'use strict';

const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../../config/redis');
const { env } = require('../../config/env');
const logger = require('../../utils/logger');

/**
 * Job data shape:
 *   { feeId, studentId, studentName, studentEmail, studentPhone,
 *     schoolName, amount, dueDate, daysUntilDue }
 */
async function processReminderJob(job) {
  const { feeId, studentName, studentEmail, studentPhone, studentIdString, schoolName, schoolId, amount, dueDate, daysUntilDue, daysOverdue, channel } = job.data;

  logger.info('Processing reminder job', { jobId: job.id, feeId, studentName, channel, daysOverdue });

  // 1. Debit credits (email is free)
  if (channel !== 'email') {
    try {
      const creditService = require('../../services/credit.service');
      await creditService.debit(
        schoolId,
        1,
        channel,
        `Automated ${channel.toUpperCase()} reminder for fee: ${feeId}`,
        schoolId,
        'system'
      );
    } catch (err) {
      logger.error('Failed to deduct credits for reminder', { feeId, error: err.message });
      throw err;
    }
  }

  // 2. Prepare message
  const paymentLink = `${env.urls.frontend}/pay?studentId=${studentIdString}`;
  const dueDateStr = new Date(dueDate).toLocaleDateString('en-IN');

  let urgencyLine;
  if (daysOverdue > 0) {
    urgencyLine = `Your payment is ${daysOverdue} day(s) OVERDUE. Please clear it immediately to avoid further penalties.`;
  } else if (daysUntilDue <= 1) {
    urgencyLine = 'Please pay TODAY to avoid late charges.';
  } else {
    urgencyLine = `You have ${daysUntilDue} day(s) remaining.`;
  }

  const message = [
    `Dear ${studentName},`,
    daysOverdue > 0
      ? `Your fee of ₹${amount} for ${schoolName} was due on ${dueDateStr}.`
      : `This is a reminder that your fee of ₹${amount} for ${schoolName} is due on ${dueDateStr}.`,
    urgencyLine,
    `Pay here: ${paymentLink}`,
  ].join(' ');

  // 3. Dispatch based on channel
  if (channel === 'email' && studentEmail) {
    logger.info('[EMAIL REMINDER]', { to: studentEmail, message });
    // await emailService.send({ to: studentEmail, subject: 'Fee Payment Reminder', body: message });
  } else if (channel === 'sms' && studentPhone) {
    logger.info('[SMS REMINDER]', { to: studentPhone, message });
    // await smsService.send({ to: studentPhone, message });
  } else if (channel === 'whatsapp' && studentPhone) {
    logger.info('[WHATSAPP REMINDER]', { to: studentPhone, message });
    // await whatsappService.send({ to: studentPhone, message });
  } else if (channel === 'call' && studentPhone) {
    logger.info('[CALL REMINDER]', { to: studentPhone, message });
    // await callService.notify({ to: studentPhone, message });
  }

  // 4. Update reminderSentAt on the Fee document
  const Fee = require('../../models/Fee');
  await Fee.findByIdAndUpdate(feeId, {
    $set: { reminderSentAt: new Date() },
    $inc: { reminderCount: 1 },
  });

  logger.info('Reminder job completed', { jobId: job.id, feeId });
}

function startReminderWorker() {
  const worker = new Worker('fee-reminders', processReminderJob, {
    connection: createBullMQConnection(),
    concurrency: 5,
  });

  worker.on('completed', (job) => {
    logger.debug('Reminder job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Reminder job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}

module.exports = { startReminderWorker };
