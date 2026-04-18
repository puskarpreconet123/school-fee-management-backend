'use strict';

const RazorpayProvider = require('./razorpay.provider');
const PhonePeProvider = require('./phonepe.provider');
const AppError = require('../utils/AppError');

const PROVIDER_MAP = {
  razorpay: RazorpayProvider,
  phonepe: PhonePeProvider,
};

/**
 * Factory: returns an instantiated provider for the given type and config.
 *
 * @param {'razorpay'|'phonepe'} type
 * @param {object} config  Provider-specific credentials
 * @returns {import('./base.provider')}
 */
function getProvider(type, config = {}) {
  const ProviderClass = PROVIDER_MAP[type];
  if (!ProviderClass) {
    throw new AppError(`Unsupported payment provider: "${type}"`, 400);
  }
  return new ProviderClass(config);
}

/**
 * Returns the provider for a specific school + type combination.
 * Reads credentials directly from the School document.
 *
 * @param {import('../models/School')} school  Mongoose School document
 * @param {'razorpay'|'phonepe'} type
 */
function getProviderForSchool(school, type) {
  const config = school.getProviderConfig(type); // throws if not active
  return getProvider(type, config);
}

module.exports = { getProvider, getProviderForSchool, PROVIDER_MAP };
