/**
 * Settings, read once from the environment (.env on a computer, the service file on the server).
 * Missing required values stop the program with a clear message.
 */
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

const value = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

export class ConfigError extends Error {}

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LEVELS)[number];

/** Official servers where joining turns presence tracking on: NoryxBot's and Studio Zératik's */
export const DEFAULT_GUILDS = ['1556972010754678807', '1463195333692752010'];

export interface PresenceConfig {
  token: string;
  guildIds: string[];
}

export const config = {
  logLevel: ((): LogLevel => {
    const v = value('LOG_LEVEL') ?? 'info';
    return (LEVELS as readonly string[]).includes(v) ? (v as LogLevel) : 'info';
  })(),

  presence(): PresenceConfig {
    const token = value('PRESENCE_BOT_TOKEN');
    if (!token) throw new ConfigError('Missing setting PRESENCE_BOT_TOKEN. Copy .env.example to .env and fill it in.');
    const guildIds = (value('PRESENCE_GUILD_IDS') ?? DEFAULT_GUILDS.join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!guildIds.length || guildIds.some((id) => !/^\d{17,20}$/.test(id))) {
      throw new ConfigError('PRESENCE_GUILD_IDS must be Discord server IDs separated by commas.');
    }
    return { token, guildIds };
  },

  port(): number {
    const port = Number(value('PORT') ?? 3007);
    if (!Number.isInteger(port) || port <= 0) throw new ConfigError('PORT must be a port number, for example 3007.');
    return port;
  },

  /** Address the web server listens on: 127.0.0.1 behind a reverse proxy (default) */
  host: () => value('HOST') ?? '127.0.0.1',
};
