/**
 * Small logger: one line per message, with the time, level and area (discord, twitch…).
 * Lines go to standard output, for whatever runs the service to keep.
 * Never log tokens or message contents.
 */
import { config, type LogLevel } from './config.js';

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function write(level: LogLevel, area: string, message: string, extra?: unknown) {
  if (ORDER[level] < ORDER[config.logLevel]) return;
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${area}] ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (extra instanceof Error) out(line, '-', extra.stack ?? extra.message);
  else if (extra !== undefined) out(line, extra);
  else out(line);
}

export const logger = (area: string) => ({
  debug: (m: string, e?: unknown) => write('debug', area, m, e),
  info: (m: string, e?: unknown) => write('info', area, m, e),
  warn: (m: string, e?: unknown) => write('warn', area, m, e),
  error: (m: string, e?: unknown) => write('error', area, m, e),
});
