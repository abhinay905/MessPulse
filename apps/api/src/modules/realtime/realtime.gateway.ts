/**
 * modules/realtime/realtime.gateway.ts — Socket.io realtime transport gateway.
 * DOC3 §3.3, §3.5, §3.8, DOC4 Step 8.
 * THE ONLY MODULE THAT TOUCHES SOCKET.IO ON THE SERVER.
 * Role-based rooms ('student', 'staff', 'admin'), handshake JWT verification,
 * throttles status snapshots to <= 1/s.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { StatusSnapshot, AlertDTO } from '@messpulse/shared';
import type { EventBus } from '../../infra/event-bus';
import type { TokenService } from '../auth/token.service';
import type { Principal } from '../auth/auth.ports';
import { authenticateSocket } from './socket-auth';
import { logger } from '../../infra/logger';

export class RealtimeGateway {
  private lastEmitTs = 0;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly io: SocketIOServer,
    private readonly eventBus: EventBus,
    private readonly tokenService: TokenService
  ) {
    this.setupAuthMiddleware();
    this.setupConnectionHandling();
    this.setupEventSubscriptions();
  }

  private setupAuthMiddleware(): void {
    this.io.use((socket: Socket, next: (err?: Error) => void) => {
      try {
        const principal = authenticateSocket(
          socket.handshake.auth as Record<string, unknown> | undefined,
          socket.handshake.headers as Record<string, unknown> | undefined,
          this.tokenService
        );

        // Attach principal to socket data
        socket.data.principal = principal;
        next();
      } catch (err) {
        logger.warn({ err }, 'Socket authentication failed at handshake');
        next(new Error('AUTH_ERROR: Authentication required'));
      }
    });
  }

  private setupConnectionHandling(): void {
    this.io.on('connection', (socket: Socket) => {
      const principal = socket.data.principal as Principal | undefined;
      if (!principal) {
        socket.disconnect(true);
        return;
      }

      // Join primary role room
      void socket.join(principal.role);

      // Admin also joins staff room to see all alerts
      if (principal.role === 'admin') {
        void socket.join('staff');
      }

      logger.info(
        { socketId: socket.id, userId: principal.userId, role: principal.role },
        `Socket connected to room [${principal.role}]`
      );

      socket.on('disconnect', (reason) => {
        logger.info({ socketId: socket.id, reason }, 'Socket disconnected');
      });
    });
  }

  private setupEventSubscriptions(): void {
    // 1. Subscribe to status.updated (throttled to <= 1/s)
    const unsubStatus = this.eventBus.subscribe('status.updated', (snapshot: StatusSnapshot) => {
      const now = Date.now();
      if (now - this.lastEmitTs < 950) {
        // Throttled: skip sub-second bursts
        return;
      }
      this.lastEmitTs = now;

      // Broadcast to student, staff, and admin rooms
      this.io.to('student').to('staff').to('admin').emit('status:update', snapshot);
    });
    this.unsubscribers.push(unsubStatus);

    // 2. Subscribe to alert.raised (staff and admin only)
    const unsubAlertRaised = this.eventBus.subscribe('alert.raised', (alert: AlertDTO) => {
      this.io.to('staff').to('admin').emit('alert:raised', alert);
    });
    this.unsubscribers.push(unsubAlertRaised);

    // 3. Subscribe to alert.cleared (staff and admin only)
    const unsubAlertCleared = this.eventBus.subscribe('alert.cleared', (payload) => {
      this.io.to('staff').to('admin').emit('alert:cleared', payload);
    });
    this.unsubscribers.push(unsubAlertCleared);
  }

  /**
   * Cleans up event bus subscriptions.
   */
  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }
}
