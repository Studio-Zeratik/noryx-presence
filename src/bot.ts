/**
 * NoryxBot Presence: a second Discord application, run by the same program as NoryxBot.
 * It is only on the allowed servers (NoryxBot's and Studio Zératik's) and has the two privileged
 * intents the main NoryxBot doesn't need: Server Members and Presence.
 * Joining one of those servers is the opt-in; leaving all of them stops tracking.
 */
import { Client, Events, GatewayIntentBits, type Guild, type GuildMember, type Presence, type User } from 'discord.js';
import type { PresenceConfig } from './config.js';
import { logger } from './logger.js';
import { buildPresence, type ActivityInput, type PresenceInput, type UserInput } from './snapshot.js';
import type { PresenceTracker } from './tracker.js';

const log = logger('presence');

const toUser = (u: User): UserInput => ({ id: u.id, username: u.username, globalName: u.globalName, avatar: u.avatar, bot: u.bot });

const ms = (d: Date | null | undefined) => (d ? d.getTime() : null);

function toPresence(p: Presence | null | undefined): PresenceInput | null {
  if (!p) return null;
  return {
    status: p.status,
    clientStatus: p.clientStatus ?? null,
    activities: p.activities.map(
      (a): ActivityInput => ({
        name: a.name,
        type: a.type,
        details: a.details,
        state: a.state,
        url: a.url,
        applicationId: a.applicationId,
        syncId: a.syncId,
        createdTimestamp: a.createdTimestamp,
        timestamps: a.timestamps ? { start: ms(a.timestamps.start), end: ms(a.timestamps.end) } : null,
        assets: a.assets ? { largeImage: a.assets.largeImage, largeText: a.assets.largeText, smallImage: a.assets.smallImage, smallText: a.assets.smallText } : null,
        emoji: a.emoji ? { name: a.emoji.name, id: a.emoji.id, animated: a.emoji.animated } : null,
      }),
    ),
  };
}

export async function startPresenceBot(cfg: PresenceConfig, tracker: PresenceTracker): Promise<Client> {
  const allowed = new Set(cfg.guildIds);
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences] });

  const track = (m: GuildMember) => {
    if (m.user.bot || !allowed.has(m.guild.id)) return;
    tracker.join(m.id, m.guild.id, buildPresence(toUser(m.user), toPresence(m.presence)));
  };

  /** Loads every member of an allowed server (at startup, or when the bot is invited later) */
  const loadGuild = async (guild: Guild) => {
    try {
      const members = await guild.members.fetch({ withPresences: true });
      members.forEach(track);
      log.info(`${guild.name}: ${members.filter((m) => !m.user.bot).size} member(s) tracked`);
    } catch (err) {
      log.error(`Could not read the members of ${guild.name}`, err);
    }
  };

  client.once(Events.ClientReady, async (c) => {
    for (const id of cfg.guildIds) {
      const guild = c.guilds.cache.get(id);
      if (!guild) {
        log.warn(`NoryxBot Presence is not on server ${id}: invite it there`);
        continue;
      }
      await loadGuild(guild);
    }
    // Leave any server that isn't allowed: presence is only collected where people opted in
    for (const guild of c.guilds.cache.values()) {
      if (!allowed.has(guild.id)) {
        log.warn(`Leaving ${guild.name} (${guild.id}): not an allowed server`);
        await guild.leave().catch(() => {});
      }
    }
    log.info(`Online as ${c.user.tag}, tracking ${tracker.size} person(s)`);
  });

  client.on(Events.PresenceUpdate, (_old, now) => {
    if (!now.guild || !allowed.has(now.guild.id) || !now.user || now.user.bot) return;
    tracker.set(now.userId, buildPresence(toUser(now.user), toPresence(now)));
  });
  client.on(Events.GuildMemberAdd, track);
  client.on(Events.GuildMemberUpdate, (_old, m) => track(m));
  client.on(Events.UserUpdate, (_old, u) => {
    const member = cfg.guildIds.map((g) => client.guilds.cache.get(g)?.members.cache.get(u.id)).find(Boolean);
    if (member) track(member);
  });
  client.on(Events.GuildMemberRemove, (m) => {
    if (allowed.has(m.guild.id)) tracker.leave(m.id, m.guild.id);
  });
  client.on(Events.GuildCreate, (guild) => {
    if (!allowed.has(guild.id)) {
      log.warn(`Added to ${guild.name} (${guild.id}), which isn't allowed: leaving`);
      void guild.leave().catch(() => {});
      return;
    }
    log.info(`Invited to ${guild.name}: loading its members`);
    void loadGuild(guild);
  });
  client.on(Events.GuildDelete, (guild) => tracker.dropGuild(guild.id));
  client.on(Events.Error, (err) => log.error('Discord error', err));

  await client.login(cfg.token);
  return client;
}
