'use strict';

const express = require('express');
const router = express.Router();

const adminRoutes = require('./admin.routes');
const superAdminRoutes = require('./superadmin.routes');
const studentRoutes = require('./student.routes');
const feeRoutes = require('./fee.routes');
const paymentRoutes = require('./payment.routes');
const noticeRoutes = require('./notice.routes');
const analyticsRoutes = require('./analytics.routes');
const publicRoutes = require('./public.routes');

router.use('/public', publicRoutes);
router.use('/admin', adminRoutes);
router.use('/superadmin', superAdminRoutes);
router.use('/students', studentRoutes);
router.use('/fees', feeRoutes);
router.use('/payments', paymentRoutes);
router.use('/notices', noticeRoutes);
router.use('/analytics', analyticsRoutes);

module.exports = router;
