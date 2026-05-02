'use strict';

const mongoose = require('mongoose');
const School = require('../models/School');
const CreditLedger = require('../models/CreditLedger');
const { CreditLedgerType } = require('../models/CreditLedger');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// Per-recipient credit cost by channel. Email is free, others reflect
// approximate provider pricing (1 credit ≈ ₹1).
const CHANNEL_COSTS = Object.freeze({
  email: 0,
  sms: 0.20,
  whatsapp: 0.50,
  call: 1.00,
});

// Channels that have their own credit bucket (email is excluded — it's free).
const PAID_CHANNELS = Object.freeze(['sms', 'whatsapp', 'call']);

function getChannelCost(channel) {
  if (!Object.prototype.hasOwnProperty.call(CHANNEL_COSTS, channel)) {
    throw new AppError(`Unknown channel: ${channel}`, 400);
  }
  return CHANNEL_COSTS[channel];
}

function assertPaidChannel(channel) {
  if (!PAID_CHANNELS.includes(channel)) {
    throw new AppError(`Channel "${channel}" does not have a credit balance`, 400);
  }
}

function emptyBalances() {
  return { sms: 0, whatsapp: 0, call: 0 };
}

function readBalances(school) {
  // Defensive read — if a legacy doc has no creditBalances yet, treat as zeros.
  const b = school.creditBalances || {};
  return {
    sms: Number(b.sms) || 0,
    whatsapp: Number(b.whatsapp) || 0,
    call: Number(b.call) || 0,
  };
}

/**
 * Add credits for a specific channel (superadmin action).
 */
async function topup(schoolId, channel, amount, description, superAdminId) {
  assertPaidChannel(channel);
  if (!amount || amount <= 0) throw new AppError('Amount must be greater than 0', 400);

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const update = { $inc: { [`creditBalances.${channel}`]: amount } };
    const school = await School.findByIdAndUpdate(
      schoolId,
      update,
      { new: true, session }
    ).select('creditBalances name');

    if (!school) throw new AppError('School not found', 404);

    const balances = readBalances(school);
    const balanceAfter = balances[channel];

    const [entry] = await CreditLedger.create(
      [{
        schoolId,
        type: CreditLedgerType.TOPUP,
        amount,
        balanceAfter,
        channel,
        description: description || `${channel.toUpperCase()} credit top-up by superadmin`,
        createdBy: superAdminId,
        createdByRole: 'superadmin',
      }],
      { session }
    );

    await session.commitTransaction();

    logger.info('Credits topped up', { schoolId, channel, amount, balanceAfter });
    return { balances, channel, balanceAfter, entry };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Deduct credits from the channel-specific bucket for a communication blast.
 * Free channels (email) short-circuit and return cost = 0.
 */
async function debit(schoolId, recipientCount, channel, description, creatorId, creatorRole = 'admin') {
  if (!recipientCount || recipientCount <= 0) throw new AppError('Recipient count must be > 0', 400);

  const perRecipient = getChannelCost(channel);

  if (perRecipient === 0) {
    const school = await School.findById(schoolId).select('creditBalances');
    if (!school) throw new AppError('School not found', 404);
    return { balances: readBalances(school), channel, balanceAfter: 0, cost: 0, entry: null };
  }

  const cost = parseFloat((recipientCount * perRecipient).toFixed(4));

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const school = await School.findById(schoolId).select('creditBalances').session(session);
    if (!school) throw new AppError('School not found', 404);

    const balances = readBalances(school);
    const available = balances[channel];

    if (available < cost) {
      throw new AppError(
        `Insufficient ${channel.toUpperCase()} credits. Required: ${cost}, Available: ${available.toFixed(4)}`,
        402
      );
    }

    const balanceAfter = parseFloat((available - cost).toFixed(4));
    school.creditBalances[channel] = balanceAfter;
    await school.save({ session });

    const [entry] = await CreditLedger.create(
      [{
        schoolId,
        type: CreditLedgerType.DEBIT,
        amount: cost,
        balanceAfter,
        channel,
        recipientCount,
        description,
        createdBy: creatorId,
        createdByRole: creatorRole,
      }],
      { session }
    );

    await session.commitTransaction();

    logger.info('Credits debited', { schoolId, channel, cost, recipientCount, balanceAfter });
    return { balances: { ...balances, [channel]: balanceAfter }, channel, balanceAfter, cost, entry };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Get per-channel credit balances for a school.
 */
async function getBalance(schoolId) {
  const school = await School.findById(schoolId).select('creditBalances name');
  if (!school) throw new AppError('School not found', 404);
  return { balances: readBalances(school), schoolName: school.name };
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

  const [rawSchools, total] = await Promise.all([
    School.find(filter)
      .select('name email schoolId creditBalances isActive')
      .skip(skip)
      .limit(limit)
      .lean(),
    School.countDocuments(filter),
  ]);

  // Normalise creditBalances and sort by total ascending so empties bubble up.
  const schools = rawSchools
    .map((s) => ({
      ...s,
      creditBalances: {
        sms: s.creditBalances?.sms ?? 0,
        whatsapp: s.creditBalances?.whatsapp ?? 0,
        call: s.creditBalances?.call ?? 0,
      },
    }))
    .sort((a, b) => {
      const ta = a.creditBalances.sms + a.creditBalances.whatsapp + a.creditBalances.call;
      const tb = b.creditBalances.sms + b.creditBalances.whatsapp + b.creditBalances.call;
      return ta - tb || a.name.localeCompare(b.name);
    });

  return { schools, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

module.exports = {
  topup,
  debit,
  getBalance,
  getLedger,
  getAllBalances,
  CHANNEL_COSTS,
  PAID_CHANNELS,
  getChannelCost,
  emptyBalances,
};
