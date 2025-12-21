const express = require('express');
const router = express.Router();
const Resep = require('../models/Resep');

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.isAdmin) {
    return res.status(403).render('404', { layout: 'layout', judul: 'Dilarang', error: 'Anda tidak memiliki akses administrator.' });
  }
  next();
}

// Admin: daftar resep
router.get('/resep', requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.filter === 'pending') filter.status = 'pending';
    else if (req.query.filter === 'approved') filter.status = 'approved';
    const resep = await Resep.find(filter).limit(500).sort({ namaResep: 1 }).populate('submittedBy', 'namaPengguna email');
    res.render('admin_resep_list', { title: 'Admin - Kelola Resep', resep });
  } catch (err) {
    console.error('❌ Admin get resep error', err);
    res.status(500).render('admin_resep_list', { title: 'Admin - Kelola Resep', resep: [], error: 'Gagal memuat daftar resep' });
  }
});

// Admin: form tambah
router.get('/resep/new', requireAdmin, (req, res) => {
  res.render('admin_resep_form', { title: 'Tambah Resep', mode: 'new', resep: {} });
});

// Admin: form edit
router.get('/resep/:id/edit', requireAdmin, async (req, res) => {
  try {
    const resep = await Resep.findById(req.params.id);
    if (!resep) return res.status(404).render('404', { layout: 'layout', judul: 'Resep Tidak Ditemukan' });
    res.render('admin_resep_form', { title: 'Edit Resep', mode: 'edit', resep });
  } catch (err) {
    console.error('❌ Admin edit get error', err);
    res.status(500).render('admin_resep_form', { title: 'Edit Resep', mode: 'edit', resep: {}, error: 'Gagal memuat resep' });
  }
});

// Admin: create
router.post('/resep', requireAdmin, async (req, res) => {
  try {
    const data = req.body || {};
    // allow daftarBahan as JSON textarea (if string try parse)
    if (typeof data.daftarBahan === 'string') {
      try { data.daftarBahan = JSON.parse(data.daftarBahan); } catch(e) { data.daftarBahan = []; }
    }
    const resepBaru = new Resep(data);
    await resepBaru.save();
    res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Admin create resep error', err);
    res.status(400).render('admin_resep_form', { title: 'Tambah Resep', mode: 'new', resep: req.body, error: 'Gagal membuat resep: ' + (err.message || '') });
  }
});

// Admin: update
router.post('/resep/:id', requireAdmin, async (req, res) => {
  try {
    const data = req.body || {};
    if (typeof data.daftarBahan === 'string') {
      try { data.daftarBahan = JSON.parse(data.daftarBahan); } catch(e) { data.daftarBahan = []; }
    }
    const resep = await Resep.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!resep) return res.status(404).render('404', { layout: 'layout', judul: 'Resep Tidak Ditemukan' });
    res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Admin update resep error', err);
    res.status(400).render('admin_resep_form', { title: 'Edit Resep', mode: 'edit', resep: Object.assign({}, req.body, { _id: req.params.id }), error: 'Gagal memperbarui resep: ' + (err.message || '') });
  }
});

// Admin: approve
router.post('/resep/:id/approve', requireAdmin, async (req, res) => {
  try {
    const note = (req.body.note || '').trim();
    const resep = await Resep.findByIdAndUpdate(req.params.id, { status: 'approved', moderationNote: note }, { new: true });
    if (!resep) return res.status(404).render('404', { layout: 'layout', judul: 'Resep Tidak Ditemukan' });
    res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Admin approve resep error', err);
    res.status(500).render('admin_resep_list', { title: 'Admin - Kelola Resep', resep: [], error: 'Gagal approve resep' });
  }
});

// Admin: reject
router.post('/resep/:id/reject', requireAdmin, async (req, res) => {
  try {
    const note = (req.body.note || '').trim();
    const resep = await Resep.findByIdAndUpdate(req.params.id, { status: 'rejected', moderationNote: note }, { new: true });
    if (!resep) return res.status(404).render('404', { layout: 'layout', judul: 'Resep Tidak Ditemukan' });
    res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Admin reject resep error', err);
    res.status(500).render('admin_resep_list', { title: 'Admin - Kelola Resep', resep: [], error: 'Gagal reject resep' });
  }
});

// Admin: delete
router.post('/resep/:id/delete', requireAdmin, async (req, res) => {
  try {
    await Resep.findByIdAndDelete(req.params.id);
    res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Admin delete resep error', err);
    res.status(500).render('admin_resep_list', { title: 'Admin - Kelola Resep', resep: [], error: 'Gagal menghapus resep' });
  }
});

module.exports = router;
