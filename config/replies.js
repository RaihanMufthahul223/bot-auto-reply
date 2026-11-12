'use strict';

const business = require('./business');

function interpolate(text) {
  return String(text || '').replace(/\{storeName\}/g, business.store.name);
}
function money(value) {
  return `${business.catalog.currency || 'Rp'}${Number(value || 0).toLocaleString('id-ID')}`;
}
function productLines() {
  return (business.catalog.products || []).map((p, i) =>
    `${i + 1}. ${p.name} — ${money(p.price)}\n   ${p.description || ''}`.trim()
  );
}
const menuItems = [
  { number: 1, label: 'Daftar Produk', reply: 'replyProduk' },
  { number: 2, label: 'Harga', reply: 'replyHarga' },
  { number: 3, label: 'Alamat Toko', reply: 'replyAlamat' },
  { number: 4, label: 'Jam Operasional', reply: 'replyJam' },
  { number: 5, label: 'Pengiriman', reply: 'replyPengiriman' },
  { number: 6, label: 'Hubungi Admin', reply: 'handoff' },
];

const replies = {
  replyProduk: () => ['Berikut katalog produk kami:', ...productLines()].join('\n'),
  replyHarga: () => ['Daftar harga produk:', ...productLines()].join('\n'),
  replyStok: () => ['Informasi stok:', ...(business.catalog.products || []).map(p => `• ${p.name}: ${p.stock || 'Silakan konfirmasi ke admin'}`)].join('\n'),
  replyAlamat: () => [`Alamat ${business.store.name}:`, business.store.address, business.store.mapsUrl].filter(Boolean).join('\n'),
  replyJam: () => `Jam operasional ${business.store.name}: ${business.store.hours.open}–${business.store.hours.close} ( ${business.store.timezone} ).`,
  replyPengiriman: () => business.operations.shipping,
  replyPembayaran: () => business.operations.payment,
  replyMenu: () => [interpolate(business.messages.menuHeader), ...menuItems.map(i => `${i.number}. ${i.label}`)].join('\n'),
  menu: { items: menuItems },
  welcome: (business.messages.welcome || []).map(interpolate),
  fallback: interpolate(business.messages.fallback),
  handoff: interpolate(business.messages.handoff),
  handoffOutsideHours: interpolate(business.messages.handoffOutsideHours),
  away: interpolate(business.messages.away),
  imageAck: interpolate(business.messages.imageAck),
  botOff: 'Bot sementara dimatikan. Status: OFF.',
  botOn: 'Bot dinyalakan kembali. Status: ON.',
  pauseChat: jid => `Chat ${jid} dijeda dan dialihkan ke admin.`,
  resumeChat: jid => `Bot kembali aktif di chat ${jid}.`,
  status: info => [
    'Status WhatsApp Auto-Reply:',
    `- Bot: ${info.botEnabled ? 'ON' : 'OFF'}`,
    `- Mode admin aktif: ${info.humanChats || 0} chat`,
    `- Uptime: ${Math.floor((info.uptimeSeconds || 0) / 3600)} jam ${Math.floor(((info.uptimeSeconds || 0) % 3600) / 60)} menit`,
    'Perintah: .onbot / .offbot / .pause / .resume',
  ].join('\n'),
  adminNotify: (name, jid, text) => `Permintaan admin dari ${name || jid} (wa.me/${String(jid).split('@')[0]}): ${text || '(tanpa teks)'}`,
  autoReactEmoji: '👍',
  keywords: business.keywords || [],
  handoffTriggers: business.handoffTriggers || [],
};

module.exports = replies;
