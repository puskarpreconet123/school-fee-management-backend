'use strict';

const paymentService = require('../services/payment.service');
const { sendSuccess, sendCreated } = require('../utils/response');
const logger = require('../utils/logger');

async function getProviders(req, res, next) {
  try {
    const studentId = req.params.studentId || req.user.id;
    const result = await paymentService.getAvailableProviders(studentId);
    return sendSuccess(res, { data: result });
  } catch (err) {
    next(err);
  }
}

async function createOrder(req, res, next) {
  try {
    const studentId = req.user.id;  // Student initiates their own payment
    const { feeId, providerType } = req.body;

    const { payment, orderData } = await paymentService.createOrder({
      studentId,
      feeId,
      providerType,
    });

    return sendCreated(res, {
      message: 'Payment order created',
      data: { paymentId: payment._id, provider: providerType, orderData },
    });
  } catch (err) {
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { paymentId, providerType, ...verificationData } = req.body;
    const result = await paymentService.verifyPayment({ paymentId, providerType, verificationData });
    return sendSuccess(res, {
      message: result.already ? 'Payment already completed' : 'Payment verified successfully',
      data: { paymentId: result.payment._id, status: result.payment.status },
    });
  } catch (err) {
    next(err);
  }
}

async function razorpayWebhook(req, res, next) {
  try {
    const result = await paymentService.handleWebhook('razorpay', req);
    logger.info('Razorpay webhook handled', result);
    // Razorpay expects 200 OK to stop retries
    return res.status(200).json({ success: true });
  } catch (err) {
    // Return 200 even on signature failure — prevents infinite retries for bad actors
    // Log the error; real signature failures are guarded inside the service
    logger.error('Razorpay webhook error', { error: err.message });
    return res.status(200).json({ success: false, message: err.message });
  }
}

async function phonePeWebhook(req, res, next) {
  try {
    const result = await paymentService.handleWebhook('phonepe', req);
    logger.info('PhonePe webhook handled', result);
    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('PhonePe webhook error', { error: err.message });
    return res.status(200).json({ success: false, message: err.message });
  }
}

/**
 * PhonePe redirect callback (POST after payment).
 * PhonePe redirects the user here after payment; we verify and redirect to frontend.
 */
async function phonePeCallback(req, res, next) {
  try {
    const { merchantTransactionId } = req.params;
    const result = await paymentService.verifyPayment({
      paymentId: null,               // lookup by orderId below
      providerType: 'phonepe',
      verificationData: { merchantTransactionId },
    });

    const frontendUrl = result.verified
      ? process.env.PAYMENT_SUCCESS_URL
      : process.env.PAYMENT_FAILURE_URL;

    return res.redirect(`${frontendUrl}?txnId=${merchantTransactionId}`);
  } catch (err) {
    logger.error('PhonePe callback error', { error: err.message });
    return res.redirect(process.env.PAYMENT_FAILURE_URL || '/');
  }
}

async function getMyPayments(req, res, next) {
  try {
    const studentId = req.user.id;
    const { status } = req.query;
    const payments = await paymentService.getMyPayments(studentId, { status });
    return sendSuccess(res, { data: payments });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProviders, createOrder, verifyPayment, razorpayWebhook, phonePeWebhook, phonePeCallback, getMyPayments };
