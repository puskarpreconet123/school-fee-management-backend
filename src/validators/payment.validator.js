'use strict';

const Joi = require('joi');

const createOrderSchema = Joi.object({
  feeId: Joi.string().hex().length(24).required(),
  providerType: Joi.string().valid('razorpay', 'phonepe').required(),
});

const verifyPaymentSchema = Joi.alternatives().try(
  // Razorpay validation
  Joi.object({
    paymentId: Joi.string().hex().length(24).required(),
    providerType: Joi.valid('razorpay').required(),
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
  }),
  // PhonePe validation
  Joi.object({
    paymentId: Joi.string().hex().length(24).required(),
    providerType: Joi.valid('phonepe').required(),
    merchantTransactionId: Joi.string().required(),
  })
);

module.exports = { createOrderSchema, verifyPaymentSchema };
