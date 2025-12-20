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
    const rencana = await RencanaMenu.findById(id).populate('pengguna', 'email namaLengkap');
    if (!rencana) return res.status(404).json({ sukses: false, pesan: 'Rencana tidak ditemukan' });
    const hasil = await layananEmail.kirimEmailMenuMingguan(rencana.pengguna, rencana);
    if (hasil.sukses) {
      rencana.statusEmailTerkirim = true;
      await rencana.save();
      return res.json({ sukses: true, messageId: hasil.messageId });
    } else {
      return res.status(500).json({ sukses: false, pesan: 'Gagal mengirim email', kesalahan: hasil.kesalahan });
    }
  } catch (err) {
    console.error('❌ Gagal kirim email menu:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengirim email' });
  }
};

const generateSaranMenu = async (req, res) => {
  try {
    // Simple heuristic generator: ambil sampel resep dari database untuk 7 hari x 3 sajian
    const jumlahDibutuhkan = 7 * 3; // sarapan, makanSiang, makanMalam per hari
    const totalResep = await Resep.countDocuments();
    if (totalResep === 0) return res.json({ sukses: false, pesan: 'Tidak ada resep di database', data: { menuMingguan: [] } });

    // gunakan aggregation $sample untuk ambil acak
    const sampel = await Resep.aggregate([{ $sample: { size: Math.min(jumlahDibutuhkan, totalResep) } }]);
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
          sarapan: sarapan ? { _id: sarapan._id, namaResep: sarapan.namaResep } : null,
          makanSiang: makanSiang ? { _id: makanSiang._id, namaResep: makanSiang.namaResep } : null,
          makanMalam: makanMalam ? { _id: makanMalam._id, namaResep: makanMalam.namaResep } : null,
        }
      });
      idx += 3;
    }

    res.json({ sukses: true, data: { menuMingguan } });
  } catch (err) {
    console.error('❌ Gagal generate saran menu:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal generate saran menu' });
  }
};

module.exports = { buatRencanaMenu, dapatkanRencanaMenu, dapatkanDaftarBelanja, updateStatusBelanja, kirimEmailMenu, generateSaranMenu };