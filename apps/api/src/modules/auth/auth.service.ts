/**
 * modules/auth/auth.service.ts — Authentication application service.
 * DOC3 §3.8.
 * Handles OTP request/verify for students, and PIN login for staff/admin.
 */

import bcrypt from 'bcryptjs';
import type { AuthResponse, AuthUser } from '@messpulse/shared';
import { generateOtp, hashOtp, verifyOtpHash } from '../../core/otp';
import { AuthError, RateLimitError } from '../../shared-kernel/errors';
import type { OtpStore, UserRepository, Mailer } from './auth.ports';
import type { TokenService } from './token.service';

export interface AuthServiceOptions {
  otpSecret: string;
  allowedDomains?: string[] | undefined;
}

export class AuthService {
  private readonly allowedDomains: string[];

  constructor(
    private readonly otpStore: OtpStore,
    private readonly userRepo: UserRepository,
    private readonly mailer: Mailer,
    private readonly tokenService: TokenService,
    private readonly options: AuthServiceOptions
  ) {
    this.allowedDomains = (options.allowedDomains ?? [])
      .map((d) => d.toLowerCase().trim())
      .filter((d) => d.length > 0);
  }

  /**
   * Request an email OTP.
   * Always resolves (returning void) to prevent user/email enumeration.
   */
  async requestOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check allow-listed domain if domains are specified
    if (this.allowedDomains.length > 0) {
      const emailDomain = normalizedEmail.split('@')[1];
      const isAllowed = Boolean(
        emailDomain && this.allowedDomains.some((d) => emailDomain === d || emailDomain.endsWith(`.${d}`))
      );

      // Return silently without sending email to prevent domain enumeration
      if (!isAllowed) {
        return;
      }
    }

    const code = generateOtp();
    const hashed = hashOtp(code, this.options.otpSecret);

    // Save with 10-minute (600 s) TTL
    await this.otpStore.set(normalizedEmail, hashed, 600);

    // Send code via configured mailer
    await this.mailer.sendOtp(normalizedEmail, code);
  }

  /**
   * Verify an email OTP.
   * Locks out after 5 failed attempts.
   */
  async verifyOtp(email: string, code: string): Promise<AuthResponse> {
    const normalizedEmail = email.toLowerCase().trim();

    // Increment and check attempt limit
    const attempts = await this.otpStore.incrementAttempts(normalizedEmail);
    if (attempts > 5) {
      throw new RateLimitError('OTP_LOCKED', {
        message: 'Too many failed attempts. Code locked for 10 minutes.',
      });
    }

    const storedHash = await this.otpStore.get(normalizedEmail);
    if (!storedHash) {
      throw new AuthError('OTP_INVALID');
    }

    const isValid = verifyOtpHash(code.trim(), this.options.otpSecret, storedHash);
    if (!isValid) {
      throw new AuthError('OTP_INVALID');
    }

    // Success — cleanup OTP, upsert student, sign JWT
    await this.otpStore.delete(normalizedEmail);

    const user = await this.userRepo.upsertStudent(normalizedEmail);
    const authUser: AuthUser = {
      id: user.id ?? user.email,
      role: user.role,
      name: user.name,
      email: user.email,
    };

    const token = this.tokenService.sign({
      id: authUser.id,
      role: authUser.role,
    });

    return {
      token,
      user: authUser,
    };
  }

  /**
   * PIN login for staff and admin roles.
   */
  async loginStaff(identifier: string, pin: string): Promise<AuthResponse> {
    const normalized = identifier.toLowerCase().trim();
    const user = await this.userRepo.findByEmail(normalized);

    if (!user || (user.role !== 'staff' && user.role !== 'admin') || !user.pinHash) {
      throw new AuthError('Invalid credentials');
    }

    const matches = await bcrypt.compare(pin, user.pinHash);
    if (!matches) {
      throw new AuthError('Invalid credentials');
    }

    const authUser: AuthUser = {
      id: user.id ?? user.email,
      role: user.role,
      name: user.name,
      email: user.email,
    };

    const token = this.tokenService.sign({
      id: authUser.id,
      role: authUser.role,
    });

    return {
      token,
      user: authUser,
    };
  }

  /**
   * Retrieve current user profile by userId.
   */
  async getMe(userId: string): Promise<AuthUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new AuthError('User not found');
    }

    return {
      id: user.id ?? user.email,
      role: user.role,
      name: user.name,
      email: user.email,
    };
  }
}
