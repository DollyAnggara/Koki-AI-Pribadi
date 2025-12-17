const mongoose = require('mongoose');

const skemaItemBelanja = new mongoose.Schema({
  namaBahan: String,
  jumlah: Number,
  satuan: String,
  sudahDibeli: { type: Boolean, default: false }
});

const skemaMenuWaktu = new mongoose.Schema({
  sarapan: { type: mongoose.Schema.Types.ObjectId, ref: 'Resep' },
  makanSiang: { type: mongoose.Schema.Types.ObjectId, ref: 'Resep' },
  makanMalam: { type: mongoose.Schema.Types.ObjectId, ref: 'Resep' },
  cemilan: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Resep' }]
});

const skemaMenuHarian = new mongoose.Schema({ hari: String, menu: skemaMenuWaktu });

const skemaRencanaMenu = new mongoose.Schema({
  pengguna: { type: mongoose.Schema.Types.ObjectId, ref: 'Pengguna' },
  mingguKe: Number,
  tahun: Number,
  tanggalMulai: Date,
  tanggalSelesai: Date,
  menuMingguan: [skemaMenuHarian],
  daftarBelanja: [skemaItemBelanja],
  totalKaloriMingguan: Number,
  statusEmailTerkirim: { type: Boolean, default: false },
  tanggalDibuat: { type: Date, default: Date.now }
});

skemaRencanaMenu.methods.hitungDaftarBelanja = async function() {
  const Resep = mongoose.model('Resep');
  const gabungan = {};
  for (const mh of this.menuMingguan || []) {
    const ids = [mh.menu.sarapan, mh.menu.makanSiang, mh.menu.makanMalam, ...(mh.menu.cemilan || [])].filter(Boolean);
    const daftar = await Resep.find({ _id: { $in: ids } });
    for (const r of daftar) {
      for (const b of r.daftarBahan || []) {
        const k = `${b.namaBahan}-${b.satuan}`;
        if (!gabungan[k]) gabungan[k] = { namaBahan: b.namaBahan, jumlah: 0, satuan: b.satuan, sudahDibeli: false };
        gabungan[k].jumlah += (b.jumlah || 0);
      }
    }
  }
  this.daftarBelanja = Object.values(gabungan);
  return this.daftarBelanja;
};

module.exports = mongoose.model('RencanaMenu', skemaRencanaMenu);