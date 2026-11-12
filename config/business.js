'use strict';

// Loader konfigurasi bisnis. Klien cukup menyalin business.example.js
// menjadi business.local.js dan mengubah data tokonya.
let business;
try {
  business = require('./business.local');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND' || !String(error.message).includes('business.local')) {
    throw error;
  }
  business = require('./business.example');
}

module.exports = business;
