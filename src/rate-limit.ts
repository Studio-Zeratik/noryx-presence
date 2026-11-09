/**
 * Simple rate limit per address: `max` requests per minute.
 * Behind a reverse proxy, the real address comes from the cf-connecting-ip header: the proxy must always set it
 * (overwriting what the visitor sent), otherwise the socket address is used.
 */
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';

export function rateLimit(max: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return async (c: Context, next: () => Promise<void>) => {
    let ip = c.req.header('cf-connecting-ip');
    if (!ip) {
      try {
        ip = getConnInfo(c).remote.address;
      } catch {
        ip = 'unknown';
      }
    }
    ip ??= 'unknown';
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 60_000 });
    else if (++h.n > max) return c.json({ success: false, error: { code: 'rate_limited', message: 'Too many requests, try again in a minute.' } }, 429);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    await next();
  };
}
