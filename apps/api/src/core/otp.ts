/**
 * core/otp.ts — pure OTP generation, HMAC hashing and timing-safe verification.
 * DOC3 §3.8.
 * Pure domain functions: uses node crypto (HMAC-SHA256 + timingSafeEqual).
 */

import crypto from 'crypto';

/**
 * Generates a 6-digit numeric OTP string uniformly between 100000 and 999999.
 */
export function generateOtp(): string {
  const code = crypto.randomInt(100000, 1000000);
  return code.toString();
}

/**
 * Hashes an OTP code using HMAC-SHA256 with the provided server secret.
 */
export function hashOtp(otp: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(otp).digest('hex');
}

/**
 * Compares an OTP attempt against the expected HMAC hex hash in constant time.
 */
export function verifyOtpHash(otp: string, secret: string, expectedHash: string): boolean {
  if (!otp || !secret || !expectedHash) {
    return false;
  }

  const computedHash = hashOtp(otp, secret);
  const computedBuffer = Buffer.from(computedHash, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (computedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, expectedBuffer);
}
