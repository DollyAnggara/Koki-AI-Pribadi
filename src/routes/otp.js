/**
 * src/routes/otp.js
 * Placeholder route OTP
 */

const express = require('express');
const router = express.Router();
const kontrolerOtp = require('../controller/kontrolerOtp');

// Kirim OTP ke email
router.post('/send', kontrolerOtp.sendOtp);
// Verifikasi OTP
router.post('/verify', kontrolerOtp.verifyOtp);
// Test koneksi SMTP 
router.post('/test', kontrolerOtp.testSmtp);

module.exports = router;