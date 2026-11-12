'use strict';

const { cleanJid } = require('../utils/jid');

/**
 * Satu-satunya pintu keluar pesan (transport layer).
 * Semua pesan keluar bot harus lewat instance ini.
 * - Hard rule anti-blast: JID harus sudah ada di state.contacts,
 *   kecuali nomor owner/admin.
 * - Catat ID pesan keluar (dari bot) untuk dedup dari sender sendiri.
 */
class Transport {
  constructor({ sock, stateStore, rateLimiter, humanizer, botJid }) {
    this.sock = sock;
    this.stateStore = stateStore;
    this.rateLimiter = rateLimiter;
    this.humanizer = humanizer;
    this.botJid = botJid;
    this.sentKeys = new Map();
  }

  ownerNumbers() {
    const list = (process.env.OWNER_NUMBERS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const admin = (process.env.ADMIN_NUMBER || '').trim();
    if (admin) list.push(admin);
    return list;
  }

  isOwnerJid(jid) {
    const digits = String(jid || '').replace(/[^0-9]/g, '');
    const owners = this.ownerNumbers();
    return owners.some((o) => String(o).replace(/[^0-9]/g, '') === digits);
  }

  isAllowedJid(jid) {
    const clean = cleanJid(jid);
    const isOwner = this.isOwnerJid(clean);
    const isBotChat = this.botJid ? cleanJid(clean) === cleanJid(this.botJid) : false;
    if (isOwner || isBotChat) return true;
    const state = this.stateStore.getState();
    const contacts = state?.contacts || {};
    const chat = contacts[clean];
    return Boolean(chat);
  }

  rememberSentKey(key) {
    if (!key) return;
    const id = `${key.remoteJid || ''}:${key.id || ''}`;
    this.sentKeys.set(id, Date.now());
  }

  isOwnSentKey(key) {
    if (!key) return false;
    const id = `${key.remoteJid || ''}:${key.id || ''}`;
    return this.sentKeys.has(id);
  }

  async sendText(jid, text) {
    if (!this.isAllowedJid(jid)) {
      throw new Error('TRANSPORT_BLOCKED_NOT_CONTACT');
    }
    await this.rateLimiter.acquire();
    const key = await this.humanizer.sendHumanized(this.sock, jid, text);
    if (key) this.rememberSentKey(key);
    return key;
  }

  async sendReaction(jid, emoji) {
    if (!this.isAllowedJid(jid)) {
      throw new Error('TRANSPORT_BLOCKED_NOT_CONTACT');
    }
    await this.rateLimiter.acquire();
    const sent = await this.sock.sendMessage(jid, { reaction: { text: emoji } });
    if (sent?.key) this.rememberSentKey(sent.key);
    return sent;
  }

  async setTyping(jid, isTyping = true) {
    return this.sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  }

  async markRead(jid, msgKey) {
    if (!msgKey) return;
    return this.sock.readMessages([msgKey]);
  }
}

module.exports = { Transport };
