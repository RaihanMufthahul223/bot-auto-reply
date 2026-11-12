# Bot Auto-Reply WhatsApp (Baileys)

Bot auto-reply untuk bisnis kecil — kasus awal: **Rumah Khitan Kak Topa**.

Spesifikasi teknis lengkap: [`rencana-wa-bot-baileys.md`](./rencana-wa-bot-baileys.md) (v1.0, 11 November 2026).

Panduan cara pakai bot: [`CARA-USE-BOT.md`](./CARA-USE-BOT.md).

## Struktur

```
├── config/        botConfig.js (teknis), replies.js (SEMUA teks balasan & keyword)
├── services/      connection, transport, humanizer, rateLimiter, stateStore, timerService,
│                  businessHours, sheetService
├── handlers/      messageHandler (pipeline filter + intent), commandHandler (perintah owner)
├── utils/         text (normalisasi + matcher), jid, math
├── data/          state.json, bot.lock (auto-generated, gitignored)
├── logs/          app.log (auto-generated, gitignored)
├── auth_info_baileys/ (sesi login, auto-generated, gitignored)
├── .env           OWNER_NUMBERS, ADMIN_NUMBER, kredensial Sheets
├── index.js       entry point
└── package.json
```

**Aturan arsitektur:** handler tidak boleh memanggil `sock.sendMessage` langsung. Semua pesan keluar
melewatkan rantai `transport.js` → `rateLimiter` → `humanizer`.

## Menjalankan

```bash
npm install
cp .env.example .env   # lalu isi nomor owner/admin
npm start
```

Saat pertama kali: scan QR dari `auth_info_baileys/` (atau pakai pairing code).

Dengan pm2:

```bash
pm2 start ecosystem.config.js
pm2 logs bot-auto-reply
pm2 stop bot-auto-reply
```

## Test

```bash
npm test
```

## Catatan penting

- Semua teks balasan diambil dari `config/replies.js` — jangan ditulis di handler.
- Semua pesan keluar melalui `transport.js`.
- Baileys terpasang di versi `7.0.0-rc14` (ESM) — dimuat via `import()`.
- Anti-ban: hard rule (hanya ke kontak yang sudah chat), rate limit global/per chat, flood guard,
  debounce, dedup, jam operasional, handoff ke admin.
- Kill switch: 5x pengiriman gagal berturut-turut -> bot mati.
