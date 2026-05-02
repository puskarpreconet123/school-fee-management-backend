'use strict';

const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../../config/redis');
const { env } = require('../../config/env');
const { sendMailFromSchool } = require('../../utils/mailer');
const logger = require('../../utils/logger');

/**
 * Job data shape:
 *   { feeId, studentId, studentName, studentEmail, studentPhone,
 *     schoolName, schoolId, amount, dueDate, daysUntilDue, daysOverdue, channel }
 */
async function processReminderJob(job) {
  const {
    feeId, studentName, studentEmail, studentPhone,
    studentIdString, schoolName, schoolId,
    amount, dueDate, daysUntilDue, daysOverdue, channel,
  } = job.data;

  logger.info('Processing reminder job', { jobId: job.id, feeId, studentName, channel, daysOverdue });

  // 1. Debit credits (email is free)
  if (channel !== 'email') {
    try {
      const creditService = require('../../services/credit.service');
      await creditService.debit(
        schoolId, 1, channel,
        `Automated ${channel.toUpperCase()} reminder for fee: ${feeId}`,
        schoolId, 'system'
      );
    } catch (err) {
      logger.error('Failed to deduct credits for reminder', { feeId, error: err.message });
      throw err;
    }
  }

  // 2. Build message
  const paymentLink = `${env.urls.frontend}/pay?studentId=${studentIdString}`;
  const dueDateStr  = new Date(dueDate).toLocaleDateString('en-IN');

  let urgencyLine;
  if (daysOverdue > 0) {
    urgencyLine = `Your payment is ${daysOverdue} day(s) OVERDUE. Please clear it immediately to avoid further penalties.`;
  } else if (daysUntilDue <= 1) {
    urgencyLine = 'Please pay TODAY to avoid late charges.';
  } else {
    urgencyLine = `You have ${daysUntilDue} day(s) remaining.`;
  }

  const template = job.data.reminderMessageTemplate || 'Dear {student_name}, this is a reminder to pay the pending fee for your child.';
  const text = template
    .replace(/{student_name}/g, studentName)
    .replace(/{amount_due}/g, `₹${amount}`)
    .replace(/{school_name}/g, schoolName)
    .replace(/{due_date}/g, dueDateStr)
    .replace(/{payment_link}/g, paymentLink)
    .replace(/{urgency_line}/g, urgencyLine);

  // 3. Dispatch based on channel
  if (channel === 'email' && studentEmail) {
    const School = require('../../models/School');
    const school  = await School.findById(schoolId).select('name emailConfig');

    const isOverdue   = daysOverdue > 0;
    const subjectLine = isOverdue
      ? `[OVERDUE] Fee Payment Reminder — ${schoolName}`
      : `Fee Payment Reminder — ${schoolName}`;

    const html = _buildReminderHtml({ studentName, schoolName, amount, dueDateStr, urgencyLine, paymentLink, isOverdue });

    await sendMailFromSchool(school, { to: studentEmail, subject: subjectLine, text, html });
    logger.info('Email reminder sent', { feeId, to: studentEmail });

  } else if (channel === 'sms' && studentPhone) {
    logger.info('[SMS REMINDER]', { to: studentPhone, message: text });
    // TODO: integrate SMS provider (MSG91 / Twilio)

  } else if (channel === 'whatsapp' && studentPhone) {
    logger.info('[WHATSAPP REMINDER]', { to: studentPhone, message: text });
    // TODO: integrate WhatsApp provider

  } else if (channel === 'call' && studentPhone) {
    logger.info('[CALL REMINDER]', { to: studentPhone, message: text });
    // TODO: integrate voice call provider
  }

  // 4. Update reminderSentAt on the Fee document
  const Fee = require('../../models/Fee');
  await Fee.findByIdAndUpdate(feeId, {
    $set: { reminderSentAt: new Date() },
    $inc: { reminderCount: 1 },
  });

  logger.info('Reminder job completed', { jobId: job.id, feeId });
}

function _buildReminderHtml({ studentName, schoolName, amount, dueDateStr, urgencyLine, paymentLink, isOverdue }) {
  const accentColor = isOverdue ? '#dc2626' : '#2563eb';
  const badge = isOverdue
    ? `<span style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">OVERDUE</span>`
    : `<span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">REMINDER</span>`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:${accentColor};padding:20px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">FeeSync</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;">${badge}</p>
          <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Fee Payment Reminder</h2>
          <p style="color:#6b7280;margin:0 0 24px;font-size:14px;">${schoolName}</p>
          <p style="margin:0 0 8px;">Dear <strong>${studentName}</strong>,</p>
          <p style="margin:0 0 16px;color:#374151;">Your fee of <strong>₹${amount}</strong> ${isOverdue ? 'was due on' : 'is due on'} <strong>${dueDateStr}</strong>.</p>
          <p style="margin:0 0 24px;color:${accentColor};font-weight:500;">${urgencyLine}</p>
          <a href="${paymentLink}" style="display:inline-block;background:${accentColor};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">Pay Now</a>
          <p style="margin:32px 0 0;font-size:12px;color:#9ca3af;">This is an automated message. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
