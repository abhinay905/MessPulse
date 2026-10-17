/**
 * modules/auth/token.service.ts — JWT issuance and verification.
 * DOC3 §3.8.
 * THE ONLY JWT CODE IN THE ENTIRE REPOSITORY.
 */

import jwt from 'jsonwebtoken';
import type { Role } from '@messpulse/shared';
import { AuthError } from '../../shared-kernel/errors';
import type { Principal } from './auth.ports';

export interface TokenUser {
  id: string;
  role: Role;
}

interface JwtPayload {
  sub: string;
  role: Role;
  iat?: number;
  exp?: number;
}

export class TokenService {
  constructor(private readonly jwtSecret: string) {
    if (!jwtSecret || jwtSecret.length < 16) {
      throw new Error('JWT secret must be at least 16 characters');
    }
  }

  sign(user: TokenUser): string {
    const expiresIn = user.role === 'student' ? '7d' : '12h';
    return jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      this.jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn,
      }
    );
  }

  verify(token: string): Principal {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
      if (!decoded || typeof decoded.sub !== 'string' || !decoded.role) {
        throw new AuthError('Invalid token payload');
      }
      if (decoded.role !== 'student' && decoded.role !== 'staff' && decoded.role !== 'admin') {
        throw new AuthError('Invalid role in token');
      }
      return {
        userId: decoded.sub,
        role: decoded.role,
      };
    } catch (err) {
      if (err instanceof AuthError) {
        throw err;
      }
      throw new AuthError('Invalid or expired authentication token');
    }
  }
}
