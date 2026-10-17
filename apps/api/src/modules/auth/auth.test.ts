/**
 * modules/auth/auth.test.ts — comprehensive tests for Auth and Roles (M7).
 * DOC3 §3.8, DOC4 Step 6.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { Request, Response, Application } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { connectMongo, disconnectMongo } from '../../infra/mongo/connection';
import { UserModel } from '../../infra/mongo/models/user.model';
import { MongoUserRepository } from '../../infra/mongo/user.repository';
import { InMemoryOtpStore } from '../../infra/memory/otp-store.memory';
import { ConsoleMailer } from '../../infra/mail/console.mailer';
import { ResendMailer } from '../../infra/mail/resend.mailer';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { createAuthMiddleware } from './auth.middleware';
import { buildApp } from '../../app';
import { buildContainer } from '../../container';
import { AuthError } from '../../shared-kernel/errors';

const JWT_SECRET = 'test-jwt-secret-min-16-characters-long';
const INGEST_KEY = 'test-ingest-key-1234';

describe('TokenService', () => {
  const tokenService = new TokenService(JWT_SECRET);

  it('signs and verifies a student token with 7d expiry', () => {
    const token = tokenService.sign({ id: 'user-student-1', role: 'student' });
    expect(typeof token).toBe('string');

    const principal = tokenService.verify(token);
    expect(principal).toEqual({
      userId: 'user-student-1',
      role: 'student',
    });

    const decoded = jwt.decode(token) as { exp: number; iat: number };
    const diffSec = decoded.exp - decoded.iat;
    expect(diffSec).toBe(7 * 24 * 60 * 60); // 7 days
  });

  it('signs and verifies a staff token with 12h expiry', () => {
    const token = tokenService.sign({ id: 'user-staff-1', role: 'staff' });
    const principal = tokenService.verify(token);
    expect(principal).toEqual({
      userId: 'user-staff-1',
      role: 'staff',
    });

    const decoded = jwt.decode(token) as { exp: number; iat: number };
    const diffSec = decoded.exp - decoded.iat;
    expect(diffSec).toBe(12 * 60 * 60); // 12 hours
  });

  it('signs and verifies an admin token with 12h expiry', () => {
    const token = tokenService.sign({ id: 'user-admin-1', role: 'admin' });
    const principal = tokenService.verify(token);
    expect(principal.role).toBe('admin');
  });

  it('rejects a tampered token with AuthError', () => {
    const token = tokenService.sign({ id: 'user-1', role: 'student' });
    const tampered = token.slice(0, -5) + 'abcde';
    expect(() => tokenService.verify(tampered)).toThrow(AuthError);
  });

  it('rejects an expired token with AuthError', () => {
    const expiredToken = jwt.sign(
      { sub: 'user-expired', role: 'student' },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );
    expect(() => tokenService.verify(expiredToken)).toThrow(AuthError);
  });

  it('rejects tokens signed with an unknown secret', () => {
    const foreignToken = jwt.sign(
      { sub: 'user-foreign', role: 'student' },
      'completely-different-secret-12345'
    );
    expect(() => tokenService.verify(foreignToken)).toThrow(AuthError);
  });

  it('rejects token with invalid role', () => {
    const badRoleToken = jwt.sign(
      { sub: 'user-bad', role: 'superhero' },
      JWT_SECRET
    );
    expect(() => tokenService.verify(badRoleToken)).toThrow(AuthError);
  });

  it('refuses initialization if secret is too short', () => {
    expect(() => new TokenService('short')).toThrow(/at least 16 characters/);
  });
});

describe('Mailers', () => {
  it('ConsoleMailer logs and captures the last sent OTP', async () => {
    const mailer = new ConsoleMailer();
    await mailer.sendOtp('alice@college.edu', '654321');
    expect(mailer.getLastOtp()).toEqual({
      email: 'alice@college.edu',
      otp: '654321',
    });
  });

  it('ResendMailer handles API error by throwing DependencyUnavailableError', async () => {
    const mailer = new ResendMailer('invalid_re_key');
    await expect(mailer.sendOtp('bob@college.edu', '111222')).rejects.toThrow(
      /Failed to send verification email/
    );
  });
});

describe('AuthService and Integration Routes', () => {
  let app: Application;
  let otpStore: InMemoryOtpStore;
  let userRepo: MongoUserRepository;
  let mailer: ConsoleMailer;
  let tokenService: TokenService;
  let authService: AuthService;
  let authMiddleware: ReturnType<typeof createAuthMiddleware>;

  beforeAll(async () => {
    await connectMongo();
  });

  afterAll(async () => {
    await disconnectMongo();
  });

  beforeEach(async () => {
    await UserModel.deleteMany({});

    otpStore = new InMemoryOtpStore();
    userRepo = new MongoUserRepository();
    mailer = new ConsoleMailer();
    tokenService = new TokenService(JWT_SECRET);
    authService = new AuthService(otpStore, userRepo, mailer, tokenService, {
      otpSecret: JWT_SECRET,
      allowedDomains: ['college.edu', 'ait.ac.in'],
    });
    authMiddleware = createAuthMiddleware(tokenService, INGEST_KEY);

    const container = buildContainer({
      otpStore,
      userRepo,
      mailer,
      tokenService,
      authService,
    });

    app = buildApp(container, (testApp) => {
      // Register test routes for role matrix verification
      testApp.get(
        '/test/staff-only',
        authMiddleware.requireAuth,
        authMiddleware.requireRole('staff', 'admin'),
        (_req: Request, res: Response) => {
          res.status(200).json({ ok: true, access: 'staff-only' });
        }
      );

      testApp.get(
        '/test/admin-only',
        authMiddleware.requireAuth,
        authMiddleware.requireRole('admin'),
        (_req: Request, res: Response) => {
          res.status(200).json({ ok: true, access: 'admin-only' });
        }
      );

      testApp.post(
        '/test/ingest-only',
        authMiddleware.requireIngestKey,
        (_req: Request, res: Response) => {
          res.status(200).json({ ok: true, access: 'ingest-only' });
        }
      );
    });
  });

  describe('OTP Flow End-to-End', () => {
    it('requests OTP for allowed domain, returns 202 and sends email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'student@college.edu' });

      expect(res.status).toBe(202);
      expect(res.body.status).toBe('accepted');

      const sent = mailer.getLastOtp();
      expect(sent).not.toBeNull();
      expect(sent?.email).toBe('student@college.edu');
      expect(sent?.otp).toMatch(/^\d{6}$/);
    });

    it('returns 202 and sends nothing for non-allowed domain', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'stranger@gmail.com' });

      expect(res.status).toBe(202);
      expect(mailer.getLastOtp()).toBeNull();
      const stored = await otpStore.get('stranger@gmail.com');
      expect(stored).toBeNull();
    });

    it('returns 422 VALIDATION_ERROR on malformed email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('verifies OTP successfully and returns student JWT token and user profile', async () => {
      // 1. Request OTP
      await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'ravi@college.edu' });

      const lastOtp = mailer.getLastOtp();
      expect(lastOtp).not.toBeNull();
      const otp = lastOtp ? lastOtp.otp : '';

      // 2. Verify OTP
      const verifyRes = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'ravi@college.edu', code: otp });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.token).toBeDefined();
      expect(verifyRes.body.user).toEqual({
        id: expect.any(String),
        role: 'student',
        name: 'ravi',
        email: 'ravi@college.edu',
      });

      // 3. User profile can be retrieved via GET /api/v1/auth/me
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${verifyRes.body.token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('ravi@college.edu');
      expect(meRes.body.user.role).toBe('student');

      // 4. Verifying again with the same code fails (one-time use)
      const repeatRes = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'ravi@college.edu', code: otp });
      expect(repeatRes.status).toBe(401);
    });

    it('locks out after 5 wrong attempts (429 RateLimitError)', async () => {
      await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ email: 'victim@college.edu' });

      // 5 wrong attempts return 401
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/otp/verify')
          .send({ email: 'victim@college.edu', code: '000000' });
        expect(res.status).toBe(401);
      }

      // 6th attempt returns 429 RATE_LIMIT
      const lockedRes = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'victim@college.edu', code: '000000' });
      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error.code).toBe('RATE_LIMIT');
    });

    it('returns 422 if verify request body has invalid code format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ email: 'test@college.edu', code: 'abc' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Staff PIN Login', () => {
    beforeEach(async () => {
      const pinHash = await bcrypt.hash('9876', 10);
      await userRepo.createStaffOrAdmin({
        email: 'manager@college.edu',
        name: 'Mess Manager',
        role: 'staff',
        pinHash,
      });

      const adminPinHash = await bcrypt.hash('5555', 10);
      await userRepo.createStaffOrAdmin({
        email: 'warden@college.edu',
        name: 'Warden Admin',
        role: 'admin',
        pinHash: adminPinHash,
      });
    });

    it('returns staff token on correct PIN', async () => {
      const res = await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ identifier: 'manager@college.edu', pin: '9876' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('staff');
      expect(res.body.user.email).toBe('manager@college.edu');

      const verified = tokenService.verify(res.body.token);
      expect(verified.role).toBe('staff');
    });

    it('returns 401 on wrong PIN', async () => {
      const res = await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ identifier: 'manager@college.edu', pin: '0000' });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_ERROR');
    });

    it('returns 401 for unknown user or student trying to login as staff', async () => {
      await userRepo.upsertStudent('student@college.edu');

      const res = await request(app)
        .post('/api/v1/auth/staff/login')
        .send({ identifier: 'student@college.edu', pin: '9876' });

      expect(res.status).toBe(401);
    });
  });

  describe('Role Matrix Integration Test', () => {
    let studentToken: string;
    let staffToken: string;
    let adminToken: string;

    beforeEach(async () => {
      studentToken = tokenService.sign({ id: 'student-id', role: 'student' });
      staffToken = tokenService.sign({ id: 'staff-id', role: 'staff' });
      adminToken = tokenService.sign({ id: 'admin-id', role: 'admin' });
    });

    it('student token on a staff-only route returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/test/staff-only')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('no token on protected route returns 401 AuthError', async () => {
      const res = await request(app).get('/test/staff-only');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_ERROR');
    });

    it('malformed bearer header returns 401 AuthError', async () => {
      const res = await request(app)
        .get('/test/staff-only')
        .set('Authorization', 'NotBearer token');
      expect(res.status).toBe(401);
    });

    it('staff token on staff-only route returns 200', async () => {
      const res = await request(app)
        .get('/test/staff-only')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('staff token on admin-only route returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/test/admin-only')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('admin token on admin-only route returns 200', async () => {
      const res = await request(app)
        .get('/test/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('ingest key on a user/auth route returns 401', async () => {
      const res = await request(app)
        .get('/test/staff-only')
        .set('X-Ingest-Key', INGEST_KEY);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_ERROR');
    });

    it('valid ingest key on ingest route returns 200', async () => {
      const res = await request(app)
        .post('/test/ingest-only')
        .set('X-Ingest-Key', INGEST_KEY);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('invalid ingest key on ingest route returns 401', async () => {
      const res = await request(app)
        .post('/test/ingest-only')
        .set('X-Ingest-Key', 'wrong-ingest-key');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_ERROR');
    });

    it('missing ingest key on ingest route returns 401', async () => {
      const res = await request(app).post('/test/ingest-only');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('AUTH_ERROR');
    });
  });
});
