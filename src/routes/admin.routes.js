'use strict';

const express = require('express');
const router = express.Router();

const adminController = require('../controllers/admin.controller');
const creditController = require('../controllers/credit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { registerSchema, loginSchema, updateProvidersSchema, updateReminderRulesSchema, updateOverdueRulesSchema, updateOverdueRepeatRuleSchema } = require('../validators/admin.validator');

// POST /api/admin/register
router.post('/register', validate(registerSchema), adminController.register);

// POST /api/admin/login
router.post('/login', validate(loginSchema), adminController.login);

// GET /api/admin/me  (protected)
router.get('/me', authenticate, authorize('admin'), adminController.getProfile);

// GET /api/admin/summary  (protected)
router.get('/summary', authenticate, authorize('admin'), adminController.getFeeSummary);

// GET /api/admin/payments  (protected)
router.get('/payments', authenticate, authorize('admin'), adminController.getPayments);

// PATCH /api/admin/me/providers  (protected)
router.patch(
  '/me/providers',
  authenticate,
  authorize('admin'),
  validate(updateProvidersSchema),
  adminController.updatePaymentProviders
);

// PATCH /api/admin/me/reminder-settings  (protected)
router.patch(
  '/me/reminder-settings',
  authenticate,
  authorize('admin'),
  validate(updateReminderRulesSchema),
  adminController.updateReminderSettings
);

// PATCH /api/admin/me/overdue-settings
router.patch(
  '/me/overdue-settings',
  authenticate,
  authorize('admin'),
  validate(updateOverdueRulesSchema),
  adminController.updateOverdueRules
);

// PATCH /api/admin/me/overdue-repeat-rule
router.patch(
  '/me/overdue-repeat-rule',
  authenticate,
  authorize('admin'),
  validate(updateOverdueRepeatRuleSchema),
  adminController.updateOverdueRepeatRule
);

// Credits & Communications
router.get('/credits', authenticate, authorize('admin'), creditController.getMyCredits);
router.post('/communicate', authenticate, authorize('admin'), creditController.communicate);

module.exports = router;
