/**
 * scripts/watch-status.ts — CLI Socket.io client for real-time status monitoring.
 * DOC4 Step 8.
 *
 * Connects with a JWT, subscribes to status:update, parses with Zod, and prints live status.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/watch-status.ts
 */

import path from 'path';
import { io, type Socket } from 'socket.io-client';
import { StatusSnapshotSchema, type StatusSnapshot } from '@messpulse/shared';
import jwt from 'jsonwebtoken';

if (typeof process.loadEnvFile === 'function') {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const envPath of candidates) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      // try next
    }
  }
}

const SERVER_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-min-16-characters-long';
const ROLE = (process.env.ROLE as 'student' | 'staff' | 'admin') || 'student';

// Generate a valid short-lived token for monitoring
const token =
  process.env.TOKEN ||
  jwt.sign(
    {
      sub: 'watch-status-cli',
      role: ROLE,
    },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' }
  );

console.log(`[watch-status] Connecting to ${SERVER_URL} as role '${ROLE}'...`);

const socket: Socket = io(SERVER_URL, {
  auth: {
    token,
  },
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log(`[watch-status] Connected successfully with socket ID: ${socket.id}`);
});

socket.on('connect_error', (err) => {
  console.error(`[watch-status] Connection failed: ${err.message}`);
});

socket.on('status:update', (data: unknown) => {
  const parseResult = StatusSnapshotSchema.safeParse(data);
  if (!parseResult.success) {
    console.error('[watch-status] Received invalid StatusSnapshot payload:', parseResult.error.issues);
    return;
  }

  const snapshot: StatusSnapshot = parseResult.data;
  const timeStr = new Date(snapshot.ts).toLocaleTimeString();

  console.log(
    `[${timeStr}] Mess: ${snapshot.messId} (${snapshot.state}) | ` +
      `Occupancy: ${snapshot.occupancy.value}/${snapshot.occupancy.capacity} ` +
      `[${snapshot.occupancy.level.toUpperCase()} | source: ${snapshot.occupancy.source} | stale: ${snapshot.occupancy.stale}] | ` +
      `Est Wait: ~${snapshot.waitMin} min (${snapshot.waitRangeMin[0]}–${snapshot.waitRangeMin[1]} min) | ` +
      `Active Sessions: ${snapshot.activeSessions} (weight: ${snapshot.decayWeightedSessions})`
  );
});

socket.on('disconnect', (reason) => {
  console.log(`[watch-status] Disconnected: ${reason}`);
});

process.on('SIGINT', () => {
  console.log('\n[watch-status] Exiting...');
  socket.disconnect();
  process.exit(0);
});
