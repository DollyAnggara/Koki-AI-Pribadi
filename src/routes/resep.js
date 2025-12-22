/**
 * src/routes/resep.js
 */

const express = require('express');
const router = express.Router();
const kontrolerResep = require('../controller/kontrolerResep');

router.get('/', kontrolerResep.dapatkanSemuaResep);
router.get('/:id', kontrolerResep.dapatkanResepById);
router.post('/', kontrolerResep.buatResepBaru);
router.put('/:id', kontrolerResep.perbaruiResep);
router.delete('/:id', kontrolerResep.hapusResep);

// memerlukan sesi untuk operasi memasak
function requireSession(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ sukses: false, pesan: 'Autentikasi diperlukan' });
  next();
}

router.post('/:id/masak', requireSession, kontrolerResep.masakResep);

router.post('/cari-dengan-bahan', kontrolerResep.cariResepDenganBahan);
router.post('/saran-ai', kontrolerResep.dapatkanSaranResepAI);
router.post('/hitung-nutrisi', kontrolerResep.hitungNutrisi);

module.exports = router;