/**
 * src/routes/otp.js
 * Placeholder route OTP (sudah ada di struktur Anda)
 */

const express = require('express');
const router = express.Router();
const otpController = require('../controller/otpController');

// Kirim OTP ke email
router.post('/send', otpController.sendOtp);
// Verifikasi OTP
router.post('/verify', otpController.verifyOtp);
// Test koneksi SMTP (POST saja untuk menghindari caching di browser)
router.post('/test', otpController.testSmtp);

module.exports = router;