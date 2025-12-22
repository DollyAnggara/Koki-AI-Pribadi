/**
 * server.js (root) - entry point ringan
 */
console.log("🛠️ Menjalankan server (debug)...");
// Tangkap unhandled errors agar kita mendapat log yang jelas alih-alih silent exit
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  // JANGAN keluar otomatis pada unhandled rejections dari external APIs (mis. auth failures).
  // Catat dan biarkan process tetap hidup; periksa jika ini menjadi sering.
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  // Untuk uncaught exceptions yang benar-benar terjadi, exit agar process dapat di-restart di production.
  process.exit(1);
});
try {
  require("dotenv").config();
  const { jalankanServer } = require("./src/app");
  console.log("Memanggil jalankanServer()...");
  jalankanServer()
    .then(() => console.log("✅ jalankanServer berhasil"))
    .catch((err) => {
      console.error("❌ Gagal menjalankan server (catch):", err);
      console.error(
        "💡 Solusi: pastikan MongoDB aktif (mongod) atau setel MONGO_URI di file .env ke MongoDB yang dapat diakses"
      );
      process.exit(1);
    });
} catch (err) {
  console.error("❌ Gagal menjalankan server (sync):", err);
  // jangan exit process di sini agar kita dapat memeriksa synchronous errors
}
