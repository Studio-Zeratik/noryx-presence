/**
 * Embeddable presence card (SVG): works in an <img>, a GitHub README or any site.
 * The drawing itself is in card-render.ts (shared with noryxbot.com's card generator); this file fetches the images.
 * Images (avatar, album art, game art) are embedded as data, because an <img> SVG can't load outside images, and they
 * are only ever fetched from Discord's and Spotify's CDNs.
 */
import { cardImageUrls, renderCard, renderNotTracked, type CardOptions, type Lang } from './card-render.js';
import type { PresenceData } from './snapshot.js';

export { escapeXml, elapsed, parseCardOptions } from './card-render.js';
export type { CardOptions } from './card-render.js';

const defaults = (lang: Lang): CardOptions => ({ lang, theme: 'dark', accent: 'lime', size: 'card', hide: new Set() });
const options = (o: Lang | CardOptions): CardOptions => (typeof o === 'string' ? defaults(o) : o);

const T = {
  fr: { listening: 'Écoute', playing: 'Joue à', watching: 'Regarde', streaming: 'En live', competing: 'Participe à', nothing: 'Rien en cours' },
  en: { listening: 'Listening to', playing: 'Playing', watching: 'Watching', streaming: 'Streaming', competing: 'Competing in', nothing: 'Nothing going on' },
};

/** One line describing what the person is doing right now */
export function activityLine(p: PresenceData, lang: Lang): string {
  const t = T[lang];
  if (p.spotify) return `${t.listening} ${p.spotify.song}${p.spotify.artist ? ` · ${p.spotify.artist.replace(/;/g, ',')}` : ''}`;
  const a = p.activities.find((x) => x.type !== 4);
  if (a) {
    const verb = [t.playing, t.streaming, t.listening, t.watching, '', t.competing][a.type] || t.playing;
    return `${verb} ${a.name}${a.details ? ` · ${a.details}` : ''}`;
  }
  if (p.custom_status?.text) return `${p.custom_status.emoji?.name && !p.custom_status.emoji.id ? `${p.custom_status.emoji.name} ` : ''}${p.custom_status.text}`;
  return t.nothing;
}

const IMAGE_HOSTS = ['https://cdn.discordapp.com/', 'https://media.discordapp.net/', 'https://i.scdn.co/'];
const imageCache = new Map<string, { data: string; at: number }>();

/** An image as a data URI (cached 10 minutes). Only Discord's and Spotify's CDNs are ever fetched. */
export async function imageData(url: string | null | undefined): Promise<string | null> {
  if (!url || !IMAGE_HOSTS.some((h) => url.startsWith(h))) return null;
  const hit = imageCache.get(url);
  if (hit && Date.now() - hit.at < 600_000) return hit.data;
  try {
    const src = url.startsWith('https://cdn.discordapp.com/avatars/') ? url.replace(/\.gif\?/, '.png?').replace(/size=\d+/, 'size=128') : url;
    const res = await fetch(src, { signal: AbortSignal.timeout(5_000) });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(png|jpe?g|webp|gif)$/.test(type)) return null;
    if (Number(res.headers.get('content-length') ?? 0) > 400_000) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 400_000) return null;
    const data = `data:${type};base64,${buf.toString('base64')}`;
    imageCache.set(url, { data, at: Date.now() });
    if (imageCache.size > 3_000) imageCache.delete(imageCache.keys().next().value!);
    return data;
  } catch {
    return null;
  }
}

export async function presenceCard(p: PresenceData, o: Lang | CardOptions, now = Date.now()): Promise<string> {
  const opts = options(o);
  const urls = cardImageUrls(p, opts);
  const [avatar, art] = await Promise.all([imageData(urls.avatar), imageData(urls.art)]);
  return renderCard(p, opts, { avatar, art }, now);
}

export function notTrackedCard(o: Lang | CardOptions): string {
  return renderNotTracked(options(o));
}
