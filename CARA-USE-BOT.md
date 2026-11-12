# Cara Menggunakan Bot Auto-Reply WhatsApp (Baileys)

Panduan ini menjelaskan cara pakai bot bagi **pemilik (owner)** dan **pelanggan (customer)**,
serta alur fitur-fitur yang tersedia.

Dokumentasi teknis: [`rencana-wa-bot-baileys.md`](./rencana-wa-bot-baileys.md)

---

## 1. Ringkasan perilaku dasar bot

- **Reaktif saja.** Bot hanya membalas chat masuk. Tidak ada broadcast/blast.
- **Sedikit dan natural.** Satu balasan per kebutuhan, dengan jeda + indikator mengetik (3–8 dtk total).
- **Saat ragu, diam.** Lebih baik tidak membalas daripada salah/berulang.
- **Teks balasan** selalu diambil dari `config/replies.js` — jangan ditulis di handler.
- **Semua pesan keluar** melalui `transport.js` → `rateLimiter` → `humanizer`.

## 2. Alur chat dari sisi pelanggan

1. Pelanggan mengirim chat (mis. “halo”).
2. Bot **sapaan awal** (random dari 3 variasi di `config/replies.js`) — maksimal sekali per 24 jam.
3. Jika pesan ke-1 juga cocok keyword, jawaban keyword dikirim setelah jeda 2–4 detik.
4. Keyword yang tersedia:
   - **harga / biaya / tarif / berapa** → `replyHarga`
   - **alamat / lokasi / maps** → `replyAlamat`
   - **jam buka / jam operasional / buka jam** → `replyJam`
   - **menu** → kirim daftar menu + aktifkan `menuState` (TTL 10 menit)
5. Jika `menuState` aktif dan pelanggan kirim angka:
   - **1** → Cek Harga
   - **2** → Alamat
   - **3** → Hubungi Admin → lanjut ke **handoff**
6. Jika ada permintaan admin (admin, cs, operator, manusia, hubungi admin, dll.) → **handoff**:
   - Bot membalas konfirmasi + set mode `human` (6 jam).
   - Notifikasi dikirim ke admin (nama, nomor, `wa.me/<nomor>`, pesan terakhir pelanggan).
   - Bot diam di chat itu sampai admin membalas manual dari HP / `.resume`, atau `humanUntil` lewat.
7. Jika pesan gambar/dokumen → balasan “bukti diterima” + notifikasi admin (1×/chat/jam).
8. Jika tidak ada keyword → **fallback** (“Maaf ya kak, saya belum paham…”) maksimal 1×/30 menit/chat.

### Aturan jam operasional (F4)
- Jam buka: `08:00` – `17:00` (zona `Asia/Jakarta`).
- Di luar jam → pesan “admin sudah tutup” maksimal 1×/12 jam per chat.
- Pertanyaan informasi (harga, alamat, jam buka) tetap dijawab walau di luar jam.

## 3. Perintah owner (diawali `.`) — dari nomor di `OWNER_NUMBERS`

| Perintah | Fungsi |
|---|---|
| `.offbot` | Matikan bot (untuk semua chat; perintah owner tetap jalan) |
| `.onbot` | Nyalakan kembali |
| `.status` | Status: on/off, jumlah chat mode human, uptime |
| `.pause <nomor>` | Paksa chat tertentu ke mode human |
| `.resume <nomor>` | Kembalikan chat ke mode bot |

- Perintah dari **non-owner** diabaikan tanpa balasan.
- Dukung dua skenario: owner dari nomor lain, atau owner mengetik di chat “ke diri sendiri” pada nomor bot.

## 4. Cara pakai fitur dari sisi owner / operasional

1. **Cek status bot**: `.status`
2. **Force handoff** ke admin: `.pause <nomor>` atau kirim “admin” dari chat pelanggan.
3. **Pulihkan chat** setelah admin menyelesaikan: `.resume <nomor>`.
4. **Matikan bot sementara** saat ada isu/infrastruktur: `.offbot` → debug → `.onbot`.

## 5. Checklist perilaku (wajib diimplementasikan)

- Tidak membalas grup, status, newsletter, pesan tanpa konten.
- Backlog > 60 detik setelah (re)connect tidak dibalas.
- Dedup pesan + flood guard (>8 pesan/menit → diam 10 menit).
- Limit balasan per chat: 8/jam.
- Anti-ban: hard rule (tidak mengirim ke JID yang belum chat, kecuali owner/admin).

## 6. Troubleshooting singkat

- Bot tidak membalas: cek `logs/app.log`, pastikan `botEnabled` (via `.status`), jam operasional, mode human.
- QR tidak muncul: hapus `auth_info_baileys/` dan scan ulang.
- Bot restart tidak scan ulang: gunakan lock file + `pm2` `instances: 1`.

---

*Bot harus (1) benar fungsi, (2) berperilaku seperti manusia, dan (3) tidak melakukan pola spam.*
