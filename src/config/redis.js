'use strict';

const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

function createRedisClient() {
  const redisUrl = process.env.REDIS_URL;

  const baseOptions = {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  };

  const client = redisUrl
    ? new Redis(redisUrl, { ...baseOptions, tls: redisUrl.startsWith('rediss://') ? {} : undefined })
    : new Redis({
        ...baseOptions,
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.error('Redis error', { error: err.message }));
  client.on('close', () => logger.warn('Redis connection closed'));

  return client;
}

async function connectRedis() {
  redisClient = createRedisClient();
  await redisClient.connect();
  return redisClient;
}

function getRedisClient() {
  if (!redisClient) throw new Error('Redis not initialized — call connectRedis() first');
  return redisClient;
}

// BullMQ requires a fresh IORedis instance per queue/worker
function createBullMQConnection() {
  return createRedisClient();
}

module.exports = { connectRedis, getRedisClient, createBullMQConnection };
