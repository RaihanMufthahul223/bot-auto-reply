'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeText, createKeywordMatcher, randomPick } = require('../utils/text');

test('normalizeText: lowercase, buang tanda baca, rapikan spasi', () => {
  assert.equal(normalizeText('  Halo   Kak!!  Selamat DATANG. '), 'halo kak selamat datang');
  assert.equal(normalizeText(null), '');
});

test('keyword matcher: kata utuh (bukan substring), fleksibel pada akhiran kata', () => {
  const matcher = createKeywordMatcher([{ id: 'harga', match: ['harga', 'biaya', 'tarif'], reply: 'replyHarga' }]);
  assert.ok(matcher('harganya berapa kak'));
  assert.ok(matcher('Berapa BIAYA tarifnya'));
  assert.equal(matcher('arahan rumah').length, 0);
});

test('keyword matcher: prioritas urutan daftar', () => {
  const matcher = createKeywordMatcher([
    { id: 'harga', match: ['harga', 'biaya'], reply: 'replyHarga' },
    { id: 'alamat', match: ['alamat', 'lokasi'], reply: 'replyAlamat' },
  ]);
  const hits = matcher('berapa alamatnya');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'alamat');
});

test('randomPick: mengembalikan elemen dari list', () => {
  const pick = randomPick(['a', 'b', 'c']);
  assert.ok(['a', 'b', 'c'].includes(pick));
});
