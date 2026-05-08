'use strict';

const feeService = require('../services/fee.service');
const { sendSuccess, sendCreated } = require('../utils/response');

async function create(req, res, next) {
  try {
    const fee = await feeService.createFee(req.user.id, req.body);
    return sendCreated(res, { message: 'Fee created', data: fee });
  } catch (err) {
    next(err);
  }
}

async function listForSchool(req, res, next) {
  try {
    const result = await feeService.getFeesForSchool(req.user.id, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
    });

    return sendSuccess(res, { data: result.fees, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

async function listForStudent(req, res, next) {
  try {
    // Admin can view any student in their school; student can only view their own in their school
    const targetStudentId = req.params.studentId || req.user.id;
    const schoolId = req.user.role === 'admin' ? req.user.id : req.user.schoolId;

    const result = await feeService.getFeesForStudent(schoolId, targetStudentId, {
      page: req.query.page,
      limit: req.query.limit,
      status: req.query.status,
    });

    return sendSuccess(res, { data: result.fees, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const schoolId = req.user.role === 'admin' ? req.user.id : null;
    const fee = await feeService.getFeeById(req.params.feeId, schoolId);
    return sendSuccess(res, { data: fee });
  } catch (err) {
    next(err);
  }
}

async function toggleOverdueReminder(req, res, next) {
  try {
    const Fee = require('../models/Fee');
    const { enabled } = req.body;
    const fee = await Fee.findOneAndUpdate(
      { _id: req.params.feeId, schoolId: req.user.id },
      {
        $set: {
          overdueReminderEnabled: enabled,
          ...(enabled === false ? { overdueReminderStoppedAt: new Date() } : { overdueReminderStoppedAt: null }),
        },
      },
      { new: true, runValidators: true }
    );
    if (!fee) throw require('../utils/AppError')('Fee not found', 404);
    return sendSuccess(res, {
      message: `Overdue reminders ${enabled ? 'resumed' : 'stopped'}`,
      data: { overdueReminderEnabled: fee.overdueReminderEnabled },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, listForSchool, listForStudent, getOne, toggleOverdueReminder };
