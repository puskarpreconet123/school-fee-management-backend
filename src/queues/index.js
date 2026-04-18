'use strict';

const { initQueues } = require('./queues');
const { startReminderWorker } = require('./workers/reminder.worker');
const { startNotificationWorker } = require('./workers/notification.worker');
const { startCsvWorker } = require('./workers/csv.worker');
const { startCommunicateWorker } = require('./workers/communicate.worker');
const { startPaymentExpiryWorker } = require('./workers/payment-expiry.worker');
const logger = require('../utils/logger');

function startWorkers() {
  initQueues();

  startReminderWorker();
  startNotificationWorker();
  startCsvWorker();
  startCommunicateWorker();
  startPaymentExpiryWorker();

  logger.info('BullMQ workers started: reminder, notification, csv, communicate, payment-expiry');
}

module.exports = { startWorkers };
