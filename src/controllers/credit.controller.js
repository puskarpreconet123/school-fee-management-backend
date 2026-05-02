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
    const { channels, channel: legacyChannel, message, target, studentIds: legacyStudentIds } = req.body;
    const schoolId = req.user.id;

    // Normalize channels
    const activeChannels = Array.isArray(channels) ? channels : (legacyChannel ? [legacyChannel] : []);
    if (activeChannels.length === 0) {
      return next(new AppError('At least one channel is required', 400));
    }
    
    if (!message || !message.trim()) {
      return next(new AppError('message is required', 400));
    }

    // Resolve target
    const targetType = target?.type || (legacyStudentIds === 'all' ? 'all' : 'student');
    const targetStudentIds = target?.studentIds || (Array.isArray(legacyStudentIds) ? legacyStudentIds : []);
    const targetClasses = target?.classes || [];

    // Resolve student list
    let students;
    if (targetType === 'all') {
      students = await Student.find({ schoolId, isActive: true }).select('_id name phone email');
    } else if (targetType === 'class' && targetClasses.length > 0) {
      students = await Student.find({ schoolId, class: { $in: targetClasses }, isActive: true }).select('_id name phone email');
    } else if (targetType === 'student' && targetStudentIds.length > 0) {
      students = await Student.find({ _id: { $in: targetStudentIds }, schoolId, isActive: true }).select('_id name phone email');
    } else {
      // Fallback for legacy or incomplete calls
      if (legacyStudentIds === 'all') {
        students = await Student.find({ schoolId, isActive: true }).select('_id name phone email');
      } else if (Array.isArray(legacyStudentIds) && legacyStudentIds.length > 0) {
        students = await Student.find({ _id: { $in: legacyStudentIds }, schoolId, isActive: true }).select('_id name phone email');
      } else {
        return next(new AppError('Invalid targeting criteria', 400));
      }
    }

    if (students.length === 0) {
      return next(new AppError('No active students found for the given selection', 400));
    }

    // ── Fetch School Name & Fee Data ──
    const School = require('../models/School');
    const school = await School.findById(schoolId).select('name');

    const Fee = require('../models/Fee');
    const pendingFees = await Fee.aggregate([
      { $match: { studentId: { $in: students.map(s => s._id) }, status: { $in: ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID'] } } },
      { $group: {
          _id: '$studentId',
          totalPending: { $sum: { $subtract: ['$amount', '$paidAmount'] } },
          earliestDueDate: { $min: '$dueDate' }
      }}
    ]);
    const feeMap = new Map(pendingFees.map(f => [f._id.toString(), f]));

    const results = [];
    const { getCommunicateQueue } = require('../queues/queues');
    const queue = getCommunicateQueue();

    // ── Scheduling Logic ──
    let delay = 0;
    if (req.body.scheduledAt) {
      const scheduledTime = new Date(req.body.scheduledAt).getTime();
      const now = Date.now();
      delay = Math.max(0, scheduledTime - now);
    }

    for (const ch of activeChannels) {
      // debit() handles email (free) and per-channel pricing internally
      const { balance, cost } = await creditService.debit(
        schoolId,
        students.length,
        ch,
        `${ch.toUpperCase()} blast to ${students.length} students ${delay > 0 ? '(Scheduled)' : ''}`,
        req.user.id
      );

      // Enqueue communication jobs
      await queue.add('bulk-communicate', {
        channel: ch,
        message: message.trim(),
        schoolId: schoolId.toString(),
        schoolName: school?.name || 'School',
        students: students.map((s) => {
          const fee = feeMap.get(s._id.toString());
          return {
            id: s._id.toString(),
            name: s.name,
            phone: s.phone,
            email: s.email,
            amountDue: fee ? fee.totalPending : 0,
            dueDate: fee ? fee.earliestDueDate : null
          };
        }),
      }, { delay });
      
      results.push({ channel: ch, cost, balance });
    }

    logger.info('Communication blast queued', { schoolId, channels: activeChannels, count: students.length, delay });

    return sendCreated(res, {
      message: delay > 0 
        ? `Communication scheduled successfully for ${new Date(req.body.scheduledAt).toLocaleString()}`
        : `Communication queued for ${students.length} students across ${activeChannels.length} channel(s)`,
      data: { recipientCount: students.length, results },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAllBalances, topup, getSchoolCredits, getMyCredits, communicate };
