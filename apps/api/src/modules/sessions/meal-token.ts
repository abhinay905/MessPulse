/**
 * modules/sessions/meal-token.ts — signs and verifies meal tokens for check-in QR codes.
 * DOC3 §3.4: (JWT: messId, mealId, exp).
 * Auth: HMAC-SHA256 with JWT_SECRET.
 */

import jwt from 'jsonwebtoken';
import { ValidationError } from '../../shared-kernel/errors';

export interface MealTokenPayload {
  messId: string;
  mealId: string;
}

/**
 * Signs a JWT meal token for the check-in QR code.
 *
 * @param payload - messId and mealId
 * @param secret - JWT signing secret
 * @param expiresInSec - duration token is valid (default 7200 s = 2 hours)
 */
export function signMealToken(
  payload: MealTokenPayload,
  secret: string,
  expiresInSec: number = 7200
): string {
  return jwt.sign(
    {
      messId: payload.messId,
      mealId: payload.mealId,
    },
    secret,
    {
      algorithm: 'HS256',
      expiresIn: expiresInSec,
    }
  );
}

/**
 * Verifies a JWT meal token from check-in.
 * Throws 422 MEAL_TOKEN_INVALID if expired or invalid.
 */
export function verifyMealToken(token: string, secret: string): MealTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (
      !decoded ||
      typeof decoded !== 'object' ||
      typeof decoded.messId !== 'string' ||
      typeof decoded.mealId !== 'string'
    ) {
      throw new ValidationError(
        'This QR code has expired — scan the one at the entrance.',
        undefined,
        'MEAL_TOKEN_INVALID'
      );
    }
    return {
      messId: decoded.messId,
      mealId: decoded.mealId,
    };
  } catch (err) {
    if (err instanceof ValidationError) {
      throw err;
    }
    throw new ValidationError(
      'This QR code has expired — scan the one at the entrance.',
      err instanceof Error ? err.message : undefined,
      'MEAL_TOKEN_INVALID'
    );
  }
}
