'use strict';

const config = require('../config/botConfig');
const { sleep, randInt, clamp } = require('../utils/math');

/**
 * F6. Delay dan indikator mengetik.
 * Menghitung jeda baca acak, durasi mengetik (tergantung panjang teks), jitter acak,
 * dan mengirim pesan dengan gaya manusiawi (read -> composing -> typing -> paused -> send).
 */
function computeTypingMs(text, humanizeConfig) {
  const cfg = { ...(config.humanize || {}), ...(humanizeConfig || {}) };
  const typingMs = (Number(cfg.typingPerCharMs) || 35) * String(text || '').length + randInt(300, 1200);
  return clamp(typingMs, Number(cfg.typingMinMs) || 1500, Number(cfg.typingMaxMs) || 6000);
}

async function sendHumanized(sock, jid, text, msgKey) {
  const cfg = config.humanize || {};
  await sleep(randInt(cfg.readDelayMs?.[0] ?? 800, cfg.readDelayMs?.[1] ?? 2500));

  if (msgKey) {
    try {
      await sock.readMessages([msgKey]);
    } catch (e) {
      // abaikan kegagalan mark-read, kirim tetap dilanjutkan
    }
  }

  try {
    await sock.presenceSubscribe(jid);
  } catch (e) {
    // presence subscribe wajib untuk indikator mengetik
  }
  await sock.sendPresenceUpdate('composing', jid);
  const typingMs = computeTypingMs(text, cfg);
  await sleep(typingMs);
  await sock.sendPresenceUpdate('paused', jid);

  const sent = await sock.sendMessage(jid, { text });
  const key = sent?.key;
  if (key) {
    try {
      await sock.readMessages([key]);
    } catch (e) {
      // abaikan
    }
  }
  return key;
}

module.exports = { sleep, randInt, clamp, computeTypingMs, sendHumanized };
