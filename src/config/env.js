'use strict';

/**
 * Central environment validation. Fails fast on startup if required vars are missing.
 */

const REQUIRED_VARS = [
  'MONGO_URI',
  'JWT_SECRET',
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    throw new Error('Missing required environment variables: REDIS_URL or REDIS_HOST');
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  isProduction: process.env.NODE_ENV === 'production',

  mongo: {
    uri: process.env.MONGO_URI,
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },

  phonepe: {
    merchantId: process.env.PHONEPE_MERCHANT_ID,
    saltKey: process.env.PHONEPE_SALT_KEY,
    saltIndex: parseInt(process.env.PHONEPE_SALT_INDEX || '1', 10),
    baseUrl: process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    callbackBaseUrl: process.env.PHONEPE_CALLBACK_BASE_URL || 'http://localhost:5000',
  },

  urls: {
    frontend: process.env.FRONTEND_URL || 'http://localhost:3000',
    paymentSuccess: process.env.PAYMENT_SUCCESS_URL || 'http://localhost:3000/payment/success',
    paymentFailure: process.env.PAYMENT_FAILURE_URL || 'http://localhost:3000/payment/failure',
  },
};

module.exports = { env, validateEnv };
