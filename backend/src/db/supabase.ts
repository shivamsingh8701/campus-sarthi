// ============================================================
// CampusSarthi — Supabase Client Initialization
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getConfig } from '../config';

let _anonClient: SupabaseClient | null = null;
let _adminClient: SupabaseClient | null = null;

/**
 * Supabase client using the anon key.
 * Row-Level Security (RLS) is enforced — suitable for user-scoped operations.
 */
export function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    const cfg = getConfig();
    _anonClient = createClient(cfg.supabase.url, cfg.supabase.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _anonClient;
}

/**
 * Supabase client using the service-role key.
 * Bypasses RLS — use ONLY for trusted server-side admin operations.
 */
export function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    const cfg = getConfig();
    _adminClient = createClient(cfg.supabase.url, cfg.supabase.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _adminClient;
}

// Named convenience exports
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getAnonClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return (getAdminClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default { getAnonClient, getAdminClient };
