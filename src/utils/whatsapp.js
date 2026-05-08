'use strict';

const axios = require('axios');
const logger = require('./logger');
const AppError = require('./AppError');

/**
 * Internal helper to resolve WhatsApp configuration for a school.
 */
function getWhatsappConfig(school) {
  const cfg = school?.whatsappConfig;

  // 1. School custom config
  if (cfg?.useCustom && cfg.apiUrl && cfg.channelId && cfg.apiKey && cfg.accessToken) {
    return cfg;
  }

  // 2. Platform defaults
  const platformCfg = {
    apiUrl: process.env.WHATSAPP_DEFAULT_API_URL || 'https://api.brandmo.ai/crm/campaign',
    channelId: process.env.WHATSAPP_DEFAULT_CHANNEL_ID,
    apiKey: process.env.WHATSAPP_DEFAULT_API_KEY,
    accessToken: process.env.WHATSAPP_DEFAULT_ACCESS_TOKEN,
    wabaId: process.env.WHATSAPP_DEFAULT_WABA_ID,
    apiVersion: process.env.WHATSAPP_DEFAULT_API_VERSION || 'v20.0',
  };

  if (platformCfg.channelId && platformCfg.apiKey && platformCfg.accessToken) {
    return platformCfg;
  }

  // 3. Fallback for incomplete custom config
  if (cfg?.apiUrl && cfg.channelId && cfg.apiKey && cfg.accessToken) {
    return cfg;
  }

  return null;
}

/**
 * Normalizes Axios errors to prevent 401 leaks and provides better messages.
 */
function handleAxiosError(err, context = 'WhatsApp API') {
  if (err.response) {
    const status = err.response.status === 401 ? 400 : err.response.status;
    const message = err.response.data?.error?.message || err.response.data?.message || `${context} error (${err.response.status})`;
    return new AppError(message, status);
  }
  return err;
}

/**
 * Common headers for WhatsApp API calls.
 */
function getHeaders(cfg) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.accessToken}`,
    'x-api-key': cfg.apiKey
  };
}

/**
 * Generates examples for variables in Meta templates.
 * Meta requires examples to approve templates with {{1}}, {{2}}, etc.
 */
function getComponentExample(text, type) {
  if (!text) return null;
  const matches = text.match(/\{\{\d+\}\}/g);
  if (!matches) return null;

  // Extract unique indices to determine count (though usually sequential)
  const uniqueIndices = [...new Set(matches.map(m => m.replace(/\D/g, '')))];
  const count = uniqueIndices.length;
  
  // Create dummy sample values
  const samples = Array.from({ length: count }, (_, i) => `sampleValue${i + 1}`);

  if (type === 'HEADER') {
    return { header_text: samples };
  }
  if (type === 'BODY') {
    return { body_text: [samples] }; // Meta expects nested array for body
  }
  return null;
}

async function sendWhatsappFromSchool(school, { to, message, studentName }) {
  const cfg = getWhatsappConfig(school);
  if (!cfg) {
    logger.warn('WhatsApp not configured for school', { schoolId: school?._id });
    return null;
  }

  try {
    let phoneNumber = to.replace(/\D/g, '');
    if (phoneNumber.length === 10) phoneNumber = '91' + phoneNumber;

    const payload = {
      receivers: [phoneNumber],
      title: `Message for ${studentName}`,
      channel: cfg.channelId,
      action: 'trigger',
      mode: 'immediate',
      schedule: 0,
      messages: [{
        type: 'template',
        template: {
          language: { policy: 'deterministic', code: 'en' },
          name: 'text_header_template',
          components: [
            { type: 'header', parameters: [{ type: 'text', text: school.name || 'Notice' }] },
            { type: 'body', parameters: [{ type: 'text', text: studentName }, { type: 'text', text: message }] }
          ]
        }
      }]
    };

    const response = await axios.post(cfg.apiUrl, payload, {
      headers: getHeaders(cfg)
    });

    logger.info('WhatsApp sent (Brandmo.ai)', { schoolId: school._id, to: phoneNumber });
    return response.data;
  } catch (err) {
    logger.error('WhatsApp send failed (Brandmo.ai)', { error: err.response?.data || err.message, schoolId: school._id });
    return null; 
  }
}

async function createWhatsappTemplate(school, templateData) {
  const cfg = getWhatsappConfig(school);
  if (!cfg || !cfg.wabaId) throw new AppError('WhatsApp not configured or missing WABA ID', 400);

  const components = [];
  
  // Body (Required)
  const bodyComp = { type: 'BODY', text: templateData.body };
  const bodyEx = getComponentExample(templateData.body, 'BODY');
  if (bodyEx) bodyComp.example = bodyEx;
  components.push(bodyComp);

  // Header (Optional)
  if (templateData.header?.type === 'TEXT' && templateData.header.text) {
    const headComp = { type: 'HEADER', format: 'TEXT', text: templateData.header.text };
    const headEx = getComponentExample(templateData.header.text, 'HEADER');
    if (headEx) headComp.example = headEx;
    components.push(headComp);
  }

  // Footer (Optional)
  if (templateData.footer) {
    components.push({ type: 'FOOTER', text: templateData.footer });
  }

  // Buttons removed as requested

  const payload = {
    name: templateData.name,
    category: templateData.category || 'MARKETING',
    language: templateData.language || 'en',
    components
  };

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${cfg.wabaId}/message_templates`;

  try {
    const response = await axios.post(url, payload, {
      headers: getHeaders(cfg)
    });
    return response.data;
  } catch (err) {
    throw handleAxiosError(err, 'Template Creation');
  }
}

async function updateWhatsappTemplate(school, templateId, templateData) {
  const cfg = getWhatsappConfig(school);
  if (!cfg) throw new AppError('WhatsApp not configured', 400);

  const components = [];
  
  const bodyComp = { type: 'BODY', text: templateData.body };
  const bodyEx = getComponentExample(templateData.body, 'BODY');
  if (bodyEx) bodyComp.example = bodyEx;
  components.push(bodyComp);

  if (templateData.header?.type === 'TEXT' && templateData.header.text) {
    const headComp = { type: 'HEADER', format: 'TEXT', text: templateData.header.text };
    const headEx = getComponentExample(templateData.header.text, 'HEADER');
    if (headEx) headComp.example = headEx;
    components.push(headComp);
  }

  if (templateData.footer) {
    components.push({ type: 'FOOTER', text: templateData.footer });
  }

  const payload = { components };
  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${templateId}`;

  try {
    const response = await axios.post(url, payload, {
      headers: getHeaders(cfg)
    });
    return response.data;
  } catch (err) {
    throw handleAxiosError(err, 'Template Update');
  }
}

async function deleteWhatsappTemplate(school, templateName) {
  const cfg = getWhatsappConfig(school);
  if (!cfg || !cfg.wabaId) throw new AppError('WhatsApp not configured or missing WABA ID', 400);

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${cfg.wabaId}/message_templates?name=${templateName}`;

  try {
    const response = await axios.delete(url, {
      headers: getHeaders(cfg)
    });
    return response.data;
  } catch (err) {
    throw handleAxiosError(err, 'Template Deletion');
  }
}

async function getWhatsappTemplates(school, limit = 10, offset = 0) {
  const cfg = getWhatsappConfig(school);
  if (!cfg || !cfg.wabaId) throw new AppError('WhatsApp not configured or missing WABA ID', 400);

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${cfg.wabaId}/message_templates?limit=${limit}&offset=${offset}`;

  try {
    const response = await axios.get(url, {
      headers: getHeaders(cfg)
    });
    return response.data;
  } catch (err) {
    throw handleAxiosError(err, 'Template Fetch');
  }
}

module.exports = { 
  sendWhatsappFromSchool, 
  createWhatsappTemplate, 
  updateWhatsappTemplate, 
  deleteWhatsappTemplate,
  getWhatsappTemplates
};
