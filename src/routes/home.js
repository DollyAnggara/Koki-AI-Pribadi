/**
 * src/routes/home.js  (sebelumnya courses.js)
 * Render halaman utama (index.hbs) — letakkan view di src/templates/views
 */

const express = require("express");
const router = express.Router();
const Resep = require("../models/Resep");

router.get("/", async (req, res) => {
  // Jika pengguna belum terautentikasi, tampilkan halaman publik (landing/intro)
  if (!req.session || !req.session.user) {
    return res.render("landing", {
      judul: "Selamat Datang - Koki AI Pribadi",
      isLanding: true,
    });
  }

  // Pengguna yang terautentikasi melihat dashboard beranda
  try {
    const penggunaId =
      req.session.user && (req.session.user._id || req.session.user.id);

    // Fetch recent recipes for display
    const daftarResep = await Resep.find().limit(12);

    // Require model secara malas untuk menghindari circular require saat modul dimuat
    const Bahan = require("../models/Bahan");
    const Pengguna = require("../models/Pengguna");

    // Hitung statistik dashboard (per-pengguna bila berlaku)
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

    // Render view 'beranda' terpisah beserta statistik
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

// Halaman publik informatif
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

// Pertahankan rute /beranda agar tetap berfungsi secara eksplisit
router.get("/beranda", async (req, res) => {
  // Redirect ke root yang mengandung logika sama (root memerlukan auth dan merender beranda)
  return res.redirect("/");
});

// Rute eksplisit opsional agar tautan ke /beranda bekerja
router.get("/beranda", (req, res) => res.redirect("/"));

module.exports = router;
