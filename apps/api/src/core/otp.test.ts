import { describe, expect, it } from 'vitest';
import { generateOtp, hashOtp, verifyOtpHash } from './otp';

describe('otp domain functions', () => {
  const secret = 'super-secret-jwt-signing-key-for-test-32chars';

  describe('generateOtp', () => {
    it('generates a 6-digit numeric string between 100000 and 999999', () => {
      for (let i = 0; i < 50; i++) {
        const otp = generateOtp();
        expect(otp).toHaveLength(6);
        expect(/^\d{6}$/.test(otp)).toBe(true);
        const num = parseInt(otp, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThan(1000000);
      }
    });
  });

  describe('hashOtp', () => {
    it('produces a deterministic 64-character HMAC-SHA256 hex string', () => {
      const code = '123456';
      const hash1 = hashOtp(code, secret);
      const hash2 = hashOtp(code, secret);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });

    it('produces different hashes for different secrets or codes', () => {
      const hashA = hashOtp('123456', secret);
      const hashB = hashOtp('123457', secret);
      const hashC = hashOtp('123456', 'different-secret-key-32chars-min');

      expect(hashA).not.toBe(hashB);
      expect(hashA).not.toBe(hashC);
    });
  });

  describe('verifyOtpHash', () => {
    it('returns true when code and secret match the expected hash', () => {
      const otp = '654321';
      const expectedHash = hashOtp(otp, secret);

      expect(verifyOtpHash(otp, secret, expectedHash)).toBe(true);
    });

    it('returns false when code is incorrect', () => {
      const expectedHash = hashOtp('123456', secret);
      expect(verifyOtpHash('999999', secret, expectedHash)).toBe(false);
    });

    it('returns false when secret is incorrect', () => {
      const expectedHash = hashOtp('123456', secret);
      expect(verifyOtpHash('123456', 'wrong-secret-key-32chars-length', expectedHash)).toBe(false);
    });

    it('returns false when inputs are empty or missing', () => {
      const expectedHash = hashOtp('123456', secret);
      expect(verifyOtpHash('', secret, expectedHash)).toBe(false);
      expect(verifyOtpHash('123456', '', expectedHash)).toBe(false);
      expect(verifyOtpHash('123456', secret, '')).toBe(false);
    });

    it('returns false when expected hash has different length or is corrupted', () => {
      expect(verifyOtpHash('123456', secret, 'short-hash')).toBe(false);
      expect(verifyOtpHash('123456', secret, 'a'.repeat(32))).toBe(false);
    });
  });
});
