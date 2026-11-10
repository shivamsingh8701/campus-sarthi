// ============================================================
// CampusSarthi — Zod Validation Middleware
// ============================================================

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

function formatZodError(err: ZodError): string[] {
  return err.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
}

/**
 * Validate req.body against a Zod schema.
 * On failure, returns 400 with structured field errors.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: formatZodError(result.error),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate req.query against a Zod schema.
 * On failure, returns 400 with structured field errors.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: formatZodError(result.error),
      });
      return;
    }
    // Attach parsed query so handlers get coerced types
    (req as Request & { parsedQuery: T }).parsedQuery = result.data;
    next();
  };
}
