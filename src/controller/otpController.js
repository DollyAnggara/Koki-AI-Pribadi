const emailService = require('../utils/emailService');

// Simple in-memory store: { email -> { code, expiresAt } }
const otpStore = new Map();

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ sukses: false, pesan: 'Email diperlukan' });

    const code = generateCode();
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes
    otpStore.set(email.toLowerCase(), { code, expiresAt });

    try {
      await emailService.kirimOtpEmail(email, code);
      return res.json({ sukses: true, pesan: 'Kode OTP telah dikirim ke email Anda' });
    } catch (err) {
      console.error('❌ Gagal kirim OTP via SMTP:', err);
      // Print code to console for developer convenience, but return error to client so it's clear sending failed
      console.log(`OTP for ${email}: ${code} (valid 5 min)`);
      return res.status(500).json({ sukses: false, pesan: `Gagal mengirim OTP: ${err.message}. Periksa konfigurasi SMTP di .env` });
    }
  } catch (err) {
    console.error('❌ Gagal kirim OTP:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengirim OTP' });
  }
};

const verifyOtp = (req, res) => {
  try {
    const { email, kode } = req.body;
    if (!email || !kode) return res.status(400).json({ sukses: false, pesan: 'Email dan kode OTP diperlukan' });
    const data = otpStore.get(email.toLowerCase());
    if (!data) return res.status(400).json({ sukses: false, pesan: 'Kode OTP tidak ditemukan atau sudah kadaluarsa' });
    if (Date.now() > data.expiresAt) { otpStore.delete(email.toLowerCase()); return res.status(400).json({ sukses: false, pesan: 'Kode OTP telah kadaluarsa' }); }
    if (data.code !== String(kode)) return res.status(400).json({ sukses: false, pesan: 'Kode OTP salah' });
    // valid
    otpStore.delete(email.toLowerCase());
    return res.json({ sukses: true, pesan: 'OTP valid' });
  } catch (err) {
    console.error('❌ Gagal verifikasi OTP:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal verifikasi OTP' });
  }
};

const testSmtp = async (req, res) => {
  try {
    await emailService.verifyTransport();
    return res.json({ sukses: true, pesan: 'SMTP connection OK' });
  } catch (err) {
    console.error('❌ SMTP verify failed:', err);
    return res.status(500).json({ sukses: false, pesan: `SMTP verify failed: ${err.message}` });
  }
};

module.exports = { sendOtp, verifyOtp, testSmtp };