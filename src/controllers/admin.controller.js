'use strict';

const authService = require('../services/auth.service');
const feeService = require('../services/fee.service');
const { sendSuccess, sendCreated } = require('../utils/response');
const whatsappUtils = require('../utils/whatsapp');

async function register(req, res, next) {
  try {
    const result = await authService.registerSchool(req.body);
    return sendCreated(res, { message: 'School registered successfully', data: result });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.loginSchool(req.body);
    return sendSuccess(res, { message: 'Login successful', data: result });
  } catch (err) {
    next(err);
  }
}

async function getProfile(req, res, next) {
  try {
    const School = require('../models/School');
    const school = await School.findById(req.user.id)
      .select('-password');
    
    const whatsappDefaults = {
      apiVersion: process.env.WHATSAPP_DEFAULT_API_VERSION || 'v20.0',
      wabaId: process.env.WHATSAPP_DEFAULT_WABA_ID || '',
      apiUrl: process.env.WHATSAPP_DEFAULT_API_URL || 'https://api.brandmo.ai/crm/campaign',
      channelId: process.env.WHATSAPP_DEFAULT_CHANNEL_ID || '',
      apiKey: process.env.WHATSAPP_DEFAULT_API_KEY || '',
    };

    const emailDefaults = {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || '',
    };

    return sendSuccess(res, { data: { ...school.toObject(), whatsappDefaults, emailDefaults } });
  } catch (err) {
    next(err);
  }
}

async function getFeeSummary(req, res, next) {
  try {
    const summary = await feeService.getFeesSummary(req.user.id);
    return sendSuccess(res, { data: summary });
  } catch (err) {
    next(err);
  }
}

async function updatePaymentProviders(req, res, next) {
  try {
    const School = require('../models/School');
    const { paymentProviders } = req.body;

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { paymentProviders } },
      { new: true, runValidators: true }
    );

    if (!school) throw new Error('School not found');

    return sendSuccess(res, { message: 'Payment settings updated successfully', data: school });
  } catch (err) {
    next(err);
  }
}

async function getPayments(req, res, next) {
  try {
    const Payment = require('../models/Payment');
    const { status, provider, page = 1, limit = 50 } = req.query;

    const filter = { schoolId: req.user.id };
    if (status) filter.status = status;
    if (provider) filter.provider = provider;

    const payments = await Payment.find(filter)
      .populate('studentId', 'name admissionNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    return sendSuccess(res, { data: payments });
  } catch (err) {
    next(err);
  }
}

async function updateReminderSettings(req, res, next) {
  try {
    const School = require('../models/School');
    const { reminderRules, reminderMessageTemplate } = req.body;
    
    const updatePayload = { reminderRules };
    if (reminderMessageTemplate !== undefined) {
      updatePayload.reminderMessageTemplate = reminderMessageTemplate;
    }

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).select('-password -paymentProviders.config');

    if (!school) throw new Error('School not found');

    return sendSuccess(res, {
      message: 'Reminder rules updated successfully',
      data: {
        reminderRules: school.reminderRules,
        reminderMessageTemplate: school.reminderMessageTemplate,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updateOverdueRules(req, res, next) {
  try {
    const School = require('../models/School');
    const { overdueRules, reminderMessageTemplate } = req.body;
    const updatePayload = { overdueRules };
    if (reminderMessageTemplate !== undefined) updatePayload.reminderMessageTemplate = reminderMessageTemplate;
    
    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).select('-password -paymentProviders.config');
    if (!school) throw new Error('School not found');
    return sendSuccess(res, { 
      message: 'Overdue rules updated', 
      data: {
        overdueRules: school.overdueRules,
        reminderMessageTemplate: school.reminderMessageTemplate,
      } 
    });
  } catch (err) {
    next(err);
  }
}

async function updateOverdueRepeatRule(req, res, next) {
  try {
    const School = require('../models/School');
    const { overdueRepeatRule, reminderMessageTemplate } = req.body;
    const updatePayload = { overdueRepeatRule: overdueRepeatRule ?? null };
    if (reminderMessageTemplate !== undefined) updatePayload.reminderMessageTemplate = reminderMessageTemplate;

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).select('-password -paymentProviders.config');
    if (!school) throw new Error('School not found');
    return sendSuccess(res, { 
      message: 'Overdue repeat rule updated', 
      data: {
        overdueRepeatRule: school.overdueRepeatRule,
        reminderMessageTemplate: school.reminderMessageTemplate,
      }
    });
  } catch (err) {
    next(err);
  }
}

async function updateEmailConfig(req, res, next) {
  try {
    const School = require('../models/School');
    const { emailConfig } = req.body;

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { emailConfig } },
      { new: true, runValidators: false }
    ).select('emailConfig');

    if (!school) throw new Error('School not found');

    return sendSuccess(res, { message: 'Email settings updated', data: school.emailConfig });
  } catch (err) {
    next(err);
  }
}

async function testEmailConfig(req, res, next) {
  try {
    const School = require('../models/School');
    const { sendMailFromSchool } = require('../utils/mailer');

    const school = await School.findById(req.user.id).select('name email emailConfig');
    if (!school) throw new Error('School not found');

    await sendMailFromSchool(school, {
      to: school.email,
      subject: 'FeeSync — Email Configuration Test',
      text: `This is a test email from FeeSync.\n\nYour email configuration is working correctly.\n\nSent from: ${school.name}`,
    });

    return sendSuccess(res, { message: `Test email sent to ${school.email}` });
  } catch (err) {
    next(err);
  }
}

async function updateWhatsappConfig(req, res, next) {
  try {
    const School = require('../models/School');
    const { whatsappConfig } = req.body;

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { whatsappConfig } },
      { new: true, runValidators: true }
    ).select('whatsappConfig');

    if (!school) throw new Error('School not found');

    return sendSuccess(res, { message: 'WhatsApp settings updated', data: school.whatsappConfig });
  } catch (err) {
    next(err);
  }
}
async function createWhatsappTemplate(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    const apiResult = await whatsappUtils.createWhatsappTemplate(school, req.body);
    
    school.whatsappTemplates.push({
      ...req.body,
      templateId: apiResult.id,
      status: apiResult.status || 'PENDING'
    });
    await school.save();

    return sendCreated(res, { message: 'WhatsApp template created successfully', data: apiResult });
  } catch (err) {
    next(err);
  }
}

async function updateWhatsappTemplate(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    const template = school.whatsappTemplates.id(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    const apiResult = await whatsappUtils.updateWhatsappTemplate(school, template.templateId, req.body);
    
    Object.assign(template, req.body);
    await school.save();

    return sendSuccess(res, { message: 'WhatsApp template updated successfully', data: apiResult });
  } catch (err) {
    next(err);
  }
}

async function deleteWhatsappTemplate(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    const template = school.whatsappTemplates.id(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });

    await whatsappUtils.deleteWhatsappTemplate(school, template.name);
    
    school.whatsappTemplates.pull(req.params.id);
    await school.save();

    return sendSuccess(res, { message: 'WhatsApp template deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function getWhatsappTemplates(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    const { limit, offset } = req.query;
    const apiResult = await whatsappUtils.getWhatsappTemplates(school, limit, offset);
    return sendSuccess(res, { data: apiResult });
  } catch (err) {
    console.error('WhatsApp API Error:', err.response?.data || err.message);
    if (err.response?.status === 400 || err.response?.status === 401) {
      return res.status(err.response.status).json({ 
        success: false, 
        message: err.response.data?.error?.message || 'WhatsApp API configuration error' 
      });
    }
    next(err);
  }
}

module.exports = {
  register, login, getProfile, getFeeSummary,
  updatePaymentProviders, getPayments,
  updateReminderSettings, updateOverdueRules, updateOverdueRepeatRule,
  updateEmailConfig, testEmailConfig,
  updateWhatsappConfig,
  createWhatsappTemplate, updateWhatsappTemplate, deleteWhatsappTemplate, getWhatsappTemplates,
};
