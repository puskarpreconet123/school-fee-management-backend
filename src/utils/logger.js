'use strict';

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, printf, colorize, errors } = format;

const isDev = process.env.NODE_ENV !== 'production';

const logFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const base = `${ts} [${level}] ${message}`;
  const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta)}` : '';
  const stackStr = stack ? `\n${stack}` : '';
  return `${base}${metaStr}${stackStr}`;
});

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    isDev ? colorize() : format.uncolorize(),
    logFormat
  ),
  transports: [
    new transports.Console(),
    ...(isDev
      ? []
      : [
          new transports.File({ filename: 'logs/error.log', level: 'error' }),
          new transports.File({ filename: 'logs/combined.log' }),
        ]),
  ],
  exitOnError: false,
});

// Morgan stream compatibility
logger.http = (msg) => logger.info(msg, { source: 'http' });

module.exports = logger;
