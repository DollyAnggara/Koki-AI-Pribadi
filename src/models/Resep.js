const mongoose = require('mongoose');

const skemaBahanResep = new mongoose.Schema({
  namaBahan: { type: String, required: true },
  jumlah: { type: Number, required: true },
  satuan: { type: String, required: true },
  wajib: { type: Boolean, default: true }
});

const skemaLangkah = new mongoose.Schema({
  nomorUrut: Number,
  deskripsi: String,
  durasiMenit: Number,
  tips: String
});

const skemaResep = new mongoose.Schema({
  namaResep: { type: String, required: true, index: true },
  deskripsi: String,
  kategori: String,
  tingkatKesulitan: { type: String, enum: ['mudah','sedang','sulit'], default: 'sedang' },
  waktuPersiapanMenit: Number,
  waktuMemasakMenit: Number,
  porsi: { type: Number, default: 1 },
  daftarBahan: [skemaBahanResep],
  langkah: [skemaLangkah],
  nutrisiPerPorsi: Object,
  tanggalDibuat: { type: Date, default: Date.now },
  tanggalDiperbarui: { type: Date, default: Date.now }
});

skemaResep.pre('save', function(next) { this.tanggalDiperbarui = Date.now(); next(); });

module.exports = mongoose.model('Resep', skemaResep);