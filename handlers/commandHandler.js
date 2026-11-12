'use strict';

const config = require('../config/botConfig');
const replies = require('../config/replies');
const { normalizeText } = require('../utils/text');
const { cleanJid } = require('../utils/jid');

/**
 * Perintah owner (diawali `.`).
 * Hanya nomor di OWNER_NUMBERS (atau chat dengan nomor bot itu sendiri) yang bisa menjalankan.
 * Perintah dari non-owner diabaikan tanpa balasan.
 * Dukung dua skenario: owner dari nomor lain, atau owner mengetik di chat "ke diri sendiri" pada nomor bot.
 */
async function handleCommand(msg, ctx) {
  const conversation = msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || '';
  const raw = normalizeText(conversation).trim();
  const firstToken = raw.split(/\s+/)[0] || '';
  const command = firstToken.startsWith('.') ? firstToken.toLowerCase() : null;
  if (!command) return false;

  const sender = msg?.key?.participant || msg?.participant || msg?.key?.remoteJid;
  if (!ctx.isOwnerJid(sender)) return false;

  const args = raw.split(/\s+/).slice(1).filter(Boolean);
  const replyJid = msg?.key?.remoteJid;
  const now = Date.now();

  switch (command) {
    case '.offbot': {
      await ctx.stateStore.updateState({ botEnabled: false });
      await ctx.transport.sendText(replyJid, replies.botOff);
      return true;
    }
    case '.onbot': {
      await ctx.stateStore.updateState({ botEnabled: true });
      await ctx.transport.sendText(replyJid, replies.botOn);
      return true;
    }
    case '.status': {
      const humanChats = Object.values(ctx.stateStore.getState().contacts || {}).filter(
        (c) => c && c.mode === 'human' && Number(c.humanUntil) > now
      ).length;
      const statusText = replies.status({
        botEnabled: ctx.stateStore.getState().botEnabled !== false,
        humanChats,
        uptimeSeconds: Math.floor((now - (ctx.startedAt || now)) / 1000),
      });
      await ctx.transport.sendText(replyJid, statusText);
      return true;
    }
    case '.pause': {
      const targetJid = args[0] ? cleanJid(args[0].startsWith('@') ? args[0] : `${args[0]}@whatsapp.net`) : replyJid;
      await ctx.stateStore.updateContact(targetJid, () => ({
        mode: 'human',
        humanUntil: Date.now() + (ctx.config.ttl ? ctx.config.ttl.handoffMs : 6 * 60 * 60 * 1000),
      }));
      await ctx.transport.sendText(replyJid, replies.pauseChat(targetJid));
      return true;
    }
    case '.resume': {
      const targetJid = args[0] ? cleanJid(args[0].startsWith('@') ? args[0] : `${args[0]}@whatsapp.net`) : replyJid;
      await ctx.stateStore.updateContact(targetJid, () => ({
        mode: 'bot',
        humanUntil: 0,
        menuUntil: 0,
      }));
      await ctx.transport.sendText(replyJid, replies.resumeChat(targetJid));
      return true;
    }
    default:
      return false;
  }
}

module.exports = { handleCommand };
