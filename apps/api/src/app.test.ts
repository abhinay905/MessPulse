/**
 * Smoke test: GET /healthz and GET /readyz.
 * Uses Supertest against the Express app without listening on a real port.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { connectMongo, disconnectMongo } from './infra/mongo/connection';

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
  await connectMongo();
  const { buildApp } = await import('./app');
  app = buildApp();
});

afterAll(async () => {
  await disconnectMongo();
});

describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /readyz', () => {
  it('returns 200 with readiness checks for api, mongo, and redis', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks).toEqual({
      api: 'ok',
      mongo: 'ok',
      redis: 'ok',
    });
  });
});

describe('Unknown API route', () => {
  it('returns 404 for unknown api endpoint', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('SPA fallback in production', () => {
  it('serves web index.html for client routes', async () => {
    const res = await request(app).get('/student');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
