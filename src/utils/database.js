const mongoose = require("mongoose");

// Connect with retry/backoff so transient Atlas propagation or network issues are retried
const hubungkanDatabase = async (options = {}) => {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/koki_ai_pribadi";
  const maxRetries = options.maxRetries ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1000;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
      console.log("✅ Terhubung ke MongoDB");
      return;
    } catch (err) {
      console.error(
        `❌ Koneksi MongoDB gagal (percobaan ${attempt}/${maxRetries}):`,
        err.message || err
      );
      if (attempt === maxRetries) {
        console.error(
          "💡 Perbaiki: periksa IP whitelist di Atlas (Network Access), pastikan cluster Aktif, dan cek kredensial. Untuk menguji dari mesin ini: `npx mongosh \"<MONGO_URI>\"` (ganti <MONGO_URI> dengan nilai di .env)."
        );
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`⏳ Menunggu ${delay}ms sebelum mencoba ulang...`);
      await sleep(delay);
    }
  }
};

module.exports = hubungkanDatabase;
