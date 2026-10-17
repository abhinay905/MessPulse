/**
 * infra/logger.ts — pino logger with PII redaction.
 * Redacts: email, lat, lng, otp, pin, token, ingestKey from all log paths.
 * DOC3 §3.1 / DOC2 §2.3 sensitive data rules.
 */
import pino from 'pino';
import { config } from '../config';

const PII_PATHS = [
  'email',
  'body.email',
  'req.body.email',
  'payload.email',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'otp',
  'code',
  'pin',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'ingestKey',
  'authorization',
  'req.headers.authorization',
  'req.headers["x-ingest-key"]',
];

const baseOptions: Parameters<typeof pino>[0] = {
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: PII_PATHS,
    censor: '[REDACTED]',
  },
};

if (config.NODE_ENV !== 'production') {
  baseOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  };
}

export const logger = pino(baseOptions);

export type Logger = typeof logger;
