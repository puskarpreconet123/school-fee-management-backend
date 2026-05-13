'use strict';

const mongoose = require('mongoose');
const Fee = require('../models/Fee');
const { FeeStatus } = require('../models/Fee');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

async function createFee(schoolId, data) {
  const { studentId, className, amount, dueDate, title, description, type, installmentsCount, dueDay } = data;

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
    if (!installmentsCount || !dueDay) throw new AppError('Installment count and Due Day are required for periodic fees', 400);
    
    const start = new Date();
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    
    for (let i = 0; i < installmentsCount; i++) {
      // Calculate due date for the month
      const year = current.getFullYear();
      const month = current.getMonth();
      
      // Handle day clamping
      const lastDay = new Date(year, month + 1, 0).getDate();
      const actualDay = Math.min(dueDay, lastDay);
      const calculatedDueDate = new Date(year, month, actualDay);

      const monthName = current.toLocaleString('default', { month: 'long' });
      timeframes.push({
        dueDate: calculatedDueDate,
        title: installmentsCount === 1 ? title : `${title} — ${monthName} ${year}`
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
    const existingFee = await Fee.findById(feeId);
    if (existingFee) update.$set.paidAmount = existingFee.amount;
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

async function getInstallmentsTracking(schoolId, { page = 1, limit = 15, search, className } = {}) {
  // 1. Build Student Filter
  const studentFilter = { schoolId, isActive: true };
  if (search) {
    studentFilter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { studentId: { $regex: search, $options: 'i' } },
    ];
  }
  if (className) studentFilter.class = className;

  // 2. Fetch Students (Paginated)
  const skip = (page - 1) * limit;
  const students = await Student.find(studentFilter)
    .select('name studentId class section')
    .sort({ name: 1 })
    .skip(skip)
    .limit(Number(limit));

  const totalStudents = await Student.countDocuments(studentFilter);

  // 3. Aggregate Fees for these students
  const studentIds = students.map(s => s._id);
  const aggregations = await Fee.aggregate([
    { $match: { studentId: { $in: studentIds } } },
    {
      $group: {
        _id: '$studentId',
        totalAmount: { $sum: '$amount' },
        paidAmount: { 
          $sum: { 
            $cond: [
              { $eq: ['$status', FeeStatus.PAID] }, 
              '$amount', 
              { $ifNull: ['$paidAmount', 0] }
            ] 
          } 
        },
        pendingAmount: {
          $sum: {
            $cond: [
              { $in: ['$status', [FeeStatus.UNPAID, FeeStatus.OVERDUE, FeeStatus.PARTIALLY_PAID]] },
              { $subtract: ['$amount', { $ifNull: ['$paidAmount', 0] }] },
              0
            ]
          }
        },
        installmentCount: { $sum: 1 },
        paidCount: {
          $sum: { $cond: [{ $eq: ['$status', FeeStatus.PAID] }, 1, 0] }
        },
        overdueCount: {
          $sum: { $cond: [{ $eq: ['$status', FeeStatus.OVERDUE] }, 1, 0] }
        }
      }
    }
  ]);

  // Map aggregations back to students
  const aggMap = aggregations.reduce((acc, curr) => {
    acc[curr._id.toString()] = curr;
    return acc;
  }, {});

  const data = students.map(s => {
    const agg = aggMap[s._id.toString()] || {
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      installmentCount: 0,
      paidCount: 0,
      overdueCount: 0
    };
    return {
      ...s.toObject(),
      ...agg
    };
  });

  return {
    data,
    meta: {
      page: Number(page),
      limit: Number(limit),
      total: totalStudents,
      pages: Math.ceil(totalStudents / limit)
    }
  };
}

async function updateFee(feeId, schoolId, data) {
  const { amount, title, dueDate, description, status } = data;
  
  const existing = await Fee.findOne({ _id: feeId, schoolId });
  if (!existing) throw new AppError('Fee not found', 404);

  if (existing.status === FeeStatus.PAID && amount !== undefined && amount !== existing.amount) {
    throw new AppError('Cannot change the amount of a PAID installment. Please mark it as unpaid first.', 400);
  }

  const update = { $set: {} };

  if (amount !== undefined) {
    update.$set.amount = amount;
    update.$set.amountInPaise = Math.round(amount * 100);
  }
  if (title !== undefined) update.$set.title = title;
  if (dueDate !== undefined) update.$set.dueDate = new Date(dueDate);
  if (description !== undefined) update.$set.description = description;
  if (status !== undefined) {
    update.$set.status = status;
    if (status === FeeStatus.PAID) {
      update.$set.paidAt = new Date();
      // Ensure paidAmount is synced with amount
      const targetAmount = amount !== undefined ? amount : (await Fee.findById(feeId))?.amount;
      if (targetAmount !== undefined) update.$set.paidAmount = targetAmount;
    }
  }

  const fee = await Fee.findOneAndUpdate(
    { _id: feeId, schoolId },
    update,
    { new: true, runValidators: true }
  );

  if (!fee) throw new AppError('Fee not found', 404);
  return fee;
}

async function rebalanceInstallments(schoolId, studentId, { count }) {
  // 1. Fetch all fees for the student
  const student = await Student.findOne({ _id: studentId, schoolId });
  if (!student) throw new AppError('Student not found', 404);

  const allFees = await Fee.find({ studentId, schoolId }).sort({ dueDate: 1 });
  
  // 2. Filter UNPAID/OVERDUE
  const toReplace = allFees.filter(f => [FeeStatus.UNPAID, FeeStatus.OVERDUE].includes(f.status));
  if (toReplace.length === 0) throw new AppError('No unpaid installments to rebalance', 400);

  // 3. Calculate remaining balance
  const remainingTotal = toReplace.reduce((sum, f) => sum + (f.amount - (f.paidAmount || 0)), 0);
  
  // 4. Get first replaceable fee's base info
  const baseFee = toReplace[0];
  const perInstallment = Math.round((remainingTotal / count) * 100) / 100;

  // 5. Delete old ones
  const toDeleteIds = toReplace.map(f => f._id);
  await Fee.deleteMany({ _id: { $in: toDeleteIds } });

  // 6. Create new ones
  const newFees = [];
  const start = new Date();
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  
  const cleanTitle = baseFee.title.split(' — ')[0];

  for (let i = 0; i < count; i++) {
    const year = current.getFullYear();
    const month = current.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const actualDay = Math.min(10, lastDay); 
    const dueDate = new Date(year, month, actualDay);
    
    const monthName = current.toLocaleString('default', { month: 'long' });

    newFees.push({
      schoolId,
      studentId,
      amount: perInstallment,
      amountInPaise: Math.round(perInstallment * 100),
      dueDate,
      title: count === 1 ? cleanTitle : `${cleanTitle} — ${monthName} ${year}`,
      status: FeeStatus.UNPAID,
      description: `Rebalanced from ${toReplace.length} installments`
    });

    current.setMonth(current.getMonth() + 1);
  }

  return await Fee.insertMany(newFees);
}

module.exports = {
  createFee,
  getFeesForStudent,
  getFeesForSchool,
  getFeeById,
  updateFeeStatus,
  getFeesSummary,
  getInstallmentsTracking,
  updateFee,
  rebalanceInstallments,
};
