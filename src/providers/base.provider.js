'use strict';

/**
 * Abstract base class for payment providers.
 * Every concrete provider MUST implement all three methods.
 */
class BaseProvider {
  /**
   * @param {object} config  Provider-specific credentials from School.paymentProviders
   */
  constructor(config) {
    if (new.target === BaseProvider) {
      throw new TypeError('Cannot instantiate abstract BaseProvider');
    }
    this.config = config;
  }

  /**
   * Create a payment order / transaction on the gateway.
   * @param {object} data
   * @param {number} data.amount        Amount in paise (INR smallest unit)
   * @param {string} data.currency      e.g. 'INR'
   * @param {string} data.receipt       Unique receipt/reference id
   * @param {object} [data.notes]       Optional metadata
   * @returns {Promise<{orderId: string, providerData: object}>}
   */
  // eslint-disable-next-line no-unused-vars
  async createOrder(data) {
    throw new Error(`${this.constructor.name} must implement createOrder()`);
  }

  /**
   * Verify a payment using data received from the client-side callback.
   * @param {object} data  Provider-specific fields
   * @returns {Promise<{verified: boolean, paymentId: string, orderId: string}>}
   */
  // eslint-disable-next-line no-unused-vars
  async verifyPayment(data) {
    throw new Error(`${this.constructor.name} must implement verifyPayment()`);
  }

  /**
   * Process an inbound webhook request.
   * @param {import('express').Request} req
   * @returns {Promise<{eventId: string, orderId: string, paymentId: string, status: 'SUCCESS'|'FAILED', raw: object}>}
   */
  // eslint-disable-next-line no-unused-vars
  async handleWebhook(req) {
    throw new Error(`${this.constructor.name} must implement handleWebhook()`);
  }
}

module.exports = BaseProvider;
