'use strict';

const config = require('../config/botConfig');
const replies = require('../config/replies');
const { normalizeText, createKeywordMatcher, randomPick } = require('../utils/text');
const { isGroupJid, isBroadcastJid, isNewsletterJid, isSameJid, cleanJid } = require('../utils/jid');
const { sleep, randInt } = require('../utils/math');

const IGNORED_TYPES = new Set([
  'protocol',
  'reaction',
  'edit',
  'history',
  'service',
  'ephemeral',
  'context',
  'poll',
  'state',
  'empty',
  'other',
]);

function getMessageType(message) {
  if (!message || typeof message !== 'object') return 'empty';
  const has = (k) => Object.prototype.hasOwnProperty.call(message, k);
  if (has('protocolMessage')) return 'protocol';
  if (has('reactionMessage') || has('reaction') || has('emojiMessage')) return 'reaction';
  if (has('editMessage')) return 'edit';
  if (has('historySyncMessage')) return 'history';
  if (has('serviceMessage')) return 'service';
  if (has('ephemeralMessage')) return 'ephemeral';
  if (has('contextInfo')) return 'context';
  if (has('conversation')) return 'text';
  if (has('imageMessage')) return 'image';
  if (has('documentMessage')) return 'document';
  if (has('audioMessage')) return 'audio';
  if (has('videoMessage')) return 'video';
  if (has('stickerMessage')) return 'sticker';
  if (has('locationMessage')) return 'location';
  if (has('contactMessage')) return 'contact';
  if (has('pollUpdateMessage')) return 'poll';
  if (has('newStateMessage')) return 'state';
  if (Object.keys(message).length === 0) return 'empty';
  return 'other';
}

function extractText(message) {
  if (!message) return '';
  if (typeof message.conversation === 'string') return message.conversation;
  const em = message.extendedTextMessage;
  if (em && typeof em.text === 'string') return em.text;
  return '';
}

function isNumeric(normalizedText) {
  return /^\d+$/.test(normalizedText);
}

function isOpenNow(ctx) {
  try {
    return Boolean(ctx.businessHours && ctx.businessHours.isOpen ? ctx.businessHours.isOpen(new Date(), ctx.config) : true);
  } catch (e) {
    return true;
  }
}

/**
 * Membuat handler pesan dengan context yang sudah terhubung ke semua layanan.
 */
function createMessageHandler(ctx) {
  const seenMessages = new Set();
  const debounces = new Map();

  async function sendWelcome(message, state) {
    const jid = message.key.remoteJid;
    const text = randomPick(replies.welcome) || replies.fallback;
    await ctx.transport.sendText(jid, text);
    ctx.stateStore.updateContact(jid, (c) => ({
      ...(c || {}),
      name: message.pushName || (c && c.name) || cleanJid(jid),
      firstSeen: (c && c.firstSeen) || Date.now(),
      lastInteraction: Date.now(),
      lastWelcomeAt: Date.now(),
    }));
    return text;
  }

  async function sendKeywordReplies(message, hits, ctx) {
    const jid = message.key.remoteJid;
    const texts = (hits || []).slice(0, 2).map((h) => replies[h.reply]).filter(Boolean);
    let greeted = false;
    for (const text of texts) {
      if (greeted) {
        // setelah sapaan awal, jeda 2-4 detik sebelum jawaban keyword
        await sleep(randInt(ctx.config.debounceMs[0], ctx.config.debounceMs[1]));
      }
      await ctx.transport.sendText(jid, text);
      greeted = true;
    }
  }

  async function runIntent(message, ctx) {
    const jid = message.key.remoteJid;
    const state = ctx.stateStore.getState();
    const chat = state?.contacts?.[jid] || {};
    const type = getMessageType(message.message);
    const normalized = normalizeText(extractText(message));
    const isOpen = isOpenNow(ctx);
    ctx.isOutsideHours = !isOpen;

    const kwHits = ctx.keywordMatcher ? ctx.keywordMatcher(normalized) : [];
    const menuHit = kwHits.find((h) => h.id === 'menu');
    const infoHits = menuHit ? [] : kwHits.filter((h) => h.id !== 'menu');
    const adminHit = ctx.handoffMatcher ? ctx.handoffMatcher(normalized) : null;

    let intent = 'fallback';
    if (adminHit) intent = 'handoff';
    else if (Number(chat.menuUntil || 0) > Date.now() && isNumeric(normalized)) {
      const menuItems = (replies.menu && replies.menu.items) || [];
      const item = menuItems.find((i) => i.number === Number(normalized));
      intent = item && item.reply === 'handoff' ? 'handoff' : 'menu_answer';
    } else if (menuHit) intent = 'menu';
    else if (infoHits.length > 0) intent = infoHits[0].id;
    else if (type === 'image' || type === 'document') intent = 'image';

    const contact = state?.contacts?.[jid];
    const welcomeDue =
      !contact ||
      Number(contact.lastInteraction || 0) < Date.now() - Number(ctx.config.ttl?.welcomeMs || 24 * 60 * 60 * 1000);
    let welcomed = false;
    if (welcomeDue) {
      await sendWelcome(message, state);
      welcomed = true;
    }

    switch (intent) {
      case 'handoff': {
        const sendText = ctx.isOutsideHours ? replies.handoffOutsideHours || replies.handoff : replies.handoff;
        await ctx.transport.sendText(jid, sendText);
        ctx.stateStore.updateContact(jid, () => ({
          ...(chat || {}),
          mode: 'human',
          humanUntil: Date.now() + (ctx.config.ttl ? ctx.config.ttl.handoffMs : 6 * 60 * 60 * 1000),
        }));
        const lastText = extractText(message);
        for (const adminJid of ctx.adminNotifyJids || []) {
          try {
            await ctx.transport.sendText(adminJid, replies.adminNotify(message.pushName || cleanJid(jid), cleanJid(jid), lastText));
          } catch (e) {
            // notifikasi admin tidak boleh menggagalkan alur bot
          }
        }
        return;
      }
      case 'menu': {
        await ctx.transport.sendText(jid, replies.replyMenu);
        ctx.stateStore.updateContact(jid, () => ({ menuUntil: Date.now() + Number(ctx.config.ttl?.menuMs || 10 * 60 * 1000) }));
        return;
      }
      case 'menu_answer': {
        const item = (replies.menu && replies.menu.items || []).find((i) => i.number === Number(normalized));
        if (item) {
          await ctx.transport.sendText(jid, replies[item.reply]);
        }
        return;
      }
      case 'image': {
        const ackDue = Date.now() - Number(chat.lastImageAckAt || 0) > Number(ctx.config.ttl?.imageAckMs || 60 * 60 * 1000);
        if (ackDue) {
          await ctx.transport.sendText(jid, replies.imageAck);
          ctx.stateStore.updateContact(jid, () => ({ lastImageAckAt: Date.now() }));
        }
        return;
      }
      case 'harga':
      case 'alamat':
      case 'jam': {
        const hits = (infoHits || []).filter((h) => h && h.id === intent).slice(0, 2);
        await sendKeywordReplies(message, hits, ctx);
        return;
      }
      case 'fallback': {
        const awayDue = Date.now() - Number(chat.lastAwayAt || 0) > Number(ctx.config.ttl?.awayMs || 12 * 60 * 60 * 1000);
        if (ctx.isOutsideHours) {
          if (!awayDue) {
            await ctx.transport.sendText(jid, replies.away);
            ctx.stateStore.updateContact(jid, () => ({ lastAwayAt: Date.now() }));
          }
          return;
        }
        const lastFallbackAt = Number(chat.lastFallbackAt || 0);
        if (Date.now() - lastFallbackAt < 30 * 60 * 1000) return;
        await ctx.transport.sendText(jid, replies.fallback);
        ctx.stateStore.updateContact(jid, () => ({ lastFallbackAt: Date.now() }));
        return;
      }
      default:
        return;
    }
  }

  async function enterHumanMode(message, ctx) {
    const jid = message.key.remoteJid;
    ctx.stateStore.updateContact(jid, () => ({
      ...(ctx.stateStore.getState().contacts?.[jid] || {}),
      mode: 'human',
      humanUntil: Date.now() + (ctx.config.ttl ? ctx.config.ttl.handoffMs : 6 * 60 * 60 * 1000),
    }));
  }

  async function runWithDebounce(jid, message, ctx) {
    return new Promise((resolve) => {
      const existing = ctx.debounces ? ctx.debounces.get(jid) : null;
      if (existing) clearTimeout(existing.timer);
      const delay = randInt(ctx.config.debounceMs[0], ctx.config.debounceMs[1]);
      const timer = setTimeout(async () => {
        if (ctx.debounces) ctx.debounces.delete(jid);
        try {
          await runIntent(message, ctx);
        } catch (e) {
          ctx.logError && ctx.logError(`Error intent: ${e && e.message ? e.message : e}`);
        } finally {
          resolve();
        }
      }, delay);
      if (ctx.debounces) ctx.debounces.set(jid, { timer, message });
    });
  }

  async function onMessage(message) {
    try {
      if (!message || !message.message) return;
      const type = getMessageType(message.message);
      const remoteJid = message.key?.remoteJid;
      // Tahap A: filter teknis (tanpa membalas)
      if (isGroupJid(remoteJid) || isBroadcastJid(remoteJid) || isNewsletterJid(remoteJid)) return;
      if (IGNORED_TYPES.has(type)) return;
      const ts = Number(message.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000;
      const startedAt = ctx.startedAt || Date.now();
      if (ts < startedAt - 60 * 1000) return;
      const messageId = message.key?.id;
      if (messageId) {
        const dedupKey = `${remoteJid}:${messageId}`;
        if (ctx.seenMessages.has(dedupKey)) return;
        ctx.seenMessages.add(dedupKey);
        setTimeout(() => ctx.seenMessages.delete(dedupKey), 5 * 60 * 1000);
      }
      if (message.key?.fromMe) {
        const participant = message.key?.participant;
        const isOwn = ctx.botJid ? isSameJid(participant, ctx.botJid) : false;
        if (!isOwn) {
          // bukan buatan bot -> admin membalas manual dari HP -> mode human
          await enterHumanMode(message, ctx);
        }
        return;
      }
      // Tahap B: kontrol
      const handled = await ctx.commandHandler.handleCommand(message, ctx);
      if (handled) return;
      const state = ctx.stateStore.getState();
      if (!state || state.botEnabled === false) return;
      const chat = state?.contacts?.[remoteJid] || {};
      if (chat.mode === 'human' && Number(chat.humanUntil) > Date.now()) return;
      if (!ctx.rateLimiter.floodCheck(remoteJid)) return;
      if (!ctx.rateLimiter.canReply(remoteJid)) return;
      // Tahap B6: debounce pesan beruntun
      await runWithDebounce(remoteJid, message, ctx);
    } catch (e) {
      ctx.logError && ctx.logError(`messageHandler error: ${e && e.message ? e.message : e}`);
    }
  }

  return onMessage;
}

module.exports = { createMessageHandler, getMessageType, extractText, isOpenNow };
