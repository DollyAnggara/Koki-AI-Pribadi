/**
 * src/controller/kontrolerResep.js
 * Controller untuk operasi CRUD Resep dan fitur terkait
 */

const Resep = require("../models/Resep");
const layananNutrisi = require("../utils/layananNutrisi");
const layananChatBot = require("../utils/layananChatBot");

/**
 * Dapatkan semua resep (GET /api/resep)
 * Supports optional query param `q` to search by recipe name (case-insensitive)
 */
const dapatkanSemuaResep = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    let resep;
    if (q) {
      // escape regex special chars
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(esc, "i");
      resep = await Resep.find({ namaResep: regex }).limit(200);
    } else {
      resep = await Resep.find().limit(200);
    }
    res.json({ sukses: true, data: resep });
  } catch (err) {
    console.error("❌ Gagal dapatkan semua resep:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal mengambil resep" });
  }
};

/**
 * Dapatkan resep berdasarkan ID (GET /api/resep/:id)
 */
const dapatkanResepById = async (req, res) => {
  try {
    const resep = await Resep.findById(req.params.id);
    if (!resep)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Resep tidak ditemukan" });
    // Hitung nutrisi jika belum ada
    if (!resep.nutrisiPerPorsi || !resep.nutrisiPerPorsi.kalori) {
      const hasil = layananNutrisi.hitungNutrisiResep(
        resep.daftarBahan || [],
        resep.porsi || 1
      );
      resep.nutrisiPerPorsi = hasil.nutrisiPerPorsi;
      await resep.save();
    }
    res.json({ sukses: true, data: resep });
  } catch (err) {
    console.error("❌ Gagal dapatkan resep by id:", err);
    res
      .status(500)
      .json({ sukses: false, pesan: "Gagal mengambil detail resep" });
  }
};

/**
 * Buat resep baru (POST /api/resep)
 */
const buatResepBaru = async (req, res) => {
  try {
    const data = req.body;
    if (data.daftarBahan && data.daftarBahan.length) {
      const nutr = layananNutrisi.hitungNutrisiResep(
        data.daftarBahan,
        data.porsi || 1
      );
      data.nutrisiPerPorsi = nutr.nutrisiPerPorsi;
    }
    const resepBaru = new Resep(data);
    await resepBaru.save();
    res.status(201).json({ sukses: true, data: resepBaru });
  } catch (err) {
    console.error("❌ Gagal buat resep baru:", err);
    res
      .status(400)
      .json({
        sukses: false,
        pesan: "Gagal membuat resep",
        kesalahan: err.message,
      });
  }
};

/**
 * Perbarui resep (PUT /api/resep/:id)
 */
const perbaruiResep = async (req, res) => {
  try {
    const data = req.body;
    if (data.daftarBahan) {
      const nutr = layananNutrisi.hitungNutrisiResep(
        data.daftarBahan,
        data.porsi || 1
      );
      data.nutrisiPerPorsi = nutr.nutrisiPerPorsi;
    }
    const resep = await Resep.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    });
    if (!resep)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Resep tidak ditemukan" });
    res.json({ sukses: true, data: resep });
  } catch (err) {
    console.error("❌ Gagal perbarui resep:", err);
    res
      .status(400)
      .json({
        sukses: false,
        pesan: "Gagal memperbarui resep",
        kesalahan: err.message,
      });
  }
};

/**
 * Hapus resep (DELETE /api/resep/:id)
 */
const hapusResep = async (req, res) => {
  try {
    const hasil = await Resep.findByIdAndDelete(req.params.id);
    if (!hasil)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Resep tidak ditemukan" });
    res.json({ sukses: true, pesan: "Resep dihapus" });
  } catch (err) {
    console.error("❌ Gagal hapus resep:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal menghapus resep" });
  }
};

/**
 * Cari resep berdasarkan bahan (POST /api/resep/cari-dengan-bahan)
 */
const cariResepDenganBahan = async (req, res) => {
  try {
    const { daftarBahan = [], minimumKecocokan = 50 } = req.body;
    if (!daftarBahan.length)
      return res
        .status(400)
        .json({ sukses: false, pesan: "Daftar bahan harus diisi" });

    // helper: normalize names (lowercase, remove punctuation/diacritics)
    const normalizeName = (s) =>
      String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const searchTerms = daftarBahan
      .map((d) => normalizeName(d))
      .filter((x) => x && x.length >= 2);

    const semua = await Resep.find();
    const hasil = semua
      .map((r) => {
        const daftarNama = (r.daftarBahan || []).map((b) => normalizeName(b.namaBahan || ''));
        // combine into single string for regex whole-word matching
        const combined = daftarNama.join(' ');

        let cocok = 0;
        for (const term of searchTerms) {
          const re = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
          if (re.test(combined)) cocok++;
        }

        const persen = Math.round((cocok / (daftarNama.length || 1)) * 100);

        const bahanKurang = (r.daftarBahan || []).filter((b) => {
          const nm = normalizeName(b.namaBahan || '');
          // consider as present if any search term matches whole word in nm
          return !searchTerms.some((term) => {
            const re = new RegExp('\\b' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
            return re.test(nm);
          });
        });

        return {
          resep: r,
          persentaseKecocokan: persen,
          bahanKurang: bahanKurang.map((x) => x.namaBahan),
        };
      })
      .map((x) => {
        // optionally augment with debug info about matches
        if (req.query.debug === '1') {
          const daftarNama = (x.resep.daftarBahan || []).map((b) => normalizeName(b.namaBahan || ''));
          const matched = searchTerms.filter((term) => daftarNama.some((d) => new RegExp('\\b' + term.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\b').test(d)));
          return Object.assign({}, x, { matchedTerms: matched });
        }
        return x;
      })
      .filter((x) => x.persentaseKecocokan >= minimumKecocokan)
      .sort((a, b) => b.persentaseKecocokan - a.persentaseKecocokan);

    if (req.query.debug === '1') console.log('[DEBUG] cariResepDenganBahan - searchTerms=', searchTerms, 'resultsCount=', hasil.length);

    res.json({ sukses: true, data: hasil });
  } catch (err) {
    console.error("❌ Gagal cari resep dengan bahan:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal mencari resep" });
  }
};

/**
 * Dapatkan saran resep dari AI (placeholder)
 */
const dapatkanSaranResepAI = async (req, res) => {
  try {
    const { daftarBahan = [], preferensi = {} } = req.body;
    const hasil = await layananChatBot.saranResep(daftarBahan, preferensi);
    if (!hasil.sukses) return res.status(500).json({ sukses: false, pesan: hasil.pesan || 'AI gagal menghasilkan saran' });
    res.json({ sukses: true, data: hasil.data });
  } catch (err) {
    console.error("❌ Gagal saran AI:", err);
    res
      .status(500)
      .json({ sukses: false, pesan: "Gagal mendapatkan saran AI" });
  }
};

/**
 * Hitung nutrisi endpoint (POST /api/resep/hitung-nutrisi)
 */
const hitungNutrisi = async (req, res) => {
  try {
    const { daftarBahan, jumlahPorsi = 1 } = req.body;
    if (!daftarBahan || !daftarBahan.length)
      return res
        .status(400)
        .json({ sukses: false, pesan: "Daftar bahan harus diisi" });
    const hasil = layananNutrisi.hitungNutrisiResep(daftarBahan, jumlahPorsi);
    res.json({ sukses: true, data: hasil });
  } catch (err) {
    console.error("❌ Gagal hitung nutrisi:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal menghitung nutrisi" });
  }
};

module.exports = {
  dapatkanSemuaResep,
  dapatkanResepById,
  buatResepBaru,
  perbaruiResep,
  hapusResep,
  cariResepDenganBahan,
  dapatkanSaranResepAI,
  hitungNutrisi,
};
