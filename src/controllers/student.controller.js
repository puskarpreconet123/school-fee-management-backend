'use strict';

const authService = require('../services/auth.service');
const studentService = require('../services/student.service');
const { sendSuccess, sendCreated } = require('../utils/response');

async function login(req, res, next) {
  try {
    const result = await authService.loginStudent(req.body);
    return sendSuccess(res, { message: 'Login successful', data: result });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const student = await studentService.createStudent(req.user.id, req.body);
    return sendCreated(res, { message: 'Student created', data: student });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const result = await studentService.getStudents(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      className: req.query.class,
      section: req.query.section,
    });
    return sendSuccess(res, { data: result.students, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const student = await studentService.getStudentById(req.user.id, req.params.id);
    return sendSuccess(res, { data: student });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const student = await studentService.updateStudent(req.user.id, req.params.id, req.body);
    return sendSuccess(res, { message: 'Student updated', data: student });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await studentService.deleteStudent(req.user.id, req.params.id);
    return sendSuccess(res, { message: 'Student deleted' });
  } catch (err) {
    next(err);
  }
}

async function uploadCsv(req, res, next) {
  try {
    const result = await studentService.uploadStudentsViaCsv(req.user.id, req.file);
    return sendSuccess(res, { message: result.message, data: { jobId: result.jobId } });
  } catch (err) {
    next(err);
  }
}

async function getMyProfile(req, res, next) {
  try {
    const Student = require('../models/Student');
    const student = await Student.findById(req.user.id).select('-password');
    return sendSuccess(res, { data: student });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    await studentService.changePassword(req.user.id, req.body);
    return sendSuccess(res, { message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

async function listClasses(req, res, next) {
  try {
    const classes = await studentService.getUniqueClasses(req.user.id);
    return sendSuccess(res, { data: classes });
  } catch (err) {
    next(err);
  }
}

async function backfillIds(req, res, next) {
  try {
    const count = await studentService.backfillStudentIds(req.user.id);
    return sendSuccess(res, { message: `${count} student IDs generated successfully`, data: { count } });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const student = await studentService.resetStudentPassword(req.user.id, req.params.id);
    return sendSuccess(res, { message: 'Password reset successful', data: student });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, create, list, getById, update, remove, uploadCsv, getMyProfile, changePassword, listClasses, backfillIds, resetPassword };
