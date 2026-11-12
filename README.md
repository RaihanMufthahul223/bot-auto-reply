# WhatsApp Auto-Reply untuk UMKM & Online Shop

Template bot WhatsApp berbasis Node.js dan Baileys untuk menjawab pertanyaan pelanggan secara otomatis berdasarkan kata kunci dan menu.

> **Catatan integrasi:** proyek ini memakai Baileys, library tidak resmi yang menghubungkan WhatsApp Web. Ini bukan WhatsApp Business Platform / Cloud API resmi. Penggunaan otomasi tidak resmi memiliki risiko pembatasan akun dan tidak ada jaminan bebas blokir. Untuk kebutuhan bisnis yang memerlukan jalur resmi, gunakan WhatsApp Business Platform.

## Fitur MVP

- Sapaan awal pelanggan.
- Menu angka dan balasan berdasarkan kata kunci.
- Informasi katalog, harga, stok, alamat, jam operasional, pengiriman, pembayaran.
- Jam buka berdasarkan zona waktu dan hari toko.
- Alihkan percakapan ke admin (human handoff).
- Pengakuan penerimaan gambar/dokumen tanpa mengklaim pembayaran terverifikasi.
- Perintah owner: `.onbot`, `.offbot`, `.status`, `.pause`, `.resume`.
- Penyimpanan state lokal, pembatasan laju, deduplikasi, dan reconnect.

## Konfigurasi toko untuk setiap klien

1. Salin `config/business.example.js` menjadi `config/business.local.js`.
2. Edit nama toko, kategori, alamat, jam operasional, katalog produk, harga, stok, pengiriman, pembayaran, teks balasan, dan kata kunci.
3. Isi `.env` berdasarkan `.env.example`: nomor owner dan admin dalam format internasional tanpa tanda `+`.
4. Jangan commit `business.local.js`, `.env`, folder sesi, atau data pelanggan.

Aplikasi otomatis memakai `business.local.js` jika tersedia. Jika belum ada, aplikasi memakai data contoh pada `business.example.js`.

### Contoh konfigurasi produk

```js
products: [
  { name: 'Kaos Polos', price: 75000, description: 'Cotton combed 24s', stock: 'Tersedia' },
  { name: 'Hoodie', price: 185000, description: 'Fleece 280 gsm', stock: 'Tanya admin' },
]
```

## Menjalankan lokal

Gunakan Node.js 20 atau lebih baru.

```bash
npm install
cp .env.example .env
cp config/business.example.js config/business.local.js
# edit .env dan config/business.local.js
npm test
npm start
```

Scan QR yang muncul di terminal menggunakan WhatsApp pada nomor khusus bot. Simpan folder sesi dengan aman; jangan membagikannya kepada klien lain.

## Deploy ke VPS dengan PM2

Contoh untuk Ubuntu:

```bash
sudo apt update
sudo apt install -y git
# Install Node.js 20 LTS atau lebih baru dari sumber tepercaya.
git clone https://github.com/RaihanMufthahul223/bot-auto-reply.git
cd bot-auto-reply
npm ci
cp .env.example .env
cp config/business.example.js config/business.local.js
nano .env
nano config/business.local.js
npm test
npx pm2 start ecosystem.config.js
npx pm2 save
npx pm2 startup
```

Setelah perintah `pm2 startup`, jalankan perintah yang ditampilkan PM2. Pantau log dengan `npx pm2 logs bot-auto-reply`.

**Penting untuk VPS:** gunakan satu instance proses untuk satu nomor WhatsApp. Pastikan `auth_info_baileys/`, `data/`, dan `logs/` berada pada disk persisten dan ikut dicadangkan dengan aman. Jangan menyalin satu folder sesi WhatsApp ke beberapa klien/server.

## Perintah owner

| Perintah | Fungsi |
|---|---|
| `.status` | Lihat status bot |
| `.offbot` | Matikan auto-reply |
| `.onbot` | Aktifkan auto-reply |
| `.pause 628xxxx` | Alihkan chat pelanggan ke admin |
| `.resume 628xxxx` | Aktifkan bot kembali di chat tersebut |

Nomor yang diizinkan ditentukan oleh `OWNER_NUMBERS`.

## Batasan MVP

- Bot berbasis aturan dan kata kunci, bukan AI yang memahami semua percakapan.
- Tidak memproses pesanan, pembayaran, atau stok secara otomatis ke sistem kasir.
- Harga dan katalog berasal dari konfigurasi lokal, bukan sinkronisasi database.
- Google Sheets dan auto-react belum termasuk MVP.
- Uji terlebih dahulu dengan nomor uji sebelum diserahkan kepada pelanggan.
- Satu instalasi ini ditujukan untuk satu nomor WhatsApp / satu bisnis.

## Checklist sebelum serah-terima

- [ ] Ganti semua data contoh dengan data bisnis klien.
- [ ] Pastikan OWNER_NUMBERS dan ADMIN_NUMBER benar.
- [ ] Pastikan jam dan hari operasional benar.
- [ ] Uji semua kata kunci dan pilihan menu angka.
- [ ] Uji handoff, balasan manual admin, dan resume bot.
- [ ] Uji restart VPS dan pastikan sesi tetap tersimpan.
- [ ] Pastikan backup sesi dan state dibuat secara aman.
- [ ] Jelaskan bahwa integrasi Baileys tidak resmi dan berisiko.
