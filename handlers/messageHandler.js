'use strict';

const replies = require('../config/replies');
const { normalizeText, randomPick } = require('../utils/text');
const { isGroupJid, isBroadcastJid, isNewsletterJid, isSameJid, cleanJid } = require('../utils/jid');
const { sleep, randInt } = require('../utils/math');

const IGNORED_TYPES = new Set(['protocol','reaction','edit','history','service','ephemeral','context','poll','state','empty','other']);

function getMessageType(message) {
  if (!message || typeof message !== 'object') return 'empty';
  if (message.protocolMessage) return 'protocol';
  if (message.reactionMessage || message.reaction || message.emojiMessage) return 'reaction';
  if (message.editMessage) return 'edit';
  if (message.historySyncMessage) return 'history';
  if (message.ephemeralMessage) return 'ephemeral';
  if (message.conversation || message.extendedTextMessage?.text) return 'text';
  if (message.imageMessage) return 'image';
  if (message.documentMessage) return 'document';
  if (message.audioMessage) return 'audio';
  if (message.videoMessage) return 'video';
  if (message.stickerMessage) return 'sticker';
  if (message.locationMessage) return 'location';
  if (message.contactMessage) return 'contact';
  return Object.keys(message).length ? 'other' : 'empty';
}
function extractText(message) {
  if (!message) return '';
  if (typeof message.conversation === 'string') return message.conversation;
  if (typeof message.extendedTextMessage?.text === 'string') return message.extendedTextMessage.text;
  if (typeof message.imageMessage?.caption === 'string') return message.imageMessage.caption;
  if (typeof message.videoMessage?.caption === 'string') return message.videoMessage.caption;
  if (typeof message.documentMessage?.caption === 'string') return message.documentMessage.caption;
  return '';
}
function isNumeric(value) { return /^\d+$/.test(value); }
function isOpenNow(ctx) {
  try { return Boolean(ctx.businessHours?.isOpen ? ctx.businessHours.isOpen(new Date(), ctx.config) : true); }
  catch (_) { return true; }
}
function resolveReply(key) {
  const value = replies[key];
  return typeof value === 'function' ? value() : value;
}

function createMessageHandler(ctx) {
  const seenMessages = new Set();
  const debounces = new Map();

  async function sendWelcome(message, jid) {
    // Simpan kontak sebelum kirim: transport hanya mengizinkan chat yang sudah dikenal.
    ctx.stateStore.updateContact(jid, c => ({
      name: message.pushName || c.name || cleanJid(jid),
      firstSeen: c.firstSeen || Date.now(),
      lastWelcomeAt: Date.now(),
    }));
    const text = randomPick(replies.welcome) || replies.fallback;
    if (text) await ctx.transport.sendText(jid, text);
  }

  async function notifyAdmins(message, jid, text) {
    for (const adminJid of ctx.adminNotifyJids || []) {
      try {
        await ctx.transport.sendText(adminJid, replies.adminNotify(message.pushName || cleanJid(jid), cleanJid(jid), text));
      } catch (error) {
        ctx.logError?.(`Notifikasi admin gagal: ${error.message || error}`);
      }
    }
  }

  async function runIntent(message) {
    const jid = message.key.remoteJid;
    const state = ctx.stateStore.getState();
    const chat = state?.contacts?.[jid] || {};
    const type = getMessageType(message.message);
    const normalized = normalizeText(extractText(message.message));
    const outsideHours = !isOpenNow(ctx);
    const kwHits = ctx.keywordMatcher ? ctx.keywordMatcher(normalized) : [];
    const menuHit = kwHits.find(h => h.id === 'menu');
    const infoHits = menuHit ? [] : kwHits.filter(h => h.id !== 'menu');
    const adminHit = ctx.handoffMatcher ? ctx.handoffMatcher(normalized) : null;

    let intent = 'fallback';
    if (adminHit) intent = 'handoff';
    else if (Number(chat.menuUntil || 0) > Date.now() && isNumeric(normalized)) {
      const item = (replies.menu?.items || []).find(i => i.number === Number(normalized));
      intent = item ? (item.reply === 'handoff' ? 'handoff' : 'menu_answer') : 'fallback';
    } else if (menuHit) intent = 'menu';
    else if (infoHits.length) intent = infoHits[0].id;
    else if (type === 'image' || type === 'document') intent = 'image';

    const welcomeDue = !chat.lastWelcomeAt ||
      Date.now() - Number(chat.lastWelcomeAt) > Number(ctx.config.ttl?.welcomeMs || 86400000);
    if (welcomeDue) await sendWelcome(message, jid);

    switch (intent) {
      case 'handoff': {
        await ctx.transport.sendText(jid, outsideHours ? replies.handoffOutsideHours : replies.handoff);
        ctx.stateStore.updateContact(jid, c => ({
          mode: 'human',
          humanUntil: Date.now() + Number(ctx.config.ttl?.handoffMs || 21600000),
        }));
        await notifyAdmins(message, jid, extractText(message.message));
        return;
      }
      case 'menu':
        await ctx.transport.sendText(jid, resolveReply('replyMenu'));
        ctx.stateStore.updateContact(jid, { menuUntil: Date.now() + Number(ctx.config.ttl?.menuMs || 600000) });
        return;
      case 'menu_answer': {
        const item = (replies.menu?.items || []).find(i => i.number === Number(normalized));
        if (item) await ctx.transport.sendText(jid, resolveReply(item.reply));
        return;
      }
      case 'image': {
        const due = Date.now() - Number(chat.lastImageAckAt || 0) > Number(ctx.config.ttl?.imageAckMs || 3600000);
        if (due && ctx.config.features?.imageAck !== false) {
          await ctx.transport.sendText(jid, replies.imageAck);
          ctx.stateStore.updateContact(jid, { lastImageAckAt: Date.now() });
          await notifyAdmins(message, jid, '[Pelanggan mengirim gambar/dokumen]');
        }
        return;
      }
      case 'harga':
      case 'produk':
      case 'stok':
      case 'alamat':
      case 'jam':
      case 'pengiriman':
      case 'pembayaran':
        await ctx.transport.sendText(jid, resolveReply(infoHits.find(h => h.id === intent)?.reply || `reply${intent[0].toUpperCase()}${intent.slice(1)}`));
        return;
      case 'fallback': {
        if (outsideHours) {
          const awayDue = Date.now() - Number(chat.lastAwayAt || 0) > Number(ctx.config.ttl?.awayMs || 43200000);
          if (awayDue) {
            await ctx.transport.sendText(jid, replies.away);
            ctx.stateStore.updateContact(jid, { lastAwayAt: Date.now() });
          }
          return;
        }
        const lastFallbackAt = Number(chat.lastFallbackAt || 0);
        if (Date.now() - lastFallbackAt < 30 * 60 * 1000) return;
        await ctx.transport.sendText(jid, replies.fallback);
        ctx.stateStore.updateContact(jid, { lastFallbackAt: Date.now() });
        return;
      }
      default: return;
    }
  }

  async function enterHumanMode(message) {
    const jid = message.key.remoteJid;
    ctx.stateStore.updateContact(jid, {
      name: message.pushName || cleanJid(jid),
      mode: 'human',
      humanUntil: Date.now() + Number(ctx.config.ttl?.handoffMs || 21600000),
    });
  }

  function runWithDebounce(jid, message) {
    return new Promise(resolve => {
      const existing = debounces.get(jid);
      if (existing) {
        clearTimeout(existing.timer);
        existing.message = message;
        existing.waiters.push(resolve);
      } else {
        debounces.set(jid, { message, waiters: [resolve], timer: null });
      }
      const entry = debounces.get(jid);
      entry.timer = setTimeout(async () => {
        debounces.delete(jid);
        try { await runIntent(entry.message); }
        catch (error) { ctx.logError?.(`Error intent: ${error.message || error}`); }
        finally { entry.waiters.forEach(done => done()); }
      }, randInt(ctx.config.debounceMs[0], ctx.config.debounceMs[1]));
    });
  }

  async function onMessage(message) {
    try {
      if (!message?.message) return;
      const remoteJid = message.key?.remoteJid;
      const type = getMessageType(message.message);
      if (!remoteJid || isGroupJid(remoteJid) || isBroadcastJid(remoteJid) || isNewsletterJid(remoteJid)) return;
      if (IGNORED_TYPES.has(type)) return;
      const ts = Number(message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000;
      if (ts < (ctx.startedAt || Date.now()) - 60000) return;

      const messageId = message.key?.id;
      if (messageId) {
        const dedupKey = `${remoteJid}:${messageId}`;
        if (seenMessages.has(dedupKey)) return;
        seenMessages.add(dedupKey);
        const cleanup = setTimeout(() => seenMessages.delete(dedupKey), 5 * 60 * 1000);
        cleanup.unref?.();
      }

      // Pesan perintah dari owner (termasuk chat ke nomor sendiri) diproses sebelum filter fromMe.
      if (message.key?.fromMe && extractText(message.message).trim().startsWith('.')) {
        if (await ctx.commandHandler.handleCommand(message, ctx)) return;
      }

      if (message.key?.fromMe) {
        if (ctx.transport.isOwnSentKey?.(message.key)) return;
        await enterHumanMode(message);
        return;
      }

      if (await ctx.commandHandler.handleCommand(message, ctx)) return;
      const state = ctx.stateStore.getState();
      if (!state || state.botEnabled === false) return;
      const chat = state.contacts?.[remoteJid] || {};
      if (chat.mode === 'human' && Number(chat.humanUntil) > Date.now()) return;
      if (!ctx.rateLimiter.floodCheck(remoteJid) || !ctx.rateLimiter.canReply(remoteJid)) return;

      ctx.stateStore.updateContact(remoteJid, c => ({
        name: message.pushName || c.name || cleanJid(remoteJid),
        firstSeen: c.firstSeen || Date.now(),
        lastInteraction: Date.now(),
      }));
      await runWithDebounce(remoteJid, message);
    } catch (error) {
      ctx.logError?.(`messageHandler error: ${error.message || error}`);
    }
  }
  return onMessage;
}

module.exports = { createMessageHandler, getMessageType, extractText, isOpenNow };
