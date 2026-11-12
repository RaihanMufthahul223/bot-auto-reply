'use strict';

// TEMPLATE DATA BISNIS.
// Salin file ini menjadi config/business.local.js, lalu edit sesuai data klien.
// Jangan masukkan password, token, atau kredensial ke file ini.

module.exports = {
  store: {
    name: 'Nama Toko Anda',
    category: 'Toko Online',
    description: 'Deskripsi singkat bisnis Anda.',
    address: 'Alamat lengkap toko / gudang',
    mapsUrl: '',
    phone: '6281234567890',
    timezone: 'Asia/Jakarta',
    hours: {
      open: '08:00',
      close: '17:00',
      // 0=Minggu, 1=Senin, ... 6=Sabtu. [] berarti buka setiap hari.
      daysOpen: [1, 2, 3, 4, 5, 6],
    },
  },

  catalog: {
    currency: 'Rp',
    products: [
      { name: 'Nama Produk A', price: 25000, description: 'Deskripsi produk A', stock: 'Tersedia' },
      { name: 'Nama Produk B', price: 50000, description: 'Deskripsi produk B', stock: 'Tanya admin' },
    ],
  },

  operations: {
    shipping: 'Pengiriman tersedia melalui kurir instan dan ekspedisi.',
    payment: 'Transfer bank, QRIS, atau metode pembayaran yang tersedia di toko.',
    customNotes: 'Silakan tanyakan kepada admin untuk informasi lebih lanjut.',
  },

  messages: {
    welcome: [
      'Halo kak! Selamat datang di {storeName}. Ada yang bisa kami bantu?',
      'Hai kak, terima kasih sudah menghubungi {storeName}. Silakan pilih menu atau tulis pertanyaan.',
    ],
    fallback: 'Maaf kak, pesan belum dapat kami pahami. Ketik MENU untuk melihat pilihan layanan.',
    handoff: 'Baik kak, permintaan diteruskan ke admin {storeName}. Mohon tunggu balasan pada jam operasional.',
    handoffOutsideHours: 'Baik kak, pesan sudah dicatat. Admin {storeName} akan membalas saat jam operasional berikutnya.',
    away: 'Terima kasih sudah menghubungi {storeName}. Saat ini toko sedang tutup. Pesan kakak akan ditindaklanjuti pada jam operasional.',
    imageAck: 'Terima kasih kak, file sudah diterima. Admin akan memeriksanya. Pesan ini bukan konfirmasi pembayaran.',
    menuHeader: 'Halo kak! Silakan pilih informasi yang dibutuhkan:',
    unknownProduct: 'Produk tersebut belum ada di daftar katalog. Silakan hubungi admin untuk konfirmasi.',
  },

  // Kata kunci dapat ditambah sesuai jenis bisnis.
  keywords: [
    { id: 'harga', match: ['harga', 'price', 'berapa', 'biaya', 'tarif'], reply: 'replyHarga' },
    { id: 'produk', match: ['produk', 'katalog', 'daftar produk'], reply: 'replyProduk' },
    { id: 'stok', match: ['stok', 'stock', 'ready', 'tersedia'], reply: 'replyStok' },
    { id: 'alamat', match: ['alamat', 'lokasi', 'maps', 'lokasi toko'], reply: 'replyAlamat' },
    { id: 'jam', match: ['jam buka', 'jam operasional', 'operasional', 'buka jam'], reply: 'replyJam' },
    { id: 'pengiriman', match: ['pengiriman', 'ongkir', 'kurir', 'ekspedisi'], reply: 'replyPengiriman' },
    { id: 'pembayaran', match: ['pembayaran', 'transfer', 'qris', 'rekening'], reply: 'replyPembayaran' },
    { id: 'menu', match: ['menu', 'bantuan'], reply: 'replyMenu' },
  ],

  handoffTriggers: ['admin', 'cs', 'customer service', 'operator', 'hubungi admin', 'panggil admin'],
};
