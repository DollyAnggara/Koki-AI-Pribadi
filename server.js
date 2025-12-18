/**
 * server.js (root) - entry point ringan
 */
console.log("🛠️ Menjalankan server (debug)...");
// Catch unhandled errors so we get a clear log instead of a silent exit
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  // Do NOT exit automatically on unhandled rejections from external APIs (e.g. auth failures).
  // Log and keep process alive; investigate if this becomes frequent.
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  // For truly uncaught exceptions, exit so the process can be restarted in production.
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
  // do not exit the process here so we can inspect synchronous errors
}
