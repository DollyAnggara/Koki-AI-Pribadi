const express = require("express");
const router = express.Router();
const Pengguna = require("../models/Pengguna");
const Resep = require("../models/Resep");
const Bahan = require("../models/Bahan");

// POST /api/debug/deepseek { prompt }
router.post("/deepseek", async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY)
    return res
      .status(400)
      .json({ sukses: false, pesan: "DEEPSEEK_API_KEY not configured" });

  // Require util Deepseek hanya saat provider dikonfigurasi.
  let panggilDeepseek, pingUrl;
  try {
    ({ panggilDeepseek, pingUrl } = require("../utils/layananDeepseek"));
  } catch (e) {
    console.error("Deepseek module not available:", e && e.stack ? e.stack : e);
    return res
      .status(500)
      .json({
        sukses: false,
        pesan: "Deepseek module not available on server",
      });
  }

  const prompt = req.body.prompt;
  if (!prompt)
    return res.status(400).json({ sukses: false, pesan: "Prompt required" });
  try {
    const includeRaw = req.query.raw === "1" || req.query.raw === "true";
    const maxTokens = req.body.maxTokens || 512;
    const timeoutMs = req.body.timeoutMs || 20000;
    const temperature =
      typeof req.body.temperature !== "undefined"
        ? Number(req.body.temperature)
        : 0.7;
    const extra = Object.assign({}, req.body.extra || {});
    if (req.body.model) extra.model = req.body.model;

    const opts = { maxTokens, timeoutMs, includeRaw, temperature, extra };
    // Ping diagnostik: /api/debug/deepseek?ping=1
    if (req.query.ping === "1" || req.query.ping === "true") {
      const diag = await pingUrl(timeoutMs);
      return res.json({ sukses: true, ping: diag });
    }

    const respon = await panggilDeepseek(prompt, opts);
    return res.json({ sukses: true, data: respon });
  } catch (err) {
    console.error("Deepseek test failed:", err && err.stack ? err.stack : err);
    const out = { sukses: false, pesan: err.message || "Deepseek error" };
    if (err.attempts)
      out.attempts = err.attempts.map((a) => ({
        url: a.url,
        ok: a.ok,
        message: a.error && a.error.message ? a.error.message : null,
      }));
    if (err.suggestion) out.suggestion = err.suggestion;
    return res.status(500).json(out);
  }
});

// GET /api/debug/db-stats - helper development untuk memeriksa jumlah
router.get("/db-stats", async (req, res) => {
  try {
    const [penggunaCount, resepCount, bahanCount] = await Promise.all([
      Pengguna.countDocuments(),
      Resep.countDocuments(),
      Bahan.countDocuments(),
    ]);
    return res.json({
      sukses: true,
      data: { pengguna: penggunaCount, resep: resepCount, bahan: bahanCount },
    });
  } catch (err) {
    console.error("DB stats failed:", err);
    return res.status(500).json({ sukses: false, pesan: "Gagal ambil stats" });
  }
});

// GET /api/debug/session - mengembalikan info user session saat ini (untuk debugging)
router.get("/session", (req, res) => {
  try {
    if (!req.session || !req.session.user)
      return res
        .status(401)
        .json({ sukses: false, pesan: "Tidak ada sesi login" });
    const user = req.session.user;
    return res.json({ sukses: true, data: { id: user._id || user.id, user } });
  } catch (err) {
    console.error("Session debug failed:", err);
    return res
      .status(500)
      .json({ sukses: false, pesan: "Gagal ambil session" });
  }
});

// POST /api/debug/impersonate-admin - HANYA DEV: set session saat ini ke pengguna admin
router.post('/impersonate-admin', async (req,res) => {
  try {
    if (process.env.DEBUG_IMPERSONATE !== '1') return res.status(403).json({ sukses:false, pesan:'Impersonation disabled' });
    const admin = await Pengguna.findOne({ email: 'admin@sistem.com' }).lean();
    if (!admin) return res.status(404).json({ sukses:false, pesan:'Admin not found' });
    req.session.user = { _id: admin._id, id: admin._id, namaPengguna: admin.namaPengguna, email: admin.email, role: 'admin' };
    return res.json({ sukses:true, pesan:'Session set to admin' });
  } catch(err){ console.error('Impersonate failed', err); return res.status(500).json({ sukses:false, pesan:'Gagal impersonate' }); }
});

// GET /api/debug/bahan - mengembalikan semua bahan untuk user session saat ini (untuk debugging)
router.get("/bahan", async (req, res) => {
  try {
    if (!req.session || !req.session.user)
      return res
        .status(401)
        .json({ sukses: false, pesan: "Autentikasi diperlukan" });
    const userId = req.session.user._id || req.session.user.id;
    const semua = await Bahan.find({ pemilik: userId }).sort({
      tanggalKadaluarsa: 1,
    });
    return res.json({ sukses: true, data: semua });
  } catch (err) {
    console.error("Debug bahan failed:", err);
    return res.status(500).json({ sukses: false, pesan: "Gagal ambil bahan" });
  }
});

module.exports = router;
