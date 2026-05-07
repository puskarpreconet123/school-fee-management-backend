'use strict';

const axios = require('axios');
const logger = require('./logger');

/**
 * Send WhatsApp message using Brandmo.ai API.
 * 
 * @param {object} school Mongoose school doc with whatsappConfig field
 * @param {object} opts { to, message, studentName }
 */
async function sendWhatsappFromSchool(school, { to, message, studentName }) {
  const cfg = school?.whatsappConfig;

  if (cfg?.useCustom && cfg.apiUrl && cfg.channelId && cfg.apiKey) {
    try {
      // Normalize phone number (ensure 91 prefix if missing, etc.)
      let phoneNumber = to.replace(/\D/g, '');
      if (phoneNumber.length === 10) phoneNumber = '91' + phoneNumber;

      const payload = {
        receivers: [phoneNumber],
        title: `Message for ${studentName}`,
        channel: cfg.channelId,
        action: 'trigger',
        mode: 'immediate',
        schedule: 0,
        messages: [
          {
            type: 'template',
            template: {
              language: {
                policy: 'deterministic',
                code: 'en'
              },
              name: 'text_header_template',
              components: [
                {
                  type: 'header',
                  parameters: [
                    {
                      type: 'text',
                      text: school.name || 'Notice'
                    }
                  ]
                },
                {
                  type: 'body',
                  parameters: [
                    {
                      type: 'text',
                      text: studentName
                    },
                    {
                      type: 'text',
                      text: message
                    }
                  ]
                }
              ]
            }
          }
        ]
      };

      const response = await axios.post(cfg.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}` // Assuming apiKey is used as Bearer token, or update as needed
        }
      });

      logger.info('WhatsApp sent (Brandmo.ai)', { 
        schoolId: school._id, 
        to: phoneNumber, 
        response: response.data 
      });
      
      return response.data;
    } catch (err) {
      logger.error('WhatsApp send failed (Brandmo.ai)', { 
        error: err.response?.data || err.message, 
        schoolId: school._id 
      });
      throw err;
    }
  }

  // If no custom config, we could have a platform fallback here, 
  // but for now we just log that it's not configured.
  logger.warn('WhatsApp not configured for school', { schoolId: school?._id });
  return null;
}

async function createWhatsappTemplate(school, templateData) {
  const cfg = school.whatsappConfig;
  if (!cfg?.useCustom) throw new Error('WhatsApp not configured');

  const components = [{ type: 'BODY', text: templateData.body }];
  if (templateData.header?.type === 'TEXT' && templateData.header.text) {
    components.push({ type: 'HEADER', format: 'TEXT', text: templateData.header.text });
  }
  if (templateData.footer) {
    components.push({ type: 'FOOTER', text: templateData.footer });
  }
  if (templateData.buttons && templateData.buttons.length > 0) {
    components.push({ type: 'BUTTONS', buttons: templateData.buttons });
  }

  const payload = {
    name: templateData.name,
    category: templateData.category || 'MARKETING',
    language: templateData.language || 'en',
    components
  };

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${cfg.wabaId}/message_templates`;

  const response = await axios.post(url, payload, {
    headers: { 'Authorization': `Bearer ${cfg.apiKey}` }
  });
  return response.data;
}

async function updateWhatsappTemplate(school, templateId, templateData) {
  const cfg = school.whatsappConfig;
  if (!cfg?.useCustom) throw new Error('WhatsApp not configured');

  const components = [{ type: 'BODY', text: templateData.body }];
  if (templateData.header?.type === 'TEXT' && templateData.header.text) {
    components.push({ type: 'HEADER', format: 'TEXT', text: templateData.header.text });
  }
  if (templateData.footer) {
    components.push({ type: 'FOOTER', text: templateData.footer });
  }

  const payload = { components };
  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${templateId}`;

  const response = await axios.post(url, payload, {
    headers: { 'Authorization': `Bearer ${cfg.apiKey}` }
  });
  return response.data;
}

async function deleteWhatsappTemplate(school, templateName) {
  const cfg = school.whatsappConfig;
  if (!cfg?.useCustom) throw new Error('WhatsApp not configured');

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${cfg.wabaId}/message_templates?name=${templateName}`;

  const response = await axios.delete(url, {
    headers: { 'Authorization': `Bearer ${cfg.apiKey}` }
  });
  return response.data;
}

async function getWhatsappTemplates(school, limit = 10, offset = 0) {
  const cfg = school.whatsappConfig;
  if (!cfg?.useCustom) throw new Error('WhatsApp not configured');

  const baseUrl = cfg.apiUrl.replace(/\/+$/, '').replace(/\/crm\/campaign\/?$/, '').replace(/\/api\/meta\/?.*$/, '');
  const url = `${baseUrl}/api/meta/${cfg.apiVersion}/${cfg.wabaId}/message_templates?limit=${limit}&offset=${offset}`;

  const response = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${cfg.apiKey}` }
  });
  return response.data;
}

module.exports = { 
  sendWhatsappFromSchool, 
  createWhatsappTemplate, 
  updateWhatsappTemplate, 
  deleteWhatsappTemplate,
  getWhatsappTemplates
};
