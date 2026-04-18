'use strict';

const express = require('express');
const router = express.Router();
const noticeController = require('../controllers/notice.controller');
const { authenticate, authorize, requireActiveSchool, requireActiveStudent } = require('../middleware/auth.middleware');

// Wait... in our index.js we might map '/api/notices' but how?
// If we map '/api/notices' we can have both admin and student routes.
// Let's create admin and student split here or use index.js route mapping.
// Alternatively, we can mount these routes in admin.routes.js and student.routes.js respectively.
// Actually, creating notice.routes.js specifically might be cleaner.

// Student routes
router.get(
  '/student',
  authenticate,
  authorize('student'),
  requireActiveStudent,
  noticeController.listStudent
);

// Admin routes
router.use(authenticate, authorize('admin'), requireActiveSchool);
router.post('/admin', noticeController.create);
router.get('/admin', noticeController.listAdmin);
router.delete('/admin/:id', noticeController.remove);

module.exports = router;
