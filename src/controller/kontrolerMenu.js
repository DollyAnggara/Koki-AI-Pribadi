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
    // compute total kalori mingguan (if resep nutrisi tersedia)
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
    // populate recipes so we have names in email
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

// Remove items marked already purchased from a rencana
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

// Remove all items from a rencana's daftarBelanja (used after confirming purchases)
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

// Clear rencana older than the start of the current ISO week for a user (used on Mondays)
const clearOldRencana = async (req, res) => {
  try {
    const { idPengguna } = req.params;
    // compute start of current week (Monday)
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
    // Simple heuristic generator: ambil sampel resep dari database untuk 7 hari x 3 sajian
    const { pilihanDiet, targetKaloriHarian } = req.body || {};
    const jumlahDibutuhkan = 7 * 3; // sarapan, makanSiang, makanMalam per hari
    // If vegetarian requested, prefer vegetarian recipes (assume resep.kategori or resep.tags can indicate vegetarian)
    let matchStage = {};
    if (pilihanDiet === 'vegetarian') {
      matchStage = { kategori: /vegetarian/i };
    }

    const totalResep = await Resep.countDocuments(matchStage || {});
    if (totalResep === 0) return res.json({ sukses: false, pesan: 'Tidak ada resep yang cocok di database', data: { menuMingguan: [] } });

    // gunakan aggregation $sample untuk ambil acak (dengan filter jika ada)
    const pipeline = [];
    if (Object.keys(matchStage).length) pipeline.push({ $match: matchStage });
    pipeline.push({ $sample: { size: Math.min(jumlahDibutuhkan, totalResep) } });
    const sampel = await Resep.aggregate(pipeline);
    // jika jumlah resep kurang dari yang dibutuhkan, isi ulang dengan pengulangan sederhana
    while (sampel.length < jumlahDibutuhkan) sampel.push(sampel[sampel.length % sampel.length]);

    const hariNames = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
    const menuMingguan = [];
    let idx = 0;
    for (let i = 0; i < 7; i++) {
      const sarapan = sampel[idx];
      const makanSiang = sampel[idx+1];
      const makanMalam = sampel[idx+2];
      menuMingguan.push({
        hari: hariNames[i],
        menu: {
          sarapan: sarapan ? sarapan._id : null,
          makanSiang: makanSiang ? makanSiang._id : null,
          makanMalam: makanMalam ? makanMalam._id : null,
        },
        // include readable names for convenience on client
        _populated: {
          sarapan: sarapan ? { _id: sarapan._id, namaResep: sarapan.namaResep, nutrisiPerPorsi: sarapan.nutrisiPerPorsi } : null,
          makanSiang: makanSiang ? { _id: makanSiang._id, namaResep: makanSiang.namaResep, nutrisiPerPorsi: makanSiang.nutrisiPerPorsi } : null,
          makanMalam: makanMalam ? { _id: makanMalam._id, namaResep: makanMalam.namaResep, nutrisiPerPorsi: makanMalam.nutrisiPerPorsi } : null,
        }
      });
      idx += 3;
    }

    // compute calorie summary if nutrisi data exists
    const kaloriSummary = { perHari: [], totalMingguan: 0 };
    for (const h of menuMingguan) {
      const sKal = h._populated.sarapan && (h._populated.sarapan.nutrisiPerPorsi && (h._populated.sarapan.nutrisiPerPorsi.kalori || h._populated.sarapan.nutrisiPerPorsi.kcal)) ? (h._populated.sarapan.nutrisiPerPorsi.kalori || h._populated.sarapan.nutrisiPerPorsi.kcal) : 0;
      const siangKal = h._populated.makanSiang && (h._populated.makanSiang.nutrisiPerPorsi && (h._populated.makanSiang.nutrisiPerPorsi.kalori || h._populated.makanSiang.nutrisiPerPorsi.kcal)) ? (h._populated.makanSiang.nutrisiPerPorsi.kalori || h._populated.makanSiang.nutrisiPerPorsi.kcal) : 0;
      const malamKal = h._populated.makanMalam && (h._populated.makanMalam.nutrisiPerPorsi && (h._populated.makanMalam.nutrisiPerPorsi.kalori || h._populated.makanMalam.nutrisiPerPorsi.kcal)) ? (h._populated.makanMalam.nutrisiPerPorsi.kalori || h._populated.makanMalam.nutrisiPerPorsi.kcal) : 0;
      const totalHari = Math.round((sKal || 0) + (siangKal || 0) + (malamKal || 0));
      kaloriSummary.perHari.push({ hari: h.hari, totalHari });
      kaloriSummary.totalMingguan += totalHari;
    }

    res.json({ sukses: true, data: { menuMingguan, kaloriSummary } });
  } catch (err) {
    console.error('❌ Gagal generate saran menu:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal generate saran menu' });
  }
};

module.exports = { buatRencanaMenu, dapatkanRencanaMenu, dapatkanDaftarBelanja, updateStatusBelanja, kirimEmailMenu, generateSaranMenu, previewDaftarBelanja, hapusItemSudahDibeli, hapusSemuaDaftar, clearOldRencana };