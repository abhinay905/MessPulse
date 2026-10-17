/**
 * modules/realtime/realtime.test.ts — Unit and integration tests for RealtimeGateway & socket-auth.
 * DOC3 §3.3, §3.5, §3.8, DOC4 Step 8.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientSocket, type Socket as ClientSocketType } from 'socket.io-client';
import type { StatusSnapshot, AlertDTO } from '@messpulse/shared';
import { EventBus } from '../../infra/event-bus';
import { TokenService } from '../auth/token.service';
import { RealtimeGateway } from './realtime.gateway';

const JWT_SECRET = 'test-jwt-secret-min-16-characters-long';

describe('RealtimeGateway (Socket.io)', () => {
  let httpServer: http.Server;
  let ioServer: SocketIOServer;
  let eventBus: EventBus;
  let tokenService: TokenService;
  let gateway: RealtimeGateway;
  let serverPort: number;

  beforeAll(async () => {
    httpServer = http.createServer();
    ioServer = new SocketIOServer(httpServer, {
      transports: ['websocket', 'polling'],
    });

    eventBus = new EventBus();
    tokenService = new TokenService(JWT_SECRET);
    gateway = new RealtimeGateway(ioServer, eventBus, tokenService);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        if (typeof addr === 'object' && addr !== null) {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    gateway.destroy();
    ioServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('rejects unauthenticated socket handshake', async () => {
    const client: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      transports: ['websocket'],
      autoConnect: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      client.on('connect_error', (err) => {
        resolve(err.message);
      });
    });

    client.connect();
    const errMsg = await errorPromise;
    expect(errMsg).toContain('AUTH_ERROR');
    client.disconnect();
  });

  it('rejects socket with invalid token', async () => {
    const client: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: 'invalid.jwt.token' },
      transports: ['websocket'],
      autoConnect: false,
    });

    const errorPromise = new Promise<string>((resolve) => {
      client.on('connect_error', (err) => {
        resolve(err.message);
      });
    });

    client.connect();
    const errMsg = await errorPromise;
    expect(errMsg).toContain('AUTH_ERROR');
    client.disconnect();
  });

  it('accepts authenticated student socket and receives status:update', async () => {
    const token = tokenService.sign({ id: 'student-1', role: 'student' });
    const client: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: false,
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', (err) => reject(err));
      client.connect();
    });

    const updatePromise = new Promise<StatusSnapshot>((resolve) => {
      client.on('status:update', (data: StatusSnapshot) => {
        resolve(data);
      });
    });

    const sampleSnapshot: StatusSnapshot = {
      messId: 'mess-1',
      mealId: '20261017-lunch',
      ts: Date.now(),
      state: 'open',
      occupancy: {
        value: 50,
        capacity: 100,
        level: 'medium',
        source: 'camera',
        stale: false,
      },
      activeSessions: 0,
      decayWeightedSessions: 0,
      waitMin: 0,
      waitRangeMin: [0, 0],
      bestWindows: [],
      camera: {
        lastSeenAt: Date.now(),
        stale: false,
      },
    };

    // Emit via eventBus
    eventBus.publish('status.updated', sampleSnapshot);

    const received = await updatePromise;
    expect(received.messId).toBe('mess-1');
    expect(received.occupancy.value).toBe(50);

    client.disconnect();
  });

  it('delivers alert:raised only to staff and admin, not to student', async () => {
    const studentToken = tokenService.sign({ id: 'student-2', role: 'student' });
    const staffToken = tokenService.sign({ id: 'staff-1', role: 'staff' });

    const studentClient: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: studentToken },
      transports: ['websocket'],
    });

    const staffClient: ClientSocketType = ClientSocket(`http://localhost:${serverPort}`, {
      auth: { token: staffToken },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((res) => studentClient.on('connect', () => res())),
      new Promise<void>((res) => staffClient.on('connect', () => res())),
    ]);

    let studentReceivedAlert = false;
    studentClient.on('alert:raised', () => {
      studentReceivedAlert = true;
    });

    const staffAlertPromise = new Promise<AlertDTO>((resolve) => {
      staffClient.on('alert:raised', (alert: AlertDTO) => {
        resolve(alert);
      });
    });

    const alertPayload: AlertDTO = {
      id: 'alert-1',
      ruleId: 'tray-depletion',
      mealId: '20261017-lunch',
      severity: 'warning',
      message: 'Tray capacity low',
      raisedAt: Date.now(),
    };

    eventBus.publish('alert.raised', alertPayload);

    const receivedAlert = await staffAlertPromise;
    expect(receivedAlert.id).toBe('alert-1');
    expect(studentReceivedAlert).toBe(false);

    studentClient.disconnect();
    staffClient.disconnect();
  });
});
