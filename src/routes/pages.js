/**
 * src/routes/pages.js
 * Render per-page views (separate .hbs files for each main page)
 */
const express = require('express');
const router = express.Router();
const Resep = require('../models/Resep');

// Middleware: require auth for pages
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
}

router.get('/resep', requireAuth, async (req, res) => {
  try {
    const daftarResep = await Resep.find().limit(50);
    res.render('resep', { judul: 'Resep - Koki AI Pribadi', resep: daftarResep });
  } catch (err) {
    console.error('Gagal render resep:', err);
    res.render('resep', { judul: 'Resep - Koki AI Pribadi', resep: [], error: 'Gagal memuat resep' });
  }
});

router.get('/chat', requireAuth, (req, res) => {
  res.render('chat', { judul: 'Chat - Koki AI Pribadi' });
});

router.get('/timer', requireAuth, (req, res) => {
  res.render('timer', { judul: 'Timer - Koki AI Pribadi' });
});

router.get('/menu', requireAuth, (req, res) => {
  res.render('menu', { judul: 'Menu Mingguan - Koki AI Pribadi' });
});

router.get('/bahan', requireAuth, async (req, res) => {
  try {
    const Bahan = require('../models/Bahan');
    const penggunaId = req.session.user && (req.session.user._id || req.session.user.id);
    const daftarBahan = penggunaId ? await Bahan.find({ pemilik: penggunaId }).sort({ namaBahan: 1 }) : [];
    res.render('bahan', { judul: 'Bahan Saya - Koki AI Pribadi', bahan: daftarBahan });
  } catch (err) {
    console.error('Gagal render bahan:', err);
    res.render('bahan', { judul: 'Bahan Saya - Koki AI Pribadi', bahan: [], error: 'Gagal memuat bahan' });
  }
});

// pantry page (optional route)
router.get('/pantry', requireAuth, (req, res) => {
  res.render('pantry', { judul: 'Pantry - Koki AI Pribadi' });
});

module.exports = router;
