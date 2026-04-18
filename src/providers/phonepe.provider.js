'use strict';

const axios = require('axios');
const BaseProvider = require('./base.provider');
const { sha256, base64Encode, base64Decode, safeCompare } = require('../utils/crypto');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

class PhonePeProvider extends BaseProvider {
  constructor(config) {
    super(config);

    this.merchantId = config.merchantId || process.env.PHONEPE_MERCHANT_ID;
    this.saltKey = config.saltKey || process.env.PHONEPE_SALT_KEY;
    this.saltIndex = config.saltIndex ?? parseInt(process.env.PHONEPE_SALT_INDEX || '1', 10);
    this.baseUrl = process.env.PHONEPE_BASE_URL || 'https://api-preprod.phonepe.com/apis/pg-sandbox';
    this.callbackBaseUrl = process.env.PHONEPE_CALLBACK_BASE_URL || 'http://localhost:5000';

    if (!this.merchantId || !this.saltKey) {
      throw new AppError('PhonePe credentials (merchantId / saltKey) are missing', 500);
    }
  }

  /**
   * Build PhonePe X-VERIFY checksum.
   * checksum = SHA256(base64Payload + "/pg/v1/pay" + saltKey) + "###" + saltIndex
   */
  _buildChecksum(base64Payload, endpoint = '/pg/v1/pay') {
    const hash = sha256(`${base64Payload}${endpoint}${this.saltKey}`);
    return `${hash}###${this.saltIndex}`;
  }

  /**
   * Verify PhonePe status-check checksum.
   * checksum = SHA256("/pg/v1/status/{merchantId}/{merchantTransactionId}" + saltKey) + "###" + saltIndex
   */
  _buildStatusChecksum(merchantTransactionId) {
    const path = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;
    const hash = sha256(`${path}${this.saltKey}`);
    return `${hash}###${this.saltIndex}`;
  }

  /**
   * Create a PhonePe payment order (initiates redirect-based payment).
   * Returns the payment URL that the client must redirect to.
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    const merchantTransactionId = receipt; // reuse receipt as transaction ID

    const payloadObj = {
      merchantId: this.merchantId,
      merchantTransactionId,
      merchantUserId: notes.studentId || 'student',
      amount,  // already in paise
      currency,
      redirectUrl: `${this.callbackBaseUrl}/api/payments/callback/phonepe/${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: `${this.callbackBaseUrl}/api/payments/webhook/phonepe`,
      paymentInstrument: { type: 'PAY_PAGE' },
    };

    const base64Payload = base64Encode(payloadObj);
    const checksum = this._buildChecksum(base64Payload);

    try {
      const response = await axios.post(
        `${this.baseUrl}/pg/v1/pay`,
        { request: base64Payload },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
          },
          timeout: 10000,
        }
      );

      const data = response.data;

      if (!data.success) {
        throw new AppError(`PhonePe error: ${data.message || 'Order creation failed'}`, 502);
      }

      const redirectUrl = data.data?.instrumentResponse?.redirectInfo?.url;

      logger.info('PhonePe order created', { merchantTransactionId, redirectUrl });

      return {
        orderId: merchantTransactionId,
        providerData: {
          merchantTransactionId,
          redirectUrl,
          raw: data,
        },
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.error('PhonePe createOrder failed', { error: err.message });
      throw new AppError(`PhonePe order creation failed: ${err.message}`, 502);
    }
  }

  /**
   * Verify payment status via PhonePe Status Check API.
   * Called after the client is redirected back.
   */
  async verifyPayment({ merchantTransactionId }) {
    if (!merchantTransactionId) {
      throw new AppError('merchantTransactionId is required for PhonePe verification', 400);
    }

    const checksum = this._buildStatusChecksum(merchantTransactionId);

    try {
      const response = await axios.get(
        `${this.baseUrl}/pg/v1/status/${this.merchantId}/${merchantTransactionId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': this.merchantId,
          },
          timeout: 10000,
        }
      );

      const data = response.data;
      const verified = data.success && data.data?.state === 'COMPLETED';

      logger.info('PhonePe payment verification', { merchantTransactionId, verified, state: data.data?.state });

      return {
        verified,
        paymentId: data.data?.transactionId || merchantTransactionId,
        orderId: merchantTransactionId,
      };
    } catch (err) {
      logger.error('PhonePe verifyPayment failed', { error: err.message });
      throw new AppError(`PhonePe status check failed: ${err.message}`, 502);
    }
  }

  /**
   * Handle PhonePe webhook (S2S callback).
   * PhonePe sends: { response: base64EncodedPayload }
   * X-VERIFY = SHA256(base64Response + saltKey) + "###" + saltIndex
   */
  async handleWebhook(req) {
    const signature = req.headers['x-verify'];
    const { response: base64Response } = req.body;

    if (!signature || !base64Response) {
      throw new AppError('Missing PhonePe webhook signature or payload', 400);
    }

    // Verify checksum
    const expectedHash = sha256(`${base64Response}${this.saltKey}`);
    const expected = `${expectedHash}###${this.saltIndex}`;

    if (!safeCompare(expected, signature)) {
      logger.warn('PhonePe webhook signature mismatch');
      throw new AppError('Invalid PhonePe webhook signature', 400);
    }

    let payload;
    try {
      payload = base64Decode(base64Response);
    } catch {
      throw new AppError('Failed to decode PhonePe webhook payload', 400);
    }

    const state = payload.data?.state;
    const status = state === 'COMPLETED' ? 'SUCCESS' : 'FAILED';
    const merchantTransactionId = payload.data?.merchantTransactionId;
    const transactionId = payload.data?.transactionId;

    logger.info('PhonePe webhook received', { merchantTransactionId, status });

    return {
      eventId: `phonepe-${merchantTransactionId}-${transactionId}`,
      orderId: merchantTransactionId,
      paymentId: transactionId,
      status,
      raw: payload,
    };
  }
}

module.exports = PhonePeProvider;
