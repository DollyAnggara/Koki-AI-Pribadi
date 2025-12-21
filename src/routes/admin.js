const express = require('express');
const router = express.Router();
const kontrolerAdmin = require('../controller/kontrolerAdmin');

// middleware: require admin role
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    if (req.accepts('html')) return res.redirect('/login?error=akses%20ditolak');
    return res.status(403).json({ sukses: false, pesan: 'Akses admin diperlukan' });
  }
  next();
}

// Admin UI pages
router.get('/', requireAdmin, (req, res) => res.redirect('/admin/resep'));
router.get('/resep', requireAdmin, kontrolerAdmin.listResepPage);
router.get('/resep/new', requireAdmin, kontrolerAdmin.newResepPage);
router.post('/resep', requireAdmin, kontrolerAdmin.createResep);
router.get('/resep/pending', requireAdmin, kontrolerAdmin.listPending);
router.get('/resep/:id/edit', requireAdmin, kontrolerAdmin.editResepPage);
router.post('/resep/:id', requireAdmin, kontrolerAdmin.updateResep);
router.post('/resep/:id/delete', requireAdmin, kontrolerAdmin.deleteResep);
router.post('/resep/:id/approve', requireAdmin, kontrolerAdmin.approveResep);
router.post('/resep/:id/reject', requireAdmin, kontrolerAdmin.rejectResep);

module.exports = router;
