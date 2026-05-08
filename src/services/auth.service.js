'use strict';

const jwt = require('jsonwebtoken');
const School = require('../models/School');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

// ─── School Admin Auth ────────────────────────────────────────────────────────

async function registerSchool(data) {
  const { name, email, password, phone, address, paymentProviders } = data;

  const existing = await School.findOne({ email });
  if (existing) throw new AppError('A school with this email already exists', 409);

  const school = await School.create({ 
    name, email, password, phone, address, paymentProviders,
    mustChangePassword: false 
  });

  logger.info('School registered', { schoolId: school._id, email });

  const token = signToken({ id: school._id, role: 'admin' });

  return { token, school: { _id: school._id, name: school.name, email: school.email } };
}

async function loginSchool({ email, password }) {
  const school = await School.findOne({ email, isActive: true }).select('+password');
  if (!school) throw new AppError('Invalid email or password', 401);

  const match = await school.comparePassword(password);
  if (!match) throw new AppError('Invalid email or password', 401);

  logger.info('School admin logged in', { schoolId: school._id });

  const token = signToken({ id: school._id, role: 'admin' });

  return {
    token,
    school: {
      _id: school._id,
      name: school.name,
      email: school.email,
      paymentProviders: school.getActiveProviderTypes(),
      mustChangePassword: school.mustChangePassword,
      tempPassword: school.tempPassword,
    },
  };
}

async function changeSchoolPassword(schoolId, { currentPassword, newPassword }) {
  const school = await School.findById(schoolId).select('+password');
  if (!school) throw new AppError('School not found', 404);

  const isMatch = await school.comparePassword(currentPassword);
  if (!isMatch) throw new AppError('Current password is incorrect', 401);

  school.password = newPassword;
  school.tempPassword = undefined; // Clear cleartext password
  school.mustChangePassword = false;
  await school.save();

  logger.info('School changed password', { schoolId });
}

// ─── Student Auth ─────────────────────────────────────────────────────────────

async function loginStudent({ identifier, password }) {
  const idTrim = identifier.trim();
  const idLower = idTrim.toLowerCase();

  const student = await Student.findOne({
    $or: [
      { studentId: idTrim },
      { email: idLower },
      { phone: idTrim },
    ],
    isActive: true,
  }).select('+password');
  if (!student) throw new AppError('Invalid credentials', 401);

  if (!student.password) {
    throw new AppError('Password not set — contact your school admin', 403);
  }

  const match = await student.comparePassword(password);
  if (!match) throw new AppError('Invalid credentials', 401);

  logger.info('Student logged in', { studentId: student._id });

  const token = signToken({ id: student._id, role: 'student', schoolId: student.schoolId });

  return {
    token,
    student: {
      _id: student._id,
      name: student.name,
      email: student.email,
      class: student.class,
      schoolId: student.schoolId,
      mustChangePassword: student.mustChangePassword,
    },
  };
}

// ─── Super Admin Auth ─────────────────────────────────────────────────────────

async function loginSuperAdmin({ email, password }) {
  const SuperAdmin = require('../models/SuperAdmin');
  const admin = await SuperAdmin.findOne({ email, isActive: true }).select('+password');
  if (!admin) throw new AppError('Invalid email or password', 401);

  const match = await admin.comparePassword(password);
  if (!match) throw new AppError('Invalid email or password', 401);

  logger.info('Super admin logged in', { adminId: admin._id });

  const token = signToken({ id: admin._id, role: 'superadmin' });
  return { token, admin: { _id: admin._id, name: admin.name, email: admin.email } };
}

async function getSchoolById(id) {
  const school = await School.findById(id);
  if (!school) throw new AppError('School not found', 404);
  return school;
}

module.exports = { registerSchool, loginSchool, loginStudent, loginSuperAdmin, getSchoolById, changeSchoolPassword };
