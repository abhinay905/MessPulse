/**
 * Smoke test: GET /healthz returns 200 {status: 'ok'}.
 * Uses Supertest against the Express app without listening on a real port.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';

// Set required env vars before importing config
process.env['NODE_ENV'] = 'test';
process.env['PORT'] = '3000';
process.env['MONGO_URL'] = 'mongodb://localhost:27017/messpulse_test';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['JWT_SECRET'] = 'test-jwt-secret-long-enough-for-tests';
process.env['JWT_EXPIRES_IN'] = '7d';
process.env['INGEST_KEY'] = 'test-ingest-key';
process.env['MAILER_PROVIDER'] = 'console';
process.env['OTP_ALLOWED_DOMAINS'] = 'college.edu';
process.env['DEFAULT_MESS_ID'] = 'mess-default';
process.env['ALLOW_SIMULATOR'] = 'true';

let app: Application;

beforeAll(async () => {
  const { buildApp } = await import('./app');
  app = buildApp();
});

describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /readyz', () => {
  it('returns 200 with checks', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Unknown route', () => {
  it('returns 404', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
  });
});
