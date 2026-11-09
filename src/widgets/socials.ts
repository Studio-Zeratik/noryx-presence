/**
 * Social banner for streams (OBS, Streamlabs…): a small animated banner on a transparent background that shows
 * your networks one after the other. Free, no account: everything is in the address, nothing is stored.
 *
 *   /v1/widgets/socials?twitch=YourName&youtube=YourName|Main channel&discord=Your server&every=30&lang=en
 *
 * - One parameter per network (twitch, kick, youtube, tiktok, instagram, x, facebook, discord, threads, bluesky,
 *   github, steam), in the order wanted, repeated for several accounts. "Name|Line" adds a small line under it.
 * - every: seconds before the next network (5 to 300, so up to 5 minutes; 20 by default). lang: en or fr.
 * - id (optional): a Discord ID tracked by NoryxBot Presence. The banner then also shows the person live on
 *   Discord (status or game), and the song when they listen to Spotify. live=discord or live=spotify keeps only one
 *   of them. Every part works alone: one network, Spotify only (the banner steps aside when no music plays)…
 *
 * Texts come from the address: they are passed to the page as JSON (with "<" escaped) and only ever shown with
 * textContent, never as HTML.
 */
import { randomBytes } from 'node:crypto';
import { BRANDS, type Brand } from './brand-icons.js';

export const SOCIAL_NETWORKS = ['twitch', 'kick', 'youtube', 'tiktok', 'instagram', 'x', 'facebook', 'discord', 'threads', 'bluesky', 'github', 'steam'] as const satisfies readonly Brand[];
export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

export const MAX_ENTRIES = 12;
/** Seconds before the next network: 20 by default, from 5 seconds up to 5 minutes */
export const DEFAULT_EVERY = 20;
export const MIN_EVERY = 5;
export const MAX_EVERY = 300;
const MAX_TEXT = 40;
const SNOWFLAKE = /^\d{17,20}$/;

export interface SocialEntry {
  network: SocialNetwork;
  handle: string;
  line: string | null;
}

export const LIVE_SLIDES = ['discord', 'spotify'] as const;
export type LiveSlide = (typeof LIVE_SLIDES)[number];

export interface SocialOptions {
  entries: SocialEntry[];
  every: number;
  lang: 'en' | 'fr';
  id: string | null;
  /** With an ID: what to show live, Discord (status or game) and/or the song on Spotify */
  live: LiveSlide[];
}

const clean = (s: string) => [...s.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, MAX_TEXT).join('');

/** The banner's options from the address (the order of the networks is the order in the address) */
export function parseSocialOptions(params: URLSearchParams): SocialOptions {
  const entries: SocialEntry[] = [];
  for (const [key, value] of params) {
    if (!(SOCIAL_NETWORKS as readonly string[]).includes(key) || entries.length >= MAX_ENTRIES) continue;
    const [handle = '', line = ''] = value.split('|');
    const h = clean(handle);
    if (h) entries.push({ network: key as SocialNetwork, handle: h, line: clean(line) || null });
  }
  const every = Math.round(Number(params.get('every')));
  const id = params.get('id') ?? '';
  return {
    entries,
    every: Number.isFinite(every) && every >= MIN_EVERY && every <= MAX_EVERY ? every : DEFAULT_EVERY,
    lang: params.get('lang') === 'fr' ? 'fr' : 'en',
    id: SNOWFLAKE.test(id) ? id : null,
    live: params.has('live') ? LIVE_SLIDES.filter((k) => (params.get('live') ?? '').split(',').includes(k)) : [...LIVE_SLIDES],
  };
}

const T = {
  fr: {
    discordLive: 'Discord · en direct', online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', offline: 'Hors ligne',
    playing: 'Joue à', streaming: 'En live', listening: 'Écoute', watching: 'Regarde', competing: 'Participe à',
    spotify: 'En écoute sur Spotify', empty: 'Ajoute tes réseaux à l’adresse : noryxbot.com/fr/presence',
  },
  en: {
    discordLive: 'Discord · live', online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline',
    playing: 'Playing', streaming: 'Streaming', listening: 'Listening to', watching: 'Watching', competing: 'Competing in',
    spotify: 'Now playing on Spotify', empty: 'Add your networks to the address: noryxbot.com/presence',
  },
};

/** JSON safe to put inside a <script> element */
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').split(LS).join('\\u2028').split(PS).join('\\u2029');

export function socialsPage(o: SocialOptions): { html: string; nonce: string } {
  const nonce = randomBytes(16).toString('base64');
  const used = [...new Set([...o.entries.map((e) => e.network), ...(o.id ? o.live : [])])];
  const icons = Object.fromEntries(used.map((k) => [k, BRANDS[k]]));
  const data = { entries: o.entries, every: o.every, id: o.live.length ? o.id : null, live: o.live, t: T[o.lang], icons };
  const html = `<!doctype html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>NoryxBot Presence · Socials</title>
<style nonce="${nonce}">
@font-face { font-family: 'Poppins'; font-weight: 700; src: url('../fonts/Poppins-Bold.ttf') format('truetype'); }
@font-face { font-family: 'Poppins'; font-weight: 600; src: url('../fonts/Poppins-SemiBold.ttf') format('truetype'); }
@font-face { font-family: 'Poppins'; font-weight: 400; src: url('../fonts/Poppins-Regular.ttf') format('truetype'); }
:root { --c: #C6F432; --c6: rgba(198,244,50,.6); --c2: rgba(198,244,50,.18); --c1: rgba(198,244,50,.1); }
html { color-scheme: dark; }
* { box-sizing: border-box; }
html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
body { padding: 18px; font-family: 'Poppins', 'Segoe UI', system-ui, sans-serif; }
/* The banner: same look as the NoryxBot Presence cards (black, dots, gradient edge, ring) */
.b { position: relative; display: flex; align-items: center; gap: 16px; width: 460px; min-height: 92px; padding: 14px 22px 17px 14px; border-radius: 20px; overflow: hidden; isolation: isolate;
  background-color: #0A0A0A; background-image: radial-gradient(rgba(255,255,255,.055) 1px, transparent 1.3px); background-size: 14px 14px; background-position: 1px 1px;
  box-shadow: 0 14px 40px rgba(0,0,0,.55);
  opacity: 0; transform: translate3d(-14px, 0, 0); transition: opacity .4s ease, transform .55s cubic-bezier(.22,1,.36,1); }
.b.on { opacity: 1; transform: none; }
.b::before { content: ''; position: absolute; inset: 0; padding: 1.5px; border-radius: inherit; pointer-events: none;
  background: linear-gradient(135deg, var(--c6), var(--c1) 55%, rgba(255,107,74,.45));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.glow { position: absolute; left: -46px; top: 50%; width: 200px; height: 200px; transform: translateY(-50%); border-radius: 50%; background: radial-gradient(closest-side, var(--c2), transparent); z-index: -1; transition: background .45s ease; }
/* Icon in a ring, like the avatar on the cards */
.i { position: relative; flex: 0 0 64px; width: 64px; height: 64px; display: grid; place-items: center; }
.ring { position: absolute; inset: 0; width: 64px; height: 64px; transform: rotate(-90deg); }
.ring circle { fill: none; stroke: var(--c); }
.ring .bg { stroke-opacity: .22; stroke-width: 2; }
.ring .arc { stroke-width: 2.6; stroke-linecap: round; stroke-dasharray: 133 49; }
.b.on .ring .arc { animation: draw .9s cubic-bezier(.22,1,.36,1); }
@keyframes draw { from { stroke-dasharray: 0 182; } }
.ic { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; overflow: hidden; background: #1C1C1A; }
.ic svg { width: 23px; height: 23px; fill: var(--c); }
.ic img { width: 100%; height: 100%; object-fit: cover; }
.b.on .ic > * { animation: pop .55s cubic-bezier(.22,1,.36,1); }
@keyframes pop { 0% { transform: scale(.7); opacity: .2; } 65% { transform: scale(1.08); opacity: 1; } 100% { transform: none; } }
.dot { position: absolute; right: 5px; bottom: 5px; width: 14px; height: 14px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3.5px #0A0A0A; }
/* Text */
.t { min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.tag { margin-bottom: 4px; color: var(--c); font-size: 9.5px; font-weight: 700; letter-spacing: 1.1px; line-height: 1.3; text-transform: uppercase; }
.h { max-width: 330px; overflow: hidden; color: #F5F5F2; font-size: 19px; font-weight: 700; line-height: 1.2; white-space: nowrap; text-overflow: ellipsis; }
.s { max-width: 330px; margin-top: 2px; overflow: hidden; color: #9A9A95; font-size: 12.5px; font-weight: 400; line-height: 1.3; white-space: nowrap; text-overflow: ellipsis; }
.s:empty { display: none; }
.wm { position: absolute; top: 11px; right: 18px; color: #F5F5F2; font-size: 10.5px; font-weight: 700; letter-spacing: .2px; }
.wm b { color: #C6F432; }
/* Time left on this network */
.p { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.06); }
.p i { position: absolute; inset: 0 auto 0 0; width: 0; background: var(--c); }
.p i.run { width: 100%; transition: width var(--every) linear; }
.empty { display: inline-block; padding: 12px 16px; border-radius: 12px; background: #0A0A0A; color: #F5F5F2; font-size: 14px; font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .b, .b.on .ic > *, .b.on .ring .arc { animation: none; transition: opacity .2s; transform: none; } }
</style>
</head>
<body>
<div class="b" id="b" hidden><div class="glow"></div><div class="i"><svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="29"/><circle class="arc" cx="32" cy="32" r="29"/></svg><div class="ic" id="i"></div><span class="dot"></span></div><div class="t"><span class="tag" id="tag"></span><span class="h" id="h"></span><span class="s" id="s"></span></div><span class="wm">noryx<b>bot</b></span><div class="p"><i id="p"></i></div></div>
<script nonce="${nonce}">
(function () {
  var D = ${scriptJson(data)};
  var $ = function (id) { return document.getElementById(id); };
  var b = $('b'), icon = $('i'), tag = $('tag'), h = $('h'), s = $('s'), bar = $('p');
  var live = null;
  document.documentElement.style.setProperty('--every', D.every + 's');

  function glowOf(hex, alpha) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }
  function svgIcon(key) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', D.icons[key].path);
    svg.appendChild(path);
    return svg;
  }
  function activityText(p) {
    var t = D.t;
    var a = (p.activities || []).filter(function (x) { return x.type !== 4 && x.type !== 2; })[0];
    if (a) return ([t.playing, t.streaming, t.listening, t.watching, '', t.competing][a.type] || t.playing) + ' ' + a.name;
    if (p.custom_status && p.custom_status.text) return p.custom_status.text;
    return t[p.discord_status] || t.online;
  }

  /** The slides of one round: the networks, then (with an ID) Discord live and the song playing */
  function slides() {
    var list = D.entries.map(function (e) { return { key: e.network, tag: D.icons[e.network].name, handle: e.handle, line: e.line || '' }; });
    if (live && D.live.indexOf('discord') >= 0 && live.discord_status !== 'offline') {
      list.push({ key: 'discord', tag: D.t.discordLive, handle: live.discord_user.display_name, line: activityText(live) });
    }
    if (live && D.live.indexOf('spotify') >= 0 && live.spotify) {
      list.push({ key: 'spotify', tag: D.t.spotify, handle: live.spotify.song, line: (live.spotify.artist || '').replace(/;/g, ','), art: live.spotify.album_art_url });
    }
    return list;
  }

  var index = 0;
  var current = null;
  function show() {
    var list = slides();
    if (!list.length) {
      // Nothing to show (e.g. Spotify only, and no music right now): the banner steps aside
      current = null;
      b.classList.remove('on');
      bar.classList.remove('run');
      return;
    }
    var item = list[index % list.length];
    index = (index + 1) % list.length;
    current = item;
    b.classList.remove('on');
    bar.classList.remove('run');
    setTimeout(function () {
      var brand = D.icons[item.key];
      document.documentElement.style.setProperty('--c', brand.color);
      document.documentElement.style.setProperty('--c6', glowOf(brand.color, .6));
      document.documentElement.style.setProperty('--c2', glowOf(brand.color, .18));
      document.documentElement.style.setProperty('--c1', glowOf(brand.color, .1));
      icon.textContent = '';
      if (item.art && /^https:\\/\\/i\\.scdn\\.co\\//.test(item.art)) {
        var img = document.createElement('img');
        img.alt = '';
        // No album art (or it fails to load): the Spotify icon instead
        img.onerror = function () { icon.textContent = ''; icon.appendChild(svgIcon(item.key)); };
        img.src = item.art;
        icon.appendChild(img);
      } else {
        icon.appendChild(svgIcon(item.key));
      }
      tag.textContent = item.tag;
      h.textContent = item.handle;
      s.textContent = item.line;
      b.hidden = false;
      void b.offsetWidth;
      b.classList.add('on');
      requestAnimationFrame(function () { requestAnimationFrame(function () { bar.classList.add('run'); }); });
    }, 400);
  }

  function refresh() {
    if (!D.id) return Promise.resolve();
    return fetch('../users/' + D.id, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { live = j && j.success ? j.data : null; })
      .catch(function () {});
  }

  if (!D.entries.length && !D.id) {
    var note = document.createElement('div');
    note.className = 'empty';
    note.textContent = D.t.empty;
    document.body.appendChild(note);
    return;
  }
  /** After a refresh: a new song, or something to show again, appears right away instead of at the next turn */
  function react() {
    var list = slides();
    var song = list.filter(function (x) { return x.key === 'spotify'; })[0];
    if (!current && list.length) show();
    else if (current && current.key === 'spotify' && (!song || song.handle !== current.handle)) show();
  }

  refresh().then(function () {
    show();
    setInterval(show, D.every * 1000);
    if (D.id) setInterval(function () { refresh().then(react); }, 10000);
  });
})();
</script>
</body>
</html>`;
  return { html, nonce };
}
