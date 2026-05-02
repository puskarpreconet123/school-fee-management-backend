'use strict';

const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const { createBullMQConnection } = require('../../config/redis');
const Payment = require('../../models/Payment');
const { PaymentStatus } = require('../../models/Payment');
const logger = require('../../utils/logger');

const EXPIRY_WINDOW_MS = 15 * 60 * 1000;

async function processPaymentExpiryJob(job) {
  const { paymentId, createdAt } = job.data;

  const payment = await Payment.findById(paymentId);

  if (!payment) {
    logger.warn('Payment expiry job: payment not found', { paymentId });
    return;
  }

  if (payment.status !== PaymentStatus.PENDING) {
    logger.info('Payment expiry job: payment already settled, skipping', {
      paymentId,
      status: payment.status,
    });
    return;
  }

  // Safety check: don't expire if somehow processed before the window elapsed
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (ageMs < EXPIRY_WINDOW_MS) {
    logger.warn('Payment expiry job fired too early, skipping', { paymentId, ageMs });
    return;
  }

  payment.status = PaymentStatus.EXPIRED;
  payment.expiredAt = new Date();
  payment.addAttempt({
    provider: payment.provider,
    providerOrderId: payment.providerOrderId,
    status: PaymentStatus.EXPIRED,
    gatewayResponse: { reason: 'expired', expiredAfterMs: ageMs },
    attemptedAt: new Date(),
  });

  await payment.save();

  logger.info('Payment marked EXPIRED due to 15-min expiry', { paymentId, ageMs });
}

function startPaymentExpiryWorker() {
  const worker = new Worker('payment-expiry', processPaymentExpiryJob, {
    connection: createBullMQConnection(),
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.debug('Payment expiry job completed', { jobId: job.id, paymentId: job.data?.paymentId });
  });

  worker.on('failed', (job, err) => {
    logger.error('Payment expiry job failed', { jobId: job?.id, paymentId: job?.data?.paymentId, error: err.message });
  });

  return worker;
}

module.exports = { startPaymentExpiryWorker };
