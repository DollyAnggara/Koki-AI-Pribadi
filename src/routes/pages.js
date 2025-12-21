/**
 * src/routes/pages.js
 * Render per-page views (separate .hbs files for each main page)
 */
const express = require("express");
const router = express.Router();
const Resep = require("../models/Resep");

// Middleware: require auth for pages
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect("/login");
  next();
}

router.get('/resep/:id', requireAuth, async (req, res) => {
  try {
    const r = await Resep.findById(req.params.id);
    if (!r) return res.status(404).render('resep_detail', { judul: 'Resep Tidak Ditemukan', error: 'Resep tidak ditemukan' });
    const waktu = (r.waktuPersiapanMenit || 0) + (r.waktuMemasakMenit || 0);
    const kalori = r.nutrisiPerPorsi && (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal) ? r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal : null;
    // Build human-friendly displays to avoid dumping raw objects in templates
    const daftarRaw = r.daftarBahan || r.bahan || r.ingredients || [];
    const langkahRaw = r.langkah || r.steps || r.instruksi || [];

    const daftarBahanDisplay = (daftarRaw || []).map((it) => {
      if (!it) return '';
      if (typeof it === 'string') return it;
      // object-like
      const nama = it.namaBahan || it.nama || it.name || it.item || '';
      const jumlah = it.jumlah || it.qty || it.jumlahTersedia || '';
      const satuan = it.satuan || it.unit || '';
      const parts = [];
      if (nama) parts.push(String(nama));
      if (jumlah !== undefined && jumlah !== '') parts.push(`${jumlah}${satuan ? ' ' + satuan : ''}`);
      return parts.join(' - ');
    });

    const langkahDisplay = (langkahRaw || []).map((lk, idx) => {
      if (!lk) return '';
      if (typeof lk === 'string') return lk;
      const desc = lk.deskripsi || lk.text || lk.instruksi || lk.step || lk.title || '';
      const dur = lk.durasiMenit || lk.duration || '';
      const tips = lk.tips || lk.catatan || '';
      let s = `${desc}`;
      if (dur) s += ` (${dur} menit)`;
      if (tips) s += ` — Tips: ${tips}`;
      return s;
    });

    // If user logged in, compute which ingredients are missing from their pantry
    let missingIngredients = [];
    try {
      if (req.session && req.session.user && (req.session.user._id || req.session.user.id)) {
        const Bahan = require('../models/Bahan');
        const userId = req.session.user._id || req.session.user.id;

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
          if (u === 'kg') return { amount: (jumlah || 0) * 1000, unit: 'gram' };
          if (u === 'gram') return { amount: (jumlah || 0) * 1, unit: 'gram' };
          if (u === 'liter') return { amount: (jumlah || 0) * 1000, unit: 'ml' };
          if (u === 'ml') return { amount: (jumlah || 0) * 1, unit: 'ml' };
          return { amount: jumlah || 0, unit: u || '' };
        };

        // load user's active pantry items once
        const pantry = await Bahan.find({ pemilik: userId, statusAktif: true });

        for (const b of daftarRaw || []) {
          const nama = typeof b === 'string' ? b : (b.namaBahan || b.nama || b.name || '');
          const reqJumlahRaw = b && typeof b === 'object' ? (b.jumlah || b.qty || 0) : 0;
          const reqSatuan = b && typeof b === 'object' ? (b.satuan || b.unit || '') : '';

          // Find pantry matches by name contains (case-insensitive)
          const rx = new RegExp((nama || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          const matches = pantry.filter((p) => rx.test(p.namaBahan || ''));

          if (!reqJumlahRaw || reqJumlahRaw === 0) {
            // No quantity specified — just check presence
            if (!matches.length) missingIngredients.push({ namaBahan: nama, alasan: 'Tidak ada di daftar Bahan' });
            continue;
          }

          // Quantified: sum available canonical amount
          const reqCanon = toCanonical(Number(reqJumlahRaw) || 0, reqSatuan);
          let sumAvailable = 0;
          for (const m of matches) {
            const availableCanon = toCanonical(Number(m.jumlahTersedia || 0), m.satuan);
            if (availableCanon.unit && reqCanon.unit && availableCanon.unit === reqCanon.unit) sumAvailable += availableCanon.amount;
            // if units differ (e.g., pantry in kg and request in gram) toCanonical handles it
          }
          if (sumAvailable < (reqCanon.amount || 0)) {
            const needed = (reqCanon.amount || 0) - sumAvailable;
            // convert needed back to request unit for display
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
            missingIngredients.push({ namaBahan: nama, jumlah: displayAmount, satuan: displayUnit });
          }
        }
      }
    } catch (err) {
      console.warn('Gagal hitung bahan hilang untuk resep:', err);
    }

    res.render('resep_detail', {
      judul: r.namaResep,
      resep: {
        _id: r._id,
        nama: r.namaResep,
        deskripsi: r.deskripsi,
        waktu,
        kalori: kalori ? Math.round(kalori) : '-',
        daftarBahan: daftarRaw,
        langkah: langkahRaw,
        // formatted arrays for clean rendering
        daftarBahanDisplay,
        langkahDisplay,
        missingIngredients,
        // raw JSON for client-side use (safe copy)
        daftarBahanJSON: JSON.stringify(daftarRaw || []),
        missingIngredientsJSON: JSON.stringify(missingIngredients || [])
      }
    });
  } catch (err) {
    console.error('Gagal render detail resep:', err);
    res.status(500).render('resep_detail', { judul: 'Resep', resep: null, error: 'Gagal memuat resep' });
  }
});

router.get("/resep", requireAuth, async (req, res) => {
  try {
    const daftarResep = await Resep.find().limit(50);
    // Map fields to view-friendly shape used by templates
    const resepUntukView = daftarResep.map((r) => {
      const waktu = (r.waktuPersiapanMenit || 0) + (r.waktuMemasakMenit || 0);
      const kalori =
        r.nutrisiPerPorsi &&
        (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal)
          ? r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal
          : null;
      return {
        _id: r._id,
        nama: r.namaResep,
        deskripsi: r.deskripsi,
        waktu,
        kalori: kalori ? Math.round(kalori) : "-",
      };
    });
    res.render("resep", {
      judul: "Resep - Koki AI Pribadi",
      resep: resepUntukView,
    });
  } catch (err) {
    console.error("Gagal render resep:", err);
    res.render("resep", {
      judul: "Resep - Koki AI Pribadi",
      resep: [],
      error: "Gagal memuat resep",
    });
  }
});

router.get("/chat", requireAuth, (req, res) => {
  res.render("chat", { judul: "Chat - Koki AI Pribadi" });
});

router.get("/timer", requireAuth, (req, res) => {
  res.render("timer", { judul: "Timer - Koki AI Pribadi" });
});

router.get("/menu", requireAuth, (req, res) => {
  res.render("menu", { judul: "Menu Mingguan - Koki AI Pribadi" });
});

router.get("/bahan", requireAuth, async (req, res) => {
  try {
    const Bahan = require("../models/Bahan");
    const penggunaId =
      req.session.user && (req.session.user._id || req.session.user.id);
    const daftarBahan = penggunaId
      ? await Bahan.find({ pemilik: penggunaId }).sort({ namaBahan: 1 })
      : [];
    res.render("bahan", {
      judul: "Bahan Saya - Koki AI Pribadi",
      bahan: daftarBahan,
    });
  } catch (err) {
    console.error("Gagal render bahan:", err);
    res.render("bahan", {
      judul: "Bahan Saya - Koki AI Pribadi",
      bahan: [],
      error: "Gagal memuat bahan",
    });
  }
});

// pantry page (optional route)
router.get("/pantry", requireAuth, (req, res) => {
  res.render("pantry", { judul: "Pantry - Koki AI Pribadi" });
});

module.exports = router;
