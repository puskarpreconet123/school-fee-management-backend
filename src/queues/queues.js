'use strict';

const { Queue } = require('bullmq');
const { createBullMQConnection } = require('../config/redis');

let reminderQueue;
let notificationQueue;
let csvQueue;
let communicateQueue;
let paymentExpiryQueue;

function initQueues() {
  const connection = createBullMQConnection();

  reminderQueue = new Queue('fee-reminders', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });

  notificationQueue = new Queue('notifications', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });

  csvQueue = new Queue('csv-processing', {
    connection,
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });

  communicateQueue = new Queue('communicate', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  });

  paymentExpiryQueue = new Queue('payment-expiry', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 200 },
    },
  });

  return { reminderQueue, notificationQueue, csvQueue, communicateQueue, paymentExpiryQueue };
}

function getReminderQueue() {
  if (!reminderQueue) throw new Error('Queues not initialized');
  return reminderQueue;
}

function getNotificationQueue() {
  if (!notificationQueue) throw new Error('Queues not initialized');
  return notificationQueue;
}

function getCsvQueue() {
  if (!csvQueue) throw new Error('Queues not initialized');
  return csvQueue;
}

function getCommunicateQueue() {
  if (!communicateQueue) throw new Error('Queues not initialized');
  return communicateQueue;
}

function getPaymentExpiryQueue() {
  if (!paymentExpiryQueue) throw new Error('Queues not initialized');
  return paymentExpiryQueue;
}

module.exports = { initQueues, getReminderQueue, getNotificationQueue, getCsvQueue, getCommunicateQueue, getPaymentExpiryQueue };
