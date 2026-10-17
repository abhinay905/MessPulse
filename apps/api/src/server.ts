/**
 * server.ts — listen + graceful shutdown.
 * Imports config (which fails fast if env is bad), builds container and app, starts scheduler,
 * wires Socket.io RealtimeGateway, and listens.
 * DOC3 §3.1: server.ts is the only place that calls listen() and starts the scheduler.
 */

import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { buildContainer } from './container';
import { buildApp } from './app';
import { logger } from './infra/logger';
import { Scheduler } from './infra/scheduler';
import { RealtimeGateway } from './modules/realtime/realtime.gateway';
import { connectMongo, disconnectMongo } from './infra/mongo/connection';

async function bootstrap() {
  await connectMongo(config.MONGO_URL);

  const container = buildContainer();
  const app = buildApp(container);
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  const realtimeGateway = new RealtimeGateway(io, container.eventBus, container.tokenService);
  const scheduler = new Scheduler(container.occupancyService, container.clock);

  scheduler.start();

  const server = httpServer.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'MessPulse API started with RealtimeGateway');
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────────

  function shutdown(signal: string): void {
    logger.info({ signal }, 'Shutting down...');
    scheduler.stop();
    realtimeGateway.destroy();
    io.close();

    server.close(() => {
      logger.info('HTTP server closed');
      Promise.all([
        container.redis?.quit().catch(() => {}),
        disconnectMongo().catch(() => {}),
      ]).finally(() => {
        process.exit(0);
      });
    });

    // Force-exit after 10 s
    setTimeout(() => {
      logger.error('Forced exit after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Failed to start MessPulse API server');
  process.exit(1);
});
