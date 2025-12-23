const express = require("express");
const router = express.Router();
const sessionChatController = require("../controller/sessionChatController");

// Middleware autentikasi
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Anda harus login terlebih dahulu" });
  }
  next();
};

// Membuat sesi chat baru
router.post("/buat", requireAuth, sessionChatController.buatSessionChat);

// Ambil semua sesi
router.get("/daftar", requireAuth, sessionChatController.ambilSemuaSessionChat);

// Ambil detail sesi
router.get(
  "/:idSession",
  requireAuth,
  sessionChatController.ambilDetailSessionChat
);

// Update nama sesi
router.put(
  "/:idSession/nama",
  requireAuth,
  sessionChatController.perbaruiNamaSession
);

// Hapus sesi
router.delete("/:idSession", requireAuth, sessionChatController.hapusSession);

// Tambah pesan ke sesi
router.post(
  "/:idSession/pesan",
  requireAuth,
  sessionChatController.tambahPesanKeSession
);

module.exports = router;