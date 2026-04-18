'use strict';

const noticeService = require('../services/notice.service');
const { sendSuccess, sendCreated } = require('../utils/response');

async function create(req, res, next) {
  try {
    const notice = await noticeService.createNotice(req.user.id, req.body);
    return sendCreated(res, { message: 'Notice created successfully', data: notice });
  } catch (err) {
    next(err);
  }
}

async function listAdmin(req, res, next) {
  try {
    const notices = await noticeService.listAdminNotices(req.user.id);
    return sendSuccess(res, { data: notices });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await noticeService.deleteNotice(req.user.id, req.params.id);
    return sendSuccess(res, { message: 'Notice deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function listStudent(req, res, next) {
  try {
    const notices = await noticeService.listStudentNotices(req.student.schoolId, req.student.class);
    return sendSuccess(res, { data: notices });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  create,
  listAdmin,
  remove,
  listStudent
};
