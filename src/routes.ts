/**
 * Public presence API (no sign-in). Same paths and shape as Lanyard:
 *
 *   GET /v1/users/:id            { success: true, data } or 404 user_not_monitored
 *   GET /v1/users/:id/card.svg   Embeddable card (?lang=fr|en, see parseCardOptions for every option)
 *   GET /v1/users/:id/card.png   The same card as a PNG image, for places that refuse SVG
 *   GET /v1/users/:id/overlay    Live overlay for OBS and other streaming software (transparent background)
 *   GET /v1/widgets/socials      Animated social banner for streams, set up in the address (see widgets/socials.ts)
 *   GET /v1/fonts/:file          The font the overlays use (Poppins, OFL)
 *   WS  /socket                  Live updates (see socket.ts)
 *
 * Open to every site (CORS *, no cookies), with a request limit per address.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { rateLimit } from './rate-limit.js';
import { notTrackedCard, parseCardOptions, presenceCard, type CardOptions } from './card.js';
import { overlayPage } from './overlay.js';
import { svgToPng } from './png.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseSocialOptions, socialsPage } from './widgets/socials.js';

const FONT_DIR = fileURLToPath(new URL('../assets/fonts/', import.meta.url));
const FONT_FILES = ['Poppins-Bold.ttf', 'Poppins-SemiBold.ttf', 'Poppins-Regular.ttf'];
import type { PresenceTracker } from './tracker.js';

const SNOWFLAKE = /^\d{17,20}$/;
export const NOT_MONITORED = {
  success: false,
  error: { code: 'user_not_monitored', message: 'This user is not tracked by NoryxBot Presence. Join the NoryxBot or Studio Zératik Discord server to turn it on.' },
} as const;

export function presenceRoutes(tracker: PresenceTracker) {
  const app = new Hono();
  app.use('*', cors({ origin: '*', allowMethods: ['GET'], maxAge: 86_400 }));
  app.use('*', rateLimit(180));
  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
  });

  app.get('/', (c) =>
    c.json({ name: 'NoryxBot Presence', by: 'Studio Zératik', tracked: tracker.size, docs: 'https://noryxbot.com/presence/', source: 'https://github.com/Studio-Zeratik/noryx-presence', licence: 'AGPL-3.0', endpoints: ['/v1/users/:id', '/v1/users/:id/card.svg', '/v1/users/:id/card.png', '/v1/users/:id/overlay', '/v1/widgets/socials', '/socket'] }),
  );

  app.get('/users/:id', (c) => {
    const id = c.req.param('id');
    if (!SNOWFLAKE.test(id)) return c.json({ success: false, error: { code: 'invalid_id', message: 'Not a Discord user ID' } }, 400);
    const data = tracker.get(id);
    c.header('Cache-Control', 'no-store');
    return data ? c.json({ success: true, data }) : c.json(NOT_MONITORED, 404);
  });

  /** The card for an id (or the "not tracked" card), as SVG text */
  const cardFor = async (id: string, opts: CardOptions): Promise<{ svg: string; found: boolean }> => {
    const data = SNOWFLAKE.test(id) ? tracker.get(id) : null;
    return data ? { svg: await presenceCard(data, opts), found: true } : { svg: notTrackedCard(opts), found: false };
  };
  // Options: ?lang=en|fr&theme=dark|light&accent=lime|coral|blue|violet|pink|cyan&size=card|compact|spotify&hide=activity,spotify,elapsed,art,custom
  const optionsOf = (c: { req: { query(name: string): string | undefined } }) => parseCardOptions({ get: (name) => c.req.query(name) });

  app.get('/users/:id/card.svg', async (c) => {
    const { svg, found } = await cardFor(c.req.param('id'), optionsOf(c));
    c.header('Content-Type', 'image/svg+xml; charset=utf-8');
    c.header('Cache-Control', 'public, max-age=30');
    c.header('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'");
    return c.body(svg, found ? 200 : 404);
  });

  app.get('/users/:id/card.png', async (c) => {
    const { svg, found } = await cardFor(c.req.param('id'), optionsOf(c));
    c.header('Content-Type', 'image/png');
    c.header('Cache-Control', 'public, max-age=30');
    return c.body(new Uint8Array(svgToPng(svg)), found ? 200 : 404);
  });

  app.get('/users/:id/overlay', (c) => {
    const id = c.req.param('id');
    if (!SNOWFLAKE.test(id)) return c.text('Not a Discord user ID', 400);
    const { html, nonce } = overlayPage(optionsOf(c));
    c.header('Cache-Control', 'no-store');
    c.header('Content-Security-Policy', `default-src 'none'; img-src 'self'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`);
    return c.html(html);
  });

  app.get('/widgets/socials', (c) => {
    const { html, nonce } = socialsPage(parseSocialOptions(new URL(c.req.url).searchParams));
    c.header('Cache-Control', 'no-store');
    c.header(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src 'self'; connect-src 'self'; img-src 'self' https://i.scdn.co; base-uri 'none'; form-action 'none'`,
    );
    return c.html(html);
  });

  app.get('/fonts/:file', async (c) => {
    const file = c.req.param('file');
    if (!FONT_FILES.includes(file)) return c.json({ success: false, error: { code: 'not_found', message: 'Not found' } }, 404);
    c.header('Content-Type', 'font/ttf');
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    return c.body(new Uint8Array(await readFile(FONT_DIR + file)));
  });

  return app;
}
