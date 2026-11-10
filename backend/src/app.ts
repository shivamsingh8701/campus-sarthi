// ============================================================
// CampusSarthi — Express Application
// ============================================================

import express from 'express';
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
import aiRoutes from './routes/ai';

export function createApp(): express.Application {
  const cfg = getConfig();
  const app = express();

  // ── Security ───────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false, // Configured separately if needed
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: cfg.frontendUrl,
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
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      env: cfg.nodeEnv,
      timestamp: new Date().toISOString(),
    });
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
  app.use('/api/v1/ai', aiRoutes);

  // ── 404 Handler ────────────────────────────────────────────
  app.use((_req: import('express').Request, res: import('express').Response) => {
    res.status(404).json({ error: 'Route not found.' });
  });

  // ── Global Error Handler ───────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}

export default createApp;
