'use strict';

/**
 * Konfigurasi teknis bot WhatsApp Auto-Reply.
 * Semua angka dan flag perilaku bot disimpan di sini (bukan di kode handler),
 * agar ganti klien / ubah perilaku cukup mengubah file ini.
 */
module.exports = {
  timezone: process.env.BOT_TIMEZONE || 'Asia/Jakarta',
  hours: { open: process.env.BOT_OPEN || '08:00', close: process.env.BOT_CLOSE || '17:00' },
  // Hari operasional. Array kosong = semua hari operasional. Misal: [1, 2, 3, 4, 5] = Senin-Jumat.
  daysOpen: [],

  humanize: {
    readDelayMs: [800, 2500],
    typingPerCharMs: 35,
    typingMinMs: 1500,
    typingMaxMs: 6000,
  },
  debounceMs: [2000, 4000],
  limits: {
    globalGapMs: [1500, 3000],
    globalPerMinute: 15,
    globalPerHour: 200,
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
