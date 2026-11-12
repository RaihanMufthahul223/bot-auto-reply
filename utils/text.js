'use strict';

/**
 * Normalisasi teks dan pembuat matcher keyword.
 * Semua teks dari WhatsApp dipetakan ke ini sebelum dicocokkan.
 */

function normalizeText(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .toLowerCase()
    .replace(/[\u200b-\u200d\u2028\u2029\u2060\ufeff]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Membuat fungsi matcher dari daftar keyword.
 * Keyword ditangani dalam prioritas urutan daftar (yang lebih dulu menang).
 * Setiap keyword punya beberapa pola alternatif (`match`).
 * Cocok sebagai kata utuh atau frasa, BUKAN substring.
 */
function createKeywordMatcher(keywords) {
  const entries = (Array.isArray(keywords) ? keywords : []).map((k) => ({
    id: k.id,
    reply: k.reply,
    patterns: (Array.isArray(k.match) ? k.match : [k.match]).map(
      (m) => new RegExp(`\\b${escapeRegExp(m)}[\\p{L}\\p{N}]*\\b`, 'u')
    ),
  }));

  return function matchKeywords(normalizedText) {
    const text = normalizeText(normalizedText);
    const hits = [];
    for (const entry of entries) {
      if (entry.patterns.some((re) => re.test(text))) hits.push(entry);
    }
    return hits;
  };
}

function randomPick(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

module.exports = { normalizeText, escapeRegExp, createKeywordMatcher, randomPick };
