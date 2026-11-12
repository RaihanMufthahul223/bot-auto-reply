'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isOpen } = require('../services/businessHours');

const config = {
  timezone: 'Asia/Jakarta',
  hours: { open: '08:00', close: '17:00' },
  daysOpen: [1, 2, 3, 4, 5, 6],
};

test('business hours uses configured timezone and open interval', () => {
  assert.equal(isOpen(new Date('2026-11-12T02:00:00.000Z'), config), true); // 09:00 WIB, Kamis
  assert.equal(isOpen(new Date('2026-11-12T10:00:00.000Z'), config), false); // 17:00 WIB
});

test('business hours respects configured weekdays', () => {
  assert.equal(isOpen(new Date('2026-11-15T02:00:00.000Z'), config), false); // Minggu
});
