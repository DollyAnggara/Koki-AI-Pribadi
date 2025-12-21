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

// Create new chat session
router.post("/buat", requireAuth, sessionChatController.buatSessionChat);

// Get all sessions
router.get("/daftar", requireAuth, sessionChatController.ambilSemuaSessionChat);

// Get session detail
router.get(
  "/:idSession",
  requireAuth,
  sessionChatController.ambilDetailSessionChat
);

// Update session name
router.put(
  "/:idSession/nama",
  requireAuth,
  sessionChatController.perbaruiNamaSession
);

// Delete session
router.delete("/:idSession", requireAuth, sessionChatController.hapusSession);

// Add message to session
router.post(
  "/:idSession/pesan",
  requireAuth,
  sessionChatController.tambahPesanKeSession
);

module.exports = router;
