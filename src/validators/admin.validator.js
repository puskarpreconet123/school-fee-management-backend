'use strict';

const Joi = require('joi');

const providerConfigSchema = Joi.object({
  type: Joi.string().valid('razorpay', 'phonepe').required(),
  isActive: Joi.boolean().default(true),
  config: Joi.object().required(),
});

const registerSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().min(8).required(),
  phone: Joi.string().trim().optional(),
  address: Joi.string().trim().optional(),
  paymentProviders: Joi.array().items(providerConfigSchema).min(1).required()
    .messages({ 'array.min': 'At least one payment provider is required' }),
});

const updateProvidersSchema = Joi.object({
  paymentProviders: Joi.array().items(providerConfigSchema).min(1).required()
    .messages({ 'array.min': 'At least one payment provider must be active' }),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const reminderRuleSchema = Joi.object({
  daysBefore: Joi.number().integer().min(0).max(60).required(),
  timesPerDay: Joi.number().integer().min(1).max(5).required(),
  channels: Joi.array().items(Joi.string().valid('sms', 'whatsapp', 'call', 'email')).min(1).required(),
});

const updateReminderRulesSchema = Joi.object({
  reminderRules: Joi.array()
    .items(reminderRuleSchema)
    .max(10)
    .unique('daysBefore')
    .required()
    .messages({
      'array.min': 'At least one reminder rule is required',
      'array.max': 'Cannot have more than 10 reminder rules',
      'array.unique': 'Each rule must have a unique "days before due date" value',
    }),
  reminderMessageTemplate: Joi.string().trim().allow('').optional(),
});

const overdueRuleSchema = Joi.object({
  daysAfter: Joi.number().integer().min(1).max(180).required(),
  timesPerDay: Joi.number().integer().min(1).max(5).required(),
  channels: Joi.array().items(Joi.string().valid('sms', 'whatsapp', 'call', 'email')).min(1).required(),
});

const updateOverdueRulesSchema = Joi.object({
  overdueRules: Joi.array()
    .items(overdueRuleSchema)
    .max(10)
    .unique('daysAfter')
    .required()
    .messages({
      'array.max': 'Cannot have more than 10 overdue rules',
      'array.unique': 'Each rule must have a unique "days after due date" value',
    }),
  reminderMessageTemplate: Joi.string().trim().allow('').optional(),
});

const updateOverdueRepeatRuleSchema = Joi.object({
  overdueRepeatRule: Joi.object({
    intervalDays: Joi.number().integer().min(1).max(30).required(),
    timesPerDay: Joi.number().integer().min(1).max(5).required(),
    channels: Joi.array().items(Joi.string().valid('sms', 'whatsapp', 'call', 'email')).min(1).required(),
  }).allow(null).required(),
  reminderMessageTemplate: Joi.string().trim().allow('').optional(),
});

const updateEmailConfigSchema = Joi.object({
  emailConfig: Joi.object({
    host:      Joi.string().trim().min(1).required(),
    port:      Joi.number().integer().min(1).max(65535).default(587),
    secure:    Joi.boolean().default(false),
    user:      Joi.string().trim().min(1).required(),
    pass:      Joi.string().min(1).required(),
    from:      Joi.string().trim().allow('').optional(),
    useCustom: Joi.boolean().default(true),
  }).required(),
});

const updateWhatsappConfigSchema = Joi.object({
  whatsappConfig: Joi.object({
    apiUrl:    Joi.string().uri().trim().required(),
    channelId: Joi.string().trim().required(),
    apiKey:    Joi.string().trim().required(),
    accessToken: Joi.string().trim().required(),
    wabaId:    Joi.string().trim().required(),
    phoneNumberId: Joi.string().trim().required(),
    apiVersion: Joi.string().trim().required(),
    useCustom: Joi.boolean().default(true),
  }).required(),
});

const whatsappTemplateSchema = Joi.object({
  name: Joi.string().trim().required(),
  category: Joi.string().valid('MARKETING', 'UTILITY', 'AUTHENTICATION').default('MARKETING'),
  language: Joi.string().default('en'),
  header: Joi.object({
    type: Joi.string().valid('TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'NONE').default('NONE'),
    text: Joi.string().trim().allow('').optional(),
  }).optional(),
  body: Joi.string().trim().required(),
  footer: Joi.string().trim().allow('').optional(),
  buttons: Joi.array().items(Joi.any()).optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProvidersSchema,
  updateReminderRulesSchema,
  updateOverdueRulesSchema,
  updateOverdueRepeatRuleSchema,
  updateEmailConfigSchema,
  updateWhatsappConfigSchema,
  whatsappTemplateSchema,
};
