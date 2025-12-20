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
        langkahDisplay
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
