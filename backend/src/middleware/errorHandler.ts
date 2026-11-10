// ============================================================
// CampusSarthi — Global Error Handler
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function createError(message: string, statusCode = 500, details?: unknown): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  err.details = details;
  return err;
}

export function globalErrorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const isProduction = getConfig().isProduction;

  logger.error('Unhandled error', {
    message: err.message,
    statusCode,
    method: req.method,
    url: req.originalUrl,
    studentId: req.student?.id,
    stack: err.stack,
    details: err.details,
  });

  const body: { error: string; details?: unknown; stack?: string } = {
    error: statusCode >= 500 && isProduction ? 'Internal server error' : err.message,
  };

  if (!isProduction && err.details !== undefined) {
    body.details = err.details;
  }

  if (!isProduction && err.stack) {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}
