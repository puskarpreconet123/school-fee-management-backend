'use strict';

const express = require('express');
const router = express.Router();

const adminController = require('../controllers/admin.controller');
const creditController = require('../controllers/credit.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { 
  registerSchema, 
  loginSchema, 
  updateProvidersSchema, 
  updateReminderRulesSchema, 
  updateOverdueRulesSchema, 
  updateOverdueRepeatRuleSchema, 
  updateEmailConfigSchema, 
  updateWhatsappConfigSchema,
  updateSMSConfigSchema,
  whatsappTemplateSchema
} = require('../validators/admin.validator');

// POST /api/admin/register
router.post('/register', validate(registerSchema), adminController.register);

// POST /api/admin/login
router.post('/login', validate(loginSchema), adminController.login);

// GET /api/admin/me  (protected)
router.get('/me', authenticate, authorize('admin'), adminController.getProfile);

// PATCH /api/admin/me/change-password
router.patch('/me/change-password', authenticate, authorize('admin'), adminController.changePassword);

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

// PATCH /api/admin/me/email-config
router.patch(
  '/me/email-config',
  authenticate,
  authorize('admin'),
  validate(updateEmailConfigSchema),
  adminController.updateEmailConfig
);

// POST /api/admin/me/email-config/test
router.post('/me/email-config/test', authenticate, authorize('admin'), adminController.testEmailConfig);

// PATCH /api/admin/me/whatsapp-config
router.patch(
  '/me/whatsapp-config',
  authenticate,
  authorize('admin'),
  validate(updateWhatsappConfigSchema),
  adminController.updateWhatsappConfig
);

// PATCH /api/admin/me/sms-config
router.patch(
  '/me/sms-config',
  authenticate,
  authorize('admin'),
  validate(updateSMSConfigSchema),
  adminController.updateSMSConfig
);

// WhatsApp Template Routes
router.get(
  '/me/whatsapp-templates',
  authenticate,
  authorize('admin'),
  adminController.getWhatsappTemplates
);

router.post(
  '/me/whatsapp-templates/sync',
  authenticate,
  authorize('admin'),
  adminController.syncWhatsappTemplates
);

router.post(
  '/me/whatsapp-templates',
  authenticate,
  authorize('admin'),
  validate(whatsappTemplateSchema),
  adminController.createWhatsappTemplate
);

router.patch(
  '/me/whatsapp-templates/:id',
  authenticate,
  authorize('admin'),
  validate(whatsappTemplateSchema),
  adminController.updateWhatsappTemplate
);

router.delete(
  '/me/whatsapp-templates/:id',
  authenticate,
  authorize('admin'),
  adminController.deleteWhatsappTemplate
);

// Campaign Template Routes
router.get(
  '/me/campaign-templates',
  authenticate,
  authorize('admin'),
  adminController.getCampaignTemplates
);

router.post(
  '/me/campaign-templates',
  authenticate,
  authorize('admin'),
  adminController.createCampaignTemplate
);

router.patch(
  '/me/campaign-templates/:id',
  authenticate,
  authorize('admin'),
  adminController.updateCampaignTemplate
);

router.delete(
  '/me/campaign-templates/:id',
  authenticate,
  authorize('admin'),
  adminController.deleteCampaignTemplate
);

// Credits & Communications
router.get('/credits', authenticate, authorize('admin'), creditController.getMyCredits);
router.post('/communicate', authenticate, authorize('admin'), creditController.communicate);

module.exports = router;
