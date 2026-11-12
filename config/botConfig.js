'use strict';

const business = require('./business');

module.exports = {
  timezone: process.env.BOT_TIMEZONE || business.store.timezone || 'Asia/Jakarta',
  hours: {
    open: process.env.BOT_OPEN || business.store.hours.open || '08:00',
    close: process.env.BOT_CLOSE || business.store.hours.close || '17:00',
  },
  daysOpen: business.store.hours.daysOpen || [],
  humanize: {
    readDelayMs: [800, 1800],
    typingPerCharMs: 25,
    typingMinMs: 900,
    typingMaxMs: 3500,
  },
  debounceMs: [1200, 2200],
  limits: {
    globalGapMs: [1800, 3200],
    globalPerMinute: 12,
    globalPerHour: 180,
    perChatPerHour: 8,
    floodInPerMinute: 8,
    floodMuteMs: 10 * 60 * 1000,
  },
  ttl: {
    menuMs: 10 * 60 * 1000,
    handoffMs: 6 * 60 * 60 * 1000,
    welcomeMs: 24 * 60 * 60 * 1000,
    awayMs: 12 * 60 * 60 * 1000,
    imageAckMs: 60 * 60 * 1000,
  },
  features: { sheets: false, autoReact: false, imageAck: true },
};
