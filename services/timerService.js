'use strict';

/**
 * Timer runtime untuk TTL menu, expiry handoff, dan event sinkron lainnya.
 * State penting disimpan di disk (stateStore) dan timer dipulihkan dari state saat startup.
 */

const timers = new Map();

function clear(key) {
  const t = timers.get(key);
  if (t) {
    clearTimeout(t);
    timers.delete(key);
  }
}

function arm(key, delayMs, onFire) {
  clear(key);
  const timer = setTimeout(() => {
    timers.delete(key);
    try {
      const r = onFire();
      if (r === false) clear(key);
      return r;
    } catch (e) {
      // error on timer tidak boleh meledakkan proses
    }
  }, Math.max(0, Number(delayMs) || 0));
  // tidak dipasang unref agar timer tetap berjalan saat proses utama aktif
  timers.set(key, timer);
  return key;
}

function armUntil(key, until, onFire) {
  const delay = Number(until) - Date.now();
  if (delay <= 0) return false;
  return arm(key, delay, onFire);
}

function cancel(key) {
  clear(key);
}

function restore(state) {
  const contacts = (state && state.contacts) || {};
  for (const jid of Object.keys(contacts)) {
    const c = contacts[jid] || {};
    if (c.mode === 'human' && Number(c.humanUntil) > Date.now()) {
      arm(`handoff:${jid}`, Number(c.humanUntil) - Date.now(), () => {
        // humanUntil lewat -> kembali ke mode bot
        const cur = stateStoreGet().contacts?.[jid];
        if (cur) {
          const updated = { ...cur, mode: 'bot', humanUntil: 0 };
          stateStoreUpdateContacts((prev) => ({ ...prev, [jid]: updated }));
        }
      });
    }
    if (Number(c.menuUntil) > Date.now()) {
      arm(`menu:${jid}`, Number(c.menuUntil) - Date.now(), () => {
        // menu TTL kadaluarsa
      });
    }
  }
}

// lazy require untuk menghindari circular dependency
const stateStore = require('./stateStore');
function stateStoreGet() {
  return stateStore.getState();
}
function stateStoreUpdateContacts(fn) {
  const s = stateStore.getState();
  const contacts = fn({ ...(s.contacts || {}) });
  stateStore.updateState({ contacts });
}

module.exports = { arm, armUntil, cancel, clear, restore };
