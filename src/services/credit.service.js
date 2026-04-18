'use strict';

const mongoose = require('mongoose');
const School = require('../models/School');
const CreditLedger = require('../models/CreditLedger');
const { CreditLedgerType } = require('../models/CreditLedger');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const CREDIT_COST_PER_RECIPIENT = 0.12;

/**
 * Add credits to a school's balance (superadmin action).
 */
async function topup(schoolId, amount, description, superAdminId) {
  if (!amount || amount <= 0) throw new AppError('Amount must be greater than 0', 400);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const school = await School.findByIdAndUpdate(
      schoolId,
      { $inc: { creditBalance: amount } },
      { new: true, session }
    ).select('creditBalance name');

    if (!school) throw new AppError('School not found', 404);

    const [entry] = await CreditLedger.create(
      [{
        schoolId,
        type: CreditLedgerType.TOPUP,
        amount,
        balanceAfter: school.creditBalance,
        description: description || 'Credit top-up by superadmin',
        createdBy: superAdminId,
        createdByRole: 'superadmin',
      }],
      { session }
    );

    await session.commitTransaction();

    logger.info('Credits topped up', { schoolId, amount, balance: school.creditBalance });
    return { balance: school.creditBalance, entry };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Deduct credits for a communication blast (admin action).
 * Cost = recipientCount × CREDIT_COST_PER_RECIPIENT
 */
async function debit(schoolId, recipientCount, channel, description, creatorId, creatorRole = 'admin') {
  if (!recipientCount || recipientCount <= 0) throw new AppError('Recipient count must be > 0', 400);

  const cost = parseFloat((recipientCount * CREDIT_COST_PER_RECIPIENT).toFixed(4));

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const school = await School.findById(schoolId).select('creditBalance').session(session);
    if (!school) throw new AppError('School not found', 404);

    if (school.creditBalance < cost) {
      throw new AppError(
        `Insufficient credits. Required: ${cost}, Available: ${school.creditBalance.toFixed(4)}`,
        402
      );
    }

    school.creditBalance = parseFloat((school.creditBalance - cost).toFixed(4));
    await school.save({ session });

    const [entry] = await CreditLedger.create(
      [{
        schoolId,
        type: CreditLedgerType.DEBIT,
        amount: cost,
        balanceAfter: school.creditBalance,
        channel,
        recipientCount,
        description,
        createdBy: creatorId,
        createdByRole: creatorRole,
      }],
      { session }
    );

    await session.commitTransaction();

    logger.info('Credits debited', { schoolId, cost, channel, recipientCount, balance: school.creditBalance });
    return { balance: school.creditBalance, cost, entry };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Get credit balance for a school.
 */
async function getBalance(schoolId) {
  const school = await School.findById(schoolId).select('creditBalance name');
  if (!school) throw new AppError('School not found', 404);
  return { balance: school.creditBalance, schoolName: school.name };
}

/**
 * Get paginated ledger for a school.
 */
async function getLedger(schoolId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;

  const [entries, total] = await Promise.all([
    CreditLedger.find({ schoolId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CreditLedger.countDocuments({ schoolId }),
  ]);

  return { entries, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/**
 * Get all schools with their credit balances (superadmin overview).
 */
async function getAllBalances({ page = 1, limit = 20, search } = {}) {
  const skip = (page - 1) * limit;
  const filter = {};
  if (search) {
    const re = new RegExp(search, 'i');
    filter.$or = [{ name: re }, { email: re }];
  }

  const [schools, total] = await Promise.all([
    School.find(filter)
      .select('name email schoolId creditBalance isActive')
      .sort({ creditBalance: 1, name: 1 })
      .skip(skip)
      .limit(limit),
    School.countDocuments(filter),
  ]);

  return { schools, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

module.exports = { topup, debit, getBalance, getLedger, getAllBalances, CREDIT_COST_PER_RECIPIENT };
