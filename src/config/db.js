'use strict';

const mongoose = require('mongoose');
const logger = require('../utils/logger');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const options = {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  };

  try {
    await mongoose.connect(process.env.MONGO_URI, options);
    isConnected = true;
    logger.info('MongoDB connected', { uri: process.env.MONGO_URI?.replace(/\/\/.*@/, '//***@') });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected — attempting reconnect');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB error', { error: err.message });
    });
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message });
    throw err;
  }
}

module.exports = { connectDB };
