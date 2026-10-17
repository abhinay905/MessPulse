/**
 * modules/realtime/socket-auth.ts — Socket.io handshake authentication.
 * DOC3 §3.8.
 * Reuses TokenService as the single JWT authority.
 */

import type { TokenService } from '../auth/token.service';
import type { Principal } from '../auth/auth.ports';
import { AuthError } from '../../shared-kernel/errors';

export function authenticateSocket(
  authData: Record<string, unknown> | undefined,
  headers: Record<string, unknown> | undefined,
  tokenService: TokenService
): Principal {
  let token: string | undefined;

  if (authData && typeof authData['token'] === 'string') {
    token = authData['token'];
  } else if (headers && typeof headers['authorization'] === 'string') {
    const authHeader = headers['authorization'];
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  if (!token) {
    throw new AuthError('Missing socket authentication token');
  }

  return tokenService.verify(token);
}
