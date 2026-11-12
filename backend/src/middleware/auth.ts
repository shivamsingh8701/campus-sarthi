// ============================================================
// CampusSarthi — Authentication Middleware (JWT + HTTP-only Cookie)
// ============================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';
import { DEMO_STUDENT_ID } from '../services/demo/demoData';
import type { AuthMode } from '../types';

export interface JwtPayload {
  studentId: string;
  email: string;
  isDemo?: boolean;
  authMode?: AuthMode;
  iat?: number;
  exp?: number;
}

export const COOKIE_NAME = 'campus_session';

function getCookieOptions(rememberMe = true) {
  const cfg = getConfig();
  const isCrossSiteProd =
    cfg.isProduction &&
    Boolean(process.env['CORS_CROSS_SITE'] === 'true' || !cfg.frontendUrl.includes('localhost'));

  return {
    httpOnly: true,
    secure: cfg.isProduction,
    sameSite: (isCrossSiteProd ? 'none' : 'lax') as 'none' | 'lax',
    maxAge: (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function generateToken(
  studentId: string,
  email: string,
  opts?: { isDemo?: boolean; authMode?: AuthMode; rememberMe?: boolean }
): string {
  const cfg = getConfig();
  const payload: JwtPayload = {
    studentId,
    email,
    isDemo: opts?.isDemo ?? studentId === DEMO_STUDENT_ID,
    authMode: opts?.authMode ?? (studentId === DEMO_STUDENT_ID ? 'demo' : 'lms'),
  };
  return jwt.sign(payload, cfg.jwtSecret, {
    expiresIn: opts?.rememberMe === false ? '24h' : '30d',
  });
}

export function setSessionCookie(res: Response, token: string, rememberMe = true): void {
  res.cookie(COOKIE_NAME, token, getCookieOptions(rememberMe));
}

export function clearSessionCookie(res: Response): void {
  const opts = getCookieOptions(true);
  res.clearCookie(COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  });
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
    const isDemo = Boolean(payload.isDemo || payload.studentId === DEMO_STUDENT_ID);
    req.student = {
      id: payload.studentId,
      email: payload.email,
      isDemo,
      authMode: payload.authMode ?? (isDemo ? 'demo' : 'lms'),
    };
    next();
  } catch (err) {
    clearSessionCookie(res);
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Session expired. Please log in again.' });
      return;
    }
    res.status(401).json({ error: 'Invalid session. Please log in again.' });
  }
}

export default requireAuth;
