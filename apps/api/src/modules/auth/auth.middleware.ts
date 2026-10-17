/**
 * modules/auth/auth.middleware.ts — Express middleware for authentication and authorization.
 * DOC3 §3.8.
 */

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@messpulse/shared';
import { AuthError, ForbiddenError } from '../../shared-kernel/errors';
import type { TokenService } from './token.service';

export function createAuthMiddleware(tokenService: TokenService, ingestKey: string) {
  /**
   * Validates Authorization: Bearer <jwt> and attaches req.principal.
   */
  function requireAuth(req: Request, _res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AuthError('Missing bearer token');
    }

    const principal = tokenService.verify(token);
    req.principal = principal;
    next();
  }

  /**
   * Enforces role requirements. Returns 403 ForbiddenError if authenticated but wrong role.
   */
  function requireRole(...roles: Role[]) {
    return (req: Request, _res: Response, next: NextFunction): void => {
      if (!req.principal) {
        throw new AuthError('Authentication required');
      }

      if (!roles.includes(req.principal.role)) {
        throw new ForbiddenError(
          `Insufficient permissions: requires one of [${roles.join(', ')}] but user has '${req.principal.role}'`
        );
      }

      next();
    };
  }

  /**
   * Constant-time comparison for the ingest key.
   */
  function requireIngestKey(req: Request, _res: Response, next: NextFunction): void {
    const headerKey = req.headers['x-ingest-key'];
    if (!headerKey || typeof headerKey !== 'string') {
      throw new AuthError('Missing or invalid X-Ingest-Key header');
    }

    const providedBuffer = Buffer.from(headerKey.trim());
    const expectedBuffer = Buffer.from(ingestKey.trim());

    if (providedBuffer.length !== expectedBuffer.length) {
      throw new AuthError('Invalid ingest key');
    }

    const matches = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    if (!matches) {
      throw new AuthError('Invalid ingest key');
    }

    next();
  }

  return {
    requireAuth,
    requireRole,
    requireIngestKey,
  };
}
