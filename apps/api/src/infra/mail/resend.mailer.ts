/**
 * infra/mail/resend.mailer.ts — Production mailer using the Resend SDK.
 * DOC3 §3.8.
 */

import { Resend } from 'resend';
import type { Mailer } from './mailer.port';
import { logger } from '../logger';
import { DependencyUnavailableError } from '../../shared-kernel/errors';

export class ResendMailer implements Mailer {
  private readonly resend: Resend;
  private readonly fromEmail: string;

  constructor(apiKey: string, fromEmail = 'MessPulse <auth@messpulse.local>') {
    this.resend = new Resend(apiKey);
    this.fromEmail = fromEmail;
  }

  async sendOtp(toEmail: string, otp: string): Promise<void> {
    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to: toEmail,
        subject: 'Your MessPulse Verification Code',
        text: `Your verification code is: ${otp}. It expires in 10 minutes.`,
      });

      if (error) {
        logger.error({ error, toEmail }, 'Failed to send OTP via Resend');
        throw new DependencyUnavailableError('Failed to send verification email');
      }
    } catch (err) {
      if (err instanceof DependencyUnavailableError) {
        throw err;
      }
      logger.error({ err, toEmail }, 'Resend mailer error');
      throw new DependencyUnavailableError('Failed to send verification email');
    }
  }
}
