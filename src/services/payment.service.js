'use strict';

const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

const Payment = require('../models/Payment');
const { PaymentStatus } = require('../models/Payment');
const Fee = require('../models/Fee');
const { FeeStatus } = require('../models/Fee');
const Student = require('../models/Student');
const School = require('../models/School');
const { getProviderForSchool } = require('../providers');
const { getNotificationQueue, getPaymentExpiryQueue } = require('../queues/queues');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Return the list of active payment provider types for a student's school.
 */
async function getAvailableProviders(studentId) {
  const student = await Student.findById(studentId).select('schoolId');
  if (!student) throw new AppError('Student not found', 404);

  const school = await School.findById(student.schoolId).select('paymentProviders name');
  if (!school) throw new AppError('School not found', 404);

  return {
    providers: school.getActiveProviderTypes(),
    schoolName: school.name,
  };
}

/**
 * Initiate payment: create a gateway order and a pending Payment record.
 */
async function createOrder({ studentId, feeId, providerType }) {
  // ── Validate entities ─────────────────────────────────────────────────────
  const [student, fee] = await Promise.all([
    Student.findById(studentId).select('schoolId name email phone'),
    Fee.findById(feeId),
  ]);

  if (!student) throw new AppError('Student not found', 404);
  if (!fee) throw new AppError('Fee not found', 404);
  if (!fee.studentId.equals(studentId)) throw new AppError('Fee does not belong to this student', 403);
  if (fee.status === FeeStatus.PAID) throw new AppError('This fee has already been paid', 409);

  // ── Guard: clear stale pending payments to ensure fresh session ───────────
  const existingPending = await Payment.findOne({ feeId, status: PaymentStatus.PENDING });
  if (existingPending) {
    logger.info('Removing stale pending payment for fresh session', { paymentId: existingPending._id });
    await Payment.deleteOne({ _id: existingPending._id });
  }

  // ── Validate provider ─────────────────────────────────────────────────────
  const school = await School.findById(student.schoolId);
  if (!school) throw new AppError('School not found', 404);

  const activeProviders = school.getActiveProviderTypes();
  if (!activeProviders.includes(providerType)) {
    throw new AppError(`Provider "${providerType}" is not available for this school`, 400);
  }

  const provider = getProviderForSchool(school, providerType);

  // ── Create gateway order ──────────────────────────────────────────────────
  const receipt = `fee-${feeId}-${uuidv4().slice(0, 8)}`;

  const { orderId, providerData } = await provider.createOrder({
    amount: fee.amountInPaise || Math.round(fee.amount * 100),
    currency: fee.currency || 'INR',
    receipt,
    notes: {
      schoolId: school._id.toString(),
      studentId: studentId.toString(),
      feeId: feeId.toString(),
    },
  });

  // ── Persist payment record ────────────────────────────────────────────────
  const payment = await Payment.create({
    schoolId: school._id,
    studentId,
    feeId,
    amount: fee.amount,
    amountInPaise: fee.amountInPaise || Math.round(fee.amount * 100),
    currency: fee.currency || 'INR',
    provider: providerType,
    providerOrderId: orderId,
    status: PaymentStatus.PENDING,
    attempts: [{
      provider: providerType,
      providerOrderId: orderId,
      status: PaymentStatus.PENDING,
      attemptedAt: new Date(),
    }],
  });

  logger.info('Payment order created', {
    paymentId: payment._id,
    orderId,
    provider: providerType,
    amount: fee.amount,
  });

  // Schedule expiry: mark PENDING → FAILED if not settled within 15 minutes
  await getPaymentExpiryQueue().add(
    'expire-payment',
    { paymentId: payment._id.toString(), createdAt: payment.createdAt },
    {
      delay: 15 * 60 * 1000,
      jobId: `expire-${payment._id}`,
    }
  );

  return { payment, orderData: providerData };
}

/**
 * Verify payment from client-side callback (used by Razorpay checkout flow).
 */
async function verifyPayment({ paymentId, providerType, verificationData }) {
  const payment = await Payment.findById(paymentId);
  if (!payment) throw new AppError('Payment not found', 404);
  if (payment.status === PaymentStatus.SUCCESS) {
    return { already: true, payment };
  }

  const school = await School.findById(payment.schoolId);
  const provider = getProviderForSchool(school, providerType);

  const result = await provider.verifyPayment(verificationData);

  if (!result.verified) {
    payment.status = PaymentStatus.FAILED;
    payment.addAttempt({
      provider: providerType,
      providerOrderId: payment.providerOrderId,
      status: PaymentStatus.FAILED,
      gatewayResponse: result,
    });
    await payment.save();
    throw new AppError('Payment verification failed', 400);
  }

  await _finalizePayment(payment, result.paymentId, { raw: verificationData });

  return { verified: true, payment };
}

/**
 * Handle inbound webhook — idempotent.
 * Multi-tenant: schoolId is embedded in order notes at order-creation time.
 * We read it from the unverified payload to load the school's own webhook secret,
 * then the provider verifies the signature with that secret.
 */
async function handleWebhook(providerType, req) {
  const { getProvider } = require('../providers');

  // Extract schoolId from notes before signature verification (safe — sig check follows)
  const entity = req.body?.payload?.payment?.entity || {};
  const notes = entity.notes || {};
  const schoolIdFromNotes = notes.schoolId;

  let provider;
  if (schoolIdFromNotes) {
    const school = await School.findById(schoolIdFromNotes).select('paymentProviders');
    if (school) {
      try {
        provider = getProviderForSchool(school, providerType);
      } catch (_) {
        // Provider not configured for this school — fall back to env
        provider = getProvider(providerType, {});
      }
    } else {
      logger.warn('Webhook: schoolId in notes not found', { schoolId: schoolIdFromNotes });
      provider = getProvider(providerType, {});
    }
  } else {
    // No schoolId in notes — use env-level credentials (single-tenant / legacy)
    provider = getProvider(providerType, {});
  }

  const webhookResult = await provider.handleWebhook(req);
  const { eventId, orderId, paymentId: gatewayPaymentId, status, raw } = webhookResult;

  // Lookup payment by provider order ID
  const payment = await Payment.findOne({ providerOrderId: orderId }).select('+processedWebhookIds +webhookPayload');

  if (!payment) {
    logger.warn('Webhook received for unknown order', { orderId, providerType });
    return { handled: false, reason: 'Payment record not found' };
  }

  // ── Idempotency guard ─────────────────────────────────────────────────────
  if (payment.isWebhookProcessed(eventId)) {
    logger.info('Duplicate webhook ignored', { eventId, orderId });
    return { handled: true, duplicate: true };
  }

  payment.markWebhookProcessed(eventId);
  payment.webhookPayload = raw;

  if (status === 'SUCCESS' && payment.status !== PaymentStatus.SUCCESS) {
    await _finalizePayment(payment, gatewayPaymentId, { raw });
  } else if (status === 'FAILED' && payment.status === PaymentStatus.PENDING) {
    payment.status = PaymentStatus.FAILED;
    payment.addAttempt({
      provider: providerType,
      providerOrderId: orderId,
      providerPaymentId: gatewayPaymentId,
      status: PaymentStatus.FAILED,
      gatewayResponse: raw,
    });
    await payment.save();
    logger.info('Payment marked FAILED via webhook', { orderId, eventId });
  } else {
    await payment.save(); // persist idempotency key even for no-op
  }

  return { handled: true };
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function _finalizePayment(payment, gatewayPaymentId, meta = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    payment.status = PaymentStatus.SUCCESS;
    payment.providerPaymentId = gatewayPaymentId;
    payment.completedAt = new Date();
    payment.addAttempt({
      provider: payment.provider,
      providerOrderId: payment.providerOrderId,
      providerPaymentId: gatewayPaymentId,
      status: PaymentStatus.SUCCESS,
      gatewayResponse: meta.raw,
      attemptedAt: new Date(),
    });

    await payment.save({ session });

    await Fee.findByIdAndUpdate(
      payment.feeId,
      { $set: { status: FeeStatus.PAID, paidAt: new Date(), paidAmount: payment.amount } },
      { session }
    );

    await session.commitTransaction();
    logger.info('Payment finalized', { paymentId: payment._id, gatewayPaymentId });

    // ── Enqueue post-payment notifications ───────────────────────────────────
    await _enqueuePostPaymentJobs(payment).catch((err) =>
      logger.error('Failed to enqueue post-payment notifications', { error: err.message })
    );
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

async function _enqueuePostPaymentJobs(payment) {
  const [student, fee, school] = await Promise.all([
    Student.findById(payment.studentId).select('name email phone'),
    Fee.findById(payment.feeId).select('title amount'),
    School.findById(payment.schoolId).select('name email'),
  ]);

  const queue = getNotificationQueue();

  await Promise.all([
    queue.add('payment-receipt', {
      type: 'payment.receipt',
      schoolId:     payment.schoolId.toString(),
      studentEmail: student?.email,
      studentName:  student?.name,
      amount:       payment.amount,
      paymentId:    payment.providerPaymentId || payment._id.toString(),
      feeName:      fee?.title,
      schoolName:   school?.name,
    }),
    queue.add('admin-notify', {
      type:       'payment.admin_notify',
      schoolId:   payment.schoolId.toString(),
      adminEmail: school?.email,
      schoolName: school?.name,
      studentName: student?.name,
      amount:     payment.amount,
      paymentId:  payment.providerPaymentId || payment._id.toString(),
    }),
  ]);
}

async function getMyPayments(studentId, { status } = {}) {
  const Payment = require('../models/Payment');
  const query = { studentId };
  if (status) query.status = status;
  const payments = await Payment.find(query)
    .populate('feeId', 'title')
    .sort({ createdAt: -1 })
    .lean();
  return payments;
}

module.exports = { getAvailableProviders, createOrder, verifyPayment, handleWebhook, getMyPayments };
