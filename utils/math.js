'use strict';

/**
 * Utilitas umum: jeda, angka acak, clamp.
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randInt(min, max) {
  const lo = Math.ceil(Number(min) || 0);
  const hi = Math.floor(Number(max) || 0);
  if (hi <= lo) return lo;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function clamp(value, min, max) {
  const v = Number(value) || 0;
  return Math.min(Math.max(v, Number(min) || 0), Number(max) || 0);
}

module.exports = { sleep, randInt, clamp };
