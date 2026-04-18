'use strict';

const nodemailer = require('nodemailer');
const logger = require('./logger');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Send a plain-text + HTML email.
 * @param {string} to       Recipient email
 * @param {string} subject  Subject line
 * @param {string} text     Plain-text body
 * @param {string} [html]   Optional HTML body (falls back to <pre>text</pre>)
 */
async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');
  }

  const from = process.env.SMTP_FROM || `FeeSync <${process.env.SMTP_USER}>`;
  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html: html || `<pre style="font-family:sans-serif">${text}</pre>`,
  });

  logger.info('Email sent', { messageId: info.messageId, to });
  return info;
}

/**
 * Verify SMTP connection — call on startup or from a health route.
 */
async function verifySmtp() {
  if (!process.env.SMTP_HOST) return { configured: false };
  try {
    await getTransporter().verify();
    return { configured: true, ok: true };
  } catch (err) {
    logger.warn('SMTP verification failed', { error: err.message });
    return { configured: true, ok: false, error: err.message };
  }
}

module.exports = { sendMail, verifySmtp };
