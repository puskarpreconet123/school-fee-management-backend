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
  channel: Joi.string().valid('sms', 'whatsapp', 'call', 'email').default('sms'),
});

const updateReminderRulesSchema = Joi.object({
  reminderRules: Joi.array()
    .items(reminderRuleSchema)
    .min(1)
    .max(10)
    .unique('daysBefore')
    .required()
    .messages({
      'array.min': 'At least one reminder rule is required',
      'array.max': 'Cannot have more than 10 reminder rules',
      'array.unique': 'Each rule must have a unique "days before due date" value',
    }),
});

const overdueRuleSchema = Joi.object({
  daysAfter: Joi.number().integer().min(1).max(180).required(),
  timesPerDay: Joi.number().integer().min(1).max(5).required(),
  channel: Joi.string().valid('sms', 'whatsapp', 'call', 'email').default('sms'),
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
});

const updateOverdueRepeatRuleSchema = Joi.object({
  overdueRepeatRule: Joi.object({
    intervalDays: Joi.number().integer().min(1).max(30).required(),
    timesPerDay: Joi.number().integer().min(1).max(5).required(),
    channel: Joi.string().valid('sms', 'whatsapp', 'call', 'email').default('sms'),
  }).allow(null).required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProvidersSchema,
  updateReminderRulesSchema,
  updateOverdueRulesSchema,
  updateOverdueRepeatRuleSchema,
};
