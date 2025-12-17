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

module.exports = router;