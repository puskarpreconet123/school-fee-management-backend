'use strict';

const cron = require('node-cron');
const Fee = require('../models/Fee');
const Student = require('../models/Student');
const School = require('../models/School');
const { getReminderQueue } = require('../queues/queues');
const logger = require('../utils/logger');

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Daily cron: runs at 08:00 IST.
 *
 * For each unpaid/overdue fee the cron:
 *   1. Calculates daysUntilDue (integer, can be 0 or negative for overdue)
 *   2. Finds the school's reminderRule whose daysBefore === daysUntilDue
 *   3. Enqueues `timesPerDay` jobs spread evenly across the 8-hour window
 *      starting from 08:00 IST (delay 0, delay 8h/n, delay 16h/n, …)
 *
 * Job deduplication key: reminder-{feeId}-d{daysBefore}-{index}-{YYYY-MM-DD}
 * BullMQ silently discards a job whose jobId already exists in the queue,
 * so re-running the cron on the same day is safe.
 */
async function enqueueFeeReminders() {
  logger.info('Cron: starting rule-based fee reminder scan');

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  try {
    // Auto-mark overdue fees (Unpaid or Partially Paid past due date)
    await Fee.updateMany(
      { status: { $in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { $lt: now } },
      { $set: { status: 'OVERDUE' } }
    );

    const dueFees = await Fee.find({
      status: { $in: ['UNPAID', 'OVERDUE'] },
    }).select('_id studentId schoolId amount dueDate title reminderCount reminderSentAt overdueReminderEnabled');

    logger.info(`Cron: ${dueFees.length} unpaid/overdue fees to evaluate`);

    // Cache schools for the run to avoid repeated DB hits
    const schoolCache = new Map();
    const queue = getReminderQueue();

    let enqueued = 0;
    let skipped = 0;

    for (const fee of dueFees) {
      try {
        const schoolKey = fee.schoolId.toString();

        let school = schoolCache.get(schoolKey);
        if (!school) {
          school = await School.findById(fee.schoolId).select('name reminderRules overdueRules overdueRepeatRule reminderMessageTemplate');
          if (!school) { skipped++; continue; }
          schoolCache.set(schoolKey, school);
        }

        const student = await Student.findById(fee.studentId).select('name email phone studentId');
        if (!student) { skipped++; continue; }

        // Days until due — negative means overdue
        const daysUntilDue = Math.round((fee.dueDate - now) / (1000 * 60 * 60 * 24));
        const isPastDue = daysUntilDue < 0;

        if (!isPastDue) {
          // ── Pre-due reminders ──────────────────────────────────────────────
          const rules = school.reminderRules || [];
          const rule = rules.find((r) => r.daysBefore === daysUntilDue);
          if (!rule) { skipped++; continue; }

          const jobData = _buildJobData({ fee, student, school, daysUntilDue, channels: rule.channels });
          const spreadMs = rule.timesPerDay > 1 ? (8 * MS_PER_HOUR) / (rule.timesPerDay - 1) : 0;

          for (let i = 0; i < rule.timesPerDay; i++) {
            for (const channel of rule.channels) {
              await queue.add('fee-reminder', { ...jobData, channel }, {
                jobId: `reminder-${fee._id}-d${rule.daysBefore}-${channel}-${i}-${today}`,
                delay: Math.round(i * spreadMs),
              });
              enqueued++;
            }
          }
        } else {
          // ── Post-due (overdue) reminders ───────────────────────────────────
          const daysOverdue = Math.abs(daysUntilDue);
          let firedAny = false;

          // 1. Exact daysAfter rules (always fire regardless of enabled flag)
          const exactRule = (school.overdueRules || []).find((r) => r.daysAfter === daysOverdue);
          if (exactRule) {
            const jobData = _buildJobData({ fee, student, school, daysUntilDue: 0, daysOverdue, channels: exactRule.channels });
            const spreadMs = exactRule.timesPerDay > 1 ? (8 * MS_PER_HOUR) / (exactRule.timesPerDay - 1) : 0;
            for (let i = 0; i < exactRule.timesPerDay; i++) {
              for (const channel of exactRule.channels) {
                await queue.add('fee-reminder', { ...jobData, channel }, {
                  jobId: `overdue-reminder-${fee._id}-a${exactRule.daysAfter}-${channel}-${i}-${today}`,
                  delay: Math.round(i * spreadMs),
                });
                enqueued++;
              }
            }
            firedAny = true;
          }

          // 2. Continuous repeat rule — fires every N days until paid or stopped
          const repeatRule = school.overdueRepeatRule;
          if (repeatRule && fee.overdueReminderEnabled !== false && daysOverdue % repeatRule.intervalDays === 0) {
            const jobData = _buildJobData({ fee, student, school, daysUntilDue: 0, daysOverdue, channels: repeatRule.channels });
            const spreadMs = repeatRule.timesPerDay > 1 ? (8 * MS_PER_HOUR) / (repeatRule.timesPerDay - 1) : 0;
            for (let i = 0; i < repeatRule.timesPerDay; i++) {
              for (const channel of repeatRule.channels) {
                await queue.add('fee-reminder', { ...jobData, channel }, {
                  jobId: `overdue-repeat-${fee._id}-${channel}-${i}-${today}`,
                  delay: Math.round(i * spreadMs),
                });
                enqueued++;
              }
            }
            firedAny = true;
          }

          if (!firedAny) { skipped++; continue; }
        }
      } catch (innerErr) {
        logger.error('Cron: failed to process fee', {
          feeId: fee._id,
          error: innerErr.message,
        });
      }
    }

    logger.info('Cron: reminder scan complete', { enqueued, skipped });
  } catch (err) {
    logger.error('Cron: reminder scan failed', { error: err.message });
  }
}

function _buildJobData({ fee, student, school, daysUntilDue, daysOverdue, channels }) {
  return {
    feeId:                    fee._id.toString(),
    studentId:                student._id.toString(),
    studentIdString:          student.studentId,
    studentName:              student.name,
    studentEmail:             student.email,
    studentPhone:             student.phone,
    schoolName:               school.name,
    schoolId:                 fee.schoolId.toString(),
    amount:                   fee.amount,
    feeName:                  fee.title,
    dueDate:                  fee.dueDate.toISOString(),
    daysUntilDue:             Math.max(daysUntilDue, 0),
    daysOverdue:              daysOverdue || 0,
    reminderMessageTemplate: school.reminderMessageTemplate,
  };
}

async function expireStalePendingPayments() {
  const Payment = require('../models/Payment');
  const { PaymentStatus } = require('../models/Payment');

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);

  try {
    const stale = await Payment.find({
      status: PaymentStatus.PENDING,
      createdAt: { $lt: cutoff },
    }).select('_id provider providerOrderId createdAt');

    if (stale.length === 0) return;

    const now = new Date();
    const bulkOps = stale.map((p) => ({
      updateOne: {
        filter: { _id: p._id, status: PaymentStatus.PENDING },
        update: {
          $set: { status: PaymentStatus.EXPIRED, expiredAt: now },
          $push: {
            attempts: {
              provider: p.provider,
              providerOrderId: p.providerOrderId,
              status: PaymentStatus.EXPIRED,
              gatewayResponse: { reason: 'sweep-expired', expiredAfterMs: now - p.createdAt },
              attemptedAt: now,
            },
          },
        },
      },
    }));

    const result = await Payment.bulkWrite(bulkOps);
    logger.info('Payment sweep: expired stale pending payments', {
      found: stale.length,
      modified: result.modifiedCount,
    });
  } catch (err) {
    logger.error('Payment sweep failed', { error: err.message });
  }
}

function startCronJobs() {
  cron.schedule('0 8 * * *', enqueueFeeReminders, {
    scheduled: true,
    timezone: 'Asia/Kolkata',
  });

  // Every 5 minutes: expire PENDING payments older than 15 min (safety net)
  cron.schedule('*/5 * * * *', expireStalePendingPayments);

  logger.info('Cron jobs registered: fee reminders @ 08:00 IST daily | payment sweep every 5 min');
}

module.exports = { startCronJobs, enqueueFeeReminders };
