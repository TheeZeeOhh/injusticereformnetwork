/**
 * log.js — a bounded activity feed. Newest-last, capped so a long session can't
 * grow memory without bound. Purely local; nothing here is ever sent anywhere.
 */
import { randomUUID } from 'node:crypto';

export class ActivityLog {
  constructor(max = 500) {
    this.max = max;
    /** @type {object[]} */
    this.entries = [];
  }

  add(level, text, meta = {}) {
    const entry = { id: randomUUID(), ts: Date.now(), level, text, ...meta };
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.shift();
    return entry;
  }

  list() {
    return this.entries;
  }
}
