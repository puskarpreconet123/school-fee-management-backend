'use strict';

const nodemailer = require('nodemailer');
const logger = require('./logger');

// Cached global transporter (platform SMTP from .env)
let _globalTransporter = null;

function _getGlobalTransporter() {
  if (_globalTransporter) return _globalTransporter;
  _globalTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _globalTransporter;
}

function _createTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: cfg.secure || false,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

/**
 * Send using the global platform SMTP (env vars).
 */
async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');
  }

  const from = process.env.SMTP_FROM || `FeeSync <${process.env.SMTP_USER}>`;
  const info = await _getGlobalTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html: html || `<pre style="font-family:sans-serif">${text}</pre>`,
  });

  logger.info('Email sent (platform)', { messageId: info.messageId, to });
  return info;
}

/**
 * Send using the school's custom SMTP if configured and useCustom is true;
 * otherwise falls back to the platform (superadmin) SMTP.
 *
 * @param {object|null} school  Mongoose school doc with emailConfig field
 * @param {{ to, subject, text, html? }} opts
 */
async function sendMailFromSchool(school, { to, subject, text, html }) {
  const cfg = school?.emailConfig;

  if (cfg?.useCustom && cfg.host && cfg.user && cfg.pass) {
    const transporter = _createTransporter(cfg);
    const from = cfg.from || `${school.name} <${cfg.user}>`;

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || `<pre style="font-family:sans-serif">${text}</pre>`,
    });

    logger.info('Email sent (school SMTP)', { messageId: info.messageId, to, school: school._id });
    return info;
  }

  // Fall back to platform mail
  return sendMail({ to, subject, text, html });
}

/**
 * Verify a given SMTP config — used by the "test connection" endpoint.
 * @param {{ host, port, secure, user, pass }} cfg
 */
async function verifySmtpConfig(cfg) {
  try {
    await _createTransporter(cfg).verify();
    return { ok: true };
  } catch (err) {
    logger.warn('SMTP verify failed', { error: err.message });
    return { ok: false, error: err.message };
  }
}

/**
 * Verify the global platform SMTP — call on startup or from a health route.
 */
async function verifySmtp() {
  if (!process.env.SMTP_HOST) return { configured: false };
  try {
    await _getGlobalTransporter().verify();
    return { configured: true, ok: true };
  } catch (err) {
    logger.warn('SMTP verification failed', { error: err.message });
    return { configured: true, ok: false, error: err.message };
  }
}

module.exports = { sendMail, sendMailFromSchool, verifySmtp, verifySmtpConfig };
