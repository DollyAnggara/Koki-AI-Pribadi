const mongoose = require('mongoose');
const crypto = require('crypto');

const skemaPengguna = new mongoose.Schema({
  namaPengguna: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  kataSandi: { type: String, required: true },
  namaLengkap: String,
  preferensiDiet: Object,
  pengaturanNotifikasi: Object,
  resepFavorit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Resep' }],
  tanggalDaftar: { type: Date, default: Date.now },
  statusAktif: { type: Boolean, default: true }
});

skemaPengguna.pre('save', function(next) {
  if (!this.isModified('kataSandi')) return next();
  this.kataSandi = crypto.createHash('sha256').update(this.kataSandi).digest('hex');
  next();
});

skemaPengguna.methods.verifikasiKataSandi = function(kataSandiInput) {
  const hash = crypto.createHash('sha256').update(kataSandiInput).digest('hex');
  return hash === this.kataSandi;
};

module.exports = mongoose.model('Pengguna', skemaPengguna);