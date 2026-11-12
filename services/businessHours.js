'use strict';

const config = require('../config/botConfig');

function parseHM(value) {
  const [h, m] = String(value ?? '00:00').split(':').map(Number);
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/**
 * Menghitung menit saat ini dalam zona waktu tertentu (pakai Intl, bukan jam lokal server).
 */
function minutesInTimeZone(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * Cek apakah sekarang (atau waktu yang diberikan) termasuk jam operasional.
 * Hari operasional default: semua hari (config `daysOpen` boleh diisi, mis. [1,2,3,4,5]).
 */
function isOpen(date, cfg) {
  const config = cfg || config;
  const ref = date instanceof Date ? date : new Date();
  const openMinutes = parseHM(config.hours?.open ?? '08:00');
  const closeMinutes = parseHM(config.hours?.close ?? '17:00');
  const nowMinutes = minutesInTimeZone(ref, config.timezone || 'Asia/Jakarta');
  if (nowMinutes < openMinutes || nowMinutes >= closeMinutes) return false;
  const daysOpen = Array.isArray(config.daysOpen) ? config.daysOpen : [];
  if (daysOpen.length > 0) {
    const day = ref.getDay(); // 0=Ahad .. 6=Sabtu
    const allowed = daysOpen.some((d) => Number(d) === day);
    if (!allowed) return false;
  }
  return true;
}

module.exports = { isOpen, parseHM, minutesInTimeZone };
