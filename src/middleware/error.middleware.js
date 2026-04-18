'use strict';

const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Centralised error handler.
 * Converts known error types into clean AppErrors; otherwise returns 500.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let error = err;

  // ── Mongoose cast error (invalid ObjectId) ───────────────────────────────
  if (err instanceof mongoose.Error.CastError) {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }

  // ── Mongoose validation error ────────────────────────────────────────────
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = new AppError('Validation failed', 422, messages);
  }

  // ── Mongoose duplicate key ───────────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    error = new AppError(`Duplicate value for field: ${field}`, 409);
  }

  // ── JWT errors already converted in auth middleware ──────────────────────

  const statusCode = error.statusCode || 500;
  const isOperational = error.isOperational === true;

  // Log non-operational (programmer) errors with full stack
  if (!isOperational) {
    logger.error('Unexpected error', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
    });
  }

  const body = {
    success: false,
    message: isOperational ? error.message : 'Internal server error',
  };

  if (error.errors) body.errors = error.errors;

  // Expose stack in development
  if (process.env.NODE_ENV === 'development' && !isOperational) {
    body.stack = err.stack;
  }

  return res.status(statusCode).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
}

module.exports = { errorHandler, notFoundHandler };
