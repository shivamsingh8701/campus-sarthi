// ============================================================
// CampusSarthi — Integrations Health & Diagnostics Routes
// GET  /api/v1/integrations/health
// POST /api/v1/integrations/test/:service
// Never marks an integration healthy solely from env var presence.
// ============================================================

import { Router, Request, Response } from 'express';
import requireAuth from '../middleware/auth';
import { getConfig } from '../config';
import { checkDatabaseHealth, LMSSessions, SyncRecords } from '../db/queries';
import { LMSConnector } from '../services/lms/connector';
import { emailSender } from '../services/email/sender';
import { isDemoStudent } from '../services/demo/demoData';
import { logger } from '../utils/logger';

const router = Router();

export type IntegrationState = 'connected' | 'reachable' | 'unconfigured' | 'disconnected' | 'error';

export interface IntegrationCheckResult {
  id: 'lms' | 'gemini' | 'openai' | 'email' | 'supabase';
  name: string;
  state: IntegrationState;
  healthy: boolean;
  configured: boolean;
  latencyMs?: number;
  lastCheckedAt: string;
  detail: string;
  error?: string;
  meta?: Record<string, unknown>;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeGemini(): Promise<IntegrationCheckResult> {
  const cfg = getConfig();
  const key = cfg.ai.geminiApiKey;
  const now = new Date().toISOString();

  if (!key) {
    return {
      id: 'gemini',
      name: 'Gemini API',
      state: 'unconfigured',
      healthy: false,
      configured: false,
      lastCheckedAt: now,
      detail: 'GEMINI_API_KEY is not configured in backend environment.',
    };
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      { method: 'GET' },
      5000
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      const payload = (await res.json()) as { models?: Array<{ name?: string }> };
      return {
        id: 'gemini',
        name: 'Gemini API',
        state: 'connected',
        healthy: true,
        configured: true,
        latencyMs,
        lastCheckedAt: now,
        detail: `Verified against Google Generative AI (${payload.models?.length ?? 0} models available).`,
      };
    }

    let errMsg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) errMsg = body.error.message;
    } catch {
      // Ignore parse failure
    }

    return {
      id: 'gemini',
      name: 'Gemini API',
      state: 'error',
      healthy: false,
      configured: true,
      latencyMs,
      lastCheckedAt: now,
      detail: 'Gemini API key verification failed.',
      error: errMsg,
    };
  } catch (err) {
    return {
      id: 'gemini',
      name: 'Gemini API',
      state: 'error',
      healthy: false,
      configured: true,
      latencyMs: Date.now() - start,
      lastCheckedAt: now,
      detail: 'Unable to reach Google Gemini API.',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeOpenAI(): Promise<IntegrationCheckResult> {
  const cfg = getConfig();
  const key = cfg.ai.openaiApiKey;
  const now = new Date().toISOString();

  if (!key) {
    return {
      id: 'openai',
      name: 'OpenAI API',
      state: 'unconfigured',
      healthy: false,
      configured: false,
      lastCheckedAt: now,
      detail: 'OPENAI_API_KEY is not set. Optional fallback provider.',
    };
  }

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(
      'https://api.openai.com/v1/models',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
      },
      5000
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        id: 'openai',
        name: 'OpenAI API',
        state: 'connected',
        healthy: true,
        configured: true,
        latencyMs,
        lastCheckedAt: now,
        detail: 'Authenticated with OpenAI API.',
      };
    }

    let errMsg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) errMsg = body.error.message;
    } catch {
      // Ignore
    }

    return {
      id: 'openai',
      name: 'OpenAI API',
      state: 'error',
      healthy: false,
      configured: true,
      latencyMs,
      lastCheckedAt: now,
      detail: 'OpenAI API key rejected.',
      error: errMsg,
    };
  } catch (err) {
    return {
      id: 'openai',
      name: 'OpenAI API',
      state: 'error',
      healthy: false,
      configured: true,
      latencyMs: Date.now() - start,
      lastCheckedAt: now,
      detail: 'Unable to reach OpenAI API.',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function probeEmail(): Promise<IntegrationCheckResult> {
  const cfg = getConfig();
  const now = new Date().toISOString();

  if (!cfg.email.smtpUser || (!cfg.email.smtpPass && !cfg.email.gmailRefreshToken)) {
    return {
      id: 'email',
      name: 'Gmail / SMTP',
      state: 'unconfigured',
      healthy: false,
      configured: false,
      lastCheckedAt: now,
      detail: 'SMTP credentials are not configured.',
    };
  }

  const start = Date.now();
  const ok = await emailSender.verifyConnection();
  const latencyMs = Date.now() - start;

  return {
    id: 'email',
    name: 'Gmail / SMTP',
    state: ok ? 'connected' : 'error',
    healthy: ok,
    configured: true,
    latencyMs,
    lastCheckedAt: now,
    detail: ok
      ? `SMTP transport verified for ${cfg.email.smtpUser}.`
      : 'SMTP handshake failed. Verify app password or OAuth token.',
    error: ok ? undefined : 'Transporter verification failed.',
    meta: { sender: cfg.email.smtpUser, host: cfg.email.smtpHost },
  };
}

async function probeSupabase(): Promise<IntegrationCheckResult> {
  const now = new Date().toISOString();
  const dbHealth = await checkDatabaseHealth();

  if (!dbHealth.configured) {
    return {
      id: 'supabase',
      name: 'Supabase PostgreSQL',
      state: 'unconfigured',
      healthy: false,
      configured: false,
      latencyMs: dbHealth.latencyMs,
      lastCheckedAt: now,
      detail: 'Supabase connection keys are missing.',
      error: dbHealth.error,
    };
  }

  return {
    id: 'supabase',
    name: 'Supabase PostgreSQL',
    state: dbHealth.ok ? 'connected' : 'error',
    healthy: dbHealth.ok,
    configured: true,
    latencyMs: dbHealth.latencyMs,
    lastCheckedAt: now,
    detail: dbHealth.ok
      ? `Live PostgreSQL connection verified (${dbHealth.latencyMs}ms).`
      : 'Database query check failed.',
    error: dbHealth.error,
  };
}

async function probeLMS(studentId: string, isDemo: boolean): Promise<IntegrationCheckResult> {
  const now = new Date().toISOString();

  if (isDemo) {
    return {
      id: 'lms',
      name: 'Galgotias LMS',
      state: 'connected',
      healthy: true,
      configured: true,
      lastCheckedAt: now,
      detail: 'Demo sandbox session active (simulated sample university data).',
      meta: { isDemo: true, portalUrl: 'https://gulms.galgotiasuniversity.org' },
    };
  }

  const [session, latestSync, portal] = await Promise.all([
    LMSSessions.findActiveByStudentId(studentId).catch(() => null),
    SyncRecords.findLatestByStudentId(studentId).catch(() => null),
    LMSConnector.probeReachability(6000),
  ]);

  if (!portal.reachable) {
    return {
      id: 'lms',
      name: 'Galgotias LMS',
      state: 'error',
      healthy: false,
      configured: Boolean(session),
      latencyMs: portal.latencyMs,
      lastCheckedAt: now,
      detail: session
        ? 'Session saved, but Galgotias LMS portal is currently unreachable.'
        : 'Galgotias LMS portal did not respond cleanly.',
      error: portal.error || `HTTP ${portal.statusCode ?? 'unknown'}`,
      meta: {
        hasSession: Boolean(session),
        username: session?.lms_username ?? null,
        expiresAt: session?.expires_at ?? null,
        lastSyncAt: latestSync?.completed_at ?? latestSync?.started_at ?? null,
      },
    };
  }

  if (!session) {
    return {
      id: 'lms',
      name: 'Galgotias LMS',
      state: 'disconnected',
      healthy: false,
      configured: false,
      latencyMs: portal.latencyMs,
      lastCheckedAt: now,
      detail: 'Galgotias LMS portal is reachable, but your account has no active session.',
      meta: {
        hasSession: false,
        portalReachable: true,
      },
    };
  }

  return {
    id: 'lms',
    name: 'Galgotias LMS',
    state: 'connected',
    healthy: true,
    configured: true,
    latencyMs: portal.latencyMs,
    lastCheckedAt: now,
    detail: `Connected as ${session.lms_username}. University portal reachable (${portal.latencyMs}ms).`,
    meta: {
      hasSession: true,
      username: session.lms_username,
      loggedInAt: session.logged_in_at,
      expiresAt: session.expires_at,
      lastSyncAt: latestSync?.completed_at ?? latestSync?.started_at ?? null,
      lastSyncStatus: latestSync?.status ?? null,
    },
  };
}

// ─── GET /health ─────────────────────────────────────────────

router.get('/health', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const isDemo = Boolean(req.student?.isDemo || isDemoStudent(studentId));

    const [lms, gemini, openai, email, supabase] = await Promise.all([
      probeLMS(studentId, isDemo),
      probeGemini(),
      probeOpenAI(),
      probeEmail(),
      probeSupabase(),
    ]);

    res.json({
      success: true,
      isDemo,
      checkedAt: new Date().toISOString(),
      integrations: [lms, gemini, openai, email, supabase],
    });
  } catch (err) {
    logger.error('Integrations health probe failed', { error: String(err) });
    res.status(500).json({ error: 'Failed to check integration health.' });
  }
});

// ─── POST /test/:service ─────────────────────────────────────

router.post('/test/:service', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.student!.id;
    const isDemo = Boolean(req.student?.isDemo || isDemoStudent(studentId));
    const service = String(req.params['service']);

    let result: IntegrationCheckResult;
    switch (service) {
      case 'lms':
        result = await probeLMS(studentId, isDemo);
        break;
      case 'gemini':
        result = await probeGemini();
        break;
      case 'openai':
        result = await probeOpenAI();
        break;
      case 'email':
        result = await probeEmail();
        break;
      case 'supabase':
        result = await probeSupabase();
        break;
      default:
        res.status(400).json({ error: 'Unknown integration service.' });
        return;
    }

    res.json({ success: true, integration: result });
  } catch (err) {
    logger.error('Integration single test error', { error: String(err) });
    res.status(500).json({ error: 'Integration test failed.' });
  }
});

export default router;

