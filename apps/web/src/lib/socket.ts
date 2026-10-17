/**
 * lib/socket.ts — singleton Socket.io client with auth handshake and typed events.
 * DOC3 §3.3.
 */

import { io, type Socket } from 'socket.io-client';
import { SocketEvents, type StatusSnapshot } from '@messpulse/shared';
import { getStoredToken } from './http';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = getStoredToken();
    socket = io('/', {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function updateSocketAuth(token: string | null): void {
  if (socket) {
    socket.auth = { token };
    if (socket.connected) {
      socket.disconnect().connect();
    }
  }
}

export function subscribeToStatusUpdates(
  onUpdate: (snapshot: StatusSnapshot) => void,
  onConnectionChange?: (state: 'connecting' | 'live' | 'reconnecting' | 'offline') => void
): () => void {
  const s = getSocket();

  const handleStatusUpdate = (data: unknown) => {
    onUpdate(data as StatusSnapshot);
  };

  const handleConnect = () => {
    onConnectionChange?.('live');
  };

  const handleDisconnect = () => {
    onConnectionChange?.('reconnecting');
  };

  const handleConnectError = () => {
    onConnectionChange?.('reconnecting');
  };

  s.on(SocketEvents.StatusUpdate, handleStatusUpdate);
  s.on('connect', handleConnect);
  s.on('disconnect', handleDisconnect);
  s.on('connect_error', handleConnectError);

  if (!s.connected) {
    onConnectionChange?.('connecting');
    s.connect();
  } else {
    onConnectionChange?.('live');
  }

  return () => {
    s.off(SocketEvents.StatusUpdate, handleStatusUpdate);
    s.off('connect', handleConnect);
    s.off('disconnect', handleDisconnect);
    s.off('connect_error', handleConnectError);
  };
}
