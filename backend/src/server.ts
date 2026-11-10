// ============================================================
// CampusSarthi — Server Entry Point
// ============================================================

import 'dotenv/config';
import { getConfig } from './config';
import { createApp } from './app';
import { logger } from './utils/logger';
import { SyncJob } from './services/scheduler/syncJob';

async function main(): Promise<void> {
  // Validate config early — throws if required env vars are missing
  const cfg = getConfig();

  const app = createApp();

  const server = app.listen(cfg.port, () => {
    logger.info(`CampusSarthi backend started`, {
      port: cfg.port,
      env: cfg.nodeEnv,
      lmsUrl: cfg.lms.baseUrl,
    });
  });

  // ── Background Scheduler ───────────────────────────────────
  const syncJob = SyncJob.getInstance();
  syncJob.start();
  logger.info('Background sync scheduler started', {
    intervalMinutes: cfg.scheduler.syncIntervalMinutes,
  });

  // ── Graceful Shutdown ──────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    syncJob.stop();

    server.close((err) => {
      if (err) {
        logger.error('Error during server shutdown', { error: String(err) });
        process.exit(1);
      }
      logger.info('Server closed. Goodbye.');
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: String(err), stack: err.stack });
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

