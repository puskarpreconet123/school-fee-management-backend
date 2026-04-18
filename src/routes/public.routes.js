'use strict';

const express = require('express');
const router = express.Router();
const publicController = require('../controllers/public.controller');
const { validate } = require('../middleware/validate.middleware');
const Joi = require('joi');

// We use basic Joi validation here to ensure required fields
const createOrderSchema = Joi.object({
  feeId: Joi.string().hex().length(24).required(),
  providerType: Joi.string().valid('razorpay', 'phonepe').required(),
});

const verifySchema = Joi.object({
  paymentId: Joi.string().hex().length(24).required(),
  providerType: Joi.string().valid('razorpay', 'phonepe').required(),
}).unknown(true); // Allow other provider-specific fields like signatures

// GET /api/public/student/:studentIdString/dues
router.get('/student/:studentIdString/dues', publicController.getStudentDues);

// GET /api/public/student/:studentIdString/providers
router.get('/student/:studentIdString/providers', publicController.getProviders);

// POST /api/public/payments/create-order
router.post('/payments/create-order', validate(createOrderSchema), publicController.createOrder);

// POST /api/public/payments/verify
router.post('/payments/verify', validate(verifySchema), publicController.verifyPayment);

module.exports = router;
