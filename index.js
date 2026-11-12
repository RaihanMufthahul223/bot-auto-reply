'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const { createKeywordMatcher } = require('./utils/text');
const { cleanJid, isSameJid } = require('./utils/jid');
const { createMessageHandler } = require('./handlers/messageHandler');
const { handleCommand } = require('./handlers/commandHandler');
const { RateLimiter } = require('./services/rateLimiter');
const { Transport } = require('./services/transport');
const { SheetService } = require('./services/sheetService');
const connection = require('./services/connection');
const stateStore = require('./services/stateStore');
const timerService = require('./services/timerService');
const { isOpen } = require('./services/businessHours');
const botConfig = require('./config/botConfig');
const replies = require('./config/replies');

const log = pino({
  level: process.env.LOG_LEVEL || 'info',
  destination: (() => {
    const logDir = path.resolve(process.cwd(), 'logs');
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch (e) {
      // abaikan
    }
    return fs.createWriteStream(path.resolve(logDir, 'app.log'));
  })(),
});

connection.setLogger((message) => log.error(message));

function toDigits(s) {
  return String(s || '').replace(/[^0-9]/g, '');
}

function isOwnerNumber(jid) {
  const digits = toDigits(jid);
  const ownerList = (process.env.OWNER_NUMBERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ownerList.some((o) => toDigits(o) === digits);
}

async function main() {
  const state = stateStore.loadState();
  const rateLimiter = new RateLimiter(botConfig);

  connection.acquireLock();
  const socket = await connection.start();

  const startedAt = Date.now();
  const botJid = socket?.user?.id ? cleanJid(socket.user.id) : undefined;

  const humanizer = require('./services/humanizer');
  const transport = new Transport({ sock: socket, stateStore, rateLimiter, humanizer, botJid });

  // Transport harus selalu memakai socket terbaru setelah proses reconnect.
  connection.setSocketHandler((activeSocket) => transport.setSocket(activeSocket));

  // Kill switch: 5x gagal berturut-turut -> botEnabled=false
  let failureCount = 0;
  const originalSendText = transport.sendText.bind(transport);
  transport.sendText = async (jid, text) => {
    try {
      const key = await originalSendText(jid, text);
      failureCount = 0;
      return key;
    } catch (e) {
      failureCount += 1;
      if (failureCount >= 5) {
        stateStore.updateState({ botEnabled: false });
        log.error('Kill switch aktif: 5 pengiriman gagal berturut-turut. Bot dimatikan.');
      }
      throw e;
    }
  };

  const adminNotifyJids = [...new Set(
    [process.env.ADMIN_NUMBER, ...(process.env.OWNER_NUMBERS || '').split(',')]
      .flatMap((s) => String(s || '').split(','))
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.includes('@') ? s : `${s}@whatsapp.net`))
  )].filter(Boolean);

  const ctx = {
    config: botConfig,
    replies,
    stateStore,
    rateLimiter,
    transport,
    businessHours: { isOpen },
    keywordMatcher: createKeywordMatcher(replies.keywords),
    handoffMatcher: createKeywordMatcher([{ id: 'handoff', match: replies.handoffTriggers }]),
    commandHandler: { handleCommand },
    isOwnerJid: (jid) => isSameJid(jid, botJid) || isOwnerNumber(jid),
    botJid,
    adminNotifyJids,
    startedAt,
    logError: (m) => log.error(m),
  };

  connection.setMessageHandler((message) => createMessageHandler(ctx)(message));

  // Pulihkan timer dari state (humanUntil, menuUntil) setelah restart
  timerService.restore(state);

  // Fitur PRO: Google Sheets (aktif hanya jika diaktifkan di botConfig.features.sheets)
  if (botConfig.features && botConfig.features.sheets) {
    const sheetService = new SheetService();
    const flushTimer = setInterval(() => {
      sheetService.flush().catch(() => {});
    }, 30 * 1000);
    if (typeof flushTimer.unref === 'function') flushTimer.unref();
  }

  log.info('Bot WhatsApp Auto-Reply started');
}

function shutdown() {
  connection.stop().finally(() => {
    connection.releaseLock();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((e) => {
  console.error('Fatal error bot:', e);
  process.exit(1);
});
