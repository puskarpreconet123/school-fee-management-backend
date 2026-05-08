'use strict';

const express = require('express');
const router = express.Router();

const c = require('../controllers/superadmin.controller');
const creditController = require('../controllers/credit.controller');
const { authenticate, requireSuperAdmin } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { loginSchema } = require('../validators/admin.validator');

// Public
router.post('/login', validate(loginSchema), c.login);

// All routes below require a valid superadmin JWT
router.use(authenticate, requireSuperAdmin);

router.get('/me', c.getProfile);
router.get('/summary', c.getGlobalSummary);

// School management
router.get('/schools', c.listSchools);
router.post('/schools', c.createSchool);
router.get('/schools/:id', c.getSchool);
router.patch('/schools/:id', c.updateSchool);
router.patch('/schools/:id/status', c.toggleSchoolStatus);
router.post('/schools/:id/reset-password', c.resetSchoolPassword);
router.delete('/schools/:id', c.deleteSchool);

// Subscriptions / Payments
router.get('/payments', c.listPayments);
router.post('/payments', c.createPayment);

// Credits
router.get('/credits', creditController.listAllBalances);
router.post('/credits/topup', creditController.topup);
router.get('/credits/:schoolId', creditController.getSchoolCredits);

module.exports = router;
