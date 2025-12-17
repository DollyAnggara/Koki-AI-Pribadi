/**
 * src/routes/bahan.js
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const kontrolerBahan = require('../controller/kontrolerBahan');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/', kontrolerBahan.dapatkanSemuaBahan);
router.post('/', kontrolerBahan.tambahBahan);
router.put('/:id', kontrolerBahan.perbaruiBahan);
router.patch('/:id/kurangi', kontrolerBahan.kurangiJumlahBahan);
router.delete('/:id', kontrolerBahan.hapusBahan);

router.post('/identifikasi-gambar', upload.single('gambar'), kontrolerBahan.identifikasiBahanDariGambar);
router.get('/pantry-challenge/:idPengguna', kontrolerBahan.pantryChallenge);
router.get('/statistik/:idPengguna', kontrolerBahan.dapatkanStatistikBahan);
router.post('/tambah-banyak', kontrolerBahan.tambahBanyakBahan);

module.exports = router;