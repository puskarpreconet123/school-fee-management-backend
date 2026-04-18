'use strict';

const Joi = require('joi');

const loginSchema = Joi.object({
  identifier: Joi.string().required()
    .messages({ 'any.required': 'Student ID, Email or phone is required' }),
  password: Joi.string().required(),
});

const createSchema = Joi.object({
  name: Joi.string().trim().max(150).required(),
  email: Joi.string().email().lowercase().optional(),
  phone: Joi.string().trim().optional(),
  class: Joi.string().trim().optional(),
  section: Joi.string().trim().optional(),
  rollNumber: Joi.string().trim().optional(),
  parentName: Joi.string().trim().optional(),
  parentPhone: Joi.string().trim().optional(),
});

const updateSchema = Joi.object({
  name: Joi.string().trim().max(150).optional(),
  email: Joi.string().email().lowercase().optional(),
  phone: Joi.string().trim().optional(),
  class: Joi.string().trim().optional(),
  section: Joi.string().trim().optional(),
  rollNumber: Joi.string().trim().optional(),
  parentName: Joi.string().trim().optional(),
  parentPhone: Joi.string().trim().optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(1000).default(20),
  search: Joi.string().trim().optional(),
  class: Joi.string().trim().optional(),
  section: Joi.string().trim().optional(),
});

module.exports = { loginSchema, createSchema, updateSchema, listQuerySchema };
