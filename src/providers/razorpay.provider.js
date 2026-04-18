'use strict';

const Razorpay = require('razorpay');
const BaseProvider = require('./base.provider');
const { hmacSHA256, safeCompare } = require('../utils/crypto');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

class RazorpayProvider extends BaseProvider {
  constructor(config) {
    super(config);

    const keyId = config.keyId || process.env.RAZORPAY_KEY_ID;
    const keySecret = config.keySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new AppError('Razorpay credentials (keyId / keySecret) are missing', 500);
    }

    this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    this.webhookSecret = config.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
    this.keySecret = keySecret;
  }

  /**
   * Create a Razorpay order.
   * @returns {{ orderId, providerData }}
   */
  async createOrder({ amount, currency = 'INR', receipt, notes = {} }) {
    try {
      const order = await this.client.orders.create({
        amount,          // in paise
        currency,
        receipt,
        notes,
      });

      logger.info('Razorpay order created', { orderId: order.id, amount });

      return {
        orderId: order.id,
        providerData: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
        },
      };
    } catch (err) {
      logger.error('Razorpay createOrder failed', { error: err.message });
      throw new AppError(`Razorpay order creation failed: ${err.error?.description || err.message}`, 502);
    }
  }

  /**
   * Verify a payment using the HMAC signature sent from Razorpay's checkout.
   * Signature = HMAC-SHA256(orderId + "|" + paymentId, keySecret)
   */
  async verifyPayment({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new AppError('Missing Razorpay verification fields', 400);
    }

    const expectedSig = hmacSHA256(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      this.keySecret
    );

    const verified = safeCompare(expectedSig, razorpay_signature);

    if (!verified) {
      logger.warn('Razorpay signature verification failed', { orderId: razorpay_order_id });
      throw new AppError('Payment signature verification failed', 400);
    }

    logger.info('Razorpay payment verified', { orderId: razorpay_order_id, paymentId: razorpay_payment_id });

    return {
      verified: true,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    };
  }

  /**
   * Process Razorpay webhook.
   * Verifies X-Razorpay-Signature header.
   */
  async handleWebhook(req) {
    if (!this.webhookSecret) {
      throw new AppError('Razorpay webhook secret not configured', 500);
    }

    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      throw new AppError('Missing X-Razorpay-Signature header', 400);
    }

    const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);
    const expected = hmacSHA256(rawBody, this.webhookSecret);

    if (!safeCompare(expected, signature)) {
      logger.warn('Razorpay webhook signature mismatch');
      throw new AppError('Invalid webhook signature', 400);
    }

    const payload = req.body;
    const event = payload.event;
    const entity = payload.payload?.payment?.entity || {};

    const status = event === 'payment.captured' ? 'SUCCESS' : 'FAILED';

    return {
      eventId: payload.event_id || `${event}-${entity.id}`,
      orderId: entity.order_id,
      paymentId: entity.id,
      status,
      notes: entity.notes || {},
      raw: payload,
    };
  }
}

module.exports = RazorpayProvider;
