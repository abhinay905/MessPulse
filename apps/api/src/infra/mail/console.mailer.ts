/**
 * infra/mail/console.mailer.ts — Console mailer for local development and demos.
 * DOC3 §3.8.
 * Logs OTP to logger/console only in non-production or demo environments.
 */

import type { Mailer } from './mailer.port';
import { logger } from '../logger';

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const local = parts[0] ?? '';
  const domain = parts[1] ?? '';
  const maskedLocal = local.length > 0 ? `${local[0]}***` : '***';
  return `${maskedLocal}@${domain}`;
}

export class ConsoleMailer implements Mailer {
  private lastOtpSent: { email: string; otp: string } | null = null;

  async sendOtp(toEmail: string, otp: string): Promise<void> {
    this.lastOtpSent = { email: toEmail, otp };
    const masked = maskEmail(toEmail);
    logger.info({ email: masked, otp }, `[ConsoleMailer] OTP for ${masked}: ${otp}`);
  }

  getLastOtp(): { email: string; otp: string } | null {
    return this.lastOtpSent;
  }
}
