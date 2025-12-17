/**
 * src/controller/kontrolerBahan.js
 * CRUD bahan + pantry challenge + identifikasi gambar
 */

const Bahan = require('../models/Bahan');
const layananVisi = require('../utils/layananVisi');

/**
 * GET /api/bahan
 * Query: idPengguna (opsional)
 */
const dapatkanSemuaBahan = async (req, res) => {
  try {
    const { idPengguna } = req.query;
    const filter = {};
    if (idPengguna) filter.pemilik = idPengguna;
    const daftar = await Bahan.find(filter).sort({ tanggalKadaluarsa: 1 });
    res.json({ sukses: true, data: daftar });
  } catch (err) {
    console.error('❌ Gagal dapatkan bahan:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mendapatkan daftar bahan' });
  }
};

/**
 * POST /api/bahan
 */
const tambahBahan = async (req, res) => {
  try {
    const data = req.body;
    if (data.tanggalKadaluarsa && new Date(data.tanggalKadaluarsa) < new Date()) {
      return res.status(400).json({ sukses: false, pesan: 'Tanggal kadaluarsa tidak boleh di masa lalu' });
    }
    const bahan = new Bahan(data);
    await bahan.save();
    res.status(201).json({ sukses: true, data: bahan });
  } catch (err) {
    console.error('❌ Gagal tambah bahan:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal menambahkan bahan', kesalahan: err.message });
  }
};

/**
 * PUT /api/bahan/:id
 */
const perbaruiBahan = async (req, res) => {
  try {
    const bahan = await Bahan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!bahan) return res.status(404).json({ sukses: false, pesan: 'Bahan tidak ditemukan' });
    res.json({ sukses: true, data: bahan });
  } catch (err) {
    console.error('❌ Gagal perbarui bahan:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal memperbarui bahan' });
  }
};

/**
 * PATCH /api/bahan/:id/kurangi
 */
const kurangiJumlahBahan = async (req, res) => {
  try {
    const { jumlahDikurangi = 0 } = req.body;
    const bahan = await Bahan.findById(req.params.id);
    if (!bahan) return res.status(404).json({ sukses: false, pesan: 'Bahan tidak ditemukan' });
    bahan.jumlahTersedia = Math.max(0, bahan.jumlahTersedia - jumlahDikurangi);
    if (bahan.jumlahTersedia === 0) bahan.statusAktif = false;
    await bahan.save();
    res.json({ sukses: true, data: bahan });
  } catch (err) {
    console.error('❌ Gagal kurangi jumlah bahan:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengurangi jumlah bahan' });
  }
};

/**
 * DELETE /api/bahan/:id
 */
const hapusBahan = async (req, res) => {
  try {
    const hasil = await Bahan.findByIdAndDelete(req.params.id);
    if (!hasil) return res.status(404).json({ sukses: false, pesan: 'Bahan tidak ditemukan' });
    res.json({ sukses: true, pesan: 'Bahan berhasil dihapus' });
  } catch (err) {
    console.error('❌ Gagal hapus bahan:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menghapus bahan' });
  }
};

/**
 * GET /api/bahan/pantry-challenge/:idPengguna
 */
const pantryChallenge = async (req, res) => {
  try {
    const { idPengguna } = req.params;
    const bahanHampir = await Bahan.dapatkanHampirKadaluarsa(idPengguna, 3);
    res.json({ sukses: true, data: { bahanHampirKadaluarsa: bahanHampir } });
  } catch (err) {
    console.error('❌ Gagal pantry challenge:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menjalankan pantry challenge' });
  }
};

/**
 * POST /api/bahan/identifikasi-gambar
 */
const identifikasiBahanDariGambar = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ sukses: false, pesan: 'Tidak ada gambar yang diupload' });
    const hasil = await layananVisi.identifikasiBahanDariBuffer(req.file.buffer, req.file.mimetype);
    res.json({ sukses: hasil.sukses, data: hasil.data, kesalahan: hasil.kesalahan });
  } catch (err) {
    console.error('❌ Gagal identifikasi gambar:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengidentifikasi gambar' });
  }
};

/**
 * POST /api/bahan/tambah-banyak
 */
const tambahBanyakBahan = async (req, res) => {
  try {
    const { daftarBahan = [], idPengguna } = req.body;
    if (!daftarBahan.length) return res.status(400).json({ sukses: false, pesan: 'Daftar bahan kosong' });
    const untukSimpan = daftarBahan.map(b => ({ ...b, pemilik: idPengguna }));
    const hasil = await Bahan.insertMany(untukSimpan, { ordered: false });
    res.status(201).json({ sukses: true, data: hasil });
  } catch (err) {
    console.error('❌ Gagal tambah banyak bahan:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal menambahkan bahan', kesalahan: err.message });
  }
};

/**
 * GET /api/bahan/statistik/:idPengguna
 */
const dapatkanStatistikBahan = async (req, res) => {
  try {
    const { idPengguna } = req.params;
    const total = await Bahan.countDocuments({ pemilik: idPengguna, statusAktif: true });
    const tanggal3Hari = new Date(); tanggal3Hari.setDate(tanggal3Hari.getDate() + 3);
    const hampir = await Bahan.countDocuments({ pemilik: idPengguna, statusAktif: true, tanggalKadaluarsa: { $gte: new Date(), $lte: tanggal3Hari } });
    res.json({ sukses: true, data: { totalBahanAktif: total, jumlahHampirKadaluarsa: hampir } });
  } catch (err) {
    console.error('❌ Gagal statistik bahan:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengambil statistik' });
  }
};

module.exports = {
  dapatkanSemuaBahan, tambahBahan, perbaruiBahan, kurangiJumlahBahan, hapusBahan,
  pantryChallenge, identifikasiBahanDariGambar, tambahBanyakBahan, dapatkanStatistikBahan
};