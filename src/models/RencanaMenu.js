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

  // Unit maps (canonical units: gram for mass, ml for volume)
  const massUnits = { g: 1, gram: 1, gramme:1, kg: 1000, kilogram: 1000 };
  const volumeUnits = { ml: 1, milliliter: 1, l: 1000, liter: 1000, litre:1000 };
  const countUnits = { butir: true, potong: true, buah: true };

  const normalizeUnit = (u) => {
    if (!u) return '';
    const x = String(u).trim().toLowerCase();
    if (x === 'g' || x === 'gram' || x === 'gramme') return 'gram';
    if (x === 'kg' || x === 'kilogram') return 'kg';
    if (x === 'ml' || x === 'milliliter') return 'ml';
    if (x === 'l' || x === 'liter' || x === 'litre') return 'liter';
    if (x === 'butir' || x === 'potong' || x === 'buah') return x;
    return x; // fallback
  };

  const toCanonical = (jumlah, satuan) => {
    const u = normalizeUnit(satuan);
    if (u === 'kg') return { amount: (jumlah || 0) * massUnits['kg'], unit: 'gram' };
    if (u === 'gram') return { amount: (jumlah || 0) * massUnits['gram'], unit: 'gram' };
    if (u === 'liter') return { amount: (jumlah || 0) * volumeUnits['liter'], unit: 'ml' };
    if (u === 'ml') return { amount: (jumlah || 0) * volumeUnits['ml'], unit: 'ml' };
    // count units: keep as-is
    if (countUnits[u]) return { amount: jumlah || 0, unit: u };
    // unknown: keep as given
    return { amount: jumlah || 0, unit: u || '' };
  };

  for (const mh of this.menuMingguan || []) {
    const ids = [mh.menu.sarapan, mh.menu.makanSiang, mh.menu.makanMalam, ...(mh.menu.cemilan || [])].filter(Boolean);
    const daftar = await Resep.find({ _id: { $in: ids } });
    for (const r of daftar) {
      for (const b of r.daftarBahan || []) {
        const nama = b.namaBahan || b.nama || '';
        const origUnit = b.satuan || '';
        const jumlah = typeof b.jumlah === 'number' ? b.jumlah : (parseFloat(b.jumlah) || 0);
        const canon = toCanonical(jumlah, origUnit);

        // key by name + canonical unit category
        const keyUnit = canon.unit || (origUnit || '').toLowerCase();
        const k = `${String(nama).trim().toLowerCase()}-${keyUnit}`;
        if (!gabungan[k]) gabungan[k] = { namaBahan: nama, jumlahCanonical: 0, canonicalUnit: keyUnit, satuan: keyUnit, sudahDibeli: false };
        gabungan[k].jumlahCanonical += canon.amount;
      }
    }
  }

  // Convert canonical sums back to friendly display units (e.g., g -> kg when large)
  const hasil = [];
  Object.keys(gabungan).forEach((k) => {
    const item = gabungan[k];
    let displayJumlah = item.jumlahCanonical;
    let displaySatuan = item.canonicalUnit || '';

    if (displaySatuan === 'gram') {
      if (displayJumlah >= 1000) {
        displayJumlah = Math.round((displayJumlah / 1000) * 100) / 100; // keep 2 decimals
        displaySatuan = 'kg';
      } else {
        displayJumlah = Math.round(displayJumlah * 100) / 100;
        displaySatuan = 'gram';
      }
    } else if (displaySatuan === 'ml') {
      if (displayJumlah >= 1000) {
        displayJumlah = Math.round((displayJumlah / 1000) * 100) / 100;
        displaySatuan = 'liter';
      } else {
        displayJumlah = Math.round(displayJumlah * 100) / 100;
        displaySatuan = 'ml';
      }
    } else {
      // counts or unknown units: round to 2 decimals but preserve integer when possible
      displayJumlah = Math.round(displayJumlah * 100) / 100;
    }

    hasil.push({ namaBahan: item.namaBahan, jumlah: displayJumlah, satuan: displaySatuan, sudahDibeli: !!item.sudahDibeli });
  });

  this.daftarBelanja = hasil;
  return this.daftarBelanja;
};

module.exports = mongoose.model('RencanaMenu', skemaRencanaMenu, 'rencanamenu');