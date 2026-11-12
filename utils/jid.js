'use strict';

/**
 * Parsing dan deteksi JID WhatsApp.
 * Menggunakan JID apa adanya sebagai kunci (termasuk format @lid),
 * tanpa berasumsi formatnya adalah nomor telepon.
 */

function cleanJid(jid) {
  if (typeof jid !== 'string') return jid;
  const at = jid.lastIndexOf('@');
  const user = at > 0 ? jid.slice(0, at) : jid;
  const domain = at > 0 ? jid.slice(at) : '';
  // strip device part (mis. 62812xxx:12@s.whatsapp.net -> 62812xxx@s.whatsapp.net)
  const main = user.split(':')[0];
  return `${main}${domain}`;
}

function isGroupJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

function isBroadcastJid(jid) {
  if (typeof jid !== 'string') return false;
  return jid.endsWith('@broadcast') || jid.startsWith('status@') || jid.includes('/status');
}

function isNewsletterJid(jid) {
  return typeof jid === 'string' && jid.endsWith('@newsletter');
}

function isDirectChatJid(jid) {
  if (typeof jid !== 'string') return false;
  return jid.endsWith('@whatsapp.net') || jid.endsWith('@lid');
}

function isSameJid(a, b) {
  const ca = cleanJid(a);
  const cb = cleanJid(b);
  return typeof ca === 'string' && typeof cb === 'string' && ca === cb;
}

module.exports = {
  cleanJid,
  isGroupJid,
  isBroadcastJid,
  isNewsletterJid,
  isDirectChatJid,
  isSameJid,
};
