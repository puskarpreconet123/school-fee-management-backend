'use strict';

const Notice = require('../models/Notice');
const AppError = require('../utils/AppError');

async function createNotice(schoolId, noticeData) {
  const notice = await Notice.create({
    school: schoolId,
    createdBy: schoolId,
    title: noticeData.title,
    content: noticeData.content,
    targetClasses: noticeData.targetClasses || [],
  });
  return notice;
}

async function listAdminNotices(schoolId) {
  return await Notice.find({ school: schoolId }).sort({ createdAt: -1 });
}

async function getAdminNotice(schoolId, noticeId) {
  const notice = await Notice.findOne({ _id: noticeId, school: schoolId });
  if (!notice) throw new AppError('Notice not found', 404);
  return notice;
}

async function deleteNotice(schoolId, noticeId) {
  const notice = await Notice.findOneAndDelete({ _id: noticeId, school: schoolId });
  if (!notice) throw new AppError('Notice not found', 404);
  return notice;
}

async function listStudentNotices(schoolId, studentClass) {
  const orCondition = [{ targetClasses: { $size: 0 } }];
  
  if (studentClass) {
    orCondition.push({ targetClasses: studentClass });
  }

  return await Notice.find({
    school: schoolId,
    $or: orCondition
  }).sort({ createdAt: -1 });
}

module.exports = {
  createNotice,
  listAdminNotices,
  getAdminNotice,
  deleteNotice,
  listStudentNotices
};
