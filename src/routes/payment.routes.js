'use strict';

const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createOrderSchema, verifyPaymentSchema } = require('../validators/payment.validator');

// ── Webhook endpoints — NO auth, signature verified inside handler ─────────────
// POST /api/payments/webhook/razorpay
router.post('/webhook/razorpay', paymentController.razorpayWebhook);

// POST /api/payments/webhook/phonepe
router.post('/webhook/phonepe', paymentController.phonePeWebhook);

// POST /api/payments/callback/phonepe/:merchantTransactionId
// PhonePe redirects user here after payment (redirect-based flow)
router.post('/callback/phonepe/:merchantTransactionId', paymentController.phonePeCallback);

// ── Authenticated endpoints ────────────────────────────────────────────────────

// GET /api/payments/providers/:studentId
// Admin can check any student; student checks their own
router.get(
  '/providers/:studentId',
  authenticate,
  authorize('admin', 'student'),
  paymentController.getProviders
);

// GET /api/payments/my  — student's own payment history
router.get(
  '/my',
  authenticate,
  authorize('student'),
  paymentController.getMyPayments
);

// POST /api/payments/create-order  — student initiates
router.post(
  '/create-order',
  authenticate,
  authorize('student'),
  validate(createOrderSchema),
  paymentController.createOrder
);

// POST /api/payments/verify  — client-side verification (Razorpay checkout callback)
router.post(
  '/verify',
  authenticate,
  authorize('student'),
  validate(verifyPaymentSchema),
  paymentController.verifyPayment
);

module.exports = router;
