// ============================================================
// CampusSarthi — Structured JSON Logger
// ============================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLevel(): LogLevel {
  const env = process.env['NODE_ENV'] ?? 'development';
  return env === 'production' ? 'info' : 'debug';
}

function formatEntry(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown>
): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}): void {
  const minPriority = LEVEL_PRIORITY[getMinLevel()];
  if (LEVEL_PRIORITY[level] < minPriority) return;

  const line = formatEntry(level, message, meta);

  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug(message: string, meta: Record<string, unknown> = {}): void {
    log('debug', message, meta);
  },
  info(message: string, meta: Record<string, unknown> = {}): void {
    log('info', message, meta);
  },
  warn(message: string, meta: Record<string, unknown> = {}): void {
    log('warn', message, meta);
  },
  error(message: string, meta: Record<string, unknown> = {}): void {
    log('error', message, meta);
  },
};

export default logger;
