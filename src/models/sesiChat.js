const mongoose = require("mongoose");

const skemaSessionChat = new mongoose.Schema(
  {
    idPengguna: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pengguna",
      required: true,
    },
    namaSession: { type: String, required: true, default: "Sesi Baru" },
    riwayatChat: [
      {
        tipe: { type: String, enum: ["pengguna", "koki"], required: true },
        pesan: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    tanggalDibuat: { type: Date, default: Date.now },
    tanggalDiperbarui: { type: Date, default: Date.now },
    aktif: { type: Boolean, default: true },
  },
  { collection: "session_chat" }
);

// Update tanggalDiperbarui setiap kali ada perubahan
skemaSessionChat.pre("save", function () {
  this.tanggalDiperbarui = new Date();
});

module.exports = mongoose.model("sesiChat", skemaSessionChat);
