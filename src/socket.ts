/**
 * Live presence over WebSocket, at /socket. Same messages as Lanyard so its clients work as is:
 *
 *   server → { op: 1, d: { heartbeat_interval } }                      Hello, on connect
 *   client → { op: 2, d: { subscribe_to_id } | { subscribe_to_ids } }  Subscribe (up to 50 people)
 *   server → { op: 0, t: "INIT_STATE", d }                             Current presence(s)
 *   server → { op: 0, t: "PRESENCE_UPDATE", d }                        On every change
 *   server → { op: 0, t: "PRESENCE_REMOVE", d: { user_id } }           No longer tracked (NoryxBot only)
 *   client → { op: 3 }                                                 Heartbeat, at least every interval
 *   client → { op: 4, d: { unsubscribe_from_id } }                     Unsubscribe
 *
 * Limits: 50 people per connection, 20 connections per address, small messages only.
 * subscribe_to_all is not offered: only people someone asked for are sent.
 */
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { logger } from './logger.js';
import type { PresenceData } from './snapshot.js';
import type { PresenceTracker } from './tracker.js';

const log = logger('presence-ws');

export const HEARTBEAT_MS = 30_000;
const MAX_IDS = 50;
const MAX_PER_IP = 20;
const MAX_MESSAGE = 4_096;
const SNOWFLAKE = /^\d{17,20}$/;

interface Client {
  ws: WebSocket;
  ip: string;
  /** Subscribed ids; null until op 2 */
  ids: Set<string> | null;
  /** Subscribed to a single id (INIT_STATE is then the presence itself, like Lanyard) */
  single: boolean;
  lastBeat: number;
}

export function attachPresenceSocket(server: Server, tracker: PresenceTracker, path = '/socket') {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE });
  const clients = new Set<Client>();
  const perIp = new Map<string, number>();

  const send = (c: Client, msg: unknown) => {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  };
  const closeWith = (c: Client, code: number, reason: string) => c.ws.close(code, reason);

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== path) return; // other upgrades are not ours
    const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? 'unknown');
    if ((perIp.get(ip) ?? 0) >= MAX_PER_IP) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, ip));
  });

  wss.on('connection', (ws: WebSocket, ip: string) => {
    const c: Client = { ws, ip, ids: null, single: false, lastBeat: Date.now() };
    clients.add(c);
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    send(c, { op: 1, d: { heartbeat_interval: HEARTBEAT_MS } });

    ws.on('message', (raw) => {
      let msg: { op?: number; d?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return closeWith(c, 4002, 'invalid_payload');
      }
      if (msg.op === 3) {
        c.lastBeat = Date.now();
        return;
      }
      if (msg.op === 2) {
        const d = msg.d ?? {};
        const ids = typeof d.subscribe_to_id === 'string' ? [d.subscribe_to_id] : Array.isArray(d.subscribe_to_ids) ? d.subscribe_to_ids : null;
        if (!ids || ids.length === 0 || ids.length > MAX_IDS || !ids.every((x) => typeof x === 'string' && SNOWFLAKE.test(x))) {
          return closeWith(c, 4006, 'invalid_subscription');
        }
        c.ids = new Set(ids as string[]);
        c.single = typeof d.subscribe_to_id === 'string';
        c.lastBeat = Date.now();
        if (c.single) {
          send(c, { op: 0, t: 'INIT_STATE', d: tracker.get(ids[0] as string) ?? {} });
        } else {
          const state: Record<string, PresenceData> = {};
          for (const id of c.ids) {
            const p = tracker.get(id);
            if (p) state[id] = p;
          }
          send(c, { op: 0, t: 'INIT_STATE', d: state });
        }
        return;
      }
      if (msg.op === 4) {
        const id = msg.d?.unsubscribe_from_id;
        if (typeof id === 'string') c.ids?.delete(id);
        return;
      }
      closeWith(c, 4004, 'unknown_opcode');
    });

    ws.on('close', () => {
      clients.delete(c);
      const n = (perIp.get(c.ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(c.ip);
      else perIp.set(c.ip, n);
    });
    ws.on('error', () => ws.terminate());
  });

  const onUpdate = (userId: string, data: PresenceData) => {
    for (const c of clients) if (c.ids?.has(userId)) send(c, { op: 0, t: 'PRESENCE_UPDATE', d: data });
  };
  const onRemove = (userId: string) => {
    for (const c of clients) if (c.ids?.has(userId)) send(c, { op: 0, t: 'PRESENCE_REMOVE', d: { user_id: userId } });
  };
  tracker.on('update', onUpdate);
  tracker.on('remove', onRemove);

  // Drop connections that stop sending heartbeats (with a little grace)
  const sweep = setInterval(() => {
    const limit = Date.now() - HEARTBEAT_MS * 1.5;
    for (const c of clients) if (c.lastBeat < limit) closeWith(c, 4001, 'heartbeat_timeout');
  }, 10_000);

  log.info(`Live presence on ${path}`);
  return {
    clients: () => clients.size,
    close: () => {
      clearInterval(sweep);
      tracker.off('update', onUpdate);
      tracker.off('remove', onRemove);
      for (const c of clients) c.ws.terminate();
      wss.close();
    },
  };
}
