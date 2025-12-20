/**
 * src/routes/menu.js
 */

const express = require('express');
const router = express.Router();
const kontrolerMenu = require('../controller/kontrolerMenu');

router.post('/', kontrolerMenu.buatRencanaMenu);
router.get('/:idPengguna/:tahun/:mingguKe', kontrolerMenu.dapatkanRencanaMenu);
router.get('/:id/daftar-belanja', kontrolerMenu.dapatkanDaftarBelanja);
router.patch('/:id/daftar-belanja/:indexItem', kontrolerMenu.updateStatusBelanja);
router.post('/:id/kirim-email', kontrolerMenu.kirimEmailMenu);
router.post('/generate-saran', kontrolerMenu.generateSaranMenu);
router.post('/preview-daftar-belanja', kontrolerMenu.previewDaftarBelanja);
router.post('/:id/hapus-sudah-dibeli', kontrolerMenu.hapusItemSudahDibeli);
router.post('/:id/hapus-semua', kontrolerMenu.hapusSemuaDaftar);
router.post('/clear-old/:idPengguna', kontrolerMenu.clearOldRencana);

module.exports = router;