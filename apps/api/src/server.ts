/**
 * server.ts — listen + graceful shutdown.
 * Imports config (which fails fast if env is bad), builds container and app, then listens.
 * DOC3 §3.1: server.ts is the only place that calls listen() and starts the scheduler.
 */
import { config } from './config';
import { buildContainer } from './container';
import { buildApp } from './app';
import { logger } from './infra/logger';

const container = buildContainer();
const app = buildApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'MessPulse API started');
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal: string): void {
  logger.info({ signal }, 'Shutting down...');
  server.close(() => {
    logger.info('HTTP server closed');
    // Redis/Mongo connections will be closed here in later steps
    process.exit(0);
  });

  // Force-exit after 10 s
  setTimeout(() => {
    logger.error('Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep TypeScript happy — container used later in Steps 3+
void container;
