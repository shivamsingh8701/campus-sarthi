// ============================================================
// CampusSarthi — JWT Authentication Middleware
// ============================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';

export interface JwtPayload {
  studentId: string;
  email: string;
  iat?: number;
  exp?: number;
}

const COOKIE_NAME = 'campus_session';

// ─── Token Helpers ───────────────────────────────────────────

export function generateToken(studentId: string, email: string): string {
  const cfg = getConfig();
  return jwt.sign({ studentId, email } as JwtPayload, cfg.jwtSecret, {
    expiresIn: cfg.jwtExpiry as jwt.SignOptions['expiresIn'],
  });
}

export function setSessionCookie(res: Response, token: string): void {
  const cfg = getConfig();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: cfg.isProduction,
    sameSite: cfg.isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// ─── Auth Middleware ─────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined = req.cookies?.[COOKIE_NAME];

  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please log in.' });
    return;
  }

  try {
    const cfg = getConfig();
    const payload = jwt.verify(token, cfg.jwtSecret) as JwtPayload;
    req.student = { id: payload.studentId, email: payload.email };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      clearSessionCookie(res);
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }
    clearSessionCookie(res);
    res.status(401).json({ error: 'Invalid session. Please log in again.' });
  }
}

export default requireAuth;
