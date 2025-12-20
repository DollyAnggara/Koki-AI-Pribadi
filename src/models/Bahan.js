const mongoose = require("mongoose");

const skemaBahan = new mongoose.Schema(
  {
    namaBahan: { type: String, required: true, index: true },
    kategoriBahan: { type: String, default: "lainnya" },
    jumlahTersedia: { type: Number, default: 0 },
    satuan: { type: String, default: "gram" },
    tanggalPembelian: Date,
    tanggalKadaluarsa: Date,
    lokasiPenyimpanan: {
      type: String,
      enum: ["kulkas", "freezer", "rak_dapur", "lainnya"],
      default: "rak_dapur",
    },
    pemilik: { type: mongoose.Schema.Types.ObjectId, ref: "Pengguna" },
    statusAktif: { type: Boolean, default: true },
  },
  { collection: "bahan", timestamps: true }
);

skemaBahan.virtual("sisaHariKadaluarsa").get(function () {
  if (!this.tanggalKadaluarsa) return null;
  const hariIni = new Date();
  return Math.ceil((this.tanggalKadaluarsa - hariIni) / (1000 * 60 * 60 * 24));
});

skemaBahan.set("toJSON", { virtuals: true });
skemaBahan.statics.dapatkanHampirKadaluarsa = function (
  idPengguna,
  hariMendatang = 3
) {
  // Include items that are already expired or will expire within `hariMendatang` days.
  // Using end-of-day cutoff ensures items expiring today (even earlier than now) are included.
  const tanggalBatas = new Date();
  tanggalBatas.setHours(23, 59, 59, 999);
  tanggalBatas.setDate(tanggalBatas.getDate() + hariMendatang);
  return this.find({
    pemilik: idPengguna,
    statusAktif: true,
    tanggalKadaluarsa: { $exists: true, $lte: tanggalBatas },
  }).sort({ tanggalKadaluarsa: 1 });
};

module.exports = mongoose.model("Bahan", skemaBahan);
