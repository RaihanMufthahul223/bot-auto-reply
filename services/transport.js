'use strict';

const { cleanJid } = require('../utils/jid');

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
    return [...(process.env.OWNER_NUMBERS || '').split(','), process.env.ADMIN_NUMBER || '']
      .map(s => s.trim()).filter(Boolean);
  }
  isOwnerJid(jid) {
    const digits = String(jid || '').replace(/[^0-9]/g, '');
    return this.ownerNumbers().some(o => o.replace(/[^0-9]/g, '') === digits);
  }
  isAllowedJid(jid) {
    const clean = cleanJid(jid);
    if (this.isOwnerJid(clean) || (this.botJid && clean === cleanJid(this.botJid))) return true;
    return Boolean(this.stateStore.getState()?.contacts?.[clean]);
  }
  rememberSentKey(key) {
    if (!key?.id) return;
    const id = `${cleanJid(key.remoteJid)}:${key.id}`;
    this.sentKeys.set(id, Date.now());
    // Batasi memori dan masa simpan key echo dari WhatsApp.
    for (const [k, at] of this.sentKeys) if (Date.now() - at > 10 * 60 * 1000) this.sentKeys.delete(k);
    while (this.sentKeys.size > 2000) this.sentKeys.delete(this.sentKeys.keys().next().value);
  }
  isOwnSentKey(key) {
    if (!key?.id) return false;
    return this.sentKeys.has(`${cleanJid(key.remoteJid)}:${key.id}`);
  }
  async sendText(jid, text) {
    if (!this.isAllowedJid(jid)) throw new Error('TRANSPORT_BLOCKED_NOT_CONTACT');
    await this.rateLimiter.acquire();
    const key = await this.humanizer.sendHumanized(this.sock, jid, text);
    if (key) this.rememberSentKey(key);
    return key;
  }
  async sendReaction(jid, emoji) {
    if (!this.isAllowedJid(jid)) throw new Error('TRANSPORT_BLOCKED_NOT_CONTACT');
    await this.rateLimiter.acquire();
    const sent = await this.sock.sendMessage(jid, { reaction: { text: emoji } });
    if (sent?.key) this.rememberSentKey(sent.key);
    return sent;
  }
  async setTyping(jid, isTyping = true) {
    return this.sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  }
  async markRead(jid, msgKey) {
    if (msgKey) return this.sock.readMessages([msgKey]);
  }
}
module.exports = { Transport };
