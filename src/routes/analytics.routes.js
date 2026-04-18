'use strict';

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const { authenticate, authorize, requireActiveSchool, requireSuperAdmin } = require('../middleware/auth.middleware');

// Admin Analytics
router.get(
  '/admin',
  authenticate,
  authorize('admin'),
  requireActiveSchool,
  analyticsController.getAdminStats
);

// Super Admin Analytics
router.get(
  '/superadmin',
  authenticate,
  authorize('superadmin'),
  requireSuperAdmin,
  analyticsController.getSuperAdminStats
);

module.exports = router;
