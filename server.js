/**
 * server.js (root) - entry point ringan
 */
console.log('🛠️ Menjalankan server (debug)...');
try {
  require('dotenv').config();
  const { jalankanServer } = require('./src/app');
  console.log('Memanggil jalankanServer()...');
  jalankanServer()
    .then(() => console.log('✅ jalankanServer berhasil'))
    .catch(err => {
      console.error('❌ Gagal menjalankan server (catch):', err);
      // do not exit the process here so we can inspect the error during development
    });
} catch (err) {
  console.error('❌ Gagal menjalankan server (sync):', err);
  // do not exit the process here so we can inspect synchronous errors
}