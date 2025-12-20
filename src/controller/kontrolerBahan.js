/**
 * src/controller/kontrolerBahan.js
 * CRUD bahan + pantry challenge + identifikasi gambar
 */

const Bahan = require("../models/Bahan");
const layananVisi = require("../utils/layananVisi");

// Helper to get logged-in user's id (supports session.user._id or session.user.id)
const getSessionUserId = (req) => {
  if (!req.session || !req.session.user) return null;
  return req.session.user._id || req.session.user.id || null; // keep backward compat (session may store id or _id)
};

// Allowed options for satuan and kategori (server-side whitelist)
const ALLOWED_SATUAN = ["gram", "kg", "liter", "ml", "butir", "potong"];
const ALLOWED_KATEGORI = [
  "daging",
  "sayur",
  "buah",
  "rempah",
  "bumbu",
  "lainnya",
];

/**
 * GET /api/bahan
 * Query: idPengguna (opsional)
 */
const dapatkanSemuaBahan = async (req, res) => {
  try {
    const { idPengguna } = req.query;
    const filter = {};

    // Require authentication unless caller explicitly provides idPengguna and server-side code is allowed to query another user's data
    if (idPengguna) {
      // If a logged-in user is requesting another user's bahan, forbid
      const sessId = getSessionUserId(req);
      if (sessId && String(sessId) !== String(idPengguna))
        return res.status(403).json({
          sukses: false,
          pesan: "Akses ditolak: tidak bisa melihat bahan pengguna lain",
        });
      filter.pemilik = idPengguna;
    } else {
      // No idPengguna provided -> require the session user
      const sessId = getSessionUserId(req);
      if (!sessId)
        return res
          .status(401)
          .json({ sukses: false, pesan: "Autentikasi diperlukan" });
      filter.pemilik = sessId;
    }

    const daftar = await Bahan.find(filter).sort({ tanggalKadaluarsa: 1 });
    res.json({ sukses: true, data: daftar });
  } catch (err) {
    console.error("❌ Gagal dapatkan bahan:", err);
    res
      .status(500)
      .json({ sukses: false, pesan: "Gagal mendapatkan daftar bahan" });
  }
};

/**
 * POST /api/bahan
 */
const tambahBahan = async (req, res) => {
  try {
    const data = req.body;

    // If pemilik not provided in request, try use logged-in user from session
    if (
      !data.pemilik &&
      req.session &&
      req.session.user &&
      req.session.user._id
    ) {
      data.pemilik = req.session.user._id;
    }

    // If pemilik explicitly provided, ensure it matches the logged-in user
    const sessId = getSessionUserId(req);
    if (data.pemilik && sessId && String(data.pemilik) !== String(sessId)) {
      return res.status(403).json({
        sukses: false,
        pesan: "Akses ditolak: tidak bisa menambah bahan untuk pengguna lain",
      });
    }

    // Require authentication
    if (!data.pemilik && !sessId)
      return res
        .status(401)
        .json({ sukses: false, pesan: "Autentikasi diperlukan" });

    // ensure we set pemilik to session id if not provided
    if (!data.pemilik && sessId) data.pemilik = sessId;

    if (
      data.tanggalKadaluarsa &&
      new Date(data.tanggalKadaluarsa) < new Date()
    ) {
      return res.status(400).json({
        sukses: false,
        pesan: "Tanggal kadaluarsa tidak boleh di masa lalu",
      });
    }

    // Normalize input keys expected by model
    const payload = {
      namaBahan: data.namaBahan || data.nama || "",
      jumlahTersedia:
        typeof data.jumlahTersedia !== "undefined"
          ? data.jumlahTersedia
          : data.jumlah || 0,
      satuan: data.satuan || "gram",
      tanggalPembelian: data.tanggalPembelian
        ? new Date(data.tanggalPembelian)
        : new Date(),
      tanggalKadaluarsa: data.tanggalKadaluarsa
        ? new Date(data.tanggalKadaluarsa)
        : undefined,
      lokasiPenyimpanan: data.lokasiPenyimpanan || "rak_dapur",
      kategoriBahan: data.kategoriBahan || "lainnya",
      pemilik: data.pemilik,
    };

    // If both dates provided, ensure pembelian <= kadaluarsa
    if (
      payload.tanggalKadaluarsa &&
      payload.tanggalPembelian &&
      payload.tanggalPembelian > payload.tanggalKadaluarsa
    ) {
      return res
        .status(400)
        .json({
          sukses: false,
          pesan:
            "Tanggal pembelian tidak boleh lebih besar dari tanggal kadaluarsa",
        });
    }

    // Normalize and validate satuan & kategori
    payload.satuan = String(payload.satuan || "gram").toLowerCase();
    if (!ALLOWED_SATUAN.includes(payload.satuan)) payload.satuan = "gram";
    payload.kategoriBahan = String(
      payload.kategoriBahan || "lainnya"
    ).toLowerCase();
    if (!ALLOWED_KATEGORI.includes(payload.kategoriBahan))
      payload.kategoriBahan = "lainnya";

    // Basic server-side validation
    if (!payload.namaBahan || String(payload.namaBahan).trim() === "")
      return res
        .status(400)
        .json({ sukses: false, pesan: "Nama bahan diperlukan" });
    if (
      typeof payload.jumlahTersedia !== "number" ||
      isNaN(payload.jumlahTersedia) ||
      payload.jumlahTersedia < 0
    )
      payload.jumlahTersedia = 0;

    const bahan = new Bahan(payload);
    await bahan.save();
    console.log(
      "✅ Bahan tersimpan:",
      bahan.namaBahan,
      "pemilik=",
      String(bahan.pemilik || "none")
    );
    res.status(201).json({ sukses: true, data: bahan });
  } catch (err) {
    console.error("❌ Gagal tambah bahan:", err);
    res.status(400).json({
      sukses: false,
      pesan: "Gagal menambahkan bahan",
      kesalahan: err.message,
    });
  }
};

/**
 * PUT /api/bahan/:id
 */
const perbaruiBahan = async (req, res) => {
  try {
    const bahan = await Bahan.findById(req.params.id);
    if (!bahan)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Bahan tidak ditemukan" });

    // Only owner can update
    const sessId = getSessionUserId(req);
    if (!sessId || String(bahan.pemilik) !== String(sessId))
      return res.status(403).json({
        sukses: false,
        pesan: "Akses ditolak: tidak bisa memperbarui bahan ini",
      });

    Object.assign(bahan, req.body);
    await bahan.save();
    res.json({ sukses: true, data: bahan });
  } catch (err) {
    console.error("❌ Gagal perbarui bahan:", err);
    res.status(400).json({ sukses: false, pesan: "Gagal memperbarui bahan" });
  }
};

/**
 * PATCH /api/bahan/:id/kurangi
 */
const kurangiJumlahBahan = async (req, res) => {
  try {
    const { jumlahDikurangi = 0 } = req.body;
    const bahan = await Bahan.findById(req.params.id);
    if (!bahan)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Bahan tidak ditemukan" });

    // Only owner can modify
    const sessId = getSessionUserId(req);
    if (!sessId || String(bahan.pemilik) !== String(sessId))
      return res.status(403).json({
        sukses: false,
        pesan: "Akses ditolak: tidak bisa mengubah bahan ini",
      });

    bahan.jumlahTersedia = Math.max(0, bahan.jumlahTersedia - jumlahDikurangi);
    if (bahan.jumlahTersedia === 0) bahan.statusAktif = false;
    await bahan.save();
    res.json({ sukses: true, data: bahan });
  } catch (err) {
    console.error("❌ Gagal kurangi jumlah bahan:", err);
    res
      .status(500)
      .json({ sukses: false, pesan: "Gagal mengurangi jumlah bahan" });
  }
};

/**
 * DELETE /api/bahan/:id
 */
const hapusBahan = async (req, res) => {
  try {
    const bahan = await Bahan.findById(req.params.id);
    if (!bahan)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Bahan tidak ditemukan" });

    // Only owner can delete
    const sessId = getSessionUserId(req);
    if (!sessId || String(bahan.pemilik) !== String(sessId))
      return res.status(403).json({
        sukses: false,
        pesan: "Akses ditolak: tidak bisa menghapus bahan ini",
      });

    await bahan.remove();
    res.json({ sukses: true, pesan: "Bahan berhasil dihapus" });
  } catch (err) {
    console.error("❌ Gagal hapus bahan:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal menghapus bahan" });
  }
};

/**
 * GET /api/bahan/pantry-challenge/:idPengguna
 */
const pantryChallenge = async (req, res) => {
  try {
    // Use session user id to avoid client-side mismatch; simpler & safer
    const sessId = getSessionUserId(req);
    if (!sessId)
      return res.status(401).json({ sukses: false, pesan: 'Autentikasi diperlukan' });

    const bahanHampir = await Bahan.dapatkanHampirKadaluarsa(sessId, 3);
    console.log(`[PANTRY-DEBUG] sessId=${sessId} requested pantry-challenge`);
    console.log(`[PANTRY-DEBUG] found ${bahanHampir ? bahanHampir.length : 0} items`);
    if (bahanHampir && bahanHampir.length) {
      bahanHampir.forEach((b) => console.log(`[PANTRY-DEBUG] id=${b._id} nama=${b.namaBahan} tanggalKadaluarsa=${b.tanggalKadaluarsa}`));
    }
    res.json({ sukses: true, data: { bahanHampirKadaluarsa: bahanHampir } });
  } catch (err) {
    console.error("❌ Gagal pantry challenge:", err);
    res
      .status(500)
      .json({ sukses: false, pesan: "Gagal menjalankan pantry challenge" });
  }
};

/**
 * POST /api/bahan/identifikasi-gambar
 */
const identifikasiBahanDariGambar = async (req, res) => {
  try {
    if (!req.file)
      return res
        .status(400)
        .json({ sukses: false, pesan: "Tidak ada gambar yang diupload" });
    const hasil = await layananVisi.identifikasiBahanDariBuffer(
      req.file.buffer,
      req.file.mimetype
    );
    res.json({
      sukses: hasil.sukses,
      data: hasil.data,
      kesalahan: hasil.kesalahan,
    });
  } catch (err) {
    console.error("❌ Gagal identifikasi gambar:", err);
    res
      .status(500)
      .json({ sukses: false, pesan: "Gagal mengidentifikasi gambar" });
  }
};

/**
 * POST /api/bahan/tambah-banyak
 */
const tambahBanyakBahan = async (req, res) => {
  try {
    const { daftarBahan = [], idPengguna } = req.body;
    if (!daftarBahan.length)
      return res
        .status(400)
        .json({ sukses: false, pesan: "Daftar bahan kosong" });

    // Require authentication and ensure idPengguna matches logged-in user
    const sessId = getSessionUserId(req);
    if (!sessId)
      return res
        .status(401)
        .json({ sukses: false, pesan: "Autentikasi diperlukan" });
    const userId = String(sessId);
    if (idPengguna && String(idPengguna) !== userId)
      return res.status(403).json({
        sukses: false,
        pesan: "Akses ditolak: tidak bisa menambah bahan untuk pengguna lain",
      });

    const untukSimpan = daftarBahan.map((b) => ({ ...b, pemilik: userId }));
    const hasil = await Bahan.insertMany(untukSimpan, { ordered: false });
    res.status(201).json({ sukses: true, data: hasil });
  } catch (err) {
    console.error("❌ Gagal tambah banyak bahan:", err);
    res.status(400).json({
      sukses: false,
      pesan: "Gagal menambahkan bahan",
      kesalahan: err.message,
    });
  }
};

/**
 * GET /api/bahan/statistik/:idPengguna
 */
const dapatkanStatistikBahan = async (req, res) => {
  try {
    const { idPengguna } = req.params;
    const total = await Bahan.countDocuments({
      pemilik: idPengguna,
      statusAktif: true,
    });
    const tanggal3Hari = new Date();
    tanggal3Hari.setDate(tanggal3Hari.getDate() + 3);
    const hampir = await Bahan.countDocuments({
      pemilik: idPengguna,
      statusAktif: true,
      tanggalKadaluarsa: { $gte: new Date(), $lte: tanggal3Hari },
    });
    res.json({
      sukses: true,
      data: { totalBahanAktif: total, jumlahHampirKadaluarsa: hampir },
    });
  } catch (err) {
    console.error("❌ Gagal statistik bahan:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal mengambil statistik" });
  }
};

/**
 * GET /api/bahan/kadaluarsa
 * Returns all bahan for current session user where tanggalKadaluarsa is today or earlier
 */
const dapatkanBahanKadaluarsa = async (req, res) => {
  try {
      const sessId = getSessionUserId(req);
    if (!sessId) return res.status(401).json({ sukses: false, pesan: 'Autentikasi diperlukan' });

    // days parameter controls how many days into the future to consider (inclusive)
    const days = Math.max(0, parseInt(req.query.days || '3', 10));

    const batas = new Date();
    batas.setHours(23, 59, 59, 999);
    batas.setDate(batas.getDate() + days);

    // find items that have tanggalKadaluarsa <= end of target day
    const items = await Bahan.find({ pemilik: sessId, statusAktif: true, tanggalKadaluarsa: { $exists: true, $lte: batas } }).sort({ tanggalKadaluarsa: 1 });

    console.log(`[PANTRY-DEBUG] sessId=${sessId} days=${days} targetDate=${batas.toISOString()} foundExpired=${items.length}`);
    items.forEach((b) => console.log(`[PANTRY-DEBUG] expired id=${b._id} nama=${b.namaBahan} tanggalKadaluarsa=${b.tanggalKadaluarsa}`));

    res.json({ sukses: true, data: { kadaluarsa: items } });
  } catch (err) {
    console.error('❌ Gagal dapatkan bahan kadaluarsa:', err);
    res.status(500).json({ sukses: false, pesan: 'Gagal mengambil bahan kadaluarsa' });
  }
};

module.exports = {
  dapatkanSemuaBahan,
  tambahBahan,
  perbaruiBahan,
  kurangiJumlahBahan,
  hapusBahan,
  pantryChallenge,
  identifikasiBahanDariGambar,
  tambahBanyakBahan,
  dapatkanStatistikBahan,
  dapatkanBahanKadaluarsa,
};
