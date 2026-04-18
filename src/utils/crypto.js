'use strict';

const crypto = require('crypto');

/**
 * HMAC-SHA256 signature used by Razorpay webhook verification.
 */
function hmacSHA256(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * SHA256 hash used by PhonePe checksum calculation.
 */
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Base64 encode / decode helpers (used by PhonePe).
 */
function base64Encode(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function base64Decode(str) {
  return JSON.parse(Buffer.from(str, 'base64').toString('utf8'));
}

/**
 * Generate a short random idempotency token.
 */
function generateToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { hmacSHA256, sha256, safeCompare, base64Encode, base64Decode, generateToken };
