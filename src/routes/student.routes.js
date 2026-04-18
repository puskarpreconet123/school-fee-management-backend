'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();

const studentController = require('../controllers/student.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { loginSchema, createSchema, updateSchema, listQuerySchema } = require('../validators/student.validator');

// ── Multer config for CSV uploads ─────────────────────────────────────────────
const upload = multer({
  dest: path.join(process.cwd(), 'uploads', 'csv'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  },
});

// ── Public ─────────────────────────────────────────────────────────────────────
// POST /api/students/login
router.post('/login', validate(loginSchema), studentController.login);

// ── Admin-only ────────────────────────────────────────────────────────────────
// POST /api/students/upload
router.post(
  '/upload',
  authenticate,
  authorize('admin'),
  upload.single('file'),
  studentController.uploadCsv
);

// POST /api/students/backfill-ids
router.post(
  '/backfill-ids',
  authenticate,
  authorize('admin'),
  studentController.backfillIds
);

// POST /api/students
router.post('/', authenticate, authorize('admin'), validate(createSchema), studentController.create);

// GET /api/students/classes  ← must be before /:id
router.get('/classes', authenticate, authorize('admin'), studentController.listClasses);

// GET /api/students
router.get('/', authenticate, authorize('admin'), validate(listQuerySchema, 'query'), studentController.list);

// ── Student self-service (must also be before /:id) ──────────────────────────
// GET /api/students/me/profile
router.get('/me/profile', authenticate, authorize('student'), studentController.getMyProfile);

// PATCH /api/students/me/change-password
router.patch('/me/change-password', authenticate, authorize('student'), studentController.changePassword);

// ── Wildcard param routes (keep last) ────────────────────────────────────────
// GET /api/students/:id
router.get('/:id', authenticate, authorize('admin'), studentController.getById);

// PATCH /api/students/:id
router.patch('/:id', authenticate, authorize('admin'), validate(updateSchema), studentController.update);

// POST /api/students/:id/reset-password
router.post('/:id/reset-password', authenticate, authorize('admin'), studentController.resetPassword);

// DELETE /api/students/:id
router.delete('/:id', authenticate, authorize('admin'), studentController.remove);

module.exports = router;
