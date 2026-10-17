/**
 * modules/auth/auth.routes.ts — Express routes for authentication.
 * DOC3 §3.8.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  StaffLoginSchema,
} from '@messpulse/shared';
import { AuthError, ValidationError } from '../../shared-kernel/errors';
import type { AuthService } from './auth.service';
import type { createAuthMiddleware } from './auth.middleware';

export function createAuthRoutes(
  authService: AuthService,
  authMiddleware: ReturnType<typeof createAuthMiddleware>
): Router {
  const router = Router();

  // Rate limiter for OTP request endpoint: 20 requests per 10 minutes per IP
  const otpRequestLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT',
        message: 'Too many OTP requests. Please try again later.',
      },
    },
  });

  /**
   * POST /api/v1/auth/otp/request
   * Request email OTP. Always returns 202 Accepted.
   */
  router.post(
    '/otp/request',
    otpRequestLimiter,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = OtpRequestSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid request payload',
            parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              issue: i.message,
            }))
          );
        }

        await authService.requestOtp(parsed.data.email);

        res.status(202).json({
          status: 'accepted',
          message: 'If the email is valid, a verification code has been sent.',
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/v1/auth/otp/verify
   * Verify email OTP and obtain JWT.
   */
  router.post(
    '/otp/verify',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = OtpVerifySchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid request payload',
            parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              issue: i.message,
            }))
          );
        }

        const authResponse = await authService.verifyOtp(
          parsed.data.email,
          parsed.data.code
        );

        res.status(200).json(authResponse);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/v1/auth/staff/login
   * PIN login for staff or admin.
   */
  router.post(
    '/staff/login',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = StaffLoginSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new ValidationError(
            'Invalid request payload',
            parsed.error.issues.map((i) => ({
              field: i.path.join('.'),
              issue: i.message,
            }))
          );
        }

        const authResponse = await authService.loginStaff(
          parsed.data.identifier,
          parsed.data.pin
        );

        res.status(200).json(authResponse);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/v1/auth/me
   * Retrieve current authenticated user profile.
   */
  router.get(
    '/me',
    authMiddleware.requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!req.principal) {
          throw new AuthError('Authentication required');
        }
        const user = await authService.getMe(req.principal.userId);
        res.status(200).json({ user });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
