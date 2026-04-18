'use strict';

const path = require('path');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const AppError = require('../utils/AppError');
const { getCsvQueue } = require('../queues/queues');
const logger = require('../utils/logger');
const crypto = require('crypto');

// ── Student ID generator ─────────────────────────────────────────────────────
// Format: STU-YYYYMM-NNNNN  e.g. STU-202604-00001
// Sequential per school; reads the current max sequence to avoid gaps.
async function generateStudentId(schoolId) {
  const now = new Date();
  const prefix = `STU-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Find the highest existing sequence for this school in the same month-prefix
  const last = await Student
    .findOne({ schoolId, studentId: { $regex: `^${prefix}-` } })
    .sort({ studentId: -1 })
    .select('studentId')
    .lean();

  let seq = 1;
  if (last?.studentId) {
    const parts = last.studentId.split('-');
    seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
  }

  return `${prefix}-${String(seq).padStart(5, '0')}`;
}

async function createStudent(schoolId, data) {
  let generatedPassword = null;
  const studentId = await generateStudentId(schoolId);
  const studentData = { ...data, schoolId, studentId };

  if (!studentData.password) {
    generatedPassword = crypto.randomBytes(4).toString('hex'); // 8 chars
    studentData.password = generatedPassword;
    studentData.tempPassword = generatedPassword; // Store cleartext temporarily
    studentData.mustChangePassword = true;
  }

  const student = await Student.create(studentData);
  logger.info('Student created', { studentId: student._id, schoolId });

  // If password was generated, return it so the admin can see it
  if (generatedPassword) {
    const studentObj = student.toObject();
    studentObj.tempPassword = generatedPassword;
    return studentObj;
  }

  return student;
}

async function getStudents(schoolId, { page = 1, limit = 20, search, className, section } = {}) {
  const filter = { schoolId };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { rollNumber: { $regex: search, $options: 'i' } },
    ];
  }

  if (className) filter.class = className;
  if (section) filter.section = section;

  const skip = (page - 1) * limit;

  const [students, total] = await Promise.all([
    Student.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
    Student.countDocuments(filter),
  ]);

  return {
    students,
    meta: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

async function getStudentById(schoolId, studentId) {
  const student = await Student.findOne({ _id: studentId, schoolId });
  if (!student) throw new AppError('Student not found', 404);
  return student;
}

async function updateStudent(schoolId, studentId, data) {
  // Never allow schoolId or password to be updated through this path
  const { schoolId: _s, password: _p, ...safe } = data;

  const student = await Student.findOneAndUpdate(
    { _id: studentId, schoolId },
    { $set: safe },
    { new: true, runValidators: true }
  );

  if (!student) throw new AppError('Student not found', 404);
  logger.info('Student updated', { studentId, schoolId });
  return student;
}

async function deleteStudent(schoolId, studentId) {
  const student = await Student.findOneAndDelete({ _id: studentId, schoolId });
  if (!student) throw new AppError('Student not found', 404);
  logger.info('Student deleted', { studentId, schoolId });
}

async function uploadStudentsViaCsv(schoolId, file) {
  if (!file) throw new AppError('CSV file is required', 400);

  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.csv') throw new AppError('Only CSV files are accepted', 400);

  const queue = getCsvQueue();

  const job = await queue.add('process-csv', {
    filePath: file.path,
    schoolId: schoolId.toString(),
  });

  logger.info('CSV upload job enqueued', { jobId: job.id, schoolId });

  return { jobId: job.id, message: 'CSV is being processed. Students will be created shortly.' };
}

async function changePassword(studentId, { currentPassword, newPassword }) {
  const student = await Student.findById(studentId).select('+password');
  if (!student) throw new AppError('Student not found', 404);

  const isMatch = await student.comparePassword(currentPassword);
  if (!isMatch) throw new AppError('Current password is incorrect', 401);

  student.password = newPassword;
  student.tempPassword = undefined; // Clear cleartext password
  student.mustChangePassword = false;
  await student.save();

  logger.info('Student changed password', { studentId });
}

async function resetStudentPassword(schoolId, studentId) {
  const student = await Student.findOne({ _id: studentId, schoolId });
  if (!student) throw new AppError('Student not found', 404);

  const newPassword = crypto.randomBytes(4).toString('hex');
  student.password = newPassword;
  student.tempPassword = newPassword;
  student.mustChangePassword = true;
  await student.save();

  logger.info('Student password reset by admin', { studentId, schoolId });

  const studentObj = student.toObject();
  studentObj.tempPassword = newPassword;
  return studentObj;
}

async function getUniqueClasses(schoolId) {
  // Aggregation pipelines do NOT auto-cast strings to ObjectId — must cast explicitly
  const oid = new mongoose.Types.ObjectId(schoolId);

  const result = await Student.aggregate([
    { $match: { schoolId: oid } },
    { $group: { _id: '$class', sections: { $addToSet: '$section' } } },
    { $sort: { _id: 1 } },
  ]);

  return result.map((r) => ({
    class: r._id || 'Unassigned',
    sections: r.sections.filter(Boolean).sort(),
  }));
}

async function backfillStudentIds(schoolId) {
  // Find students missing IDs
  const students = await Student.find({
    schoolId,
    $or: [{ studentId: { $exists: false } }, { studentId: null }, { studentId: '' }],
  });

  if (students.length === 0) return 0;

  let count = 0;
  // Use for...of to avoid ID sequential race conditions if generateStudentId is very fast
  for (const student of students) {
    student.studentId = await generateStudentId(schoolId);
    await student.save();
    count++;
  }

  logger.info('Student IDs backfilled', { schoolId, count });
  return count;
}

module.exports = {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  deleteStudent,
  uploadStudentsViaCsv,
  changePassword,
  resetStudentPassword,
  getUniqueClasses,
  backfillStudentIds,
};
