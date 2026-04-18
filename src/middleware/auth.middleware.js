'use strict';

const jwt = require('jsonwebtoken');
const School = require('../models/School');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');

/**
 * Extracts and verifies JWT from Authorization header.
 * Attaches decoded payload to req.user.
 */
async function authenticate(req, _res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Authentication token required', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, schoolId }
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') return next(new AppError('Invalid token', 401));
    if (err.name === 'TokenExpiredError') return next(new AppError('Token expired', 401));
    next(err);
  }
}

/**
 * Role-based access control.
 * @param {...string} roles  Allowed roles ('admin', 'student')
 */
function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError('Not authenticated', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
}

/**
 * School admin guard: verifies the DB record still exists and is active.
 */
async function requireActiveSchool(req, _res, next) {
  try {
    const school = await School.findById(req.user.id).select('isActive');
    if (!school || !school.isActive) {
      throw new AppError('School account is inactive or not found', 403);
    }
    req.school = school;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Student guard: verifies the DB record still exists and is active.
 */
async function requireActiveStudent(req, _res, next) {
  try {
    const student = await Student.findById(req.user.id).select('isActive schoolId class');
    if (!student || !student.isActive) {
      throw new AppError('Student account is inactive or not found', 403);
    }
    req.student = student;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Super admin guard: verifies the DB record still exists and is active.
 */
async function requireSuperAdmin(req, _res, next) {
  try {
    if (!req.user || req.user.role !== 'superadmin') {
      return next(new AppError('Super admin access required', 403));
    }
    const SuperAdmin = require('../models/SuperAdmin');
    const admin = await SuperAdmin.findById(req.user.id).select('isActive');
    if (!admin || !admin.isActive) {
      throw new AppError('Super admin account is inactive or not found', 403);
    }
    req.superAdmin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, authorize, requireActiveSchool, requireActiveStudent, requireSuperAdmin };
