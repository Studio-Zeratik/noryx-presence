/**
 * Presence card renderer (SVG text only, no Node or browser API), in NoryxBot's style.
 *
 * This file is shared: noryxbot.com uses an exact copy (noryx-website/src/presence-card.ts) for the live preview of the
 * card generator. Change it here first, then copy it there, so the preview always matches the real card.
 *
 * Everything that comes from Discord users is escaped. Images are passed in already embedded as data URIs.
 */

export type Lang = 'fr' | 'en';
export type Status = 'online' | 'idle' | 'dnd' | 'offline';
export type Theme = 'dark' | 'light';
export type Size = 'card' | 'compact' | 'spotify';
export type Hidden = 'activity' | 'spotify' | 'elapsed' | 'art' | 'custom';

/** The parts of a presence the card reads (same shape as the API's data) */
export interface CardPresence {
  discord_user: { display_name: string; avatar_url: string };
  discord_status: Status;
  spotify: { song: string; artist: string; album_art_url: string | null; timestamps: { start?: number; end?: number } | null } | null;
  custom_status: { text: string | null; emoji: { name: string | null; id: string | null } | null } | null;
  activities: {
    type: number;
    name: string;
    details: string | null;
    state: string | null;
    timestamps: { start?: number; end?: number } | null;
    assets: { large_image_url: string | null } | null;
  }[];
}

export interface CardOptions {
  lang: Lang;
  theme: Theme;
  accent: Accent;
  size: Size;
  hide: Set<Hidden>;
}

export const ACCENTS = {
  lime: { dark: '#C6F432', light: '#5A8A00' },
  coral: { dark: '#FF6B4A', light: '#D9480F' },
  blue: { dark: '#6E9BFF', light: '#2456D6' },
  violet: { dark: '#B197FC', light: '#6D3FD6' },
  pink: { dark: '#FF6FB5', light: '#C2256F' },
  cyan: { dark: '#3DDCF0', light: '#0B7C92' },
} as const;
export type Accent = keyof typeof ACCENTS;

const HIDDEN: Hidden[] = ['activity', 'spotify', 'elapsed', 'art', 'custom'];

/** Card options from a URL query (?lang=en&theme=light&accent=blue&size=compact&hide=spotify,art). Unknown values are ignored. */
export function parseCardOptions(q: { get(name: string): string | null | undefined }): CardOptions {
  const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    lang: pick(q.get('lang'), ['en', 'fr'], 'en'),
    theme: pick(q.get('theme'), ['dark', 'light'], 'dark'),
    accent: pick(q.get('accent'), Object.keys(ACCENTS) as Accent[], 'lime'),
    size: pick(q.get('size'), ['card', 'compact', 'spotify'], 'card'),
    hide: new Set((q.get('hide') ?? '').split(',').map((s) => s.trim()).filter((s): s is Hidden => HIDDEN.includes(s as Hidden))),
  };
}

/** The query string for some options, without the defaults (what the generator puts in the card's address) */
export function cardQuery(o: CardOptions): string {
  const parts = [`lang=${o.lang}`];
  if (o.theme !== 'dark') parts.push(`theme=${o.theme}`);
  if (o.accent !== 'lime') parts.push(`accent=${o.accent}`);
  if (o.size !== 'card') parts.push(`size=${o.size}`);
  if (o.hide.size) parts.push(`hide=${HIDDEN.filter((h) => o.hide.has(h)).join(',')}`);
  return parts.join('&');
}

const T = {
  fr: {
    online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger', offline: 'Hors ligne',
    listening: 'Écoute', playing: 'Joue à', watching: 'Regarde', streaming: 'En live', competing: 'Participe à',
    spotify: 'Écoute sur Spotify', status: 'Statut', nothing: 'Rien en cours',
    notTracked: 'Présence non suivie', join: 'Rejoins le serveur Discord de NoryxBot pour l’activer',
    onSpotify: 'En écoute sur Spotify', notListening: 'Aucune musique en ce moment',
    since: (d: string) => `depuis ${d}`,
  },
  en: {
    online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline',
    listening: 'Listening to', playing: 'Playing', watching: 'Watching', streaming: 'Streaming', competing: 'Competing in',
    spotify: 'Listening on Spotify', status: 'Status', nothing: 'Nothing going on',
    notTracked: 'Presence not tracked', join: 'Join the NoryxBot Discord server to turn it on',
    onSpotify: 'Now playing on Spotify', notListening: 'Not listening to anything',
    since: (d: string) => `for ${d}`,
  },
};

const PALETTE = {
  dark: {
    bg: '#0A0A0A', ink: '#FFFFFF', dots: 0.05, text: '#F5F5F2', muted: '#9A9A95', faint: '#6B6B66', empty: '#1C1C1A', brand: '#C6F432',
    status: { online: '#C6F432', idle: '#FFC94A', dnd: '#FF6B4A', offline: '#6B6B66' } as Record<Status, string>,
  },
  light: {
    bg: '#FAFAF7', ink: '#000000', dots: 0.06, text: '#111110', muted: '#5E5E58', faint: '#8A8A84', empty: '#E7E7E2', brand: '#5A8A00',
    status: { online: '#5A8A00', idle: '#B7791F', dnd: '#D9480F', offline: '#8A8A84' } as Record<Status, string>,
  },
};

const FONT = "Poppins, 'Segoe UI', Inter, system-ui, sans-serif";

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);

type Act = CardPresence['activities'][number];
const verbOf = (a: Act, lang: Lang) => {
  const t = T[lang];
  return [t.playing, t.streaming, t.listening, t.watching, '', t.competing][a.type] || t.playing;
};

/** "1 h 12" / "1h 12m" from a start time */
export function elapsed(start: number, now: number, lang: Lang): string {
  const min = Math.max(0, Math.floor((now - start) / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (lang === 'fr') return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
}

/** What the card shows as the current activity, once the hidden parts are left out */
function current(p: CardPresence, o: CardOptions) {
  if (o.hide.has('activity')) return { spotify: null, game: null, custom: null };
  const spotify = o.hide.has('spotify') ? null : p.spotify;
  const game = spotify ? null : (p.activities.find((x) => x.type !== 4 && !(o.hide.has('spotify') && x.name === 'Spotify' && x.type === 2)) ?? null);
  const custom = spotify || game || o.hide.has('custom') || !p.custom_status?.text ? null : p.custom_status;
  return { spotify, game, custom };
}

/** Images the card needs (the caller fetches them and passes them back as data URIs) */
export function cardImageUrls(p: CardPresence, o: CardOptions): { avatar: string; art: string | null } {
  if (o.size === 'spotify') return { avatar: p.discord_user.avatar_url, art: o.hide.has('art') ? null : (p.spotify?.album_art_url ?? null) };
  const c = current(p, o);
  const art = o.hide.has('art') || o.size === 'compact' ? null : (c.spotify?.album_art_url ?? c.game?.assets?.large_image_url ?? null);
  return { avatar: p.discord_user.avatar_url, art };
}

/* ------------------------------------------------------------------ */
/* Full card (460 × 128)                                               */
/* ------------------------------------------------------------------ */

function frame(o: CardOptions, status: Status, w: number, h: number, r: number, body: string, wordmark: { x: number; y: number; size: number }): string {
  const pal = PALETTE[o.theme];
  const accent = ACCENTS[o.accent][o.theme];
  const glow = pal.status[status];
  const edgeEnd = o.accent === 'lime' ? ACCENTS.coral[o.theme] : accent;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">
  <defs>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${accent}" stop-opacity=".6"/>
      <stop offset=".55" stop-color="${accent}" stop-opacity=".1"/>
      <stop offset="1" stop-color="${edgeEnd}" stop-opacity=".45"/>
    </linearGradient>
    <radialGradient id="glow" cx="${h / 2}" cy="${h / 2}" r="${h * 1.2}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${glow}" stop-opacity="${o.theme === 'dark' ? 0.16 : 0.12}"/>
      <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${pal.ink}" fill-opacity="${pal.dots}"/></pattern>
  </defs>
  <rect width="${w}" height="${h}" rx="${r}" fill="${pal.bg}"/>
  <rect width="${w}" height="${h}" rx="${r}" fill="url(#dots)"/>
  <rect width="${w}" height="${h}" rx="${r}" fill="url(#glow)"/>
  <rect x=".75" y=".75" width="${w - 1.5}" height="${h - 1.5}" rx="${r - 0.75}" fill="none" stroke="url(#edge)" stroke-width="1.5"/>
  ${body}
  <text x="${wordmark.x}" y="${wordmark.y}" text-anchor="end" font-family="${FONT}" font-size="${wordmark.size}" font-weight="800" letter-spacing=".2"><tspan fill="${pal.text}">noryx</tspan><tspan fill="${pal.brand}">bot</tspan></text>
</svg>`;
}

function avatarBlock(o: CardOptions, avatar: string | null, status: Status, cx: number, cy: number, r: number): string {
  const pal = PALETTE[o.theme];
  const c = pal.status[status];
  const ring = r + 6;
  const len = 2 * Math.PI * ring;
  const dot = Math.max(5, r * 0.2);
  const dx = cx + r * 0.78;
  const dy = cy + r * 0.78;
  return `<clipPath id="av"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
  <circle cx="${cx}" cy="${cy}" r="${ring}" fill="none" stroke="${c}" stroke-opacity=".25" stroke-width="2"/>
  <circle cx="${cx}" cy="${cy}" r="${ring}" fill="none" stroke="${c}" stroke-width="2.5" stroke-dasharray="${(len * 0.73).toFixed(1)} ${(len * 0.27).toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
  ${avatar ? `<image href="${avatar}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pal.empty}"/>`}
  <circle cx="${dx}" cy="${dy}" r="${dot + 3.5}" fill="${pal.bg}"/>
  <circle cx="${dx}" cy="${dy}" r="${dot}" fill="${c}"/>`;
}

function statusPill(o: CardOptions, x: number, y: number, status: Status, label: string): string {
  const c = PALETTE[o.theme].status[status];
  const w = Math.round(22 + label.length * 6.4);
  return `<rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="${c}" fill-opacity=".14"/>
  <circle cx="${x + 10}" cy="${y + 9}" r="3" fill="${c}"/>
  <text x="${x + 18}" y="${y + 13}" font-family="${FONT}" font-size="10.5" font-weight="700" fill="${c}">${escapeXml(label)}</text>`;
}

export function renderCard(p: CardPresence, o: CardOptions, images: { avatar: string | null; art: string | null }, now = Date.now()): string {
  if (o.size === 'compact') return renderCompact(p, o, images.avatar, now);
  if (o.size === 'spotify') return renderSpotify(p, o, images, now);
  const t = T[o.lang];
  const pal = PALETTE[o.theme];
  const accent = ACCENTS[o.accent][o.theme];
  const status = p.discord_status;
  const { spotify, game, custom } = current(p, o);
  const art = images.art;
  const textMax = art ? 30 : 40;
  const x = 118;

  let label = '';
  let main = '';
  let sub = '';
  let progress = '';
  if (spotify) {
    label = t.spotify;
    main = spotify.song;
    sub = spotify.artist.replace(/;/g, ',');
    const s = spotify.timestamps;
    if (s?.start && s.end && s.end > s.start) {
      const ratio = Math.min(1, Math.max(0, (now - s.start) / (s.end - s.start)));
      const width = art ? 236 : 316;
      progress = `<rect x="${x}" y="114" width="${width}" height="3" rx="1.5" fill="${pal.ink}" fill-opacity=".1"/>
  <rect x="${x}" y="114" width="${Math.max(3, Math.round(width * ratio))}" height="3" rx="1.5" fill="${accent}"/>`;
    }
  } else if (game) {
    label = verbOf(game, o.lang);
    if (game.timestamps?.start && !o.hide.has('elapsed')) label += ` · ${t.since(elapsed(game.timestamps.start, now, o.lang))}`;
    main = game.name;
    sub = game.details ?? game.state ?? '';
  } else if (custom?.text) {
    label = t.status;
    const emoji = custom.emoji?.name && !custom.emoji.id ? `${custom.emoji.name} ` : '';
    main = `${emoji}${custom.text}`;
  } else if (!o.hide.has('activity')) {
    main = t.nothing;
  }

  // Without any activity line, the name and status are centred vertically.
  const bare = !label && !main;
  const nameY = bare ? 60 : 42;
  const pillY = bare ? 70 : 50;
  const activity = label
    ? `<text x="${x}" y="${progress ? 86 : 90}" font-family="${FONT}" font-size="9.5" font-weight="700" letter-spacing="1" fill="${accent}">${escapeXml(clip(label.toUpperCase(), textMax + 4))}</text>
  <text x="${x}" y="${progress ? 104 : 108}" font-family="${FONT}" font-size="13" fill="${pal.muted}"><tspan font-weight="700" fill="${pal.text}">${escapeXml(clip(main, textMax))}</tspan>${
        sub && main.length < textMax - 4 ? `<tspan>&#160;· ${escapeXml(clip(sub, textMax - main.length - 3))}</tspan>` : ''
      }</text>`
    : main
      ? `<text x="${x}" y="100" font-family="${FONT}" font-size="13" fill="${pal.faint}">${escapeXml(main)}</text>`
      : '';

  return frame(
    o,
    status,
    460,
    128,
    22,
    `${avatarBlock(o, images.avatar, status, 62, 64, 33)}
  <text x="${x}" y="${nameY}" font-family="${FONT}" font-size="19" font-weight="800" fill="${pal.text}">${escapeXml(clip(p.discord_user.display_name, art ? 20 : 24))}</text>
  ${statusPill(o, x, pillY, status, t[status])}
  ${activity}
  ${progress}
  ${art ? `<clipPath id="art"><rect x="372" y="38" width="64" height="64" rx="14"/></clipPath>
  <image href="${art}" x="372" y="38" width="64" height="64" clip-path="url(#art)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="372.5" y="38.5" width="63" height="63" rx="13.5" fill="none" stroke="${pal.ink}" stroke-opacity=".1"/>` : ''}`,
    { x: 438, y: 24, size: 11 },
  );
}

/* ------------------------------------------------------------------ */
/* Compact badge (340 × 64), for READMEs and small spaces              */
/* ------------------------------------------------------------------ */

function renderCompact(p: CardPresence, o: CardOptions, avatar: string | null, now: number): string {
  const t = T[o.lang];
  const pal = PALETTE[o.theme];
  const status = p.discord_status;
  const { spotify, game, custom } = current(p, o);
  let line = t[status];
  let color = pal.status[status];
  if (spotify) {
    line = `${t.listening} ${spotify.song}`;
    color = pal.muted;
  } else if (game) {
    line = `${verbOf(game, o.lang)} ${game.name}${game.timestamps?.start && !o.hide.has('elapsed') ? ` · ${elapsed(game.timestamps.start, now, o.lang)}` : ''}`;
    color = pal.muted;
  } else if (custom?.text) {
    line = `${custom.emoji?.name && !custom.emoji.id ? `${custom.emoji.name} ` : ''}${custom.text}`;
    color = pal.muted;
  }
  return frame(
    o,
    status,
    340,
    64,
    18,
    `${avatarBlock(o, avatar, status, 32, 32, 19)}
  <text x="66" y="29" font-family="${FONT}" font-size="15" font-weight="800" fill="${pal.text}">${escapeXml(clip(p.discord_user.display_name, 18))}</text>
  <text x="66" y="47" font-family="${FONT}" font-size="11.5" fill="${color}">${escapeXml(clip(line, 36))}</text>`,
    { x: 324, y: 20, size: 9 },
  );
}

/* ------------------------------------------------------------------ */
/* Spotify card (460 × 112): only the music, for a site or a stream    */
/* ------------------------------------------------------------------ */

/** "3:07" from milliseconds */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A small Spotify-style mark: a green disc with three arcs */
function spotifyMark(x: number, y: number, theme: Theme): string {
  const green = theme === 'dark' ? '#1ED760' : '#1DB954';
  return `<circle cx="${x}" cy="${y}" r="7" fill="${green}"/>
  <path d="M${x - 3.6} ${y - 2.2}c2.6-.8 5.4-.6 7.6.7M${x - 3.2} ${y + 0.2}c2.2-.6 4.4-.4 6.2.6M${x - 2.8} ${y + 2.4}c1.7-.4 3.4-.3 4.8.5" fill="none" stroke="#0A0A0A" stroke-width="1.3" stroke-linecap="round"/>`;
}

function renderSpotify(p: CardPresence, o: CardOptions, images: { avatar: string | null; art: string | null }, now: number): string {
  const t = T[o.lang];
  const pal = PALETTE[o.theme];
  const accent = ACCENTS[o.accent][o.theme];
  const status = p.discord_status;
  const song = o.hide.has('activity') || o.hide.has('spotify') ? null : p.spotify;
  const showArt = !o.hide.has('art');
  const x = showArt ? 112 : 24;
  const width = 436 - x;
  const max = showArt ? 30 : 38;
  const art = showArt
    ? images.art && song
      ? `<clipPath id="art"><rect x="16" y="16" width="80" height="80" rx="14"/></clipPath>
  <image href="${images.art}" x="16" y="16" width="80" height="80" clip-path="url(#art)" preserveAspectRatio="xMidYMid slice"/>
  <rect x="16.5" y="16.5" width="79" height="79" rx="13.5" fill="none" stroke="${pal.ink}" stroke-opacity=".1"/>`
      : `<rect x="16" y="16" width="80" height="80" rx="14" fill="${pal.empty}"/>
  <path d="M62 38v26.5a7 7 0 1 1-4-6.3V44l-14 3v20.5a7 7 0 1 1-4-6.3V41z" fill="${pal.faint}" fill-opacity=".7"/>`
    : '';

  let body: string;
  if (song) {
    const s = song.timestamps;
    let bar = '';
    if (s?.start && s.end && s.end > s.start) {
      const total = s.end - s.start;
      const done = Math.min(total, Math.max(0, now - s.start));
      bar = `<rect x="${x}" y="80" width="${width}" height="4" rx="2" fill="${pal.ink}" fill-opacity=".1"/>
  <rect x="${x}" y="80" width="${Math.max(4, Math.round((width * done) / total))}" height="4" rx="2" fill="${accent}"/>${
    o.hide.has('elapsed')
      ? ''
      : `
  <text x="${x}" y="99" font-family="${FONT}" font-size="10" fill="${pal.faint}">${clock(done)}</text>
  <text x="${x + width}" y="99" text-anchor="end" font-family="${FONT}" font-size="10" fill="${pal.faint}">${clock(total)}</text>`
  }`;
    }
    body = `${art}
  ${spotifyMark(x + 7, 31, o.theme)}
  <text x="${x + 20}" y="35" font-family="${FONT}" font-size="9.5" font-weight="700" letter-spacing="1" fill="${accent}">${escapeXml(t.onSpotify.toUpperCase())}</text>
  <text x="${x}" y="56" font-family="${FONT}" font-size="16" font-weight="800" fill="${pal.text}">${escapeXml(clip(song.song, max))}</text>
  <text x="${x}" y="72" font-family="${FONT}" font-size="12" fill="${pal.muted}">${escapeXml(clip(song.artist.replace(/;/g, ','), max + 8))}</text>
  ${bar}`;
  } else {
    body = `${art}
  ${spotifyMark(x + 7, 31, o.theme)}
  <text x="${x + 20}" y="35" font-family="${FONT}" font-size="9.5" font-weight="700" letter-spacing="1" fill="${pal.faint}">SPOTIFY</text>
  <text x="${x}" y="60" font-family="${FONT}" font-size="15" font-weight="800" fill="${pal.text}">${escapeXml(t.notListening)}</text>
  <text x="${x}" y="80" font-family="${FONT}" font-size="12" fill="${pal.muted}">${escapeXml(clip(p.discord_user.display_name, max))}<tspan fill="${pal.status[status]}">&#160;· ${escapeXml(t[status])}</tspan></text>`;
  }
  return frame(o, status, 460, 112, 20, body, { x: 438, y: 24, size: 11 });
}

/** Card shown for someone NoryxBot Presence doesn't track */
export function renderNotTracked(o: CardOptions): string {
  const t = T[o.lang];
  const pal = PALETTE[o.theme];
  if (o.size === 'compact') {
    return frame(
      o,
      'offline',
      340,
      64,
      18,
      `${avatarBlock(o, null, 'offline', 32, 32, 19)}
  <text x="66" y="29" font-family="${FONT}" font-size="14" font-weight="800" fill="${pal.text}">${escapeXml(t.notTracked)}</text>
  <text x="66" y="47" font-family="${FONT}" font-size="10.5" fill="${pal.muted}">${escapeXml(clip(t.join, 44))}</text>`,
      { x: 324, y: 20, size: 9 },
    );
  }
  return frame(
    o,
    'offline',
    460,
    128,
    22,
    `${avatarBlock(o, null, 'offline', 62, 64, 33)}
  <text x="118" y="58" font-family="${FONT}" font-size="17" font-weight="800" fill="${pal.text}">${escapeXml(t.notTracked)}</text>
  <text x="118" y="82" font-family="${FONT}" font-size="12.5" fill="${pal.muted}">${escapeXml(t.join)}</text>`,
    { x: 438, y: 24, size: 11 },
  );
}
