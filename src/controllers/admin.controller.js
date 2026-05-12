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
      phoneNumberId: process.env.WHATSAPP_DEFAULT_PHONE_NUMBER_ID || '',
      apiUrl: process.env.WHATSAPP_DEFAULT_API_URL || 'https://api.brandmo.ai/crm/campaign',
      channelId: process.env.WHATSAPP_DEFAULT_CHANNEL_ID || '',
      apiKey: process.env.WHATSAPP_DEFAULT_API_KEY || '',
      accessToken: process.env.WHATSAPP_DEFAULT_ACCESS_TOKEN || '',
    };

    const emailDefaults = {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || '',
    };

    const smsDefaults = {
      apiUrl: process.env.SMS_DEFAULT_API_URL || '',
      username: process.env.SMS_DEFAULT_USERNAME || '',
      password: process.env.SMS_DEFAULT_PASSWORD || '',
      senderId: process.env.SMS_DEFAULT_SENDER_ID || 'NOTICE',
    };

    return sendSuccess(res, { data: { ...school.toObject(), whatsappDefaults, emailDefaults, smsDefaults } });
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

async function updateSMSConfig(req, res, next) {
  try {
    const School = require('../models/School');
    const { smsConfig } = req.body;

    const school = await School.findByIdAndUpdate(
      req.user.id,
      { $set: { smsConfig } },
      { new: true, runValidators: true }
    ).select('smsConfig');

    if (!school) throw new Error('School not found');

    return sendSuccess(res, { message: 'SMS settings updated', data: school.smsConfig });
  } catch (err) {
    next(err);
  }
}
async function createWhatsappTemplate(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      return res.status(400).json({ message: 'Template name can only contain lowercase letters, numbers, and underscores (no spaces or other special characters).' });
    }

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
    // Find by Mongo _id OR Meta templateId
    const template = school.whatsappTemplates.find(t => t._id.toString() === req.params.id || t.templateId === req.params.id);
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
    const templateIndex = school.whatsappTemplates.findIndex(t => t._id.toString() === req.params.id || t.templateId === req.params.id || t.name === req.params.id);
    
    let templateName;
    if (templateIndex !== -1) {
      templateName = school.whatsappTemplates[templateIndex].name;
    } else {
      templateName = req.query.name || req.params.id;
    }

    // Call Meta API first to ensure it's deleted there before removing locally
    if (templateName) {
      try {
        await whatsappUtils.deleteWhatsappTemplate(school, templateName);
      } catch (metaErr) {
        // If it returns 404, we assume it's already deleted from Meta
        const status = metaErr.statusCode || metaErr.status || (metaErr.response && metaErr.response.status);
        if (status !== 404) {
          throw metaErr;
        }
      }
    }

    // Now delete locally
    if (templateIndex !== -1) {
      school.whatsappTemplates.splice(templateIndex, 1);
      await school.save();
    } else if (!req.query.name && templateName === req.params.id && !templateName) {
      return res.status(404).json({ message: 'Template not found' });
    }

    return sendSuccess(res, { message: 'WhatsApp template deleted successfully' });
  } catch (err) {
    next(err);
  }
}
async function syncWhatsappTemplates(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    const metaRes = await whatsappUtils.getWhatsappTemplates(school, 100, 0);
    
    if (!metaRes || !metaRes.data) {
      return sendSuccess(res, { message: 'No templates found on Meta to sync' });
    }

    let syncCount = 0;
    const metaTemplates = metaRes.data;

    metaTemplates.forEach(mt => {
      // Find components
      const bodyComp = mt.components?.find(c => c.type === 'BODY');
      const headerComp = mt.components?.find(c => c.type === 'HEADER');
      const footerComp = mt.components?.find(c => c.type === 'FOOTER');

      const templateData = {
        templateId: mt.id,
        name: mt.name,
        category: mt.category,
        language: mt.language,
        status: mt.status,
        body: bodyComp?.text || '',
        header: headerComp ? { type: 'TEXT', text: headerComp.text } : { type: 'NONE', text: '' },
        footer: footerComp?.text || ''
      };

      // Check if exists locally
      const existingIdx = school.whatsappTemplates.findIndex(t => t.name === mt.name);
      if (existingIdx > -1) {
        // Update existing
        Object.assign(school.whatsappTemplates[existingIdx], templateData);
      } else {
        // Add new
        school.whatsappTemplates.push(templateData);
      }
      syncCount++;
    });

    await school.save();
    return sendSuccess(res, { message: `Successfully synced ${syncCount} templates from Meta`, count: syncCount });
  } catch (err) {
    next(err);
  }
}

async function getWhatsappTemplates(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    // Sort by newest first
    const templates = [...school.whatsappTemplates].reverse();
    return sendSuccess(res, { data: templates });
  } catch (err) {
    next(err);
  }
}

async function getCampaignTemplates(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    return sendSuccess(res, { data: school.campaignTemplates || [] });
  } catch (err) {
    next(err);
  }
}

async function createCampaignTemplate(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    school.campaignTemplates.push(req.body);
    await school.save();
    return sendCreated(res, { message: 'Campaign template created successfully', data: school.campaignTemplates[school.campaignTemplates.length - 1] });
  } catch (err) {
    next(err);
  }
}

async function updateCampaignTemplate(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    const template = school.campaignTemplates.id(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Campaign template not found' });
    }
    Object.assign(template, req.body);
    await school.save();
    return sendSuccess(res, { message: 'Campaign template updated successfully', data: template });
  } catch (err) {
    next(err);
  }
}

async function deleteCampaignTemplate(req, res, next) {
  try {
    const school = await authService.getSchoolById(req.user.id);
    const templateIndex = school.campaignTemplates.findIndex(t => t._id.toString() === req.params.id);
    if (templateIndex === -1) {
      return res.status(404).json({ message: 'Campaign template not found' });
    }
    school.campaignTemplates.splice(templateIndex, 1);
    await school.save();
    return sendSuccess(res, { message: 'Campaign template deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    await authService.changeSchoolPassword(req.user.id, req.body);
    return sendSuccess(res, { message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register, login, getProfile, getFeeSummary,
  updatePaymentProviders, getPayments,
  updateReminderSettings, updateOverdueRules, updateOverdueRepeatRule,
  updateEmailConfig, testEmailConfig,
  updateWhatsappConfig, updateSMSConfig,
  createWhatsappTemplate, updateWhatsappTemplate, deleteWhatsappTemplate, getWhatsappTemplates, syncWhatsappTemplates,
  getCampaignTemplates, createCampaignTemplate, updateCampaignTemplate, deleteCampaignTemplate,
  changePassword,
};
