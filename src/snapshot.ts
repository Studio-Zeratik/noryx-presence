/**
 * Turns Discord's presence data into the public NoryxBot Presence format.
 * The shape follows Lanyard's (discord_user, discord_status, activities, spotify…) so a site
 * using Lanyard can switch by changing one address. Extra fields (avatar_url, *_url) only add.
 *
 * Inputs are plain objects (not discord.js classes) so this file is easy to test.
 */

export type Status = 'online' | 'idle' | 'dnd' | 'offline';

export interface UserInput {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  bot: boolean;
}

export interface ActivityInput {
  name: string;
  type: number;
  details?: string | null;
  state?: string | null;
  url?: string | null;
  applicationId?: string | null;
  syncId?: string | null;
  createdTimestamp?: number;
  timestamps?: { start?: number | null; end?: number | null } | null;
  assets?: { largeImage?: string | null; largeText?: string | null; smallImage?: string | null; smallText?: string | null } | null;
  emoji?: { name?: string | null; id?: string | null; animated?: boolean | null } | null;
}

export interface PresenceInput {
  status: string;
  clientStatus?: { desktop?: string; mobile?: string; web?: string } | null;
  activities: ActivityInput[];
}

export interface Activity {
  type: number;
  name: string;
  details: string | null;
  state: string | null;
  url: string | null;
  application_id: string | null;
  created_at: number | null;
  timestamps: { start?: number; end?: number } | null;
  assets: { large_image: string | null; large_text: string | null; small_image: string | null; small_text: string | null; large_image_url: string | null; small_image_url: string | null } | null;
  emoji: { name: string | null; id: string | null; animated: boolean } | null;
}

export interface Spotify {
  track_id: string | null;
  song: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  timestamps: { start?: number; end?: number } | null;
}

export interface PresenceData {
  discord_user: { id: string; username: string; global_name: string | null; display_name: string; avatar: string | null; avatar_url: string; bot: boolean };
  discord_status: Status;
  active_on_discord_desktop: boolean;
  active_on_discord_mobile: boolean;
  active_on_discord_web: boolean;
  listening_to_spotify: boolean;
  spotify: Spotify | null;
  custom_status: { text: string | null; emoji: Activity['emoji'] } | null;
  activities: Activity[];
  /** Not in Lanyard: when this snapshot was made (ms) */
  updated_at: number;
}

const ACTIVITY_CUSTOM = 4;
const ACTIVITY_LISTENING = 2;
const STATUSES: Status[] = ['online', 'idle', 'dnd', 'offline'];

export function avatarUrl(u: UserInput): string {
  if (u.avatar) return `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`;
  const index = Number((BigInt(u.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/** Discord asset keys → image addresses (Spotify, external images, application assets) */
export function assetUrl(key: string | null | undefined, applicationId: string | null | undefined): string | null {
  if (!key) return null;
  if (key.startsWith('spotify:')) return `https://i.scdn.co/image/${key.slice('spotify:'.length)}`;
  if (key.startsWith('mp:')) return `https://media.discordapp.net/${key.slice('mp:'.length)}`;
  if (/^\d+$/.test(key) && applicationId) return `https://cdn.discordapp.com/app-assets/${applicationId}/${key}.png`;
  return null;
}

const ts = (t: ActivityInput['timestamps']) => {
  if (!t) return null;
  const out: { start?: number; end?: number } = {};
  if (t.start) out.start = t.start;
  if (t.end) out.end = t.end;
  return Object.keys(out).length ? out : null;
};

function activity(a: ActivityInput): Activity {
  const appId = a.applicationId ?? null;
  return {
    type: a.type,
    name: a.name,
    details: a.details ?? null,
    state: a.state ?? null,
    url: a.url ?? null,
    application_id: appId,
    created_at: a.createdTimestamp ?? null,
    timestamps: ts(a.timestamps),
    assets: a.assets
      ? {
          large_image: a.assets.largeImage ?? null,
          large_text: a.assets.largeText ?? null,
          small_image: a.assets.smallImage ?? null,
          small_text: a.assets.smallText ?? null,
          large_image_url: assetUrl(a.assets.largeImage, appId),
          small_image_url: assetUrl(a.assets.smallImage, appId),
        }
      : null,
    emoji: a.emoji ? { name: a.emoji.name ?? null, id: a.emoji.id ?? null, animated: !!a.emoji.animated } : null,
  };
}

export function buildPresence(user: UserInput, presence: PresenceInput | null, now = Date.now()): PresenceData {
  const status = (STATUSES as string[]).includes(presence?.status ?? '') ? (presence!.status as Status) : 'offline';
  const activities = (presence?.activities ?? []).map(activity);
  const spotifyRaw = (presence?.activities ?? []).find((a) => a.type === ACTIVITY_LISTENING && a.name === 'Spotify');
  const custom = activities.find((a) => a.type === ACTIVITY_CUSTOM) ?? null;
  const cs = presence?.clientStatus ?? {};
  return {
    discord_user: {
      id: user.id,
      username: user.username,
      global_name: user.globalName,
      display_name: user.globalName ?? user.username,
      avatar: user.avatar,
      avatar_url: avatarUrl(user),
      bot: user.bot,
    },
    discord_status: status,
    active_on_discord_desktop: !!cs.desktop,
    active_on_discord_mobile: !!cs.mobile,
    active_on_discord_web: !!cs.web,
    listening_to_spotify: !!spotifyRaw,
    spotify: spotifyRaw
      ? {
          track_id: spotifyRaw.syncId ?? null,
          song: spotifyRaw.details ?? '',
          artist: spotifyRaw.state ?? '',
          album: spotifyRaw.assets?.largeText ?? null,
          album_art_url: assetUrl(spotifyRaw.assets?.largeImage, null),
          timestamps: ts(spotifyRaw.timestamps),
        }
      : null,
    custom_status: custom ? { text: custom.state, emoji: custom.emoji } : null,
    activities,
    updated_at: now,
  };
}

/** True when two snapshots show the same thing (ignores the update time) */
export function samePresence(a: PresenceData, b: PresenceData): boolean {
  const strip = (p: PresenceData) => JSON.stringify({ ...p, updated_at: 0 });
  return strip(a) === strip(b);
}
