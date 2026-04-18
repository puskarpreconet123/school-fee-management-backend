'use strict';

const mongoose = require('mongoose');

const SchoolPaymentStatus = Object.freeze({
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
});

const SchoolPaymentPlan = Object.freeze({
  YEARLY: 'YEARLY',
  CUSTOM: 'CUSTOM',
});

const schoolPaymentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    plan: {
      type: String,
      enum: Object.values(SchoolPaymentPlan),
      required: true,
      default: SchoolPaymentPlan.YEARLY,
    },
    status: {
      type: String,
      enum: Object.values(SchoolPaymentStatus),
      default: SchoolPaymentStatus.SUCCESS, 
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    referenceId: {
      type: String,
    },
    notes: {
      type: String,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('SchoolPayment', schoolPaymentSchema);
module.exports.SchoolPaymentStatus = SchoolPaymentStatus;
module.exports.SchoolPaymentPlan = SchoolPaymentPlan;
