/**
 * src/routes/home.js  (sebelumnya courses.js)
 * Render halaman utama (index.hbs) — letakkan view di src/templates/views
 */

const express = require("express");
const router = express.Router();
const Resep = require("../models/Resep");

router.get("/", async (req, res) => {
  // Redirect to login if user not authenticated. When auth is implemented, set `req.session.user` on login.
  if (!req.session || !req.session.user) return res.redirect("/login");

  try {
    const daftarResep = await Resep.find().limit(12);
    res.render("index", { judul: "Koki AI Pribadi", resep: daftarResep });
  } catch (err) {
    console.error("Gagal render home:", err);
    res.render("index", {
      judul: "Koki AI Pribadi",
      resep: [],
      error: "Gagal memuat data",
    });
  }
});

module.exports = router;
