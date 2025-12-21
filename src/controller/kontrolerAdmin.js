const Resep = require('../models/Resep');

// List all recipes (admin view)
const listResepPage = async (req, res) => {
  try {
    const semua = await Resep.find({}).sort({ tanggalDibuat: -1 }).lean();
    return res.render('admin/resep_list', { judul: 'Manajemen Resep', resep: semua });
  } catch (err) {
    console.error('❌ Gagal ambil resep untuk admin:', err);
    return res.status(500).render('admin/resep_list', { judul: 'Manajemen Resep', resep: [], error: 'Gagal ambil data' });
  }
};

const listPending = async (req, res) => {
  try {
    const pending = await Resep.find({ status: 'pending' }).sort({ tanggalDibuat: -1 }).lean();
    return res.render('admin/resep_pending', { judul: 'Konfirmasi Resep (Pending)', resep: pending });
  } catch (err) {
    console.error('❌ Gagal ambil resep pending:', err);
    return res.status(500).render('admin/resep_pending', { judul: 'Konfirmasi Resep (Pending)', resep: [], error: 'Gagal ambil data' });
  }
};

const newResepPage = (req, res) => {
  return res.render('admin/resep_new', { judul: 'Tambah Resep Baru' });
};

const createResep = async (req, res) => {
  try {
    const body = req.body || {};
    // normalize minimal fields
    const r = new Resep({
      namaResep: body.namaResep || 'Untitled',
      deskripsi: body.deskripsi || '',
      kategori: body.kategori || '',
      porsi: Number(body.porsi) || 1,
      daftarBahan: body.daftarBahan || [],
      langkah: body.langkah || [],
      status: 'approved',
      submittedBy: req.session.user ? req.session.user._id : null
    });
    await r.save();
    return res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Gagal buat resep (admin):', err);
    return res.status(500).render('admin/resep_new', { judul: 'Tambah Resep Baru', error: 'Gagal menyimpan resep' });
  }
};

const editResepPage = async (req, res) => {
  try {
    const r = await Resep.findById(req.params.id).lean();
    if (!r) return res.redirect('/admin/resep');
    // add convenience flags for templates
    r.isApproved = r.status === 'approved';
    r.isPending = r.status === 'pending';
    r.isRejected = r.status === 'rejected';
    return res.render('admin/resep_edit', { judul: 'Edit Resep', resep: r });
  } catch (err) {
    console.error('❌ Gagal ambil resep edit:', err);
    return res.redirect('/admin/resep');
  }
};

const updateResep = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body || {};
    await Resep.findByIdAndUpdate(id, data, { new: true });
    return res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Gagal update resep:', err);
    return res.status(500).redirect('/admin/resep');
  }
};

const deleteResep = async (req, res) => {
  try {
    const id = req.params.id;
    await Resep.findByIdAndDelete(id);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) return res.json({ sukses: true });
    return res.redirect('/admin/resep');
  } catch (err) {
    console.error('❌ Gagal hapus resep:', err);
    if (req.xhr) return res.status(500).json({ sukses: false, pesan: 'Gagal hapus' });
    return res.redirect('/admin/resep');
  }
};

const approveResep = async (req, res) => {
  try {
    const id = req.params.id;
    const note = req.body.moderationNote || '';
    const r = await Resep.findByIdAndUpdate(id, { status: 'approved', moderationNote: note }, { new: true });
    if (!r) return res.status(404).json({ sukses: false, pesan: 'Resep tidak ditemukan' });
    return res.json({ sukses: true, pesan: 'Resep disetujui' });
  } catch (err) {
    console.error('❌ Gagal approve resep:', err);
    return res.status(500).json({ sukses: false, pesan: 'Gagal setujui resep' });
  }
};

const rejectResep = async (req, res) => {
  try {
    const id = req.params.id;
    const note = req.body.moderationNote || '';
    const r = await Resep.findByIdAndUpdate(id, { status: 'rejected', moderationNote: note }, { new: true });
    if (!r) return res.status(404).json({ sukses: false, pesan: 'Resep tidak ditemukan' });
    return res.json({ sukses: true, pesan: 'Resep ditolak' });
  } catch (err) {
    console.error('❌ Gagal reject resep:', err);
    return res.status(500).json({ sukses: false, pesan: 'Gagal tolak resep' });
  }
};

module.exports = {
  listResepPage,
  listPending,
  newResepPage,
  createResep,
  editResepPage,
  updateResep,
  deleteResep,
  approveResep,
  rejectResep
};
