'use strict';

const { sleep, randInt } = require('./humanizer');

const DEFAULT_LIMITS = {
  globalGapMs: [1500, 3000],
  globalPerMinute: 15,
  globalPerHour: 200,
  perChatPerHour: 8,
  floodInPerMinute: 8,
  floodMuteMs: 10 * 60 * 1000,
};

/**
 * Rate limiter: antrean global satu jalur + limit per chat + flood guard.
 */
class RateLimiter {
  constructor(cfg) {
    const limits = { ...DEFAULT_LIMITS, ...(cfg && cfg.limits) };
    this.limits = limits;
    this.lastSentAt = 0;
    this.recentSentAt = [];
    this.hourSentAt = [];
    this.incoming = new Map();
    this.floodMuteUntil = new Map();
    this.replyCounts = new Map();
    this.chain = Promise.resolve();
  }

  async acquire() {
    const task = this.chain.then(() => this._acquire());
    this.chain = task.then(
      () => undefined,
      () => undefined
    );
    return task;
  }

  async _acquire() {
    const gap = randInt(this.limits.globalGapMs[0], this.limits.globalGapMs[1]);
    const wait = this.lastSentAt + gap - Date.now();
    if (wait > 0) await sleep(wait);

    const now = Date.now();
    this.recentSentAt = this.recentSentAt.filter((t) => now - t < 60 * 1000);
    if (this.recentSentAt.length >= this.limits.globalPerMinute) {
      throw new Error('RATE_LIMIT_PER_MINUTE');
    }
    const hourAgo = now - 60 * 60 * 1000;
    const perHour = this.hourSentAt.filter((t) => t > hourAgo).length;
    if (perHour >= this.limits.globalPerHour) {
      throw new Error('RATE_LIMIT_PER_HOUR');
    }
    this.recentSentAt.push(now);
    this.hourSentAt.push(now);
    this.lastSentAt = now;
    return true;
  }

  canReply(jid) {
    const now = Date.now();
    const entry = this.replyCounts.get(jid);
    if (!entry || entry.resetAt < now) {
      this.replyCounts.set(jid, { count: 1, resetAt: now + 60 * 60 * 1000 });
      return true;
    }
    const allowed = entry.count < this.limits.perChatPerHour;
    entry.count += 1;
    return allowed;
  }

  registerReply(jid) {
    this.canReply(jid);
  }

  floodCheck(jid) {
    const now = Date.now();
    const mutedUntil = this.floodMuteUntil.get(jid) || 0;
    if (mutedUntil > now) return false;

    const list = (this.incoming.get(jid) || []).filter((t) => now - t < 60 * 1000);
    list.push(now);
    this.incoming.set(jid, list);

    if (list.length > this.limits.floodInPerMinute) {
      this.floodMuteUntil.set(jid, now + this.limits.floodMuteMs);
      this.incoming.set(jid, []);
      return false;
    }
    return true;
  }

  isFloodMuted(jid) {
    return (this.floodMuteUntil.get(jid) || 0) > Date.now();
  }

  clearFlood(jid) {
    this.floodMuteUntil.delete(jid);
    this.incoming.delete(jid);
  }
}

module.exports = { RateLimiter, DEFAULT_LIMITS };
