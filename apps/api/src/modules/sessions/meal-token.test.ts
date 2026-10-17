/**
 * modules/sessions/meal-token.test.ts — Unit tests for meal-token signing and verification.
 * DOC3 §3.4.
 */

import { describe, it, expect } from 'vitest';
import { signMealToken, verifyMealToken } from './meal-token';
import { ValidationError } from '../../shared-kernel/errors';

describe('meal-token', () => {
  const secret = 'super-secret-test-jwt-key-min-16-chars';
  const payload = { messId: 'mess-main-hall', mealId: '20261017-lunch' };

  it('signs and verifies a valid meal token', () => {
    const token = signMealToken(payload, secret, 3600);
    const decoded = verifyMealToken(token, secret);

    expect(decoded.messId).toBe(payload.messId);
    expect(decoded.mealId).toBe(payload.mealId);
  });

  it('throws 422 MEAL_TOKEN_INVALID on expired token', async () => {
    // 0 or -1 second expiry
    const token = signMealToken(payload, secret, -1);

    expect(() => verifyMealToken(token, secret)).toThrowError(ValidationError);
    try {
      verifyMealToken(token, secret);
    } catch (err) {
      const valErr = err as ValidationError;
      expect(valErr.httpStatus).toBe(422);
      expect(valErr.code).toBe('MEAL_TOKEN_INVALID');
      expect(valErr.message).toBe('This QR code has expired — scan the one at the entrance.');
    }
  });

  it('throws 422 MEAL_TOKEN_INVALID on malformed token string', () => {
    expect(() => verifyMealToken('invalid.token.here', secret)).toThrowError(ValidationError);
    try {
      verifyMealToken('garbage', secret);
    } catch (err) {
      const valErr = err as ValidationError;
      expect(valErr.httpStatus).toBe(422);
      expect(valErr.code).toBe('MEAL_TOKEN_INVALID');
    }
  });

  it('throws 422 MEAL_TOKEN_INVALID on wrong secret', () => {
    const token = signMealToken(payload, secret, 3600);
    expect(() => verifyMealToken(token, 'different-wrong-secret-key-16-chars')).toThrowError(ValidationError);
    try {
      verifyMealToken(token, 'different-wrong-secret-key-16-chars');
    } catch (err) {
      const valErr = err as ValidationError;
      expect(valErr.httpStatus).toBe(422);
      expect(valErr.code).toBe('MEAL_TOKEN_INVALID');
    }
  });
});
