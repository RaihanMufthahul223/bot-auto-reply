'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const business = require('../config/business');
const replies = require('../config/replies');
const { createKeywordMatcher } = require('../utils/text');

test('business template menyediakan identitas dan jam operasional', () => {
  assert.ok(business.store.name);
  assert.match(business.store.hours.open, /^\d{2}:\d{2}$/);
  assert.match(business.store.hours.close, /^\d{2}:\d{2}$/);
});

test('reply katalog dan harga dibentuk dari data produk', () => {
  const catalog = replies.replyProduk();
  assert.ok(catalog.includes(business.catalog.products[0].name));
  assert.ok(replies.replyHarga().includes(String(business.catalog.products[0].price).replace(/\B(?=(\d{3})+(?!\d))/g, '.')));
});

test('keyword bisnis dapat dicocokkan', () => {
  const match = createKeywordMatcher(replies.keywords);
  assert.equal(match('berapa harga produk ini')[0]?.id, 'harga');
  assert.ok(match('cek stok barang').some(hit => hit.id === 'stok'));
});
