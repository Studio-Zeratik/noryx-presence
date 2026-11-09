/**
 * Who is tracked, and their latest presence. Memory only: nothing is written to disk.
 *
 * Opt-in rule: a person is tracked while they are a member of at least one of the allowed
 * servers (NoryxBot's or Studio Zératik's). Leaving all of them deletes their data at once.
 */
import { EventEmitter } from 'node:events';
import { samePresence, type PresenceData } from './snapshot.js';

interface TrackerEvents {
  /** New or changed presence */
  update: [userId: string, data: PresenceData];
  /** The person is no longer tracked (left every allowed server) */
  remove: [userId: string];
}

export class PresenceTracker extends EventEmitter<TrackerEvents> {
  private readonly data = new Map<string, PresenceData>();
  /** userId → allowed servers they are in */
  private readonly memberships = new Map<string, Set<string>>();

  isTracked(userId: string): boolean {
    return (this.memberships.get(userId)?.size ?? 0) > 0;
  }

  get(userId: string): PresenceData | null {
    return this.isTracked(userId) ? (this.data.get(userId) ?? null) : null;
  }

  get size(): number {
    return this.memberships.size;
  }

  /** The person is (still) a member of `guildId`; `snapshot` is their presence there. */
  join(userId: string, guildId: string, snapshot: PresenceData): void {
    let set = this.memberships.get(userId);
    if (!set) this.memberships.set(userId, (set = new Set()));
    set.add(guildId);
    this.set(userId, snapshot);
  }

  /** Presence changed (only for tracked people). */
  set(userId: string, snapshot: PresenceData): void {
    if (!this.isTracked(userId)) return;
    const before = this.data.get(userId);
    if (before && samePresence(before, snapshot)) return;
    this.data.set(userId, snapshot);
    this.emit('update', userId, snapshot);
  }

  /** The person left `guildId` (or was removed). Deleted when they are in no allowed server. */
  leave(userId: string, guildId: string): void {
    const set = this.memberships.get(userId);
    if (!set) return;
    set.delete(guildId);
    if (set.size === 0) {
      this.memberships.delete(userId);
      this.data.delete(userId);
      this.emit('remove', userId);
    }
  }

  /** NoryxBot Presence lost access to a whole server: everyone only there is removed. */
  dropGuild(guildId: string): void {
    for (const userId of [...this.memberships.keys()]) this.leave(userId, guildId);
  }
}
