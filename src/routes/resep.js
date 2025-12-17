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

router.post('/cari-dengan-bahan', kontrolerResep.cariResepDenganBahan);
router.post('/saran-ai', kontrolerResep.dapatkanSaranResepAI);
router.post('/hitung-nutrisi', kontrolerResep.hitungNutrisi);

module.exports = router;