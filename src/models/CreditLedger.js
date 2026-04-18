'use strict';

const mongoose = require('mongoose');

const CreditLedgerType = Object.freeze({
  TOPUP: 'TOPUP',
  DEBIT: 'DEBIT',
});

const CreditChannel = Object.freeze({
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  CALL: 'call',
  EMAIL: 'email',
});

const creditLedgerSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(CreditLedgerType),
      required: true,
    },
    // Credits added (TOPUP) or consumed (DEBIT) — always positive
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Running balance after this transaction
    balanceAfter: {
      type: Number,
      required: true,
    },
    // Only set for DEBIT
    channel: {
      type: String,
      enum: Object.values(CreditChannel),
      default: null,
    },
    recipientCount: {
      type: Number,
      default: null,
    },
    description: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    createdByRole: {
      type: String,
      enum: ['superadmin', 'admin', 'system'],
      required: true,
    },
  },
  { timestamps: true }
);

creditLedgerSchema.index({ schoolId: 1, createdAt: -1 });

module.exports = mongoose.model('CreditLedger', creditLedgerSchema);
module.exports.CreditLedgerType = CreditLedgerType;
module.exports.CreditChannel = CreditChannel;
