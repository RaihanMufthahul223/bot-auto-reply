'use strict';

const BOT_NAME = process.env.BOT_NAME;

function status(info) {
  return [
    'Status bot WhatsApp Auto-Reply:',
    `- Bot: ${info.botEnabled ? 'ON' : 'OFF'}`,
    `- Mode human aktif: ${info.humanChats || 0} chat`,
    `- Uptime: ${Math.floor((info.uptimeSeconds || 0) / 3600)} jam ${Math.floor(((info.uptimeSeconds || 0) % 3600) / 60)} menit`,
    '',
    'Ketik .onbot / .offbot untuk mengubah status.',
  ].join('\n');
}

// ---- menu ----
// Sumber kebenaran daftar menu. Teks menu (replyMenu) dibuat otomatis dari sini,
// jadi tambah/ubah/hapus item cukup di menuItems dan teks menu selalu sinkron.
// `reply` harus nama properti yang ada di module.exports, atau 'handoff'
// untuk meneruskan chat ke admin.
const MENU_HEADER = 'Baik kak, silakan pilih menu:';

const menuItems = [
  { number: 1, label: 'Cek Harga', reply: 'replyHarga' },
  { number: 2, label: 'Alamat', reply: 'replyAlamat' },
  { number: 3, label: 'Jam Operasional', reply: 'replyJam' },
  { number: 4, label: 'Hubungi Admin', reply: 'handoff' },
  { number: 5, label: 'Menu', reply: 'replyMenu' },
];

function buildMenu(items, header = MENU_HEADER) {
  const lines = (items || []).map((item) => `${item.number}. ${item.label}`);
  return [header, ...lines].join('\n');
}

module.exports = {
  // ---- template balasan (semua teks bot ada di sini, bukan di handler) ----
  replyHarga:
    'Baik kak, untuk harganya saya perlu cek ke admin untuk daftar harga ya. Sebentar kak.',
  replyAlamat:
    'Baik kak, alamat kantor kami akan saya sampaikan ke admin ya supaya tidak salah kirim. Sebentar kak.',
  replyJam: 'Baik kak, jam operasional kami 08.00 - 17.00 ya. Admin akan saya sampaikan detail paketnya ya.',

  // ---- menu ----
  replyMenu: 'Baik kak, silakan pilih menu:\n1. Cek Harga\n2. Alamat\n3. Hubungi Admin',
  menu: {
    items: [
      { number: 1, label: 'Cek Harga', reply: 'replyHarga' },
      { number: 2, label: 'Alamat', reply: 'replyAlamat' },
      { number: 3, label: 'Hubungi Admin', reply: 'handoff' },
    ],
  },

  // ---- sapaan awal (F1) ----
  welcome: [
    `Halo kak, selamat datang di ${BOT_NAME}. Ada yang bisa kami bantu ya?`,
    `Hai kak, terima kasih sudah menghubungi ${BOT_NAME}. Silakan tanya apa saja ya.`,
    `Selamat datang di ${BOT_NAME}. Kakak mau tanya apa ya?`,
  ],

  // ---- fallback ----
  fallback: 'Maaf ya kak, saya belum paham. Silakan ketik MENU atau tanya ADMIN ya.',

  // ---- handoff (F5) ----
  handoff: 'Baik kak, chat ini sudah diteruskan ke admin ya. Sebentar lagi kami sampaikan.',
  handoffOutsideHours: 'Baik kak, chat ini sudah diteruskan ke admin ya. Admin akan membalas saat jam operasional buka ya.',

  // ---- jam operasional / tutup ----
  away: 'Baik, admin kami sudah tutup. Untuk pertanyaan penting, silakan hubungi admin ya.',

  // ---- bukti gambar (P3) ----
  imageAck: 'Terima kasih kak, gambar sudah kami terima. Admin akan mengecek dan mengonfirmasi.',

  // ---- perintah owner (F7) ----
  botOff: 'Baik, bot sementara dimatikan. Status bot: OFF.',
  botOn: 'Baik, bot sudah dinyalakan kembali. Status bot: ON.',
  pauseChat: (jid) => `Baik, saya akan diam di chat ${jid} sampai owner menyuruh saya lanjut.`,
  resumeChat: (jid) => `Baik, saya kembali aktif di chat ${jid}.`,
  status: (info) =>
    [
      'Status bot WhatsApp Auto-Reply:',
      `- Bot: ${info.botEnabled ? 'ON' : 'OFF'}`,
      `- Mode human aktif: ${info.humanChats || 0} chat`,
      `- Uptime: ${Math.floor((info.uptimeSeconds || 0) / 3600)} jam ${Math.floor(((info.uptimeSeconds || 0) % 3600) / 60)} menit`,
      '',
      'Ketik .onbot / .offbot untuk mengubah status.',
    ].join('\n'),

  // ---- notifikasi admin (F5 / P3) ----
  adminNotify: (name, jid, text) => `Pesan dari ${name || jid}: "${text}". Tautan: wa.me/${jid}.`,

  // ---- fitur tambahan (PRO) ----
  autoReactEmoji: '👍',

  // ---- keyword (F2) ----
  keywords: [
    { id: 'harga', match: ['harga', 'berapa', 'biaya', 'tarif', 'price'], reply: 'replyHarga' },
    { id: 'alamat', match: ['alamat', 'lokasi', 'maps'], reply: 'replyAlamat' },
    { id: 'jam', match: ['jam buka', 'jam operasional', 'buka jam', 'operasional'], reply: 'replyJam' },
    { id: 'menu', match: ['menu'], reply: 'replyMenu' },
  ],

  // ---- trigger handoff (F5). JANGAN pakai kata "orang".
  handoffTriggers: ['admin', 'cs', 'customer service', 'operator', 'manusia', 'hubungi admin', 'panggil admin', 'agent'],
};
