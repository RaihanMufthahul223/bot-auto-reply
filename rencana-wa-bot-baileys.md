# Rencana Teknis WhatsApp Bot Auto-Reply (Baileys)

*Spesifikasi untuk programmer dan AI agent · 11 November 2026 · v1.0*

## 1. Tujuan dan prinsip desain

Bot auto-reply untuk bisnis kecil (kasus awal: Rumah Khitan Kak Topa) yang membalas chat masuk: sapaan awal, keyword, menu angka, jam operasional, dan penerusan ke admin. Bot harus (1) benar secara fungsi, (2) berperilaku seperti manusia, dan (3) tidak melakukan pola yang biasa memicu deteksi spam WhatsApp.

Lima prinsip yang tidak boleh dilanggar:

1. **Reaktif saja.** Bot hanya membalas orang yang chat duluan. Tidak ada broadcast, blast, atau kirim ke nomor yang belum pernah chat.
2. **Sedikit dan natural.** Satu balasan per kebutuhan, dengan jeda dan indikator mengetik. Tidak ada balasan beruntun yang berlebihan.
3. **Saat ragu, diam dan serahkan ke manusia.** Lebih baik tidak membalas daripada membalas salah atau berulang.
4. **Teks di config, bukan di kode.** Ganti klien = ganti file config, bukan ubah logika.
5. **Satu nomor = satu sesi = satu proses.**

## 2. Catatan jujur soal risiko ban

- Baileys adalah library tidak resmi. Otomasi di luar API resmi bertentangan dengan ketentuan WhatsApp, jadi akun tetap bisa dibatasi atau diblokir kapan saja. **Tidak ada konfigurasi yang menjamin 100% aman.** Rencana ini menurunkan risiko, bukan menghilangkannya.
- WhatsApp tidak mempublikasikan ambang batas spam. Semua angka di dokumen ini adalah **default konservatif** yang bisa disetel, bukan aturan resmi.
- Untuk klien yang butuh stabilitas penuh, tawarkan jalur resmi **WhatsApp Business Platform (Cloud API)** sebagai paket upgrade. Karena itu, logika bot harus dipisah dari Baileys lewat lapisan `transport.js` (satu antarmuka: `sendText`, `sendReaction`, `setTyping`, `markRead`), sehingga mengganti Baileys ke Cloud API nanti tidak perlu menulis ulang bot.
- Gunakan nomor khusus bot, bukan nomor pribadi.

## 3. Tech stack (dengan koreksi dari rencana awal)

| Komponen | Pilihan | Catatan |
|---|---|---|
| Runtime | Node.js LTS (20 atau 22) | Ringan, cukup untuk bot satu nomor. |
| Bahasa | JavaScript CommonJS | Baileys v6.x mendukung CommonJS. Versi 7 diketahui bermigrasi ke ESM; verifikasi saat instalasi, dan jika dipakai, muat dengan `import()` dinamis. |
| `@whiskeysockets/baileys` | Pin versi persis di `package.json` (tanpa `^`) | Update library tanpa tes bisa mematahkan sesi atau mengubah perilaku. |
| `qrcode-terminal` | Cetak QR manual dari event `connection.update` | Opsi `printQRInTerminal` sudah deprecated di versi baru. Alternatif: login dengan pairing code. |
| `pino` | Logger Baileys: `silent` atau `warn`. Logger aplikasi terpisah: level `info` ke file `logs/app.log` | Jangan membisukan semua log, sebab log aplikasi dibutuhkan untuk mendeteksi masalah. |
| `dotenv` | Menyimpan nomor owner/admin dan kredensial | Jangan di-commit. |
| `Map` + `setTimeout` | Timer runtime (kedaluwarsa handoff, TTL menu) | Timer hilang saat restart. State penting harus disimpan ke disk dan dipulihkan saat start (lihat bagian 8). |
| `googleapis` | Opsional, untuk Google Sheets | Hanya aktif jika fitur dinyalakan. |
| `pm2` | Menjalankan proses di server | Wajib `instances: 1`. |

## 4. Struktur project

```
├── config/
│   ├── botConfig.js       # Angka teknis: delay, rate limit, TTL, jam operasional, feature flag
│   └── replies.js         # SEMUA teks balasan, keyword, dan menu (data, bukan kode)
├── services/
│   ├── connection.js      # Socket Baileys, QR/pairing, reconnect + backoff, lock file
│   ├── transport.js       # Satu-satunya pintu keluar pesan (send, react, typing, read)
│   ├── humanizer.js       # Hitung jeda baca, durasi mengetik, jitter
│   ├── rateLimiter.js     # Antrean global + limit per chat
│   ├── stateStore.js      # Simpan/muat state ke disk (atomic write)
│   ├── timerService.js    # Map timer: expiry handoff, TTL menu (dipulihkan dari state)
│   ├── businessHours.js   # Cek jam buka berdasarkan zona waktu
│   └── sheetService.js    # (opsional) antrean tulis ke Google Sheets
├── handlers/
│   ├── messageHandler.js  # Pipeline filter + router intent
│   └── commandHandler.js  # Perintah owner
├── utils/
│   ├── text.js            # Normalisasi teks dan matcher keyword
│   └── jid.js             # Parsing JID, deteksi grup/broadcast/newsletter
├── data/                  # state.json, bot.lock (auto-generated, di-.gitignore)
├── logs/                  # app.log (di-.gitignore)
├── auth_info_baileys/     # Sesi login (auto-generated, di-.gitignore)
├── .env                   # OWNER_NUMBERS, ADMIN_NUMBER, kredensial Sheets
├── index.js               # Entry point
└── package.json
```

**Aturan arsitektur:** handler tidak boleh memanggil `sock.sendMessage` langsung. Semua pesan keluar melewati rantai `transport.js` → `rateLimiter` → `humanizer`.

## 5. Alur pemrosesan pesan (pipeline)

Setiap pesan masuk diproses berurutan. Berhenti di langkah pertama yang menangani pesan.

**Tahap A: filter teknis (abaikan tanpa membalas)**

1. Event bukan `type === 'notify'` (riwayat sinkronisasi dan append diabaikan).
2. JID berakhiran `@g.us` (grup), `status@broadcast`, `@broadcast`, atau `@newsletter`.
3. Pesan tanpa konten nyata: protocol message, reaction, edit, perubahan setelan.
4. Pesan lebih tua dari 60 detik sebelum bot (re)connect, supaya backlog tidak dibalas.
5. ID pesan sudah pernah diproses (dedup dengan Set ber-TTL).
6. Pesan yang dikirim bot sendiri: catat ID setiap pesan keluar di `transport.js` dan abaikan jika muncul lagi sebagai `fromMe`.
7. Pesan `fromMe` yang bukan buatan bot di chat pelanggan berarti **admin membalas manual dari HP**. Jangan dibalas, tetapi aktifkan mode `human` untuk chat itu (lihat F5).

**Tahap B: kontrol**

1. Perintah owner (diawali `.`) dari nomor di `OWNER_NUMBERS` → `commandHandler`.
2. `botEnabled === false` → berhenti.
3. Chat dalam mode `human` yang belum kedaluwarsa → berhenti.
4. Flood guard: lebih dari 8 pesan masuk per menit dari satu chat → abaikan chat itu 10 menit.
5. Limit per chat: bot sudah membalas 8 kali dalam 1 jam ke chat ini → diam.
6. Debounce: kumpulkan pesan beruntun dari chat yang sama selama 2–4 detik, lalu balas **sekali** berdasarkan pesan terakhir (atau gabungan).

**Tahap C: penentuan intent (urutan prioritas)**

1. Permintaan admin → handoff (F5).
2. Angka saat `menuState` aktif → jawaban menu (F3).
3. Kata `menu` → kirim daftar menu dan aktifkan `menuState` selama 10 menit.
4. Keyword informasi (F2).
5. Pesan gambar/dokumen → balasan bukti diterima (P3).
6. Fallback: balas sekali “belum paham, ketik MENU atau ADMIN”, maksimal 1 kali per 30 menit per chat. Selebihnya diam.

Di atas semua intent, **sapaan awal** (F1) dikirim lebih dulu jika kontak baru. Bila pesan pertama itu juga cocok dengan keyword, jawaban keyword dikirim sebagai pesan kedua setelah jeda 2–4 detik.

**Tahap D: lapisan jam operasional (F4)**

Di luar jam buka: kirim pesan “admin sudah tutup” maksimal 1 kali per 12 jam per chat. Pertanyaan informasi (harga, alamat, jam buka) tetap dijawab karena tidak butuh admin. Permintaan admin tetap dicatat, dan dijawab bahwa admin akan membalas saat jam buka.

## 6. Spesifikasi fitur dan kriteria selesai

### Fitur wajib

**F1. Sapaan awal (welcome)**

- Pemicu: JID belum ada di `state.contacts`, atau `lastInteraction` lebih dari 24 jam lalu.
- Isi: 2–3 variasi teks di `replies.js`, dipilih acak.
- Selesai bila: kontak baru mendapat tepat satu sapaan; chat kedua dalam 24 jam tidak disapa lagi; restart bot tidak mengulang sapaan (status tersimpan di disk).

**F2. Auto-reply keyword**

- Normalisasi: huruf kecil, buang tanda baca, rapikan spasi. Cocokkan sebagai **kata utuh atau frasa**, bukan substring.
- Prioritas: keyword yang terdaftar lebih dulu menang. Jika dua keyword cocok, kirim maksimal dua jawaban dengan jeda antar pesan.

```js
// config/replies.js (cuplikan)
keywords: [
  { id: 'harga',  match: ['harga', 'biaya', 'tarif'],                  reply: 'replyHarga' },
  { id: 'alamat', match: ['alamat', 'lokasi', 'maps'],                reply: 'replyAlamat' },
  { id: 'jam',    match: ['jam buka', 'jam operasional', 'buka jam'], reply: 'replyJam' },
]
```

- Selesai bila: “harganya berapa kak” → balasan harga; “alamatnya dimana” → balasan alamat; kalimat tanpa keyword tidak memicu apa pun.

**F3. Menu angka**

- “MENU” (tidak peka huruf besar/kecil) mengirim daftar: 1. Cek Harga, 2. Alamat, 3. Hubungi Admin.
- Angka hanya dianggap pilihan jika `menuState` aktif (TTL 10 menit). Angka “2” yang dikirim tanpa menu tidak boleh memicu apa pun.
- Pilihan 3 menjalankan alur handoff (F5).

**F4. Jam operasional**

- Config: `hours: { open: '08:00', close: '17:00' }` dan `timezone: 'Asia/Jakarta'`. Hitung jam dengan `Intl.DateTimeFormat` memakai zona waktu tersebut, **jangan memakai jam lokal server**.
- Hari operasional dibuat configurable (default: semua hari, sampai owner memutuskan).
- Selesai bila: pesan jam 20:00 mendapat pesan tutup sekali, pesan kedua dalam 12 jam tidak mendapat pesan tutup lagi, dan pengujian dilakukan juga pada pergantian hari serta tepat di jam 08:00 dan 17:00.

**F5. Penerusan ke admin (handoff)**

- Pemicu: `admin`, `cs`, `customer service`, `operator`, `manusia`, `hubungi admin`, atau menu 3.
- **Jangan memakai kata “orang” sebagai pemicu.** Untuk bisnis khitan, kalimat seperti “orang tua saya mau tanya” akan salah memicu handoff.
- Aksi bot:
  1. Balas “Baik kak, chat diteruskan ke admin ya.”
  2. Set `mode = 'human'` untuk chat itu dengan `humanUntil` (default 6 jam).
  3. Kirim notifikasi ke `ADMIN_NUMBER`: nama, nomor, tautan `wa.me/<nomor>`, dan pesan terakhir pelanggan.
  4. Bot diam di chat itu sampai `humanUntil` lewat atau owner menjalankan `.resume <nomor>`.
- Deteksi otomatis: jika admin membalas manual dari HP di chat pelanggan, chat itu otomatis masuk mode `human`.
- Prasyarat operasional: `ADMIN_NUMBER` sebaiknya sudah pernah chat dengan nomor bot, supaya notifikasi tidak tampak sebagai pesan dari pihak asing.
- Selesai bila: setelah “admin”, bot tidak lagi membalas chat itu; admin menerima notifikasi; setelah 6 jam (atau `.resume`) bot aktif lagi; kalimat “orang tua saya” tidak memicu handoff.

**F6. Delay dan indikator mengetik**

Jeda 2–3 detik dari rencana awal diperhalus menjadi jeda acak yang menyesuaikan panjang teks:

```js
async function sendHumanized(jid, text, msgKey) {
  await sleep(rand(800, 2500));                      // jeda seolah membaca
  await sock.readMessages([msgKey]);                 // centang biru
  await sock.presenceSubscribe(jid);
  await sock.sendPresenceUpdate('composing', jid);   // "sedang mengetik..."
  const typingMs = clamp(text.length * 35 + rand(300, 1200), 1500, 6000);
  await sleep(typingMs);
  await sock.sendPresenceUpdate('paused', jid);
  await sock.sendMessage(jid, { text });
}
```

- Total latensi balasan yang wajar: sekitar 3–8 detik.
- Selesai bila: tidak ada balasan yang terkirim kurang dari 2 detik setelah pesan masuk, dan indikator mengetik terlihat di sisi pelanggan.

**F7. On/off dan perintah owner**

| Perintah | Fungsi |
|---|---|
| `.offbot` | Matikan bot untuk semua chat (owner command tetap jalan) |
| `.onbot` | Nyalakan lagi |
| `.status` | Tampilkan status: on/off, jumlah chat mode human, uptime |
| `.pause <nomor>` | Paksa satu chat ke mode human |
| `.resume <nomor>` | Kembalikan chat ke mode bot |

- Otorisasi: hanya nomor di `OWNER_NUMBERS`. Perintah dari nomor lain diabaikan tanpa balasan.
- Dukung dua skenario: owner mengirim dari nomor lain, atau owner mengetik di chat “pesan ke diri sendiri” pada nomor bot.
- Status `botEnabled` disimpan ke disk, sehingga tetap berlaku setelah restart.

### Fitur tambahan (PRO)

**P1. Simpan nomor ke Google Sheet**

- Gunakan service account. Kolom: waktu, nomor, nama (`pushName`), pesan pertama, status (`new` atau `handoff`).
- Tulis lewat antrean di memori dan kirim batch (misalnya tiap 30 detik atau maksimal 20 baris) memakai `values.append`. Kegagalan Sheets **tidak boleh** menunda atau menggagalkan balasan; ulangi dengan backoff lalu buang setelah beberapa kali gagal.
- Satu nomor hanya ditulis sekali (cek `state.contacts`).
- Pertimbangkan pemberitahuan penggunaan data pelanggan sesuai UU Pelindungan Data Pribadi.

**P2. Auto-react**

- Default **mati** (`features.autoReact: false`). Reaksi menambah trafik keluar dan tidak membantu menghindari ban.
- Jika dinyalakan: hanya pada pesan pertama dari kontak baru, satu emoji, probabilitas maksimal 30%, jeda 1–3 detik, dan ikut dihitung dalam rate limit global.

**P3. Balasan untuk gambar (bukti transfer)**

- Jika pesan berupa `imageMessage` atau dokumen: balas sekali per chat per jam, “Terima kasih kak, gambar sudah kami terima. Admin akan mengecek dan mengonfirmasi.”
- **Jangan menyatakan pembayaran sudah terverifikasi.** Bot tidak bisa memverifikasi.
- Kirim notifikasi ke admin berisi nomor pengirim.
- Jika pelanggan mengirim beberapa gambar beruntun, balas satu kali saja (debounce).

## 7. Kontrol anti-ban (wajib)

| Risiko | Kontrol di bot | Default |
|---|---|---|
| Mengirim ke orang yang tidak chat duluan | Hard rule di `transport.js`: tolak kirim ke JID yang tidak ada di `state.contacts`, kecuali `ADMIN_NUMBER` dan `OWNER_NUMBERS`. Tidak ada fitur broadcast. | Selalu aktif |
| Volume terlalu tinggi | Antrean global satu jalur dengan jarak antar pesan keluar acak | Jarak 1,5–3 detik; maks 15 pesan/menit; maks 200 pesan/jam |
| Spam ke satu chat atau loop bot melawan bot | Limit balasan per chat dan flood guard | Maks 8 balasan/jam/chat; lebih dari 8 pesan masuk/menit → diam 10 menit |
| Pesan identik berulang | 2–3 variasi template; tidak mengirim teks persis sama ke chat yang sama dalam 30 menit | Aktif |
| Pola tidak manusiawi | Jeda baca, indikator mengetik, jitter acak, debounce pesan beruntun | Lihat F6 |
| Pola 24 jam tanpa henti | Di luar jam operasional hanya satu pesan tutup per 12 jam per chat | Lihat F4 |
| Reconnect berulang atau relogin | Backoff eksponensial; berhenti total saat logged out | Lihat kode di bawah |
| Dua sesi untuk satu akun | Lock file `data/bot.lock`; `pm2` `instances: 1`; jangan jalankan dev dan prod dengan folder auth yang sama | Selalu aktif |
| Akun baru dan langsung otomatis | Gunakan nomor khusus (disarankan WhatsApp Business), lengkapi profil bisnis, lalu **pakai manual dulu 7–14 hari** sebelum bot dinyalakan | Prosedur operasional |
| Laporan atau blokir dari pelanggan | Selalu sediakan jalan ke manusia (F5); tidak mengirim promosi yang tidak diminta; tidak mengirim tautan berlebihan | Aktif |
| Infrastruktur mencurigakan | VPS stabil dengan IP tetap, hindari ganti-ganti IP atau proxy murah; sinkronkan waktu server (NTP) | Prosedur operasional |
| Status “online” permanen | Opsi socket `markOnlineOnConnect: false` dan `syncFullHistory: false` | Aktif |

Kebijakan reconnect:

```js
sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
  if (qr) qrcode.generate(qr, { small: true });
  if (connection !== 'close') return;
  const code = lastDisconnect?.error?.output?.statusCode;

  if (code === DisconnectReason.loggedOut) {
    // BERHENTI. Jangan reconnect otomatis. Catat log, hapus sesi secara manual, scan ulang.
  } else if (code === DisconnectReason.connectionReplaced) {
    // Ada sesi lain di akun ini. BERHENTI, jangan merebut balik.
  } else if (code === DisconnectReason.restartRequired) {
    start(); // normal setelah pairing, buat socket baru
  } else {
    scheduleReconnect(); // 2s, 4s, 8s ... maks 60s, plus jitter; setelah 10 kali gagal: berhenti dan log error
  }
});
```

Kill switch otomatis: jika pengiriman gagal berturut-turut (misalnya 5 kali) atau terjadi `loggedOut`, set `botEnabled = false`, catat log jelas bahwa akun kemungkinan dibatasi, dan jangan mencoba lagi sampai owner turun tangan.

## 8. Data dan state

State disimpan di `data/state.json`:

```js
{
  botEnabled: true,
  contacts: {
    '62812xxxxxxx@s.whatsapp.net': {
      name: 'Budi',
      firstSeen: 1731300000000,
      lastInteraction: 1731303600000,
      mode: 'bot',            // 'bot' atau 'human'
      humanUntil: 0,          // epoch ms, 0 = tidak aktif
      menuUntil: 0,
      lastWelcomeAt: 0,
      lastAwayAt: 0,
      lastFallbackAt: 0,
      lastImageAckAt: 0
    }
  }
}
```

Aturan:

- Tulis secara **atomic**: tulis ke file sementara lalu `rename`, dengan debounce sekitar 1 detik. Jika file korup, cadangkan lalu mulai dari state kosong.
- Saat startup, pulihkan timer dari `humanUntil` dan `menuUntil`. Jangan mengandalkan `setTimeout` yang hilang saat restart.
- Untuk MVP, JSON sudah cukup. Pindah ke SQLite (`better-sqlite3`) jika bot dipakai multi-klien atau kontak mencapai puluhan ribu.
- WhatsApp mulai memakai alamat berbentuk LID (`@lid`) pada sebagian chat. Gunakan JID apa adanya sebagai kunci, jangan berasumsi formatnya nomor telepon, dan untuk nomor asli pakai field alternatif yang disediakan Baileys pada versi yang dipakai (cek dokumentasinya).

## 9. Konfigurasi

```js
// config/botConfig.js
module.exports = {
  timezone: 'Asia/Jakarta',
  hours: { open: '08:00', close: '17:00' },
  humanize: {
    readDelayMs: [800, 2500],
    typingPerCharMs: 35,
    typingMinMs: 1500,
    typingMaxMs: 6000,
  },
  debounceMs: [2000, 4000],
  limits: {
    globalGapMs: [1500, 3000],
    globalPerMinute: 15,
    globalPerHour: 200,
    perChatPerHour: 8,
    floodInPerMinute: 8,
    floodMuteMs: 10 * 60 * 1000,
  },
  ttl: {
    menuMs: 10 * 60 * 1000,
    handoffMs: 6 * 60 * 60 * 1000,
    welcomeMs: 24 * 60 * 60 * 1000,
    awayMs: 12 * 60 * 60 * 1000,
    imageAckMs: 60 * 60 * 1000,
  },
  features: { sheets: false, autoReact: false, imageAck: true },
};
```

Variabel `.env`:

```
OWNER_NUMBERS=62812xxxxxxx,62813xxxxxxx
ADMIN_NUMBER=62812xxxxxxx
SHEET_ID=
GOOGLE_CREDENTIALS_PATH=
```

## 10. Tahapan implementasi

| Fase | Isi | Selesai bila |
|---|---|---|
| 0. Persiapan | Nomor khusus, profil bisnis, masa pakai manual 7–14 hari, VPS, repo dengan `.gitignore` (auth, .env, data, logs) | Nomor siap dan repo bersih dari data sensitif |
| 1. Fondasi | `connection.js`, QR/pairing, reconnect + backoff, lock file, logger, `transport.js`, filter Tahap A | Bot online, restart tanpa scan ulang, tidak membalas grup/status/backlog |
| 2. Inti | `replies.js`, `messageHandler.js`, welcome, keyword, menu, jam operasional | F1–F4 lolos pengujian |
| 3. Natural dan aman | `humanizer.js`, `rateLimiter.js`, debounce, dedup, flood guard, limit per chat | F6 lolos; semua kontrol bagian 7 aktif |
| 4. Kontrol | `stateStore.js`, `timerService.js`, `commandHandler.js`, handoff, deteksi balasan manual admin | F5 dan F7 lolos |
| 5. PRO | Google Sheets, balasan gambar, auto-react (opsional) | P1–P3 lolos |
| 6. Deploy | `pm2` (1 instance), log rotation, backup rutin `auth_info_baileys/` dan `data/`, alert saat bot mati | Berjalan stabil 7 hari tanpa intervensi |

## 11. Checklist pengujian

| Skenario | Hasil yang diharapkan |
|---|---|
| Nomor baru kirim “halo” | Satu sapaan, jeda sekitar 3–8 detik, indikator mengetik terlihat |
| Kirim “harga” | Balasan harga |
| Kirim “orang tua saya mau tanya” | Tidak memicu handoff |
| “menu”, lalu “2” | Balasan alamat |
| “2” tanpa “menu” sebelumnya | Tidak memicu menu; paling banyak fallback |
| Kirim 5 pesan dalam 3 detik | Hanya satu balasan |
| Chat di luar jam 08:00–17:00 | Pesan tutup satu kali; chat kedua dalam 12 jam tidak mendapat pesan tutup |
| Kirim “admin” | Pelanggan mendapat konfirmasi, admin mendapat notifikasi, bot diam di chat itu |
| Admin membalas manual dari HP | Bot otomatis diam di chat itu |
| `.offbot` dari owner, lalu chat biasa | Bot tidak membalas; `.onbot` menghidupkan lagi |
| `.offbot` dari nomor non-owner | Diabaikan |
| Pesan di grup atau status | Tidak ada balasan |
| Restart bot | Tidak scan ulang, tidak mengulang sapaan, tidak membalas backlog |
| Putus internet | Reconnect dengan backoff, tanpa loop cepat |
| Menjalankan instance kedua | Ditolak oleh lock file |
| Kirim gambar | Satu balasan “diterima”, admin dinotifikasi |

Uji dengan nomor sendiri. Jangan melakukan stress test dengan banyak nomor pada akun produksi.

## 12. Aturan untuk programmer dan AI agent

- Jangan membuat fitur broadcast, blast, kirim massal, scraping nomor, auto-join grup, atau kirim ke nomor yang belum chat.
- Semua pesan keluar wajib lewat `transport.js`. Jangan memanggil `sock.sendMessage` dari tempat lain.
- Jangan menulis teks balasan di dalam handler; ambil dari `replies.js`.
- Jangan men-commit `auth_info_baileys/`, `.env`, `data/`, atau kredensial Google.
- Bungkus setiap handler async dengan `try/catch`. Error pada satu pesan tidak boleh mematikan proses.
- Jangan menaikkan angka limit di bagian 7 dan 9 menjadi lebih agresif tanpa persetujuan owner.
- Buat fungsi murni (matcher keyword, `businessHours`, hitung delay) supaya mudah diuji unit.
- Jangan memakai `process.exit` kecuali saat lock gagal atau `loggedOut`.
- Pin versi dependensi; jangan upgrade Baileys tanpa menjalankan seluruh checklist bagian 11.

## 13. Hal yang perlu diputuskan owner

1. Nomor bot: nomor khusus baru, atau nomor lama yang sudah punya riwayat chat? Pakai aplikasi WhatsApp Business?
2. Hari operasional selain jam 08:00–17:00.
3. Isi final teks harga, alamat, dan jam buka.
4. Jumlah admin: satu nomor atau lebih, dan siapa saja yang boleh menjadi owner.
5. Rencana jual ke banyak klien: satu proses per klien (config terpisah) atau satu proses multi-klien, dan apakah perlu paket upgrade ke Cloud API.
