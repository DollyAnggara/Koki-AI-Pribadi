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
    // Placeholder: integrasikan LLM untuk rekomendasi
    res.json({ sukses: true, data: { saran: 'Generate menu AI belum diaktifkan' } });
  } catch (err) {
    console.error('❌ Gagal generate saran menu:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal generate saran menu' });
  }
};

module.exports = { buatRencanaMenu, dapatkanRencanaMenu, dapatkanDaftarBelanja, updateStatusBelanja, kirimEmailMenu, generateSaranMenu };