'use strict';

const mongoose = require('mongoose');

const PaymentStatus = Object.freeze({
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
});

const attemptSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['razorpay', 'phonepe'], required: true },
    providerOrderId: { type: String },
    providerPaymentId: { type: String },
    status: { type: String, enum: Object.values(PaymentStatus), default: PaymentStatus.PENDING },
    gatewayResponse: { type: mongoose.Schema.Types.Mixed },
    attemptedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const paymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Fee',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    amountInPaise: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
    },
    // Active / latest provider being used
    provider: {
      type: String,
      enum: ['razorpay', 'phonepe'],
      required: true,
    },
    // Latest gateway order / transaction ID
    providerOrderId: {
      type: String,
      index: true,
    },
    // Gateway payment ID (available after success)
    providerPaymentId: {
      type: String,
      sparse: true,
    },
    status: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
      index: true,
    },
    // Full attempt history
    attempts: {
      type: [attemptSchema],
      default: [],
    },
    // Raw webhook payload (kept for audit)
    webhookPayload: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },
    // Idempotency: track processed webhook event IDs
    processedWebhookIds: {
      type: [String],
      default: [],
      select: false,
    },
    receiptSent: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Compound index: one pending payment per fee (prevent duplicate orders) ────
paymentSchema.index(
  { feeId: 1, status: 1 },
  { partialFilterExpression: { status: 'PENDING' } }
);

// ── Pre-validate ────────────────────────────────────────────────────────────────
paymentSchema.pre('validate', function (next) {
  if (this.amount && !this.amountInPaise) {
    this.amountInPaise = Math.round(this.amount * 100);
  }
  next();
});

// ── Instance helpers ──────────────────────────────────────────────────────────
paymentSchema.methods.addAttempt = function addAttempt(data) {
  this.attempts.push(data);
};

paymentSchema.methods.isWebhookProcessed = function isWebhookProcessed(eventId) {
  return this.processedWebhookIds.includes(eventId);
};

paymentSchema.methods.markWebhookProcessed = function markWebhookProcessed(eventId) {
  this.processedWebhookIds.push(eventId);
};

module.exports = mongoose.model('Payment', paymentSchema);
module.exports.PaymentStatus = PaymentStatus;
