// A09: logs estructurados en JSON. Se redactan cookies, contrasenas, tokens y datos cifrados.
import pino from 'pino';
import { config } from './config/env.js';

export const logger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  base: { service: 'securevault' },
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
      '*.phone',
      '*.content',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});
