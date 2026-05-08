'use strict';

const mongoose = require('mongoose');
const Fee = require('../models/Fee');
const { FeeStatus } = require('../models/Fee');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

async function createFee(schoolId, data) {
  const { studentId, className, amount, dueDate, title, description, type, endDate, dueDay } = data;

  // 1. Identify Target Students
  let students = [];
  if (studentId) {
    const student = await Student.findOne({ _id: studentId, schoolId, isActive: true });
    if (!student) throw new AppError('Student not found or does not belong to this school', 404);
    students = [student];
  } else if (className) {
    students = await Student.find({ class: className, schoolId, isActive: true });
    if (students.length === 0) throw new AppError(`No active students found in class: ${className}`, 404);
  } else {
    throw new AppError('Either Student or Class must be specified', 400);
  }

  // 2. Determine Timeframes
  const timeframes = [];
  if (type === 'periodic') {
    if (!endDate || !dueDay) throw new AppError('End date and Due Day are required for periodic fees', 400);
    
    const start = new Date();
    const end = new Date(endDate);
    
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      // Calculate due date for the month
      const year = current.getFullYear();
      const month = current.getMonth();
      
      // Handle day clamping (e.g. 31st of Feb -> 28th)
      const lastDay = new Date(year, month + 1, 0).getDate();
      const actualDay = Math.min(dueDay, lastDay);
      const calculatedDueDate = new Date(year, month, actualDay);

      const monthName = current.toLocaleString('default', { month: 'long' });
      timeframes.push({
        dueDate: calculatedDueDate,
        title: `${title} — ${monthName} ${year}`
      });

      // Move to next month
      current.setMonth(current.getMonth() + 1);
    }
  } else {
    // One-time
    timeframes.push({ dueDate, title });
  }

  // 3. Create all records
  const feeRecords = [];
  for (const stu of students) {
    for (const tf of timeframes) {
      feeRecords.push({
        schoolId,
        studentId: stu._id,
        amount,
        amountInPaise: Math.round(amount * 100),
        dueDate: tf.dueDate,
        title: tf.title,
        description,
        status: FeeStatus.UNPAID
      });
    }
  }

  const createdFees = await Fee.insertMany(feeRecords);
  logger.info('Fees created in bulk', { 
    count: createdFees.length, 
    students: students.length, 
    months: timeframes.length 
  });
  
  return createdFees;
}

async function getFeesForStudent(schoolId, studentId, { page = 1, limit = 20, status } = {}) {
  // If called as admin, validate the student belongs to the school
  if (schoolId) {
    const student = await Student.findOne({ _id: studentId, schoolId });
    if (!student) throw new AppError('Student not found', 404);
  }

  const filter = { studentId };
  if (schoolId) filter.schoolId = schoolId;
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [fees, total] = await Promise.all([
    Fee.find(filter).skip(skip).limit(limit).sort({ dueDate: 1 }),
    Fee.countDocuments(filter),
  ]);

  return {
    fees,
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  };
}

async function getFeesForSchool(schoolId, { page = 1, limit = 20, status } = {}) {
  // Proactively mark overdue fees for this school
  await _markOverdue(schoolId);

  const filter = { schoolId };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [fees, total] = await Promise.all([
    Fee.find(filter)
      .populate('studentId', 'name studentId class section')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(Number(limit)),
    Fee.countDocuments(filter),
  ]);

  return {
    fees,
    meta: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
  };
}

async function getFeeById(feeId, schoolId) {
  const filter = { _id: feeId };
  if (schoolId) filter.schoolId = schoolId;
  const fee = await Fee.findOne(filter);
  if (!fee) throw new AppError('Fee not found', 404);
  return fee;
}

async function updateFeeStatus(feeId, status, extra = {}) {
  const allowed = Object.values(FeeStatus);
  if (!allowed.includes(status)) throw new AppError(`Invalid status: ${status}`, 400);

  const update = { $set: { status, ...extra } };
  if (status === FeeStatus.PAID) {
    update.$set.paidAt = extra.paidAt || new Date();
  }

  const fee = await Fee.findByIdAndUpdate(feeId, update, { new: true });
  if (!fee) throw new AppError('Fee not found', 404);

  logger.info('Fee status updated', { feeId, status });
  return fee;
}

async function getFeesSummary(schoolId) {
  // Proactively mark overdue fees before calculating summary
  await _markOverdue(schoolId);

  const [total, paid, unpaid, overdue] = await Promise.all([
    Fee.countDocuments({ schoolId }),
    Fee.countDocuments({ schoolId, status: FeeStatus.PAID }),
    Fee.countDocuments({ schoolId, status: FeeStatus.UNPAID }),
    Fee.countDocuments({ schoolId, status: FeeStatus.OVERDUE }),
  ]);

  const collected = await Fee.aggregate([
    { $match: { schoolId: new mongoose.Types.ObjectId(schoolId), status: FeeStatus.PAID } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  return {
    total,
    paid,
    unpaid,
    overdue,
    totalCollected: collected[0]?.total || 0,
  };
}

async function _markOverdue(schoolId) {
  const now = new Date();
  await Fee.updateMany(
    { 
      schoolId, 
      status: { $in: [FeeStatus.UNPAID, FeeStatus.PARTIALLY_PAID] }, 
      dueDate: { $lt: now } 
    },
    { $set: { status: FeeStatus.OVERDUE } }
  );
}

module.exports = {
  createFee,
  getFeesForStudent,
  getFeesForSchool,
  getFeeById,
  updateFeeStatus,
  getFeesSummary,
};
