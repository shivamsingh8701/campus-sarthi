// ============================================================
// CampusSarthi — Express Application
// ============================================================

import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { getConfig } from './config';
import { logger } from './utils/logger';
import { globalErrorHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiter';

// Routes
import authRoutes from './routes/auth';
import lmsRoutes from './routes/lms';
import assignmentRoutes from './routes/assignments';
import quizRoutes from './routes/quizzes';
import documentRoutes from './routes/documents';
import emailRoutes from './routes/email';
import activityRoutes from './routes/activity';
import integrationsRoutes from './routes/integrations';
import aiRoutes from './routes/ai';
import { SyncJob } from './services/scheduler/syncJob';

export function createApp(): express.Application {
  const cfg = getConfig();
  const app = express();

  // Trust reverse proxy headers (Railway, Render, Fly.io, Nginx)
  app.set('trust proxy', 1);

  // ── Security ───────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false, // Configured separately if needed
      crossOriginEmbedderPolicy: false,
    })
  );

  const allowedOrigins = new Set(
    [
      ...cfg.frontendUrl.split(',').map((o) => o.trim()).filter(Boolean),
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
    ].filter(Boolean)
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin) || (!cfg.isProduction && origin.startsWith('http://localhost:'))) {
          callback(null, true);
          return;
        }
        callback(new Error(`CORS origin denied: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ── Parsing ────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser(cfg.cookieSecret));

  // ── Logging ────────────────────────────────────────────────
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
      skip: (_req, res) => res.statusCode < 400 && cfg.isProduction,
    })
  );

  // ── Health check (no rate limit) ──────────────────────────
  const healthHandler = (_req: express.Request, res: express.Response) => {
    res.json({
      status: 'ok',
      env: cfg.nodeEnv,
      timestamp: new Date().toISOString(),
    });
  };
  app.get('/health', healthHandler);
  app.get('/api/health', healthHandler);

  // ── Vercel Cron Sync Endpoint (protected by CRON_SECRET) ──
  app.get('/api/v1/cron/sync', async (req, res) => {
    const cronSecret = process.env['CRON_SECRET'];
    if (!cronSecret) {
      res.status(503).json({ error: 'CRON_SECRET is not configured.' });
      return;
    }
    const authHeader = req.headers.authorization || '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized cron invocation.' });
      return;
    }
    await SyncJob.getInstance().runSyncForAllStudents();
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // ── API Routes ─────────────────────────────────────────────
  app.use('/api/v1', apiLimiter);
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/lms', lmsRoutes);
  app.use('/api/v1/assignments', assignmentRoutes);
  app.use('/api/v1/quizzes', quizRoutes);
  app.use('/api/v1/documents', documentRoutes);
  app.use('/api/v1/email', emailRoutes);
  app.use('/api/v1/activity', activityRoutes);
  app.use('/api/v1/integrations', integrationsRoutes);
  app.use('/api/v1/ai', aiRoutes);

  // ── Serve Built Frontend (Single-Container Production Mode) ─
  const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
  const frontendIndex = path.join(frontendDist, 'index.html');
  if ((cfg.isProduction || process.env['SERVE_FRONTEND'] === 'true') && fs.existsSync(frontendIndex)) {
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api\/|\/health$).*/, (_req, res) => {
      res.sendFile(frontendIndex);
    });
  }

  // ── 404 Handler ────────────────────────────────────────────
  app.use((_req: import('express').Request, res: import('express').Response) => {
    res.status(404).json({ error: 'Route not found.' });
  });

  // ── Global Error Handler ───────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}

export default createApp;
