'use strict';

/**
 * Operational error class.  Thrown from services/providers to produce clean
 * HTTP responses without leaking stack traces.
 */
class AppError extends Error {
  /**
   * @param {string} message  Human-readable message
   * @param {number} statusCode  HTTP status code
   * @param {*} [errors]  Optional structured validation errors
   */
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
