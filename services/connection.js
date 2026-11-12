'use strict';

const fs = require('fs');
const path = require('path');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');

let baileys = null;
let sock = null;
let onMessage = null;
let onSocketChange = null;
let reconnectAttempts = 0;
let stopping = false;
let currentQr = null;
let reconnectTimer = null;
let startPromise = null;
let socketGeneration = 0;
let logError = () => {};

async function loadBaileys() {
  if (!baileys) {
    // Baileys v7 adalah ESM, sehingga dimuat melalui dynamic import().
    baileys = await import('@whiskeysockets/baileys');
  }
  return baileys;
}

function getAuthFolder() {
  return process.env.AUTH_FOLDER || 'auth_info_baileys';
}

async function createSocket(opts = {}) {
  const b = await loadBaileys();
  const authResult = await b.useMultiFileAuthState(opts.authFolder || getAuthFolder());
  const authState = authResult && authResult.state ? authResult.state : authResult;

  return b.makeWASocket({
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
}

function printQr(qr) {
  if (typeof qr !== 'string' || !qr) return;

  try {
    // qrcode-terminal menulis langsung ke stdout jika callback tidak diberikan.
    // Jangan console.log hasil generate(): nilainya undefined.
    qrcodeTerminal.generate(qr, { small: true });
  } catch (error) {
    logError(`Gagal menampilkan QR: ${error?.message || error}`);
  }
}

function getDisconnectCode(lastDisconnect) {
  const error = lastDisconnect?.error;
  // Jangan menebak DisconnectReason jika server tidak mengirim status code.
  return error?.output?.statusCode
    ?? error?.data?.status
    ?? error?.data?.code
    ?? error?.statusCode;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(delayOverride) {
  if (stopping || reconnectTimer) return;

  if (reconnectAttempts >= 10) {
    logError('Reconnect dihentikan setelah 10 percobaan. Periksa koneksi dan jalankan ulang bot secara manual.');
    stopping = true;
    return;
  }

  const exponentialDelay = Math.min(60000, 2000 * (2 ** reconnectAttempts));
  const delay = delayOverride ?? Math.round(exponentialDelay * (1 + Math.random() * 0.3));
  reconnectAttempts += 1;

  logError(`Koneksi terputus. Mencoba menghubungkan kembali dalam ${delay} ms (percobaan ${reconnectAttempts}/10).`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (stopping) return;

    try {
      await start();
    } catch (error) {
      logError(`Reconnect gagal: ${error?.message || error}`);
      scheduleReconnect();
    }
  }, delay);
}

function attachSocketEvents(socket, generation, b) {
  socket.ev.on('connection.update', ({ connection, lastDisconnect, qr } = {}) => {
    // Abaikan event dari socket lama yang sudah digantikan.
    if (generation !== socketGeneration || socket !== sock || stopping) return;

    if (qr && qr !== currentQr) {
      currentQr = qr;
      console.log('\nQR WhatsApp terbaru:');
      printQr(qr);
      console.log('Scan QR ini melalui WhatsApp > Perangkat tertaut.\n');
    }

    if (connection === 'open') {
      currentQr = null;
      reconnectAttempts = 0;
      clearReconnectTimer();
      console.log('WhatsApp berhasil terhubung.');
      return;
    }

    if (connection !== 'close') return;

    const code = getDisconnectCode(lastDisconnect);
    const reason = b.DisconnectReason || {};
    const errorMessage = lastDisconnect?.error?.message || 'Tidak ada detail error';

    sock = null;
    currentQr = null;
    if (typeof onSocketChange === 'function') onSocketChange(null);

    if (code === reason.loggedOut || code === 401) {
      stopping = true;
      clearReconnectTimer();
      logError('Sesi WhatsApp logout (401). Reconnect otomatis dihentikan. Hubungkan ulang secara manual.');
      return;
    }

    if (code === reason.connectionReplaced || code === 440) {
      stopping = true;
      clearReconnectTimer();
      logError('Koneksi WhatsApp digantikan oleh sesi lain (440). Bot dihentikan agar tidak terjadi perebutan sesi.');
      return;
    }

    if (code === reason.restartRequired || code === 515) {
      reconnectAttempts = 0;
      logError('WhatsApp meminta restart koneksi (515). Menyiapkan satu socket pengganti.');
      scheduleReconnect(500);
      return;
    }

    logError(`Koneksi WhatsApp ditutup (kode: ${code ?? 'tidak diketahui'}): ${errorMessage}`);
    scheduleReconnect();
  });

  socket.ev.on('messages.upsert', async ({ messages } = {}) => {
    if (generation !== socketGeneration || socket !== sock || stopping) return;

    const list = Array.isArray(messages) ? messages : messages?.messages;
    if (!Array.isArray(list)) return;

    for (const message of list) {
      if (generation !== socketGeneration || socket !== sock || stopping) break;
      if (typeof onMessage !== 'function') continue;

      try {
        await onMessage(message);
      } catch (error) {
        logError(`Error handler pesan: ${error?.message || error}`);
      }
    }
  });
}

async function start() {
  if (stopping) return null;
  if (sock) return sock;
  if (startPromise) return startPromise;

  startPromise = (async () => {
    const generation = ++socketGeneration;
    const b = await loadBaileys();

    if (stopping) return null;

    const newSocket = await createSocket();

    if (stopping || generation !== socketGeneration) {
      try {
        await newSocket.end(undefined);
      } catch (_) {
        // Socket sudah tidak aktif.
      }
      return null;
    }

    sock = newSocket;
    currentQr = null;
    if (typeof onSocketChange === 'function') onSocketChange(newSocket);
    attachSocketEvents(newSocket, generation, b);
    return newSocket;
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
}

async function stop() {
  stopping = true;
  socketGeneration += 1;
  clearReconnectTimer();
  currentQr = null;

  const activeSocket = sock;
  sock = null;
  if (typeof onSocketChange === 'function') onSocketChange(null);

  if (activeSocket) {
    try {
      await activeSocket.end(undefined);
    } catch (_) {
      // Abaikan jika socket sudah tertutup.
    }
  }
}

function acquireLock() {
  const lockPath = path.resolve(process.cwd(), 'data', 'bot.lock');
  const dataDir = path.dirname(lockPath);

  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (_) {
    // Penulisan lock di bawah akan melaporkan error jika direktori tidak tersedia.
  }

  const existingRaw = fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8').trim() : '';
  const existingPid = existingRaw ? parseInt(existingRaw, 10) : null;

  const alive = (pid) => {
    if (!pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (_) {
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
  } catch (_) {
    // Abaikan jika lock sudah tidak ada.
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
  setSocketHandler(fn) {
    onSocketChange = typeof fn === 'function' ? fn : null;
    if (onSocketChange) onSocketChange(sock);
  },
  setLogger(fn) {
    logError = typeof fn === 'function' ? fn : () => {};
  },
  getSocket: () => sock,
};
