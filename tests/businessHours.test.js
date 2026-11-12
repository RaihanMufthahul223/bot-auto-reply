'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { isOpen, parseHM, minutesInTimeZone } = require('../services/businessHours');

test('parseHM: "08:00" -> 480', () => {
  assert.equal(parseHM('08:00'), 480);
  assert.equal(parseHM('17:00'), 1020);
});

test('minutesInTimeZone: hitung menit di zona waktu Jakarta', () => {
  const now = new Date('2026-11-11T12:00:00Z'); // 19:00 WIB
  assert.equal(minutesInTimeZone(now, 'Asia/Jakarta'), 19 * 60);
});

test('isOpen: jam operasional 08:00-17:00 (default semua hari)', () => {
  const cfg = { timezone: 'Asia/Jakarta', hours: { open: '08:00', close: '17:00' }, daysOpen: [] };
  // 16:59 WIB (09:59 UTC) -> buka
  assert.equal(isOpen(new Date('2026-11-11T09:59:00Z'), cfg), true);
  // 17:00 WIB (10:00 UTC) -> tutup
  assert.equal(isOpen(new Date('2026-11-11T10:00:00Z'), cfg), false);
  // 07:59 WIB (00:59 UTC) -> tutup
  assert.equal(isOpen(new Date('2026-11-11T00:59:00Z'), cfg), false);
});

test('isOpen: hari operasional dikustomisasi', () => {
  const cfg = { timezone: 'Asia/Jakarta', hours: { open: '08:00', close: '17:00' }, daysOpen: [2, 3, 4, 5] }; // Selasa-Jumat
  // 2026-11-11 = Rabu -> diizinkan, jam 16:59 WIB -> buka
  assert.equal(isOpen(new Date('2026-11-11T09:59:00Z'), cfg), true);
  // 2026-11-11 = Rabu, jam 07:59 WIB -> belum buka
  assert.equal(isOpen(new Date('2026-11-11T00:59:00Z'), cfg), false);
});
