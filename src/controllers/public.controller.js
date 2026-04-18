'use strict';

const Student = require('../models/Student');
const School = require('../models/School');
const Fee = require('../models/Fee');
const paymentService = require('../services/payment.service');
const { sendSuccess, sendCreated } = require('../utils/response');
const AppError = require('../utils/AppError');

async function getStudentDues(req, res, next) {
  try {
    const { studentIdString } = req.params;
    
    const student = await Student.findOne({ studentId: studentIdString, isActive: true })
      .select('name class section schoolId studentId');
      
    if (!student) {
      throw new AppError('Student not found. Please check the ID and try again.', 404);
    }

    const school = await School.findById(student.schoolId).select('name');

    const fees = await Fee.find({
      studentId: student._id,
      status: { $in: ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID'] },
    }).sort({ dueDate: 1 });

    return sendSuccess(res, {
      data: {
        student: {
          id: student._id,
          studentId: student.studentId,
          name: student.name,
          class: student.class,
          section: student.section,
        },
        school: { name: school?.name || 'School' },
        fees,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getProviders(req, res, next) {
  try {
    const { studentIdString } = req.params;
    
    const student = await Student.findOne({ studentId: studentIdString, isActive: true });
    if (!student) throw new AppError('Student not found', 404);

    const result = await paymentService.getAvailableProviders(student._id);
    return sendSuccess(res, { data: result });
  } catch (err) {
    next(err);
  }
}

async function createOrder(req, res, next) {
  try {
    const { feeId, providerType } = req.body;
    
    const fee = await Fee.findById(feeId);
    if (!fee) throw new AppError('Fee not found', 404);

    const { payment, orderData } = await paymentService.createOrder({
      studentId: fee.studentId,
      feeId,
      providerType,
    });

    return sendCreated(res, {
      message: 'Payment order created',
      data: { paymentId: payment._id, provider: providerType, orderData },
    });
  } catch (err) {
    next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { paymentId, providerType, ...verificationData } = req.body;
    const result = await paymentService.verifyPayment({ paymentId, providerType, verificationData });
    return sendSuccess(res, {
      message: result.already ? 'Payment already completed' : 'Payment verified successfully',
      data: { paymentId: result.payment._id, status: result.payment.status },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStudentDues,
  getProviders,
  createOrder,
  verifyPayment,
};
