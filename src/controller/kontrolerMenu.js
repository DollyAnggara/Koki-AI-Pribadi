/**
 * src/controller/kontrolerMenu.js
 * Rencana menu mingguan & daftar belanja + kirim email
 */

const RencanaMenu = require('../models/RencanaMenu');
const Resep = require('../models/Resep');
const Pengguna = require('../models/Pengguna');
const layananEmail = require('../utils/emailService');

const buatRencanaMenu = async (req, res) => {
  try {
    const { idPengguna, mingguKe, tahun, menuMingguan } = req.body;
    const tanggalMulai = new Date(); // sederhana
    const tanggalSelesai = new Date(tanggalMulai); tanggalSelesai.setDate(tanggalSelesai.getDate() + 6);

    const rencana = new RencanaMenu({ pengguna: idPengguna, mingguKe, tahun, tanggalMulai, tanggalSelesai, menuMingguan });
    await rencana.hitungDaftarBelanja();
    // hitung total kalori mingguan (jika resep nutrisi tersedia)
    let totalKaloriMingguan = 0;
    for (const mh of menuMingguan || []) {
      const ids = [mh.menu.sarapan, mh.menu.makanSiang, mh.menu.makanMalam, ...(mh.menu.cemilan || [])].filter(Boolean);
      const daftar = await Resep.find({ _id: { $in: ids } });
      for (const r of daftar) {
        const k = r.nutrisiPerPorsi && (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal) ? (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal) : 0;
        totalKaloriMingguan += k;
      }
    }
    rencana.totalKaloriMingguan = Math.round(totalKaloriMingguan);
    await rencana.save();
    res.status(201).json({ sukses: true, data: rencana });
  } catch (err) {
    console.error('❌ Gagal buat rencana menu:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal membuat rencana menu' });
  }
};

const dapatkanRencanaMenu = async (req, res) => {
  try {
    const { idPengguna, tahun, mingguKe } = req.params;
    const rencana = await RencanaMenu.findOne({ pengguna: idPengguna, tahun: parseInt(tahun), mingguKe: parseInt(mingguKe) })
      .populate('menuMingguan.menu.sarapan menuMingguan.menu.makanSiang menuMingguan.menu.makanMalam');
    if (!rencana) return res.status(404).json({ sukses: false, pesan: 'Rencana menu tidak ditemukan' });
    res.json({ sukses: true, data: rencana });
  } catch (err) {
    console.error('❌ Gagal dapatkan rencana menu:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mendapatkan rencana menu' });
  }
};

const dapatkanDaftarBelanja = async (req, res) => {
  try {
    const rencana = await RencanaMenu.findById(req.params.id);
    if (!rencana) return res.status(404).json({ sukses: false, pesan: 'Rencana tidak ditemukan' });
    res.json({ sukses: true, data: rencana.daftarBelanja });
  } catch (err) {
    console.error('❌ Gagal dapatkan daftar belanja:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mendapatkan daftar belanja' });
  }
};

const updateStatusBelanja = async (req, res) => {
  try {
    const { id, indexItem } = req.params;
    const { sudahDibeli } = req.body;
    const rencana = await RencanaMenu.findById(id);
    if (!rencana) return res.status(404).json({ sukses: false, pesan: 'Rencana tidak ditemukan' });
    if (!rencana.daftarBelanja[indexItem]) return res.status(400).json({ sukses: false, pesan: 'Index item tidak valid' });
    rencana.daftarBelanja[indexItem].sudahDibeli = !!sudahDibeli;
    await rencana.save();
    res.json({ sukses: true, data: rencana.daftarBelanja[indexItem] });
  } catch (err) {
    console.error('❌ Gagal update status belanja:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal update status belanja' });
  }
};

const kirimEmailMenu = async (req, res) => {
  try {
    const { id } = req.params;
    let rencana = await RencanaMenu.findById(id).populate('pengguna', 'email namaLengkap');
    if (!rencana) return res.status(404).json({ sukses: false, pesan: 'Rencana tidak ditemukan' });
    // Mengisi resep agar kita memiliki daftar resep di email.
    await rencana.populate('menuMingguan.menu.sarapan menuMingguan.menu.makanSiang menuMingguan.menu.makanMalam');
    const hasil = await layananEmail.kirimEmailMenuMingguan(rencana.pengguna, rencana);
    if (hasil && hasil.messageId) {
      rencana.statusEmailTerkirim = true;
      await rencana.save();
      return res.json({ sukses: true, messageId: hasil.messageId });
    } else if (hasil && hasil.sukses) {
      rencana.statusEmailTerkirim = true;
      await rencana.save();
      return res.json({ sukses: true });
    } else {
      return res.status(500).json({ sukses: false, pesan: 'Gagal mengirim email', kesalahan: hasil ? hasil.kesalahan : 'unknown' });
    }
  } catch (err) {
    console.error('❌ Gagal kirim email menu:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengirim email' });
  }
};

const previewDaftarBelanja = async (req, res) => {
  try {
    const { menuMingguan } = req.body || {};
    if (!menuMingguan || !Array.isArray(menuMingguan)) return res.status(400).json({ sukses: false, pesan: 'menuMingguan diperlukan' });
    const rencanaTemp = new RencanaMenu({ menuMingguan });
    await rencanaTemp.hitungDaftarBelanja();
    res.json({ sukses: true, data: rencanaTemp.daftarBelanja });
  } catch (err) {
    console.error('❌ Gagal preview daftar belanja:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menghitung daftar belanja' });
  }
};

// Hapus item yang sudah ditandai dibeli dari sebuah rencana
const hapusItemSudahDibeli = async (req, res) => {
  try {
    const { id } = req.params;
    const rencana = await RencanaMenu.findById(id);
    if (!rencana) return res.status(404).json({ sukses: false, pesan: 'Rencana tidak ditemukan' });
    const before = (rencana.daftarBelanja || []).length;
    rencana.daftarBelanja = (rencana.daftarBelanja || []).filter((it) => !it.sudahDibeli);
    await rencana.save();
    const after = (rencana.daftarBelanja || []).length;
    res.json({ sukses: true, data: rencana.daftarBelanja, removed: before - after });
  } catch (err) {
    console.error('❌ Gagal hapus item sudah dibeli:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menghapus item' });
  }
};

// Hapus semua item dari daftarBelanja sebuah rencana (digunakan setelah konfirmasi pembelian)
const hapusSemuaDaftar = async (req, res) => {
  try {
    const { id } = req.params;
    const rencana = await RencanaMenu.findById(id);
    if (!rencana) return res.status(404).json({ sukses: false, pesan: 'Rencana tidak ditemukan' });
    const count = (rencana.daftarBelanja || []).length;
    rencana.daftarBelanja = [];
    await rencana.save();
    res.json({ sukses: true, removed: count });
  } catch (err) {
    console.error('❌ Gagal hapus semua item daftar belanja:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menghapus semua item' });
  }
};

// Hapus rencana yang lebih lama dari awal minggu ISO saat ini untuk pengguna (digunakan pada hari Senin)
const clearOldRencana = async (req, res) => {
  try {
    const { idPengguna } = req.params;
    // hitung awal minggu ini (Senin)
    const now = new Date();
    const day = now.getDay(); // 0 Sun .. 6 Sat
    const diffToMonday = day === 0 ? -6 : 1 - day; // if Sunday, go back 6 days
    const monday = new Date(now);
    monday.setHours(0,0,0,0);
    monday.setDate(now.getDate() + diffToMonday);

    const result = await RencanaMenu.deleteMany({ pengguna: idPengguna, tanggalSelesai: { $lt: monday } });
    res.json({ sukses: true, deletedCount: result.deletedCount || 0 });
  } catch (err) {
    console.error('❌ Gagal clear old rencana:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal membersihkan rencana lama' });
  }
};


const generateSaranMenu = async (req, res) => {
  try {
    // Generator sederhana: buat saran menu untuk 7 hari x 3 sajian (sarapan, makan siang, makan malam)
    // Dukung preferensi diet (mis. vegetarian) dan pilihan target kalori harian yang dimasukkan user
    const { pilihanDiet, targetKaloriHarian } = req.body || {};
    const jumlahDibutuhkan = 7 * 3; // jumlah resep yang dibutuhkan

    // filter awal berdasarkan preferensi (mis. vegetarian)
    let matchStage = {};
    if (pilihanDiet === 'vegetarian') {
      // Untuk vegetarian: pastikan resep yang dipilih tidak mengandung bahan daging/ikan/seafood
      // Mencari resep yang **tidak** menyebut bahan daging pada namaResep atau daftarBahan
      const meatRegex = /(daging|ayam|sapi|kambing|ikan|udang|seafood|dori|tuna|salmon|kerang|kepiting|lele|sosis|bakso)/i;
      matchStage = { $nor: [{ namaResep: meatRegex }, { 'daftarBahan.namaBahan': meatRegex }] };
    }

    // Jika user memberikan target kalori harian, hitung target per makan (perkiraan)
    let targetPerMakan = null;
    if (typeof targetKaloriHarian !== 'undefined' && targetKaloriHarian !== null) {
      const nilai = Number(targetKaloriHarian);
      if (!Number.isNaN(nilai) && nilai > 0) {
        targetPerMakan = nilai / 3; // perkiraan: 3 kali makan per hari
      }
    }

    let catatanPreferensi = null;
    let totalResep = await Resep.countDocuments(matchStage || {});

    // Jika tidak ada resep yang cocok untuk preferensi
    if (totalResep === 0 && Object.keys(matchStage).length) {
      // Jika preferensi vegetarian dan tidak ada resep vegetarian yang cocok, kembalikan pesan yang jelas (tidak fallback ke non-vegetarian)
      if (pilihanDiet === 'vegetarian') {
        return res.json({ sukses: false, pesan: 'Tidak ada resep vegetarian yang cocok di database', data: { menuMingguan: [] } });
      }

      // Untuk preferensi lain, fallback ke semua resep dan beri catatan
      const totalSemua = await Resep.countDocuments({});
      if (totalSemua === 0) return res.json({ sukses: false, pesan: 'Tidak ada resep yang cocok di database', data: { menuMingguan: [] } });
      matchStage = {};
      totalResep = totalSemua;
      catatanPreferensi = 'Preferensi diet tidak dapat dipenuhi dengan resep yang tersedia; menggunakan semua resep.';
    }

    let kandidat = [];

    if (targetPerMakan) {
      // Jika ada target per-makan, coba pilih resep yang kalorinya dekat dengan targetPerMakan
      const marginRelatif = 0.25; // +/- 25% awal
      const rendah = Math.max(0, Math.round(targetPerMakan * (1 - marginRelatif)));
      const tinggi = Math.round(targetPerMakan * (1 + marginRelatif));

      // cari resep yang memiliki data nutrisi dan kalori dalam rentang
      const cocok = await Resep.find({
        ...(matchStage || {}),
        $or: [
          { 'nutrisiPerPorsi.kalori': { $gte: rendah, $lte: tinggi } },
          { 'nutrisiPerPorsi.kcal': { $gte: rendah, $lte: tinggi } },
        ],
      }).lean();

      kandidat = kandidat.concat(cocok);

      // jika masih kurang, perluas margin secara bertahap sampai cukup
      let currentMargin = marginRelatif;
      while (kandidat.length < jumlahDibutuhkan && currentMargin <= 1.0) {
        currentMargin += 0.25; // tambah 25% lagi
        const low = Math.max(0, Math.round(targetPerMakan * (1 - currentMargin)));
        const high = Math.round(targetPerMakan * (1 + currentMargin));
        const tambahan = await Resep.find({
          ...(matchStage || {}),
          $or: [
            { 'nutrisiPerPorsi.kalori': { $gte: low, $lte: high } },
            { 'nutrisiPerPorsi.kcal': { $gte: low, $lte: high } },
          ],
        }).lean();
        // gabungkan unik
        const ids = new Set(kandidat.map((r) => String(r._id)));
        for (const t of tambahan) if (!ids.has(String(t._id))) kandidat.push(t);
        if (currentMargin >= 1.0) break;
      }

      // Jika setelah perluasan masih tidak ada kandidat (mis. tidak ada data nutrisi tersedia), fallback ke sample acak
      if (kandidat.length === 0) {
        catatanPreferensi = catatanPreferensi || 'Tidak ditemukan resep dengan data nutrisi yang cocok; menggunakan resep acak.';
        const pipelineSample = [];
        if (Object.keys(matchStage).length) pipelineSample.push({ $match: matchStage });
        pipelineSample.push({ $sample: { size: Math.min(jumlahDibutuhkan, Math.max(1, totalResep)) } });
        const sampelAcak = await Resep.aggregate(pipelineSample);
        kandidat = kandidat.concat(sampelAcak);
      }
    }

    // Jika belum cukup kandidat (atau tidak ada target kalori), lengkapi dengan sample acak dari pool yang sesuai
    if (kandidat.length < jumlahDibutuhkan) {
      // ambil sample acak dari resep yang sesuai dengan matchStage, kecuali yang sudah ada di kandidat
      const excludeIds = kandidat.map((r) => r._id);
      const pipeline = [];
      if (Object.keys(matchStage).length) pipeline.push({ $match: matchStage });
      if (excludeIds.length) pipeline.push({ $match: { _id: { $nin: excludeIds } } });
      pipeline.push({ $sample: { size: Math.min(jumlahDibutuhkan - kandidat.length, Math.max(1, totalResep)) } });
      const tambahanSample = await Resep.aggregate(pipeline);
      kandidat = kandidat.concat(tambahanSample);
    }

    // jika jumlah kandidat kurang dari dibutuhkan, ulangi isi ulang sederhana (jaga agar selalu ada cukup item)
    while (kandidat.length < jumlahDibutuhkan) kandidat.push(kandidat[kandidat.length % (kandidat.length || 1)]);

    // Susun menu dari kandidat (urutkan sederhana)
    const hariNames = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
    const menuMingguan = [];
    let idx = 0;

    for (let i = 0; i < 7; i++) {
      const sarapan = kandidat[idx];
      const makanSiang = kandidat[idx+1];
      const makanMalam = kandidat[idx+2];
      menuMingguan.push({
        hari: hariNames[i],
        menu: {
          sarapan: sarapan ? sarapan._id : null,
          makanSiang: makanSiang ? makanSiang._id : null,
          makanMalam: makanMalam ? makanMalam._id : null,
        },
        _populated: {
          sarapan: sarapan ? { _id: sarapan._id, namaResep: sarapan.namaResep, nutrisiPerPorsi: sarapan.nutrisiPerPorsi } : null,
          makanSiang: makanSiang ? { _id: makanSiang._id, namaResep: makanSiang.namaResep, nutrisiPerPorsi: makanSiang.nutrisiPerPorsi } : null,
          makanMalam: makanMalam ? { _id: makanMalam._id, namaResep: makanMalam.namaResep, nutrisiPerPorsi: makanMalam.nutrisiPerPorsi } : null,
        }
      });
      idx += 3;
    }

    // hitung ringkasan kalori per-hari jika data nutrisi tersedia
    const kaloriSummary = { perHari: [], totalMingguan: 0 };
    for (const h of menuMingguan) {
      const sKal = h._populated.sarapan && (h._populated.sarapan.nutrisiPerPorsi && (h._populated.sarapan.nutrisiPerPorsi.kalori || h._populated.sarapan.nutrisiPerPorsi.kcal)) ? (h._populated.sarapan.nutrisiPerPorsi.kalori || h._populated.sarapan.nutrisiPerPorsi.kcal) : 0;
      const siangKal = h._populated.makanSiang && (h._populated.makanSiang.nutrisiPerPorsi && (h._populated.makanSiang.nutrisiPerPorsi.kalori || h._populated.makanSiang.nutrisiPerPorsi.kcal)) ? (h._populated.makanSiang.nutrisiPerPorsi.kalori || h._populated.makanSiang.nutrisiPerPorsi.kcal) : 0;
      const malamKal = h._populated.makanMalam && (h._populated.makanMalam.nutrisiPerPorsi && (h._populated.makanMalam.nutrisiPerPorsi.kalori || h._populated.makanMalam.nutrisiPerPorsi.kcal)) ? (h._populated.makanMalam.nutrisiPerPorsi.kalori || h._populated.makanMalam.nutrisiPerPorsi.kcal) : 0;
      const totalHari = Math.round((sKal || 0) + (siangKal || 0) + (malamKal || 0));
      kaloriSummary.perHari.push({ hari: h.hari, totalHari });
      kaloriSummary.totalMingguan += totalHari;
    }

    res.json({ sukses: true, data: { menuMingguan, kaloriSummary }, keterangan: catatanPreferensi });
  } catch (err) {
    console.error('❌ Gagal generate saran menu:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal generate saran menu' });
  }
};

module.exports = { buatRencanaMenu, dapatkanRencanaMenu, dapatkanDaftarBelanja, updateStatusBelanja, kirimEmailMenu, generateSaranMenu, previewDaftarBelanja, hapusItemSudahDibeli, hapusSemuaDaftar, clearOldRencana };