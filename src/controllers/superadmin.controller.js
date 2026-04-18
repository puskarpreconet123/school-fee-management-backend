'use strict';

const authService = require('../services/auth.service');
const School = require('../models/School');
const Student = require('../models/Student');
const Fee = require('../models/Fee');
const { FeeStatus } = require('../models/Fee');
const SchoolPayment = require('../models/SchoolPayment');
const AppError = require('../utils/AppError');
const { sendSuccess, sendCreated } = require('../utils/response');
const logger = require('../utils/logger');

// POST /api/superadmin/login
async function login(req, res, next) {
  try {
    const result = await authService.loginSuperAdmin(req.body);
    return sendSuccess(res, { message: 'Login successful', data: result });
  } catch (err) {
    next(err);
  }
}

// GET /api/superadmin/me
async function getProfile(req, res, next) {
  try {
    const SuperAdmin = require('../models/SuperAdmin');
    const admin = await SuperAdmin.findById(req.user.id);
    return sendSuccess(res, { data: admin });
  } catch (err) {
    next(err);
  }
}

// GET /api/superadmin/schools
async function listSchools(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.search) {
      const re = new RegExp(req.query.search, 'i');
      filter.$or = [{ name: re }, { email: re }];
    }
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    const [schools, total] = await Promise.all([
      School.find(filter)
        .select('-password -paymentProviders.config')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      School.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      data: schools,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/superadmin/schools/:id
async function getSchool(req, res, next) {
  try {
    const school = await School.findById(req.params.id).select('-password -paymentProviders.config');
    if (!school) throw new AppError('School not found', 404);
    return sendSuccess(res, { data: school });
  } catch (err) {
    next(err);
  }
}

// POST /api/superadmin/schools
async function createSchool(req, res, next) {
  try {
    const { name, email, password, phone, address, paymentProviders } = req.body;

    const existing = await School.findOne({ email });
    if (existing) throw new AppError('A school with this email already exists', 409);

    const school = await School.create({ name, email, password, phone, address, paymentProviders });

    logger.info('School created by superadmin', { schoolId: school._id, adminId: req.user.id });

    return sendCreated(res, {
      message: 'School created successfully',
      data: { _id: school._id, name: school.name, email: school.email },
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/superadmin/schools/:id
async function updateSchool(req, res, next) {
  try {
    const allowed = ['name', 'phone', 'address', 'paymentProviders'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );

    const school = await School.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password -paymentProviders.config');

    if (!school) throw new AppError('School not found', 404);

    logger.info('School updated by superadmin', { schoolId: school._id, adminId: req.user.id });
    return sendSuccess(res, { message: 'School updated', data: school });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/superadmin/schools/:id/status
async function toggleSchoolStatus(req, res, next) {
  try {
    const school = await School.findById(req.params.id).select('isActive name');
    if (!school) throw new AppError('School not found', 404);

    school.isActive = !school.isActive;
    await school.save({ validateModifiedOnly: true });

    logger.info('School status toggled by superadmin', {
      schoolId: school._id,
      isActive: school.isActive,
      adminId: req.user.id,
    });

    return sendSuccess(res, {
      message: `School ${school.isActive ? 'activated' : 'deactivated'}`,
      data: { _id: school._id, name: school.name, isActive: school.isActive },
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/superadmin/schools/:id
async function deleteSchool(req, res, next) {
  try {
    const school = await School.findByIdAndDelete(req.params.id);
    if (!school) throw new AppError('School not found', 404);

    logger.info('School deleted by superadmin', { schoolId: req.params.id, adminId: req.user.id });
    return sendSuccess(res, { message: 'School deleted' });
  } catch (err) {
    next(err);
  }
}

// GET /api/superadmin/summary
async function getGlobalSummary(req, res, next) {
  try {
    const [
      totalSchools,
      activeSchools,
      totalStudents,
      totalFees,
      paidFees,
      unpaidFees,
      overdueFees,
      collected,
    ] = await Promise.all([
      School.countDocuments(),
      School.countDocuments({ isActive: true }),
      Student.countDocuments({ isActive: true }),
      Fee.countDocuments(),
      Fee.countDocuments({ status: FeeStatus.PAID }),
      Fee.countDocuments({ status: FeeStatus.UNPAID }),
      Fee.countDocuments({ status: FeeStatus.OVERDUE }),
      Fee.aggregate([
        { $match: { status: FeeStatus.PAID } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return sendSuccess(res, {
      data: {
        schools: { total: totalSchools, active: activeSchools },
        students: { total: totalStudents },
        fees: {
          total: totalFees,
          paid: paidFees,
          unpaid: unpaidFees,
          overdue: overdueFees,
          totalCollected: collected[0]?.total || 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/superadmin/payments
async function listPayments(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.plan) filter.plan = req.query.plan;

    // Populating school to get schoolId and name
    const [payments, total] = await Promise.all([
      SchoolPayment.find(filter)
        .populate('schoolId', 'name schoolId email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      SchoolPayment.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      data: payments,
      meta: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/superadmin/payments
async function createPayment(req, res, next) {
  try {
    const { schoolId, amount, plan, referenceId, notes, paymentDate } = req.body;
    
    // Convert to ObjectId if necessary, here we assume schoolId is the document _id
    const school = await School.findById(schoolId);
    if (!school) throw new AppError('School not found', 404);

    const payment = await SchoolPayment.create({
      schoolId: school._id,
      amount,
      plan,
      referenceId,
      notes,
      paymentDate: paymentDate ? new Date(paymentDate) : undefined,
    });

    logger.info('School subscription payment added by superadmin', { 
      schoolId: school._id, 
      paymentId: payment._id, 
      adminId: req.user.id 
    });

    return sendCreated(res, {
      message: 'Subscription payment recorded successfully',
      data: payment,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  getProfile,
  listSchools,
  getSchool,
  createSchool,
  updateSchool,
  toggleSchoolStatus,
  deleteSchool,
  getGlobalSummary,
  listPayments,
  createPayment,
};
