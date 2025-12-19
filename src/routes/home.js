/**
 * src/routes/home.js  (sebelumnya courses.js)
 * Render halaman utama (index.hbs) — letakkan view di src/templates/views
 */

const express = require("express");
const router = express.Router();
const Resep = require("../models/Resep");

router.get("/", async (req, res) => {
  // If user is not authenticated, show the public landing page (intro)
  if (!req.session || !req.session.user) {
    return res.render("landing", {
      judul: "Selamat Datang - Koki AI Pribadi",
      isLanding: true,
    });
  }

  // Authenticated users see the beranda dashboard
  try {
    const penggunaId =
      req.session.user && (req.session.user._id || req.session.user.id);

    // Fetch recent recipes for display
    const daftarResep = await Resep.find().limit(12);

    // Lazy-require models to avoid circular requires at module load time
    const Bahan = require("../models/Bahan");
    const Pengguna = require("../models/Pengguna");

    // Compute dashboard stats (per-user where applicable)
    const totalBahan = penggunaId
      ? await Bahan.countDocuments({ pemilik: penggunaId, statusAktif: true })
      : 0;
    const bahanHampir = penggunaId
      ? await Bahan.dapatkanHampirKadaluarsa(penggunaId, 3)
      : [];
    const bahanKadaluarsa = Array.isArray(bahanHampir) ? bahanHampir.length : 0;
    const totalResep = await Resep.countDocuments();

    let resepFavorit = 0;
    if (penggunaId) {
      const pengguna = await Pengguna.findById(penggunaId).select(
        "resepFavorit"
      );
      resepFavorit = pengguna ? (pengguna.resepFavorit || []).length : 0;
    }

    // Render the standalone 'beranda' view with stats
    res.render("beranda", {
      judul: "Beranda - Koki AI Pribadi",
      resep: daftarResep,
      totalBahan,
      bahanKadaluarsa,
      totalResep,
      resepFavorit,
    });
  } catch (err) {
    console.error("Gagal render beranda:", err);
    res.render("beranda", {
      judul: "Beranda - Koki AI Pribadi",
      resep: [],
      totalBahan: 0,
      bahanKadaluarsa: 0,
      totalResep: 0,
      resepFavorit: 0,
      error: "Gagal memuat data",
    });
  }
});

// Public informational pages
router.get("/about", (req, res) => {
  return res.render("about", {
    judul: "Tentang - Koki AI Pribadi",
    isLanding: true,
  });
});

router.get("/contact", (req, res) => {
  return res.render("contact", {
    judul: "Kontak - Koki AI Pribadi",
    isLanding: true,
    success: req.query.success,
    error: req.query.error,
  });
});

// Keep /beranda route working explicitly
router.get("/beranda", async (req, res) => {
  // Redirect to root which contains same logic (root requires auth and renders beranda)
  return res.redirect("/");
});

// Optional explicit route so links to /beranda work
router.get("/beranda", (req, res) => res.redirect("/"));

module.exports = router;
