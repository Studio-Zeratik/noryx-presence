/**
 * NoryxBot Presence — public Discord presence API by Studio Zératik.
 * Starts the presence bot, the HTTP API (/v1) and the live socket (/socket).
 */
import type { Server } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { startPresenceBot } from './bot.js';
import { config, ConfigError } from './config.js';
import { logger } from './logger.js';
import { presenceRoutes } from './routes.js';
import { attachPresenceSocket } from './socket.js';
import { PresenceTracker } from './tracker.js';

const log = logger('presence');

async function main() {
  log.info('Starting NoryxBot Presence');
  const cfg = config.presence();
  const port = config.port();
  const tracker = new PresenceTracker();

  const app = new Hono();
  app.get('/', (c) => c.redirect('/v1'));
  app.get('/health', (c) => c.json({ ok: true, tracked: tracker.size }));
  app.route('/v1', presenceRoutes(tracker));
  app.notFound((c) => c.json({ success: false, error: { code: 'not_found', message: 'Not found' } }, 404));

  const server = serve({ fetch: app.fetch, port, hostname: config.host() }, (info) => log.info(`API on http://localhost:${info.port}/v1 and ws://localhost:${info.port}/socket`));
  const socket = attachPresenceSocket(server as Server, tracker);
  const bot = await startPresenceBot(cfg, tracker);

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info(`Stopping (${signal})`);
    socket.close();
    server.close();
    await bot.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('SIGINT'));
  process.on('SIGTERM', () => void stop('SIGTERM'));
}

process.on('unhandledRejection', (err) => log.error('Unhandled error', err));

main().catch((err) => {
  if (err instanceof ConfigError) log.error(err.message);
  else if ((err as { code?: string })?.code === 'TokenInvalid') log.error('Discord refused PRESENCE_BOT_TOKEN. Copy it again from the Discord Developer Portal (Bot → Reset Token).');
  else if ((err as { code?: string })?.code === 'DisallowedIntents') log.error('Turn on "Server Members Intent" and "Presence Intent" in the Discord Developer Portal (Bot tab), then restart.');
  else log.error('NoryxBot Presence could not start', err);
  process.exit(1);
});
