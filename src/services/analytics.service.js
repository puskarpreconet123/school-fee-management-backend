'use strict';

const mongoose = require('mongoose');
const Fee = require('../models/Fee');
const Student = require('../models/Student');
const School = require('../models/School');
const Payment = require('../models/Payment');
const { FeeStatus } = require('../models/Fee');

async function getAdminAnalytics(schoolId) {
  const objSchoolId = new mongoose.Types.ObjectId(schoolId);

  // 1. Fee Status Distribution
  const statusStats = await Fee.aggregate([
    { $match: { schoolId: objSchoolId } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  // 2. Collection Trend (Last 6 Months)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const trend = await Fee.aggregate([
    { 
      $match: { 
        schoolId: objSchoolId, 
        status: FeeStatus.PAID,
        paidAt: { $gte: sixMonthsAgo }
      } 
    },
    {
      $group: {
        _id: {
          month: { $month: '$paidAt' },
          year: { $year: '$paidAt' }
        },
        total: { $sum: '$amount' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  // 3. Class-wise Performance
  const classStats = await Fee.aggregate([
    { $match: { schoolId: objSchoolId } },
    {
      $lookup: {
        from: 'students',
        localField: 'studentId',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: '$student' },
    {
      $group: {
        _id: '$student.class',
        totalExpected: { $sum: '$amount' },
        totalCollected: {
          $sum: { $cond: [{ $eq: ['$status', FeeStatus.PAID] }, '$amount', 0] }
        }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // 4. Overall Totals & Forecasting
  const overallStats = await Fee.aggregate([
    { $match: { schoolId: objSchoolId, status: FeeStatus.PAID } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const startOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
  const endOfNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);

  const forecast = await Fee.aggregate([
    { 
      $match: { 
        schoolId: objSchoolId, 
        status: { $in: [FeeStatus.UNPAID, FeeStatus.OVERDUE] },
        dueDate: { $gte: startOfNextMonth, $lte: endOfNextMonth }
      } 
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  return {
    statusDistribution: statusStats,
    collectionTrend: trend,
    classPerformance: classStats,
    totalCollectedOverall: overallStats[0]?.total || 0,
    projectedNextMonth: forecast[0]?.total || 0
  };
}

async function getSuperAdminAnalytics() {
  // 1. School Growth (Count of schools by month)
  const schoolGrowth = await School.aggregate([
    {
      $group: {
        _id: {
          month: { $month: '$createdAt' },
          year: { $year: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  // 2. Platform Transaction Volume (Last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const platformVolume = await Payment.aggregate([
    { $match: { status: 'SUCCESS', completedAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id': 1 } }
  ]);

  // 3. Top Schools by Revenue
  const topSchools = await Fee.aggregate([
    { $match: { status: FeeStatus.PAID } },
    {
      $group: {
        _id: '$schoolId',
        totalRevenue: { $sum: '$amount' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: 5 },
    {
      $lookup: {
        from: 'schools',
        localField: '_id',
        foreignField: '_id',
        as: 'schoolDetails'
      }
    },
    { $unwind: '$schoolDetails' },
    {
      $project: {
        name: '$schoolDetails.name',
        totalRevenue: 1
      }
    }
  ]);

  // 4. Platform Health (School Status)
  const schoolStatus = await School.aggregate([
    { $group: { _id: '$isActive', count: { $sum: 1 } } }
  ]);

  return {
    schoolGrowth,
    platformVolume,
    topSchools,
    schoolStatus
  };
}

module.exports = {
  getAdminAnalytics,
  getSuperAdminAnalytics
};
