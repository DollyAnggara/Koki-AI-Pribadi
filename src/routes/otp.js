/**
 * src/routes/otp.js
 * Placeholder route OTP
 */

const express = require('express');
const router = express.Router();
const otpController = require('../controller/otpController');

// Kirim OTP ke email
router.post('/send', otpController.sendOtp);
// Verifikasi OTP
router.post('/verify', otpController.verifyOtp);
// Test koneksi SMTP 
router.post('/test', otpController.testSmtp);

module.exports = router;