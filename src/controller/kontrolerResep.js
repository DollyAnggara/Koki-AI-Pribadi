/**
 * src/controller/kontrolerResep.js
 * Controller untuk operasi CRUD Resep dan fitur terkait
 */

const Resep = require('../models/Resep');
const layananNutrisi = require('../utils/layananNutrisi');
const layananChatBot = require('../utils/layananChatBot');

/**
 * Dapatkan semua resep (GET /api/resep)
 */
const dapatkanSemuaResep = async (req, res) => {
  try {
    const resep = await Resep.find().limit(200);
    res.json({ sukses: true, data: resep });
  } catch (err) {
    console.error('❌ Gagal dapatkan semua resep:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengambil resep' });
  }
};

/**
 * Dapatkan resep berdasarkan ID (GET /api/resep/:id)
 */
const dapatkanResepById = async (req, res) => {
  try {
    const resep = await Resep.findById(req.params.id);
    if (!resep) return res.status(404).json({ sukses: false, pesan: 'Resep tidak ditemukan' });
    // Hitung nutrisi jika belum ada
    if (!resep.nutrisiPerPorsi || !resep.nutrisiPerPorsi.kalori) {
      const hasil = layananNutrisi.hitungNutrisiResep(resep.daftarBahan || [], resep.porsi || 1);
      resep.nutrisiPerPorsi = hasil.nutrisiPerPorsi;
      await resep.save();
    }
    res.json({ sukses: true, data: resep });
  } catch (err) {
    console.error('❌ Gagal dapatkan resep by id:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengambil detail resep' });
  }
};

/**
 * Buat resep baru (POST /api/resep)
 */
const buatResepBaru = async (req, res) => {
  try {
    const data = req.body;
    if (data.daftarBahan && data.daftarBahan.length) {
      const nutr = layananNutrisi.hitungNutrisiResep(data.daftarBahan, data.porsi || 1);
      data.nutrisiPerPorsi = nutr.nutrisiPerPorsi;
    }
    const resepBaru = new Resep(data);
    await resepBaru.save();
    res.status(201).json({ sukses: true, data: resepBaru });
  } catch (err) {
    console.error('❌ Gagal buat resep baru:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal membuat resep', kesalahan: err.message });
  }
};

/**
 * Perbarui resep (PUT /api/resep/:id)
 */
const perbaruiResep = async (req, res) => {
  try {
    const data = req.body;
    if (data.daftarBahan) {
      const nutr = layananNutrisi.hitungNutrisiResep(data.daftarBahan, data.porsi || 1);
      data.nutrisiPerPorsi = nutr.nutrisiPerPorsi;
    }
    const resep = await Resep.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!resep) return res.status(404).json({ sukses: false, pesan: 'Resep tidak ditemukan' });
    res.json({ sukses: true, data: resep });
  } catch (err) {
    console.error('❌ Gagal perbarui resep:', err);
    res.status(400).json({ sukses: false, pesan: 'Gagal memperbarui resep', kesalahan: err.message });
  }
};

/**
 * Hapus resep (DELETE /api/resep/:id)
 */
const hapusResep = async (req, res) => {
  try {
    const hasil = await Resep.findByIdAndDelete(req.params.id);
    if (!hasil) return res.status(404).json({ sukses: false, pesan: 'Resep tidak ditemukan' });
    res.json({ sukses: true, pesan: 'Resep dihapus' });
  } catch (err) {
    console.error('❌ Gagal hapus resep:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menghapus resep' });
  }
};

/**
 * Cari resep berdasarkan bahan (POST /api/resep/cari-dengan-bahan)
 */
const cariResepDenganBahan = async (req, res) => {
  try {
    const { daftarBahan = [], minimumKecocokan = 50 } = req.body;
    if (!daftarBahan.length) return res.status(400).json({ sukses: false, pesan: 'Daftar bahan harus diisi' });

    const semua = await Resep.find();
    const hasil = semua.map(r => {
      const bahanResep = (r.daftarBahan || []).map(b => b.namaBahan.toLowerCase());
      let cocok = 0;
      for (const b of daftarBahan.map(x => x.toLowerCase())) {
        if (bahanResep.some(br => br.includes(b) || b.includes(br))) cocok++;
      }
      const persen = Math.round((cocok / (bahanResep.length || 1)) * 100);
      const bahanKurang = (r.daftarBahan || []).filter(b => !daftarBahan.map(x=>x.toLowerCase()).some(d => b.namaBahan.toLowerCase().includes(d)));
      return { resep: r, persentaseKecocokan: persen, bahanKurang: bahanKurang.map(x=>x.namaBahan) };
    }).filter(x => x.persentaseKecocokan >= minimumKecocokan).sort((a,b) => b.persentaseKecocokan - a.persentaseKecocokan);

    res.json({ sukses: true, data: hasil });
  } catch (err) {
    console.error('❌ Gagal cari resep dengan bahan:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mencari resep' });
  }
};

/**
 * Dapatkan saran resep dari AI (placeholder)
 */
const dapatkanSaranResepAI = async (req, res) => {
  try {
    const { daftarBahan = [], preferensi = {} } = req.body;
    // Gunakan layananChatBot atau layananAI nyata untuk hasil lebih baik
    const saran = `Saran (placeholder) berdasarkan: ${daftarBahan.join(', ')}`;
    res.json({ sukses: true, data: { saran } });
  } catch (err) {
    console.error('❌ Gagal saran AI:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mendapatkan saran AI' });
  }
};

/**
 * Hitung nutrisi endpoint (POST /api/resep/hitung-nutrisi)
 */
const hitungNutrisi = async (req, res) => {
  try {
    const { daftarBahan, jumlahPorsi = 1 } = req.body;
    if (!daftarBahan || !daftarBahan.length) return res.status(400).json({ sukses: false, pesan: 'Daftar bahan harus diisi' });
    const hasil = layananNutrisi.hitungNutrisiResep(daftarBahan, jumlahPorsi);
    res.json({ sukses: true, data: hasil });
  } catch (err) {
    console.error('❌ Gagal hitung nutrisi:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal menghitung nutrisi' });
  }
};

module.exports = {
  dapatkanSemuaResep, dapatkanResepById, buatResepBaru, perbaruiResep, hapusResep,
  cariResepDenganBahan, dapatkanSaranResepAI, hitungNutrisi
};