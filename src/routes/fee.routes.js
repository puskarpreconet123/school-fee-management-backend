'use strict';

const express = require('express');
const router = express.Router();

const feeController = require('../controllers/fee.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { createFeeSchema, listQuerySchema } = require('../validators/fee.validator');

// GET /api/fees  — admin only
router.get(
  '/',
  authenticate,
  authorize('admin'),
  validate(listQuerySchema, 'query'),
  feeController.listForSchool
);

// POST /api/fees  — admin only
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validate(createFeeSchema),
  feeController.create
);

// GET /api/fees/student/:studentId  — admin can view any; student views their own
router.get(
  '/student/:studentId',
  authenticate,
  authorize('admin', 'student'),
  validate(listQuerySchema, 'query'),
  feeController.listForStudent
);

// GET /api/fees/my  — student views their own fees (alias)
router.get(
  '/my',
  authenticate,
  authorize('student'),
  validate(listQuerySchema, 'query'),
  feeController.listForStudent
);

// GET /api/fees/:feeId
router.get(
  '/:feeId',
  authenticate,
  authorize('admin', 'student'),
  feeController.getOne
);

// PATCH /api/fees/:feeId/overdue-reminder  — admin only
router.patch(
  '/:feeId/overdue-reminder',
  authenticate,
  authorize('admin'),
  feeController.toggleOverdueReminder
);

module.exports = router;
