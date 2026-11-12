'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const BACKUP_FILE = `${STATE_FILE}.bak`;

const DEFAULT_STATE = { botEnabled: true, contacts: {} };

let state = DEFAULT_STATE;
let saveTimer = null;

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const contacts = parsed && typeof parsed.contacts === 'object' && parsed.contacts !== null ? parsed.contacts : {};
    return {
      botEnabled: parsed ? parsed.botEnabled !== false : true,
      contacts,
    };
  } catch (err) {
    // File corrupt -> cadangkan lalu mulai dari state kosong.
    try {
      if (fs.existsSync(STATE_FILE)) fs.copyFileSync(STATE_FILE, BACKUP_FILE);
    } catch (e) {
      // abaikan
    }
    return { botEnabled: true, contacts: {} };
  }
}

function getState() {
  return state;
}

function updateState(next) {
  state = { ...state, ...next };
  scheduleSave();
  return state;
}

function saveStateNow() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    // abaikan; akan dicoba lagi pada save berikutnya
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveStateNow();
  }, 1000); // debounce ~1 detik, tulis atomic (tmp + rename)
}

function saveState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  saveStateNow();
}

function updateContact(jid, patch) {
  const contacts = { ...(state.contacts || {}) };
  const existing = contacts[jid] || {};
  const next =
    typeof patch === 'function'
      ? patch(existing)
      : { ...existing, ...(patch || {}) };
  contacts[jid] = next;
  state = { ...state, contacts };
  scheduleSave();
  return next;
}

module.exports = { loadState, getState, updateState, saveState, saveStateNow, updateContact, STATE_FILE };
