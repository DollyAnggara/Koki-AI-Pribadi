const express = require("express");
const router = express.Router();
const { panggilDeepseek } = require("../utils/layananDeepseek");
const Pengguna = require("../models/Pengguna");
const Resep = require("../models/Resep");
const Bahan = require("../models/Bahan");

// POST /api/debug/deepseek { prompt }
router.post("/deepseek", async (req, res) => {
  if (!process.env.DEEPSEEK_API_KEY)
    return res
      .status(400)
      .json({ sukses: false, pesan: "DEEPSEEK_API_KEY not configured" });
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
    // Ping diagnostic: /api/debug/deepseek?ping=1
    if (req.query.ping === "1" || req.query.ping === "true") {
      const { pingUrl } = require("../utils/layananDeepseek");
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

// GET /api/debug/db-stats - development helper to check counts
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

module.exports = router;
