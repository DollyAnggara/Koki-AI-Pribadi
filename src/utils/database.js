const mongoose = require("mongoose");
const hubungkanDatabase = async () => {
  const uri =
    process.env.MONGO_URI || "mongodb://localhost:27017/koki_ai_pribadi";
  try {
    await mongoose.connect(uri, { maxPoolSize: 10 });
    console.log("✅ Terhubung ke MongoDB");
  } catch (err) {
    console.error("❌ Tidak dapat terhubung ke MongoDB:", err.message || err);
    console.error(
      "💡 Perbaiki: jalankan MongoDB secara lokal (mongod) atau setel MONGO_URI pada file .env ke instance MongoDB yang tersedia (mis. MongoDB Atlas)."
    );
    throw err;
  }
};
module.exports = hubungkanDatabase;
