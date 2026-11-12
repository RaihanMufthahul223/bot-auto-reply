'use strict';

const fs = require('fs');
const path = require('path');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const config = require('../config/botConfig');

let baileys = null;
let sock = null;
let onMessage = null;
let reconnectAttempts = 0;
let stopping = false;
let currentQr = null;
let logError = () => {};

async function loadBaileys() {
  if (!baileys) {
    // Baileys v7 (terpasang: 7.0.0-rc14) berjenis ESM -> wajib load via dynamic import().
    baileys = await import('@whiskeysockets/baileys');
  }
  return baileys;
}

function getAuthFolder() {
  return process.env.AUTH_FOLDER || 'auth_info_baileys';
}

async function createSocket(opts) {
  const b = await loadBaileys();
  const authResult = await b.useMultiFileAuthState(opts.authFolder || getAuthFolder());
  const authState = authResult && authResult.state ? authResult.state : authResult;
  const s = b.makeWASocket({
    auth: {
      creds: authState.creds,
      keys: authState.keys,
    },
    logger: opts.logger || pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    emitOwnEvents: true,
  });
  sock = s;
  return s;
}

function printQr(qr) {
  try {
    const out = qrcodeTerminal.generate(qr, { small: true });
    console.log(out);
  } catch (e) {
    // abaikan kegagalan print QR
  }
}

function getDisconnectCode(lastDisconnect) {
  const err = lastDisconnect && lastDisconnect.error;
  const statusCode = err ? err.output?.statusCode ?? err.data?.status ?? err.data?.code : undefined;
  const reason = baileys && baileys.DisconnectReason;
  if (statusCode === undefined && reason) {
    if (reason.loggedOut !== undefined) return reason.loggedOut;
    if (reason.connectionReplaced !== undefined) return reason.connectionReplaced;
    if (reason.restartRequired !== undefined) return reason.restartRequired;
  }
  return statusCode;
}

function scheduleReconnect() {
  if (stopping) return;
  if (reconnectAttempts >= 10) {
    logError('Kegagalan reconnect berulang (maks 10). Berhenti dan butuh intervensi manual.');
    stopping = true;
    return;
  }
  const baseDelay = 2000;
  const delay = Math.min(60000, baseDelay * Math.pow(2, reconnectAttempts)) * (1 + Math.random() * 0.3);
  reconnectAttempts += 1;
  setTimeout(async () => {
    if (stopping) return;
    try {
      await start();
    } catch (e) {
      logError(`Reconnect gagal: ${e && e.message ? e.message : e}`);
      scheduleReconnect();
    }
  }, delay);
}

async function start() {
  if (stopping) return;
  const socket = await createSocket({});
  const b = await loadBaileys();

  socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr } = {}) => {
    if (qr) {
      currentQr = qr;
      printQr(qr);
    }
    if (connection !== 'close') return;
    const code = getDisconnectCode(lastDisconnect);
    const reason = baileys && baileys.DisconnectReason;
    const is = (v) => v !== undefined && code === v;
    if (is(reason?.loggedOut) || code === 401) {
      // loggedOut: BERHENTI. Jangan reconnect otomatis. Sesi harus dihapus manual + scan ulang.
      stopping = true;
      return;
    }
    if (is(reason?.connectionReplaced) || code === 440) {
      // Sesi lain dipakai akun ini. BERHENTI, jangan merebut balik.
      stopping = true;
      return;
    }
    if (is(reason?.restartRequired) || code === 515) {
      reconnectAttempts = 0;
      await start();
      return;
    }
    scheduleReconnect();
  });

  socket.ev.on('messages.upsert', async ({ messages } = {}) => {
    const list = Array.isArray(messages) ? messages : messages?.messages;
    if (!Array.isArray(list)) return;
    for (const message of list) {
      if (typeof onMessage === 'function') {
        try {
          await onMessage(message);
        } catch (e) {
          logError(`Error handler pesan: ${e && e.message ? e.message : e}`);
        }
      }
    }
  });

  return socket;
}

async function stop() {
  stopping = true;
  if (sock) {
    try {
      await sock.end(undefined);
    } catch (e) {
      // abaikan
    }
  }
}

function acquireLock() {
  const lockPath = path.resolve(process.cwd(), 'data', 'bot.lock');
  const dataDir = path.dirname(lockPath);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    // abaikan
  }
  const existingRaw = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8').trim() : '';
  const existingPid = existingRaw ? parseInt(existingRaw, 10) : null;
  const alive = (pid) => {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  };
  if (existingPid && alive(existingPid) && existingPid !== process.pid) {
    logError(`Lock gagal: instance lain (PID ${existingPid}) masih berjalan.`);
    process.exit(1);
  }
  fs.writeFileSync(lockPath, String(process.pid));
}

function releaseLock() {
  try {
    fs.unlinkSync(path.resolve(process.cwd(), 'data', 'bot.lock'));
  } catch (e) {
    // abaikan
  }
}

module.exports = {
  loadBaileys,
  createSocket,
  start,
  stop,
  acquireLock,
  releaseLock,
  setMessageHandler(fn) {
    onMessage = fn;
  },
  getSocket: () => sock,
};
