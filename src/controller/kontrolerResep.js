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
    const filter = {};
    // by default show only approved to normal users
    if (!(req.session && req.session.user && req.session.user.isAdmin)) {
      filter.status = 'approved';
    } else {
      // admins can pass ?filter=pending to see pending submissions
      if (req.query.filter === 'pending') filter.status = 'pending';
      else if (req.query.filter === 'approved') filter.status = 'approved';
      // else leave undefined to see all
    }

    let resep;
    if (q) {
      // escape regex special chars
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(esc, "i");
      resep = await Resep.find(Object.assign({ namaResep: regex }, filter)).limit(200);
    } else {
      resep = await Resep.find(filter).limit(200);
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
    const resep = await Resep.findById(req.params.id).populate('submittedBy','namaPengguna email');
    if (!resep)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Resep tidak ditemukan" });

    // if recipe is not approved, only allow owner or admin to view
    if (resep.status && resep.status !== 'approved') {
      const isOwner = req.session && req.session.user && (String(req.session.user._id || req.session.user.id) === String(resep.submittedBy && resep.submittedBy._id));
      const isAdmin = req.session && req.session.user && req.session.user.isAdmin;
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ sukses: false, pesan: 'Resep ini sedang menunggu moderasi' });
      }
    }

    // Hitung nutrisi jika belum ada
    if (!resep.nutrisiPerPorsi || !resep.nutrisiPerPorsi.kalori) {
      const hasil = layananNutrisi.hitungNutrisiResep(
        resep.daftarBahan || [],
        resep.porsi || 1
      ) || { nutrisiPerPorsi: { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0 } };
      resep.nutrisiPerPorsi = hasil.nutrisiPerPorsi || { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0 };
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
      ) || { nutrisiPerPorsi: { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0 } };
      data.nutrisiPerPorsi = nutr.nutrisiPerPorsi || { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0 };
    }

    // If a logged-in user creates a recipe and is not admin, mark as pending for moderation
    if (req.session && req.session.user) {
      data.submittedBy = req.session.user._id || req.session.user.id;
      if (!req.session.user.isAdmin) {
        data.status = 'pending';
      } else {
        data.status = data.status || 'approved';
      }
    } else {
      // anonymous submissions are pending
      data.status = 'pending';
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
      ) || { nutrisiPerPorsi: { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0 } };
      data.nutrisiPerPorsi = nutr.nutrisiPerPorsi || { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0 };
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

/**
 * Masak resep: cek ketersediaan bahan pengguna lalu kurangi stok jika cukup (POST /api/resep/:id/masak)
 */
const masakResep = async (req, res) => {
  try {
    if (!req.session || !req.session.user)
      return res.status(401).json({ sukses: false, pesan: 'Autentikasi diperlukan' });
    const userId = req.session.user._id || req.session.user.id;
    const resep = await Resep.findById(req.params.id);
    if (!resep) return res.status(404).json({ sukses: false, pesan: 'Resep tidak ditemukan' });

    const Bahan = require('../models/Bahan');

    // helpers to normalize units and convert to canonical amounts (grams/ml)
    const normalizeUnit = (u) => {
      if (!u) return '';
      const x = String(u).trim().toLowerCase();
      if (x === 'g' || x === 'gram' || x === 'gramme') return 'gram';
      if (x === 'kg' || x === 'kilogram') return 'kg';
      if (x === 'ml' || x === 'milliliter') return 'ml';
      if (x === 'l' || x === 'liter' || x === 'litre') return 'liter';
      if (x === 'butir' || x === 'potong' || x === 'buah') return x;
      return x;
    };
    const toCanonical = (jumlah, satuan) => {
      const u = normalizeUnit(satuan);
      if (u === 'kg') return { amount: (Number(jumlah) || 0) * 1000, unit: 'gram' };
      if (u === 'gram') return { amount: (Number(jumlah) || 0) * 1, unit: 'gram' };
      if (u === 'liter') return { amount: (Number(jumlah) || 0) * 1000, unit: 'ml' };
      if (u === 'ml') return { amount: (Number(jumlah) || 0) * 1, unit: 'ml' };
      return { amount: Number(jumlah) || 0, unit: u || '' };
    };
    const canonicalToPantry = (amountCanon, pantryUnit) => {
      const u = normalizeUnit(pantryUnit);
      if (u === 'kg') return amountCanon / 1000;
      if (u === 'gram') return amountCanon;
      if (u === 'liter') return amountCanon / 1000;
      if (u === 'ml') return amountCanon;
      return amountCanon;
    };

    // load user's pantry
    const pantry = await Bahan.find({ pemilik: userId, statusAktif: true }).sort({ jumlahTersedia: -1 });

    const missing = [];
    const recipeBahan = resep.daftarBahan || [];

    // Determine portion scaling
    const requestedPorsi = Number(req.body.porsi || 1) || 1;
    const basePorsi = Number(resep.porsi || 1) || 1;
    const scale = requestedPorsi / basePorsi;

    // First pass: detect shortages
    for (const b of recipeBahan) {
      const nama = b.namaBahan || b.nama || '';
      const reqJumlahRaw = (Number(b.jumlah) || 0) * scale;
      const reqSatuan = b.satuan || '';

      const rx = new RegExp((nama || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matches = pantry.filter((p) => rx.test(p.namaBahan || ''));

      if (!reqJumlahRaw || reqJumlahRaw === 0) {
        // presence check
        if (!matches.length) missing.push({ namaBahan: nama, alasan: 'Tidak ada di pantry' });
        continue;
      }

      const reqCanon = toCanonical(Number(reqJumlahRaw) || 0, reqSatuan);
      let sumAvailable = 0;
      for (const m of matches) {
        const availCanon = toCanonical(Number(m.jumlahTersedia || 0), m.satuan);
        if (availCanon.unit && reqCanon.unit && availCanon.unit === reqCanon.unit) sumAvailable += availCanon.amount;
      }
      if (sumAvailable < (reqCanon.amount || 0)) {
        const needed = (reqCanon.amount || 0) - sumAvailable;
        let displayAmount = needed;
        let displayUnit = reqCanon.unit;
        if (displayUnit === 'gram' && displayAmount >= 1000) {
          displayAmount = Math.round((displayAmount / 1000) * 100) / 100;
          displayUnit = 'kg';
        } else if (displayUnit === 'ml' && displayAmount >= 1000) {
          displayAmount = Math.round((displayAmount / 1000) * 100) / 100;
          displayUnit = 'liter';
        } else {
          displayAmount = Math.round(displayAmount * 100) / 100;
        }
        missing.push({ namaBahan: nama, jumlah: displayAmount, satuan: displayUnit });
      }
    }

    if (missing.length) {
      // If caller requested a preview, return missing list without failing the request
      if (req.body && req.body.preview) {
        return res.json({ sukses: true, missing });
      }
      return res.status(400).json({ sukses: false, pesan: 'Bahan tidak mencukupi', missing });
    }

    // If preview mode requested, and there are no missing ingredients, do NOT alter pantry.
    if (req.body && req.body.preview) {
      // Return simulated success and list of ingredients that would be consumed
      const simulated = recipeBahan.map(b => ({ namaBahan: b.namaBahan || b.nama || '', jumlah: (Number(b.jumlah)||0) * scale, satuan: b.satuan || '' }));
      return res.json({ sukses: true, pesan: 'Preview masak — stok tidak dikurangi', simulated, preview: true });
    }

    // Second pass: perform decrements (apply same portion scaling as first pass)
    for (const b of recipeBahan) {
      const nama = b.namaBahan || b.nama || '';
      const reqJumlahRaw = (Number(b.jumlah) || 0) * scale; // APPLY SCALE HERE
      const reqSatuan = b.satuan || '';
      if (!reqJumlahRaw || reqJumlahRaw === 0) continue; // nothing to decrement

      const reqCanon = toCanonical(Number(reqJumlahRaw) || 0, reqSatuan);
      let remaining = reqCanon.amount;

      const rx = new RegExp((nama || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matches = pantry.filter((p) => rx.test(p.namaBahan || '')).sort((a,b)=> (Number(b.jumlahTersedia||0) - Number(a.jumlahTersedia||0)));

      for (const m of matches) {
        if (remaining <= 0) break;
        const availCanon = toCanonical(Number(m.jumlahTersedia || 0), m.satuan);
        if (!availCanon.unit || !reqCanon.unit || availCanon.unit !== reqCanon.unit) continue; // skip incompatible
        const take = Math.min(availCanon.amount, remaining);
        const deltaInPantryUnit = canonicalToPantry(take, m.satuan);
        const newJumlah = Number(m.jumlahTersedia || 0) - deltaInPantryUnit;
        // update database
        await Bahan.findByIdAndUpdate(m._id, { jumlahTersedia: Math.max(0, Math.round(newJumlah * 100) / 100) });
        remaining -= take;
      }
    }
    // remove any items that became empty or already expired
    let hapusCount = 0;
    try {
      const hapusResult = await Bahan.deleteMany({ pemilik: userId, $or: [ { jumlahTersedia: { $lte: 0 } }, { tanggalKadaluarsa: { $lt: new Date() } } ] });
      hapusCount = hapusResult && hapusResult.deletedCount ? hapusResult.deletedCount : 0;
      if (hapusCount) console.log(`🗑️ Dihapus ${hapusCount} bahan (habis/kadaluarsa) setelah memasak oleh user=${userId}`);
    } catch (e) {
      console.warn('❌ Gagal hapus bahan habis/kadaluarsa:', e.message || e);
    }
    return res.json({ sukses: true, pesan: 'Resep dimasak, bahan berhasil dikurangi dari pantry', dihapus: hapusCount });
  } catch (err) {
    console.error('❌ Gagal proses masak resep:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal memproses masak resep' });
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
  masakResep,
};
