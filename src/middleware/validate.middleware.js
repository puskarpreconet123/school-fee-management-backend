'use strict';

const AppError = require('../utils/AppError');

/**
 * Joi validation middleware factory.
 *
 * @param {import('joi').ObjectSchema} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/['"]/g, ''),
      }));
      return next(new AppError('Validation failed', 422, errors));
    }

    // Replace with stripped/coerced values
    req[source] = value;
    next();
  };
}

module.exports = { validate };
