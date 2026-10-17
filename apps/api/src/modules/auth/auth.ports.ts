/**
 * modules/auth/auth.ports.ts — ports and types for authentication.
 * DOC3 §3.8.
 */

import type { Role } from '@messpulse/shared';
import type { OtpStore, UserRepository, Clock } from '../../core/ports';
import type { Mailer } from '../../infra/mail/mailer.port';

export interface Principal {
  userId: string;
  role: Role;
}

export type { OtpStore, UserRepository, Mailer, Clock };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal | undefined;
    }
  }
}
