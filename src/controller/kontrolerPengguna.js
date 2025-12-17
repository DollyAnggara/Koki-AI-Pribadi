/**
 * src/controller/kontrolerPengguna.js
 * Registrasi, login, profil, preferensi, favorit
 */

const Pengguna = require('../models/Pengguna');

const registrasiPengguna = async (req, res) => {
  try {
    const { namaPengguna, email, kataSandi, namaLengkap } = req.body;
    const sudah = await Pengguna.findOne({ $or: [{ email }, { namaPengguna }] });
    if (sudah) return res.status(400).json({ sukses: false, pesan: 'Email atau username sudah terdaftar' });
    const pengguna = new Pengguna({ namaPengguna, email, kataSandi, namaLengkap });
    await pengguna.save();
    const out = pengguna.toObject(); delete out.kataSandi;
    // If request is JSON (API), return JSON. If it is a normal form submit, redirect to login with a friendly message.
    if (req.is('application/json')) {
      return res.status(201).json({ sukses: true, data: out });
    }

    // assume form POST (browser): redirect to /login with success flag
    return res.redirect('/login?success=1');
  } catch (err) {
    console.error('❌ Gagal registrasi:', err);
    // If coming from a form, redirect back to register page with error message
    if (!req.is('application/json')) {
      const pesan = encodeURIComponent(err.message || 'Gagal registrasi');
      return res.redirect(`/register?error=${pesan}`);
    }
    res.status(400).json({ sukses: false, pesan: 'Gagal registrasi', kesalahan: err.message });
  }
};

const loginPengguna = async (req, res) => {
  try {
    const { email, kataSandi } = req.body;
    const pengguna = await Pengguna.findOne({ email, statusAktif: true });
    if (!pengguna || !pengguna.verifikasiKataSandi(kataSandi)) {
      if (!req.is('application/json')) return res.redirect('/login?error=' + encodeURIComponent('Email atau kata sandi salah'));
      return res.status(401).json({ sukses: false, pesan: 'Email atau kata sandi salah' });
    }

    // Successful login
    // Attach to session for browser form submissions
    if (!req.is('application/json')) {
      req.session.user = { id: pengguna._id, namaPengguna: pengguna.namaPengguna, email: pengguna.email };
      return res.redirect('/');
    }

    const out = pengguna.toObject(); delete out.kataSandi;
    res.json({ sukses: true, data: out });
  } catch (err) {
    console.error('❌ Gagal login:', err);
    if (!req.is('application/json')) return res.redirect('/login?error=' + encodeURIComponent('Gagal login'));
    res.status(500).json({ sukses: false, pesan: 'Gagal login' });
  }
};

const dapatkanProfil = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id).select('-kataSandi');
    if (!pengguna) return res.status(404).json({ sukses: false, pesan: 'Pengguna tidak ditemukan' });
    res.json({ sukses: true, data: pengguna });
  } catch (err) {
    console.error('❌ Gagal dapatkan profil:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mendapatkan profil' });
  }
};

const perbaruiProfil = async (req, res) => {
  try {
    const data = req.body; delete data.kataSandi;
    const pengguna = await Pengguna.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true }).select('-kataSandi');
    if (!pengguna) return res.status(404).json({ sukses: false, pesan: 'Pengguna tidak ditemukan' });
    res.json({ sukses: true, data: pengguna });
  } catch (err) {
    console.error('❌ Gagal perbarui profil:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal memperbarui profil' });
  }
};

const perbaruiPreferensiDiet = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna) return res.status(404).json({ sukses: false, pesan: 'Pengguna tidak ditemukan' });
    pengguna.preferensiDiet = { ...(pengguna.preferensiDiet || {}), ...(req.body || {}) };
    await pengguna.save();
    res.json({ sukses: true, data: pengguna.preferensiDiet });
  } catch (err) {
    console.error('❌ Gagal perbarui preferensi:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal memperbarui preferensi' });
  }
};

const perbaruiPengaturanNotifikasi = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna) return res.status(404).json({ sukses: false, pesan: 'Pengguna tidak ditemukan' });
    pengguna.pengaturanNotifikasi = { ...(pengguna.pengaturanNotifikasi || {}), ...(req.body || {}) };
    await pengguna.save();
    res.json({ sukses: true, data: pengguna.pengaturanNotifikasi });
  } catch (err) {
    console.error('❌ Gagal perbarui pengaturan:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal memperbarui pengaturan notifikasi' });
  }
};

const tambahResepFavorit = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna) return res.status(404).json({ sukses: false, pesan: 'Pengguna tidak ditemukan' });
    if (!pengguna.resepFavorit.includes(req.params.idResep)) pengguna.resepFavorit.push(req.params.idResep);
    await pengguna.save();
    res.json({ sukses: true, pesan: 'Resep ditambahkan ke favorit' });
  } catch (err) {
    console.error('❌ Gagal tambah favorit:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menambahkan favorit' });
  }
};

const hapusResepFavorit = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna) return res.status(404).json({ sukses: false, pesan: 'Pengguna tidak ditemukan' });
    pengguna.resepFavorit = pengguna.resepFavorit.filter(r => String(r) !== String(req.params.idResep));
    await pengguna.save();
    res.json({ sukses: true, pesan: 'Resep dihapus dari favorit' });
  } catch (err) {
    console.error('❌ Gagal hapus favorit:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menghapus favorit' });
  }
};

module.exports = {
  registrasiPengguna, loginPengguna, dapatkanProfil, perbaruiProfil,
  perbaruiPreferensiDiet, perbaruiPengaturanNotifikasi, tambahResepFavorit, hapusResepFavorit
};