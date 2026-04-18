'use strict';

const authService = require('../services/auth.service');
const feeService = require('../services/fee.service');
const { sendSuccess, sendCreated } = require('../utils/response');

async function register(req, res, next) {
  try {
    const result = await authService.registerSchool(req.body);
    return sendCreated(res, { message: 'School registered successfully', data: result });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.loginSchool(req.body);
    return sendSuccess(res, { message: 'Login successful', data: result });
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const School = require('../models/School');
    const school = await School.findById(req.user.id)
      .select('-password -paymentProviders.config');
    return sendSuccess(res, { data: school });
  } catch (err) {
    next(err);
  }
}

async function getFeeSummary(req, res, next) {
  try {
    const summary = await feeService.getFeesSummary(req.user.id);
    return sendSuccess(res, { data: summary });
  } catch (err) {
    next(err);
  }
}

async function updatePaymentProviders(req, res, next) {
  try {
    const School = require('../models/School');
    const { paymentProviders } = req.body;

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { paymentProviders } },
      { new: true, runValidators: true }
    );

    if (!school) throw new Error('School not found');

    return sendSuccess(res, { message: 'Payment settings updated successfully', data: school });
  } catch (err) {
    next(err);
  }
}

async function getPayments(req, res, next) {
  try {
    const Payment = require('../models/Payment');
    const { status, provider, page = 1, limit = 50 } = req.query;

    const filter = { schoolId: req.user.id };
    if (status) filter.status = status;
    if (provider) filter.provider = provider;

    const payments = await Payment.find(filter)
      .populate('studentId', 'name admissionNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    return sendSuccess(res, { data: payments });
  } catch (err) {
    next(err);
  }
}

async function updateReminderSettings(req, res, next) {
  try {
    const School = require('../models/School');
    const { reminderRules } = req.body;

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { reminderRules } },
      { new: true, runValidators: true }
    ).select('-password -paymentProviders.config');

    if (!school) throw new Error('School not found');

    return sendSuccess(res, {
      message: 'Reminder rules updated successfully',
      data: school.reminderRules,
    });
  } catch (err) {
    next(err);
  }
}

async function updateOverdueRules(req, res, next) {
  try {
    const School = require('../models/School');
    const { overdueRules } = req.body;
    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { overdueRules } },
      { new: true, runValidators: true }
    ).select('-password -paymentProviders.config');
    if (!school) throw new Error('School not found');
    return sendSuccess(res, { message: 'Overdue rules updated', data: school.overdueRules });
  } catch (err) {
    next(err);
  }
}

async function updateOverdueRepeatRule(req, res, next) {
  try {
    const School = require('../models/School');
    const { overdueRepeatRule } = req.body;
    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { overdueRepeatRule: overdueRepeatRule ?? null } },
      { new: true, runValidators: true }
    ).select('-password -paymentProviders.config');
    if (!school) throw new Error('School not found');
    return sendSuccess(res, { message: 'Overdue repeat rule updated', data: school.overdueRepeatRule });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register, login, getProfile, getFeeSummary,
  updatePaymentProviders, getPayments,
  updateReminderSettings, updateOverdueRules, updateOverdueRepeatRule,
};
