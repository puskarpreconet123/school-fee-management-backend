'use strict';

const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * Job types handled:
 *  - 'payment.receipt'   → Send receipt to student
 *  - 'payment.admin_notify' → Notify school admin of successful payment
 */
async function processNotificationJob(job) {
  const { type, ...data } = job.data;

  logger.info('Processing notification job', { jobId: job.id, type });

  switch (type) {
    case 'payment.receipt': {
      const { studentEmail, studentName, amount, paymentId, feeName, schoolName } = data;
      const receipt = [
        `Dear ${studentName},`,
        `Your payment of ₹${amount} for ${feeName} at ${schoolName} was successful.`,
        `Payment ID: ${paymentId}`,
        `Thank you!`,
      ].join('\n');

      if (studentEmail) {
        logger.info('[EMAIL RECEIPT]', { to: studentEmail, paymentId });
        // await emailService.send({ to: studentEmail, subject: 'Payment Receipt', body: receipt });
      }
      break;
    }

    case 'payment.admin_notify': {
      const { adminEmail, schoolName, studentName, amount, paymentId } = data;
      logger.info('[ADMIN NOTIFY]', {
        to: adminEmail,
        message: `${studentName} paid ₹${amount} | Payment ID: ${paymentId}`,
      });
      // await emailService.send({ to: adminEmail, subject: `Fee collected – ${schoolName}`, ... });
      break;
    }

    default:
      logger.warn('Unknown notification job type', { type });
  }
}

function startNotificationWorker() {
  const worker = new Worker('notifications', processNotificationJob, {
    connection: createBullMQConnection(),
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.debug('Notification job completed', { jobId: job.id, type: job.data?.type });
  });

  worker.on('failed', (job, err) => {
    logger.error('Notification job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startNotificationWorker };
