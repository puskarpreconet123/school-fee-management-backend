'use strict';

const Joi = require('joi');

const createFeeSchema = Joi.object({
  studentId: Joi.string().hex().length(24).optional(),
  className: Joi.string().trim().optional(),
  title: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().optional(),
  amount: Joi.number().min(1).required(),
  type: Joi.string().valid('one-time', 'periodic').default('one-time'),
  dueDate: Joi.date().iso().when('type', { is: 'one-time', then: Joi.required(), otherwise: Joi.optional() }),
  endDate: Joi.date().iso().when('type', { is: 'periodic', then: Joi.required(), otherwise: Joi.optional() }),
  dueDay: Joi.number().integer().min(1).max(31).when('type', { is: 'periodic', then: Joi.required(), otherwise: Joi.optional() }),
  currency: Joi.string().uppercase().length(3).default('INR'),
}).or('studentId', 'className');

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('UNPAID', 'PAID', 'OVERDUE', 'PARTIALLY_PAID').optional(),
});

module.exports = { createFeeSchema, listQuerySchema };
