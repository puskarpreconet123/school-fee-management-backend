'use strict';

const creditService = require('../services/credit.service');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const { sendSuccess, sendCreated } = require('../utils/response');
const logger = require('../utils/logger');

// ── Superadmin endpoints ──────────────────────────────────────────────────────

// GET /api/v1/superadmin/credits  — all schools with balances
async function listAllBalances(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const result = await creditService.getAllBalances({ page, limit, search: req.query.search });
    return sendSuccess(res, { data: result });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/superadmin/credits/topup
// Body: { schoolId, channel: 'sms'|'whatsapp'|'call', amount, description? }
async function topup(req, res, next) {
  try {
    const { schoolId, channel, amount, description } = req.body;
    if (!schoolId || !channel || !amount) {
      return next(new AppError('schoolId, channel, and amount are required', 400));
    }
    if (!creditService.PAID_CHANNELS.includes(channel)) {
      return next(new AppError(`channel must be one of: ${creditService.PAID_CHANNELS.join(', ')}`, 400));
    }
    const result = await creditService.topup(schoolId, channel, Number(amount), description, req.user.id);
    return sendCreated(res, {
      message: `${amount} ${channel.toUpperCase()} credits added successfully`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/superadmin/credits/:schoolId  — balance + ledger for one school
async function getSchoolCredits(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const [balanceInfo, ledger] = await Promise.all([
      creditService.getBalance(req.params.schoolId),
      creditService.getLedger(req.params.schoolId, { page, limit }),
    ]);

    return sendSuccess(res, { data: { ...balanceInfo, ...ledger } });
  } catch (err) {
    next(err);
  }
}

// ── Admin endpoints ───────────────────────────────────────────────────────────

// GET /api/v1/admin/credits  — own balance + recent ledger + rate card
async function getMyCredits(req, res, next) {
  try {
    const schoolId = req.user.id; // school admin's id IS the school id
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 15));

    const [balanceInfo, ledger] = await Promise.all([
      creditService.getBalance(schoolId),
      creditService.getLedger(schoolId, { page, limit }),
    ]);

    return sendSuccess(res, {
      data: { ...balanceInfo, ...ledger, channelCosts: creditService.CHANNEL_COSTS },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/communicate
// Body: { channel: 'sms'|'whatsapp'|'call', studentIds: [...] | 'all', message: '...' }
async function communicate(req, res, next) {
  try {
    const { channel, studentIds, message } = req.body;
    const schoolId = req.user.id;

    if (!['sms', 'whatsapp', 'call', 'email'].includes(channel)) {
      return next(new AppError('channel must be sms, whatsapp, call, or email', 400));
    }
    if (!message || !message.trim()) {
      return next(new AppError('message is required', 400));
    }

    // Resolve student list
    let students;
    if (studentIds === 'all') {
      students = await Student.find({ schoolId, isActive: true }).select('_id name phone email');
    } else if (Array.isArray(studentIds) && studentIds.length > 0) {
      students = await Student.find({ _id: { $in: studentIds }, schoolId, isActive: true }).select('_id name phone email');
    } else {
      return next(new AppError('studentIds must be "all" or a non-empty array', 400));
    }

    if (students.length === 0) {
      return next(new AppError('No active students found for the given selection', 400));
    }

    // debit() handles email (free) and per-channel pricing internally
    const { balance, cost } = await creditService.debit(
      schoolId,
      students.length,
      channel,
      `${channel.toUpperCase()} blast to ${students.length} students`,
      req.user.id
    );

    // Enqueue communication jobs
    const { getCommunicateQueue } = require('../queues/queues');
    const queue = getCommunicateQueue();
    await queue.add('bulk-communicate', {
      channel,
      message: message.trim(),
      schoolId: schoolId.toString(),
      students: students.map((s) => ({ id: s._id.toString(), name: s.name, phone: s.phone, email: s.email })),
    });

    logger.info('Communication blast queued', { schoolId, channel, count: students.length, cost });

    return sendCreated(res, {
      message: `${channel.toUpperCase()} queued for ${students.length} students`,
      data: { recipientCount: students.length, creditsCost: cost, remainingBalance: balance },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAllBalances, topup, getSchoolCredits, getMyCredits, communicate };
