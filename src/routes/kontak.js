const express = require("express");
const router = express.Router();
const layananEmail = require("../utils/emailService");
const Pengguna = require("../models/Pengguna");

// POST /api/kontak
router.post("/", async (req, res) => {
  const { email, pesan } = req.body || {};
  if (!email || !pesan) {
    return res.redirect("/contact?error=Silakan lengkapi email dan pesan");
  }

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  // Pastikan email yang dikirim terdaftar sebagai pengguna
  try {
    const pengguna = await Pengguna.findOne({ email: normalizedEmail }).select(
      "_id email namaLengkap"
    );
    if (!pengguna) {
      return res.redirect(
        "/contact?error=Email tidak terdaftar. Gunakan email yang terdaftar pada akun Anda."
      );
    }

    console.log(
      `Kontak: menerima pesan dari ${normalizedEmail} (terdaftar, _id=${pengguna._id})`
    );

    await layananEmail.kirimPesanKontak(normalizedEmail, pesan);
    console.log(
      `Kontak: pesan dari ${normalizedEmail} berhasil dikirim ke pemilik`
    );
    return res.redirect("/contact?success=1");
  } catch (err) {
    console.error(
      "Gagal memproses pesan kontak:",
      err && err.message ? err.message : err
    );
    return res.redirect(
      "/contact?error=Gagal mengirim pesan. Silakan coba lagi nanti."
    );
  }
});

module.exports = router;
