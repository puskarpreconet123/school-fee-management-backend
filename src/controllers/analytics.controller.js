'use strict';

const analyticsService = require('../services/analytics.service');
const { sendSuccess } = require('../utils/response');

async function getAdminStats(req, res, next) {
  try {
    const data = await analyticsService.getAdminAnalytics(req.user.id);
    return sendSuccess(res, { data });
  } catch (err) {
    next(err);
  }
}

async function getSuperAdminStats(req, res, next) {
  try {
    const data = await analyticsService.getSuperAdminAnalytics();
    return sendSuccess(res, { data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAdminStats,
  getSuperAdminStats
};
