'use strict';

const config = require('../config/botConfig');
const { sleep, randInt, clamp } = require('../utils/math');

function computeTypingMs(text, humanizeConfig) {
  const cfg = { ...(config.humanize || {}), ...(humanizeConfig || {}) };
  const typingMs = (Number(cfg.typingPerCharMs) || 25) * String(text || '').length + randInt(250, 900);
  return clamp(typingMs, Number(cfg.typingMinMs) || 900, Number(cfg.typingMaxMs) || 3500);
}

async function sendHumanized(sock, jid, text, msgKey) {
  const cfg = config.humanize || {};
  await sleep(randInt(cfg.readDelayMs?.[0] ?? 700, cfg.readDelayMs?.[1] ?? 1800));

  if (msgKey) {
    try { await sock.readMessages([msgKey]); } catch (_) {}
  }
  try { await sock.presenceSubscribe(jid); } catch (_) {}
  try { await sock.sendPresenceUpdate('composing', jid); } catch (_) {}

  await sleep(computeTypingMs(text, cfg));
  try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}

  const sent = await sock.sendMessage(jid, { text: String(text || '') });
  const key = sent?.key;
  if (key) {
    try { await sock.readMessages([key]); } catch (_) {}
  }
  return key;
}
module.exports = { sleep, randInt, clamp, computeTypingMs, sendHumanized };
