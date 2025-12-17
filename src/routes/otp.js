/**
 * src/routes/otp.js
 * Placeholder route OTP (sudah ada di struktur Anda)
 */

const express = require('express');
const router = express.Router();

// Contoh endpoint OTP (placeholder)
router.post('/send', (req, res) => {
  // logic kirim OTP dapat ditaruh di src/controller/otpController.js
  res.json({ sukses: true, pesan: 'OTP dikirim (placeholder)' });
});

module.exports = router;