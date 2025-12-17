/**
 * src/routes/pengguna.js
 */

const express = require('express');
const router = express.Router();
const kontrolerPengguna = require('../controller/kontrolerPengguna');

router.post('/registrasi', kontrolerPengguna.registrasiPengguna);
router.post('/login', kontrolerPengguna.loginPengguna);
router.post('/lupa', require('../controller/resetController').requestReset);
router.post('/reset', require('../controller/resetController').performReset);
router.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
// POST logout endpoint for ajax/logout with confirmation
router.post('/logout', (req, res) => { req.session.destroy(err => { if (err) return res.status(500).json({ sukses:false, pesan:'Gagal logout' }); res.json({ sukses:true, pesan:'Keluar berhasil' }); }); });
router.get('/:id', kontrolerPengguna.dapatkanProfil);
router.put('/:id', kontrolerPengguna.perbaruiProfil);
router.patch('/:id/preferensi-diet', kontrolerPengguna.perbaruiPreferensiDiet);
router.patch('/:id/pengaturan-notifikasi', kontrolerPengguna.perbaruiPengaturanNotifikasi);
router.post('/:id/favorit/:idResep', kontrolerPengguna.tambahResepFavorit);
router.delete('/:id/favorit/:idResep', kontrolerPengguna.hapusResepFavorit);

module.exports = router;