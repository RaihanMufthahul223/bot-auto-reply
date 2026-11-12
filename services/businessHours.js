'use strict';

const defaultConfig = require('../config/botConfig');
function parseHM(value) {
  const match = /^(\\d{1,2}):(\\d{2})$/.exec(String(value || ''));
  if (!match) return 0;
  const h = Number(match[1]), m = Number(match[2]);
  if (h > 23 || m > 59) return 0;
  return h * 60 + m;
}
function partsInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: 'numeric', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value]));
}
function minutesInTimeZone(date, timeZone) {
  const p = partsInTimeZone(date, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}
function isOpen(date, cfg) {
  const config = cfg || defaultConfig;
  const ref = date instanceof Date ? date : new Date();
  const tz = config.timezone || 'Asia/Jakarta';
  const p = partsInTimeZone(ref, tz);
  const now = Number(p.hour) * 60 + Number(p.minute);
  const open = parseHM(config.hours?.open || '08:00');
  const close = parseHM(config.hours?.close || '17:00');
  if (open >= close || now < open || now >= close) return false;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const days = Array.isArray(config.daysOpen) ? config.daysOpen : [];
  return days.length === 0 || days.includes(dayMap[p.weekday]);
}
module.exports = { isOpen, parseHM, minutesInTimeZone };
