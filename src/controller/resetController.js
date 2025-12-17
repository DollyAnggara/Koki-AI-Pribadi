const crypto = require('crypto');
const Pengguna = require('../models/Pengguna');
const emailService = require('../utils/emailService');

// tokenStore: token -> { email, expiresAt }
const tokenStore = new Map();

const generateToken = () => crypto.randomBytes(20).toString('hex');

const requestReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ sukses: false, pesan: 'Email diperlukan' });

    const pengguna = await Pengguna.findOne({ email });
    if (!pengguna) {
      // For privacy, still return success for forms but show a message
      if (!req.is('application/json')) return res.render('forgot', { layout: 'auth', error: null, success: 'Jika email terdaftar, tautan reset telah dikirim.' });
      return res.json({ sukses: true, pesan: 'Jika email terdaftar, tautan reset telah dikirim.' });
    }

    const token = generateToken();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    tokenStore.set(token, { email: pengguna.email, expiresAt });

    const baseUrl = process.env.APP_URL || (`http://localhost:${process.env.PORT||3000}`);
    const link = `${baseUrl}/reset?token=${token}`;

    try {
      await emailService.kirimResetEmail(pengguna.email, link);
      console.log(`🔗 Reset link for ${pengguna.email}: ${link}`);
    } catch (err) {
      console.error('Gagal kirim email reset:', err);
      console.log(`🔗 (fallback) Reset link for ${pengguna.email}: ${link}`);
      if (!req.is('application/json')) return res.render('forgot', { layout: 'auth', error: 'Gagal mengirim email. Cek konfigurasi SMTP.', success: null });
      return res.status(500).json({ sukses: false, pesan: 'Gagal mengirim email reset' });
    }

    if (!req.is('application/json')) return res.render('forgot', { layout: 'auth', success: 'Jika email terdaftar, tautan reset telah dikirim.', error: null });
    return res.json({ sukses: true, pesan: 'Tautan reset dikirim' });
  } catch (err) {
    console.error('❌ Request reset failed:', err);
    if (!req.is('application/json')) return res.render('forgot', { error: 'Terjadi kesalahan', success: null });
    return res.status(500).json({ sukses: false, pesan: 'Gagal proses permintaan reset' });
  }
};

const performReset = async (req, res) => {
  try {
    const { token, kataSandi, kataSandiConfirm } = req.body;
    if (!token || !kataSandi || !kataSandiConfirm) {
      if (!req.is('application/json')) return res.render('reset', { layout: 'auth', token, error: 'Semua field diperlukan' });
      return res.status(400).json({ sukses: false, pesan: 'Field diperlukan' });
    }
    if (kataSandi !== kataSandiConfirm) {
      if (!req.is('application/json')) return res.render('reset', { layout: 'auth', token, error: 'Konfirmasi password tidak cocok' });
      return res.status(400).json({ sukses: false, pesan: 'Konfirmasi password tidak cocok' });
    }

    const data = tokenStore.get(token);
    if (!data) return res.status(400).json({ sukses: false, pesan: 'Token tidak valid atau sudah kadaluarsa' });
    if (Date.now() > data.expiresAt) { tokenStore.delete(token); return res.status(400).json({ sukses: false, pesan: 'Token telah kadaluarsa' }); }

    const pengguna = await Pengguna.findOne({ email: data.email });
    if (!pengguna) return res.status(400).json({ sukses: false, pesan: 'Pengguna tidak ditemukan' });

    pengguna.kataSandi = kataSandi;
    await pengguna.save();

    tokenStore.delete(token);

    if (!req.is('application/json')) return res.redirect('/login?success=1');
    return res.json({ sukses: true, pesan: 'Password berhasil direset' });
  } catch (err) {
    console.error('❌ Reset failed:', err);
    if (!req.is('application/json')) return res.render('reset', { token: req.body.token, error: 'Gagal mereset password' });
    return res.status(500).json({ sukses: false, pesan: 'Gagal mereset password' });
  }
};

module.exports = { requestReset, performReset, tokenStore };