'use strict';

const axios = require('axios');
const logger = require('./logger');
const AppError = require('./AppError');
const CommunicationLog = require('../models/CommunicationLog');
const { env } = require('../config/env');

/**
 * Internal helper to resolve SMS configuration for a school.
 */
function getSMSConfig(school) {
  const cfg = school?.smsConfig;

  // 1. School custom config
  if (cfg?.useCustom && cfg.apiUrl && cfg.username && cfg.password) {
    return cfg;
  }

  // 2. Platform defaults
  const platformCfg = env.sms;

  if (platformCfg.apiUrl && platformCfg.username && platformCfg.password) {
    return platformCfg;
  }

  // 3. Fallback for incomplete custom config
  if (cfg?.apiUrl && cfg.username && cfg.password) {
    return cfg;
  }

  return null;
}

/**
 * Normalizes Axios errors.
 */
function handleAxiosError(err, context = 'SMS API') {
  if (err.response) {
    const status = err.response.status === 401 ? 400 : err.response.status;
    const message = err.response.data?.description || err.response.data?.message || `${context} error (${err.response.status})`;
    return new AppError(message, status);
  }
  return err;
}

/**
 * Sends an SMS from a school using the configured provider.
 * Follows the JSON Method API from the provider documentation.
 * 
 * @param {Object} school - School document with smsConfig
 * @param {Object} options - { to, message, dltContentId, unicode }
 */
async function sendSMSFromSchool(school, { to, message, dltContentId, unicode = false }) {
  const cfg = getSMSConfig(school);
  if (!cfg) {
    throw new AppError('SMS not configured for school', 400);
  }

  let url, payload;
  try {
    let phoneNumber = to.replace(/\D/g, '');
    // Remove leading 0 if present
    if (phoneNumber.startsWith('0')) {
      phoneNumber = phoneNumber.substring(1);
    }
    // Prepend 91 if it's a 10-digit number
    if (phoneNumber.length === 10) {
      phoneNumber = '91' + phoneNumber;
    }

    // The API documentation suggests /fe/api/v1/message for JSON POST
    // We ensure the URL ends correctly
    url = cfg.apiUrl.replace(/\/+$/, '') + '/fe/api/v1/message';

    // payload structure from page 4/5 of PDF
    payload = {
      extra: {
        dltContentId: dltContentId || ''
      },
      message: {
        recipient: phoneNumber,
        text: message
      },
      sender: cfg.senderId || 'NOTICE',
      unicode: !!unicode
    };

    // Note: The documentation shows Basic Auth in headers or -u flag in curl
    // authorization: Basic dGV4dC50cmFucy5wYXNzd29yZA== 
    const authString = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');

    const response = await axios.post(url, payload, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`,
        'Cache-Control': 'no-cache'
      }
    });

    // Save successful log
    await CommunicationLog.create({
      schoolId: school._id,
      channel: 'sms',
      recipient: phoneNumber,
      payload,
      response: response.data,
      status: 'success',
      metadata: { url }
    }).catch(e => logger.error('Failed to save communication log', e));

    logger.info('SMS sent', { schoolId: school._id, to: phoneNumber });
    return response.data;
  } catch (err) {
    const errorBody = err.response?.data || err.message;
    
    // Save failure log
    await CommunicationLog.create({
      schoolId: school._id,
      channel: 'sms',
      recipient: to,
      payload: typeof payload !== 'undefined' ? payload : { to },
      response: err.response?.data || null,
      status: 'failure',
      error: errorBody,
      metadata: { url: typeof url !== 'undefined' ? url : null }
    }).catch(e => logger.error('Failed to save communication log', e));

    logger.error('SMS send failed', { error: errorBody, schoolId: school._id });
    throw handleAxiosError(err, 'SMS Send');
  }
}

module.exports = { sendSMSFromSchool };
