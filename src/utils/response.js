'use strict';

/**
 * Standardised JSON response helpers.
 * Every API response follows the shape:
 *   { success, message, data?, meta? }
 */

function sendSuccess(res, { message = 'Success', data = null, meta = null, statusCode = 200 } = {}) {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
}

function sendCreated(res, { message = 'Created', data = null } = {}) {
  return sendSuccess(res, { message, data, statusCode: 201 });
}

function sendError(res, { message = 'An error occurred', errors = null, statusCode = 500 } = {}) {
  const body = { success: false, message };
  if (errors !== null) body.errors = errors;
  return res.status(statusCode).json(body);
}

function sendNotFound(res, message = 'Resource not found') {
  return sendError(res, { message, statusCode: 404 });
}

function sendUnauthorized(res, message = 'Unauthorized') {
  return sendError(res, { message, statusCode: 401 });
}

function sendForbidden(res, message = 'Forbidden') {
  return sendError(res, { message, statusCode: 403 });
}

function sendValidationError(res, errors) {
  return sendError(res, { message: 'Validation failed', errors, statusCode: 422 });
}

module.exports = {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendValidationError,
};
