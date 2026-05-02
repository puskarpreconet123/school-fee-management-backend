'use strict';

const { Worker } = require('bullmq');
const { createBullMQConnection } = require('../../config/redis');
const { sendMailFromSchool } = require('../../utils/mailer');
const logger = require('../../utils/logger');

/**
 * Job types handled:
 *  - 'payment.receipt'      → Send receipt to student
 *  - 'payment.admin_notify' → Notify school admin of successful payment
 *
 * Both job payloads must include schoolId so we can resolve the school's
 * email config (custom SMTP vs platform fallback).
 */
async function processNotificationJob(job) {
  const { type, ...data } = job.data;

  logger.info('Processing notification job', { jobId: job.id, type });

  switch (type) {
    case 'payment.receipt': {
      const { schoolId, studentEmail, studentName, amount, paymentId, feeName, schoolName } = data;

      if (!studentEmail) {
        logger.info('No student email, skipping receipt', { paymentId });
        break;
      }

      const receipt = [
        `Dear ${studentName},`,
        `Your payment of ₹${amount} for "${feeName}" at ${schoolName} was successful.`,
        `Payment ID: ${paymentId}`,
        `Thank you for your payment!`,
      ].join('\n\n');

      const html = _buildReceiptHtml({ studentName, amount, feeName, schoolName, paymentId });

      const school = schoolId ? await _loadSchool(schoolId) : null;
      await sendMailFromSchool(school, {
        to:      studentEmail,
        subject: `Payment Successful — ${schoolName}`,
        text:    receipt,
        html,
      });

      logger.info('Payment receipt email sent', { paymentId, to: studentEmail });
      break;
    }

    case 'payment.admin_notify': {
      const { schoolId, adminEmail, schoolName, studentName, amount, paymentId } = data;

      if (!adminEmail) {
        logger.info('No admin email, skipping notify', { paymentId });
        break;
      }

      const text = [
        `Fee collected for ${schoolName}`,
        `Student: ${studentName}`,
        `Amount:  ₹${amount}`,
        `Payment ID: ${paymentId}`,
      ].join('\n');

      const school = schoolId ? await _loadSchool(schoolId) : null;
      await sendMailFromSchool(school, {
        to:      adminEmail,
        subject: `Fee Collected — ${studentName} paid ₹${amount}`,
        text,
      });

      logger.info('Admin payment notify sent', { paymentId, to: adminEmail });
      break;
    }

    default:
      logger.warn('Unknown notification job type', { type });
  }
}

async function _loadSchool(schoolId) {
  const School = require('../../models/School');
  return School.findById(schoolId).select('name emailConfig');
}

function _buildReceiptHtml({ studentName, amount, feeName, schoolName, paymentId }) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#16a34a;padding:20px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;">FeeSync</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <div style="width:48px;height:48px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <span style="color:#16a34a;font-size:24px;">✓</span>
          </div>
          <h2 style="margin:0 0 4px;font-size:20px;color:#111827;">Payment Successful</h2>
          <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">${schoolName}</p>
          <p style="margin:0 0 16px;">Dear <strong>${studentName}</strong>,</p>
          <p style="margin:0 0 24px;color:#374151;">Your payment of <strong>₹${amount}</strong> for <strong>${feeName}</strong> has been received successfully.</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;">
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Payment ID</td><td style="padding:4px 0;text-align:right;font-family:monospace;font-size:13px;color:#111827;">${paymentId}</td></tr>
            <tr><td style="padding:4px 0;color:#6b7280;font-size:13px;">Amount</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#16a34a;">₹${amount}</td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:#9ca3af;">This is an automated receipt. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
