'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { computeTypingMs } = require('../services/humanizer');

test('computeTypingMs: menyesuaikan panjang teks dengan batas', () => {
  const short = computeTypingMs('halo', {});
  const long = computeTypingMs('x'.repeat(200), {});
  assert.ok(short >= 1500 && short <= 6000);
  assert.ok(long >= 1500 && long <= 6000); // dipatok max 6000
});

test('computeTypingMs: teks lebih pendek -> typing lebih cepat', () => {
  const a = computeTypingMs('ok', {});
  const b = computeTypingMs('ok'.repeat(60), {});
  assert.ok(b >= a);
});
