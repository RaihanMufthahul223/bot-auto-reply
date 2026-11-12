'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { RateLimiter } = require('../services/rateLimiter');

function newLimiter() {
  return new RateLimiter({ limits: { globalGapMs: [1500, 3000], globalPerMinute: 15, globalPerHour: 200, perChatPerHour: 8, floodInPerMinute: 8, floodMuteMs: 60000 } });
}

test('rateLimiter: per chat maksimal 8 balasan per jam', async () => {
  const rl = newLimiter();
  let allowed = 0;
  for (let i = 0; i < 10; i++) {
    if (rl.canReply('62812@s.whatsapp.net')) allowed += 1;
  }
  assert.equal(allowed, 8);
});

test('rateLimiter: flood guard >8 pesan/menit -> chat di-mute', async () => {
  const rl = newLimiter();
  let results = [];
  for (let i = 0; i < 10; i++) results.push(rl.floodCheck('62812@s.whatsapp.net'));
  assert.equal(results.filter(Boolean).length, 8);
  assert.equal(rl.floodCheck('62812@s.whatsapp.net'), false); // ke-9 di-mute
  assert.ok(rl.isFloodMuted('62812@s.whatsapp.net'));
});

test('rateLimiter: acquire global terjadwal dengan gap', async () => {
  const rl = newLimiter();
  const p1 = rl.acquire();
  const p2 = rl.acquire();
  const start = Date.now();
  await Promise.all([p1, p2]);
  const elapsed = Date.now() - start;
  // gap antar pesan 1.5-3s -> minimal > 0
  assert.ok(elapsed >= 1400);
});
