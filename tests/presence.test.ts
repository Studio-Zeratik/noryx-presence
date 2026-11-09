import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { getRequestListener } from '@hono/node-server';
import { WebSocket } from 'ws';
import { activityLine, escapeXml, notTrackedCard, presenceCard } from '../src/card.ts';
import { presenceRoutes } from '../src/routes.ts';
import { buildPresence, samePresence } from '../src/snapshot.ts';
import { attachPresenceSocket } from '../src/socket.ts';
import { PresenceTracker } from '../src/tracker.ts';

const USER = { id: '100000000000000001', username: 'testuser', globalName: 'Test User', avatar: null, bot: false };
const OTHER = '100000000000000002';
const NORYX = '1556972010754678807';
const STUDIO = '1463195333692752010';

const spotify = {
  status: 'online',
  clientStatus: { desktop: 'online' },
  activities: [
    { name: 'Spotify', type: 2, details: 'Song', state: 'Artist A; Artist B', syncId: 'track123', assets: { largeImage: 'spotify:ab67', largeText: 'Album' }, timestamps: { start: 1, end: 2 } },
    { name: 'Custom Status', type: 4, state: 'En live ce soir', emoji: { name: '🎮' } },
  ],
};

test('snapshot follows the Lanyard shape', () => {
  const p = buildPresence(USER, spotify, 42);
  assert.equal(p.discord_status, 'online');
  assert.equal(p.discord_user.display_name, 'Test User');
  assert.match(p.discord_user.avatar_url, /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/\d\.png$/);
  assert.equal(p.active_on_discord_desktop, true);
  assert.equal(p.listening_to_spotify, true);
  assert.deepEqual(p.spotify, { track_id: 'track123', song: 'Song', artist: 'Artist A; Artist B', album: 'Album', album_art_url: 'https://i.scdn.co/image/ab67', timestamps: { start: 1, end: 2 } });
  assert.equal(p.custom_status?.text, 'En live ce soir');
  assert.equal(p.activities.length, 2);
});

test('no presence means offline', () => {
  const p = buildPresence(USER, null);
  assert.equal(p.discord_status, 'offline');
  assert.equal(p.spotify, null);
  assert.deepEqual(p.activities, []);
});

test('opt-in: tracked while in NoryxBot or Studio, deleted after leaving both', () => {
  const t = new PresenceTracker();
  const removed: string[] = [];
  t.on('remove', (id) => removed.push(id));
  t.join(USER.id, NORYX, buildPresence(USER, spotify));
  t.join(USER.id, STUDIO, buildPresence(USER, spotify));
  assert.ok(t.get(USER.id));
  t.leave(USER.id, NORYX);
  assert.ok(t.get(USER.id), 'still in the Studio server');
  t.leave(USER.id, STUDIO);
  assert.equal(t.get(USER.id), null);
  assert.deepEqual(removed, [USER.id]);
});

test('presence of people who never joined is ignored', () => {
  const t = new PresenceTracker();
  t.set(OTHER, buildPresence({ ...USER, id: OTHER }, spotify));
  assert.equal(t.get(OTHER), null);
});

test('identical presence does not send an update', () => {
  const t = new PresenceTracker();
  let updates = 0;
  t.on('update', () => updates++);
  t.join(USER.id, NORYX, buildPresence(USER, spotify, 1));
  t.set(USER.id, buildPresence(USER, spotify, 2));
  assert.equal(updates, 1);
  assert.ok(samePresence(buildPresence(USER, spotify, 1), buildPresence(USER, spotify, 2)));
});

test('API: tracked, not tracked, invalid id, open CORS', async () => {
  const t = new PresenceTracker();
  t.join(USER.id, NORYX, buildPresence(USER, spotify));
  const app = presenceRoutes(t);
  const ok = await app.request(`/users/${USER.id}`, { headers: { Origin: 'https://example.com' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), '*');
  const body = (await ok.json()) as { success: boolean; data: { discord_user: { id: string } } };
  assert.equal(body.success, true);
  assert.equal(body.data.discord_user.id, USER.id);
  const missing = await app.request(`/users/${OTHER}`);
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { error: { code: string } }).error.code, 'user_not_monitored');
  assert.equal((await app.request('/users/abc')).status, 400);
});

test('card escapes names and texts', async () => {
  const evil = buildPresence({ ...USER, globalName: '<script>alert(1)</script>' }, { status: 'dnd', activities: [{ name: 'Game "&" <b>', type: 0 }] });
  const svg = await presenceCard(evil, 'fr');
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /Ne pas déranger/);
  assert.equal(escapeXml(`<>&'"`), '&lt;&gt;&amp;&apos;&quot;');
  assert.match(notTrackedCard('en'), /Presence not tracked/);
});

test('activity line: Spotify first, then games, then custom status', () => {
  assert.equal(activityLine(buildPresence(USER, spotify), 'fr'), 'Écoute Song · Artist A, Artist B');
  assert.equal(activityLine(buildPresence(USER, { status: 'online', activities: [{ name: 'Minecraft', type: 0 }] }), 'en'), 'Playing Minecraft');
  assert.equal(activityLine(buildPresence(USER, { status: 'online', activities: [] }), 'en'), 'Nothing going on');
});

test('WebSocket: hello, INIT_STATE, live PRESENCE_UPDATE and REMOVE', async () => {
  const t = new PresenceTracker();
  t.join(USER.id, NORYX, buildPresence(USER, spotify));
  const server = createServer(getRequestListener(() => new Response('ok')));
  const sock = attachPresenceSocket(server, t);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket`);
  const messages: { op: number; t?: string; d: any }[] = [];
  const next = () => new Promise<(typeof messages)[number]>((resolve) => ws.once('message', (m) => resolve(JSON.parse(String(m)))));

  const hello = await next();
  assert.equal(hello.op, 1);
  assert.ok(hello.d.heartbeat_interval > 0);

  ws.send(JSON.stringify({ op: 2, d: { subscribe_to_ids: [USER.id, OTHER] } }));
  const init = await next();
  assert.equal(init.t, 'INIT_STATE');
  assert.deepEqual(Object.keys(init.d), [USER.id], 'only tracked people are sent');

  const update = next();
  t.set(USER.id, buildPresence(USER, { status: 'idle', activities: [] }));
  const u = await update;
  assert.equal(u.t, 'PRESENCE_UPDATE');
  assert.equal(u.d.discord_status, 'idle');

  const removal = next();
  t.leave(USER.id, NORYX);
  assert.deepEqual((await removal).d, { user_id: USER.id });

  const closed = new Promise<number>((r) => ws.once('close', (code) => r(code)));
  ws.send(JSON.stringify({ op: 2, d: { subscribe_to_ids: Array.from({ length: 51 }, (_, i) => String(100000000000000000n + BigInt(i))) } }));
  assert.equal(await closed, 4006, 'more than 50 people is refused');

  sock.close();
  await new Promise<void>((r) => server.close(() => r()));
});

test('card options: theme, accent, compact size and hidden parts', async () => {
  const { parseCardOptions } = await import('../src/card.ts');
  const q = (s: string) => parseCardOptions(new URLSearchParams(s));
  const d = q('');
  assert.deepEqual([d.lang, d.theme, d.accent, d.size, d.hide.size], ['en', 'dark', 'lime', 'card', 0]);
  const o = q('lang=en&theme=light&accent=blue&size=compact&hide=spotify,art,nope');
  assert.deepEqual([o.lang, o.theme, o.accent, o.size, [...o.hide]], ['en', 'light', 'blue', 'compact', ['spotify', 'art']]);
  assert.equal(q('theme=<x>&accent=red').theme, 'dark', 'unknown values fall back to the defaults');

  const p = buildPresence(USER, spotify);
  const light = await presenceCard(p, q('theme=light'));
  assert.match(light, /#FAFAF7/);
  const compact = await presenceCard(p, q('size=compact&lang=en'));
  assert.match(compact, /width="340" height="64"/);
  const hidden = await presenceCard(p, q('hide=spotify'));
  assert.doesNotMatch(hidden, /Song/);
  const nothing = await presenceCard(p, q('hide=activity'));
  assert.doesNotMatch(nothing, /Song|Nothing going on/);
  assert.match(notTrackedCard(q('size=compact')), /width="340"/);
});

test('Spotify card: the song with its progress, or a calm message when nothing plays', async () => {
  const { parseCardOptions } = await import('../src/card.ts');
  const q = (s: string) => parseCardOptions(new URLSearchParams(s));
  assert.equal(q('size=spotify').size, 'spotify');
  const playing = buildPresence(USER, { ...spotify, activities: [{ ...spotify.activities[0]!, timestamps: { start: Date.now() - 65_000, end: Date.now() + 120_000 } }] });
  const svg = await presenceCard(playing, q('size=spotify&lang=fr'));
  assert.match(svg, /width="460" height="112"/);
  assert.match(svg, /EN ÉCOUTE SUR SPOTIFY/);
  assert.match(svg, /Song/);
  assert.match(svg, /Artist A, Artist B/);
  assert.match(svg, />1:0[45]</, 'elapsed time');
  const quiet = await presenceCard(buildPresence(USER, { status: 'idle', activities: [] }), q('size=spotify&lang=en'));
  assert.match(quiet, /Not listening to anything/);
  assert.match(quiet, /Idle/);
  assert.doesNotMatch(await presenceCard(playing, q('size=spotify&hide=elapsed')), />1:0[45]</);
});

test('PNG card: a real PNG image, also for people who are not tracked', async () => {
  const t = new PresenceTracker();
  t.join(USER.id, NORYX, buildPresence(USER, { status: 'online', activities: [{ name: 'Minecraft', type: 0 }] }));
  const app = presenceRoutes(t);
  const ok = await app.request(`/users/${USER.id}/card.png?lang=fr`);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/png');
  const png = new Uint8Array(await ok.arrayBuffer());
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(new DataView(png.buffer).getUint32(16), 920, 'drawn at twice the card width');
  const missing = await app.request(`/users/${OTHER}/card.png`);
  assert.equal(missing.status, 404);
  assert.deepEqual([...new Uint8Array(await missing.arrayBuffer()).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
});

test('overlay: transparent page that refreshes the card, locked down by its own CSP', async () => {
  const app = presenceRoutes(new PresenceTracker());
  const res = await app.request(`/users/${USER.id}/overlay?size=spotify&lang=fr&accent=blue`);
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy') ?? '';
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, 'scripts and styles need the nonce');
  assert.match(csp, /default-src 'none'/);
  const html = await res.text();
  assert.match(html, /background: transparent/);
  assert.match(html, /card\.svg\?lang=fr&amp;accent=blue&amp;size=spotify|card\.svg\?lang=fr&accent=blue&size=spotify/);
  assert.ok(html.includes(`nonce="${nonce}"`));
  assert.equal((await app.request('/users/abc/overlay')).status, 400);
});

test('PNG: emoji the font cannot draw are left out, the rest of the name stays', async () => {
  const { withoutEmoji } = await import('../src/png.ts');
  assert.equal(withoutEmoji('<text>Test User 🌑</text>'), '<text>Test User</text>');
  assert.equal(withoutEmoji('<text>Zoé ❤️ 🇨🇦</text>'), '<text>Zoé</text>');
  assert.equal(withoutEmoji('<image href="data:image/png;base64,AAAA"/>'), '<image href="data:image/png;base64,AAAA"/>');
});

test('social banner: networks in the address order, repeated accounts, a line under the name, limits', async () => {
  const { parseSocialOptions, MAX_ENTRIES } = await import('../src/widgets/socials.ts');
  const o = parseSocialOptions(new URLSearchParams('youtube=Main|Chaîne principale&twitch=YourName&youtube=Replays&nope=x&every=12&lang=fr&id=123'));
  assert.deepEqual(o.entries.map((e) => [e.network, e.handle, e.line]), [['youtube', 'Main', 'Chaîne principale'], ['twitch', 'YourName', null], ['youtube', 'Replays', null]]);
  assert.equal(o.every, 12);
  assert.equal(o.lang, 'fr');
  assert.equal(o.id, null, 'an ID that is not a Discord ID is ignored');
  assert.equal(parseSocialOptions(new URLSearchParams('')).every, 20, '20 s by default');
  assert.equal(parseSocialOptions(new URLSearchParams('every=2')).every, 20, 'too fast falls back to the default');
  assert.equal(parseSocialOptions(new URLSearchParams('every=300')).every, 300, 'up to 5 minutes');
  assert.equal(parseSocialOptions(new URLSearchParams('every=301')).every, 20, 'longer than 5 minutes falls back to the default');
  const many = parseSocialOptions(new URLSearchParams(Array.from({ length: 20 }, (_, i) => ['x', `n${i}`])));
  assert.equal(many.entries.length, MAX_ENTRIES);
  assert.equal(parseSocialOptions(new URLSearchParams(`x=${'a'.repeat(80)}`)).entries[0]!.handle.length, 40);
});

test('social banner page: texts from the address never become HTML, own CSP, fonts served from the service', async () => {
  const app = presenceRoutes(new PresenceTracker());
  const res = await app.request('/widgets/socials?twitch=%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E&discord=Le%20QG&lang=fr&id=100000000000000001');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.doesNotMatch(html, /<\/script><script>alert/);
  assert.match(html, /\u003c\/script>/);
  assert.match(html, /"name":"Twitch"/);
  assert.match(html, /"name":"Spotify"/, 'with an ID, the Spotify icon comes along for the song slide');
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/);
  const font = await app.request('/fonts/Poppins-Bold.ttf');
  assert.equal(font.status, 200);
  assert.equal(font.headers.get('content-type'), 'font/ttf');
  assert.equal((await app.request('/fonts/secret.env')).status, 404);
  const empty = await (await app.request('/widgets/socials?lang=fr')).text();
  assert.match(empty, /noryxbot\.com\/fr\/presence/);
});

test('social banner: every part works alone (one network, Spotify only, Discord only)', async () => {
  const { parseSocialOptions, socialsPage } = await import('../src/widgets/socials.ts');
  const q = (s: string) => parseSocialOptions(new URLSearchParams(s));
  assert.deepEqual(q('id=100000000000000001').live, ['discord', 'spotify'], 'both by default');
  const spotifyOnly = q('id=100000000000000001&live=spotify');
  assert.deepEqual([spotifyOnly.entries.length, spotifyOnly.live], [0, ['spotify']]);
  const html = socialsPage(spotifyOnly).html;
  assert.match(html, /"live":\["spotify"\]/);
  assert.match(html, /"name":"Spotify"/);
  assert.doesNotMatch(html, /"name":"Discord"/, 'only the icons in use are sent');
  assert.deepEqual(q('youtube=YourName').entries.map((e) => e.network), ['youtube']);
  assert.deepEqual(q('id=100000000000000001&live=discord').live, ['discord']);
});
