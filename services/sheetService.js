'use strict';

/**
 * P1 (PRO). Antrean tulis ke Google Sheets.
 * - Queue di memori, batch tiap 30 detik atau maksimal 20 baris.
 * - Kegagalan Sheets tidak boleh menunda/menggagalkan balasan bot.
 * - Retry dengan backoff, lalu buang setelah batas.
 */
const config = require('../config/botConfig');

class SheetService {
  constructor() {
    this.queue = [];
    this.flushTimer = null;
    this.maxBatchSize = 20;
    this.flushIntervalMs = 30 * 1000;
    this.maxAttempts = 3;
  }

  enqueue(row) {
    this.queue.push({ ...row, attempts: 0 });
    if (this.queue.length >= this.maxBatchSize) this.flush();
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
    }
  }

  clear() {
    this.queue = [];
  }

  async flush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    const batch = this.queue.splice(0, this.maxBatchSize);
    if (batch.length === 0) return;

    const googleapis = require('googleapis');
    const auth = new googleapis.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
    });
    const sheets = googleapis.sheets({ version: 'v4', auth });

    for (const row of batch) {
      try {
        await sheets.spreadsheets.values.append({
          spreadsheetId: process.env.SHEET_ID,
          range: 'Sheet1',
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          body: { values: [row.values] },
        });
        row.attempts = 0;
      } catch (e) {
        row.attempts = (row.attempts || 0) + 1;
        if (row.attempts > this.maxAttempts) {
          // buang setelah beberapa kali gagal
          continue;
        }
        this.queue.unshift(row);
        break; // tunda batch berikutnya, coba lagi nanti
      }
    }
  }

  stop() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
  }
}

module.exports = { SheetService };
