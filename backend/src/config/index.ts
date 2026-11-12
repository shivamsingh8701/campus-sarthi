// ============================================================
// CampusSarthi — Central Configuration
// ============================================================

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key: string, defaultValue = ''): string {
  return (process.env[key] ?? defaultValue).trim();
}

function requireIntEnv(key: string, defaultValue?: number): number {
  const raw = process.env[key];
  if (!raw) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got: ${raw}`);
  }
  return parsed;
}

export interface AppConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  jwtSecret: string;
  jwtExpiry: string;
  cookieSecret: string;

  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };

  ai: {
    geminiApiKey: string;
    openaiApiKey: string;
    geminiModel: string;
    geminiProModel: string;
    openaiModel: string;
    openaiReasoningModel: string;
  };

  email: {
    gmailClientId: string;
    gmailClientSecret: string;
    gmailRefreshToken: string;
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
  };

  encryption: {
    key: string;
  };

  frontendUrl: string;

  lms: {
    baseUrl: string;
    loginUrl: string;
  };

  scheduler: {
    syncIntervalMinutes: number;
  };

  isProduction: boolean;
  isDevelopment: boolean;
}

function buildConfig(): AppConfig {
  const nodeEnv = optionalEnv('NODE_ENV', 'development') as AppConfig['nodeEnv'];

  return {
    nodeEnv,
    port: requireIntEnv('PORT', 3001),
    jwtSecret: requireEnv('JWT_SECRET'),
    jwtExpiry: optionalEnv('JWT_EXPIRY', '7d'),
    cookieSecret: requireEnv('COOKIE_SECRET'),

    supabase: {
      url: requireEnv('SUPABASE_URL'),
      anonKey: requireEnv('SUPABASE_ANON_KEY'),
      serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    },

    ai: {
      geminiApiKey: optionalEnv('GEMINI_API_KEY'),
      openaiApiKey: optionalEnv('OPENAI_API_KEY'),
      geminiModel: optionalEnv('GEMINI_MODEL', 'gemini-3-flash-preview'),
      geminiProModel: optionalEnv('GEMINI_PRO_MODEL', 'gemini-3-flash-preview'),
      openaiModel: optionalEnv('OPENAI_MODEL', 'gpt-4o-mini'),
      openaiReasoningModel: optionalEnv('OPENAI_REASONING_MODEL', 'gpt-4o'),
    },

    email: {
      gmailClientId: optionalEnv('GMAIL_CLIENT_ID'),
      gmailClientSecret: optionalEnv('GMAIL_CLIENT_SECRET'),
      gmailRefreshToken: optionalEnv('GMAIL_REFRESH_TOKEN'),
      smtpHost: optionalEnv('SMTP_HOST', 'smtp.gmail.com'),
      smtpPort: requireIntEnv('SMTP_PORT', 587),
      smtpUser: optionalEnv('SMTP_USER'),
      smtpPass: optionalEnv('SMTP_PASS'),
    },

    encryption: {
      key: requireEnv('ENCRYPTION_KEY'),
    },

    frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),

    lms: {
      baseUrl: optionalEnv('LMS_BASE_URL', 'https://gulms.galgotiasuniversity.org'),
      loginUrl: optionalEnv(
        'LMS_LOGIN_URL',
        'https://gulms.galgotiasuniversity.org/login/index.php'
      ),
    },

    scheduler: {
      syncIntervalMinutes: requireIntEnv('SYNC_INTERVAL_MINUTES', 60),
    },

    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
  };
}

// Lazy singleton — built only once when first imported
let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = buildConfig();
  }
  return _config;
}

export const config = new Proxy({} as AppConfig, {
  get(_target, prop) {
    return getConfig()[prop as keyof AppConfig];
  },
});

export default config;
