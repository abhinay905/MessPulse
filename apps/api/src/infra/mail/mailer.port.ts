/**
 * infra/mail/mailer.port.ts — Mailer port interface.
 * DOC3 §3.8.
 */

export interface Mailer {
  sendOtp(toEmail: string, otp: string): Promise<void>;
}
