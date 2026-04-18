'use strict';

const mongoose = require('mongoose');

const FeeStatus = Object.freeze({
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
});

const feeSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: [true, 'Fee title is required'],
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be at least 1'],
    },
    // Amount in smallest currency unit (paise for INR) for payment gateways
    amountInPaise: {
      type: Number,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(FeeStatus),
      default: FeeStatus.UNPAID,
      index: true,
    },
    paidAt: {
      type: Date,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    reminderSentAt: {
      type: Date,
    },
    reminderCount: {
      type: Number,
      default: 0,
    },
    overdueReminderEnabled: {
      type: Boolean,
      default: true,
    },
    overdueReminderStoppedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Pre-save: derive amountInPaise ────────────────────────────────────────────
feeSchema.pre('save', function (next) {
  if (this.isModified('amount')) {
    this.amountInPaise = Math.round(this.amount * 100);
  }
  next();
});

// ── Auto-mark overdue ─────────────────────────────────────────────────────────
feeSchema.methods.checkAndMarkOverdue = function checkAndMarkOverdue() {
  if (this.status === FeeStatus.UNPAID && this.dueDate < new Date()) {
    this.status = FeeStatus.OVERDUE;
    return true;
  }
  return false;
};

module.exports = mongoose.model('Fee', feeSchema);
module.exports.FeeStatus = FeeStatus;
