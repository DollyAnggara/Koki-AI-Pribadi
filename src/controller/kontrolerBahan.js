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

    // Cleanup expired items for this user automatically (they requested expired items be removed)
    try {
      await Bahan.deleteMany({
        pemilik: filter.pemilik,
        tanggalKadaluarsa: { $lt: new Date() },
      });
    } catch (e) {
      console.warn("[CLEANUP] gagal hapus bahan kadaluarsa:", e.message || e);
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
      return res.status(400).json({
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

    // Try to merge with existing bahan for this user (case-insensitive exact name)
    const escapeRegex = (s) =>
      String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const convertToBase = (jumlah, satuan) => {
      const u = String(satuan || "")
        .trim()
        .toLowerCase();
      if (u === "kg") return { amount: Number(jumlah) * 1000, unit: "gram" };
      if (u === "g" || u === "gram")
        return { amount: Number(jumlah), unit: "gram" };
      if (u === "l" || u === "liter" || u === "litre")
        return { amount: Number(jumlah) * 1000, unit: "ml" };
      if (u === "ml" || u === "milliliter")
        return { amount: Number(jumlah), unit: "ml" };
      return { amount: Number(jumlah) || 0, unit: u || "" };
    };
    const fromBaseToUnit = (amountBase, targetUnit) => {
      const u = String(targetUnit || "")
        .trim()
        .toLowerCase();
      if (u === "kg") return { amount: amountBase / 1000, unit: "kg" };
      if (u === "g" || u === "gram")
        return { amount: amountBase, unit: "gram" };
      if (u === "liter" || u === "l" || u === "litre")
        return { amount: amountBase / 1000, unit: "liter" };
      if (u === "ml" || u === "milliliter")
        return { amount: amountBase, unit: "ml" };
      return { amount: amountBase, unit: u || "" };
    };

    const nama = String(payload.namaBahan || "").trim();
    const regex = new RegExp(`^${escapeRegex(nama)}$`, "i");
    let existing = await Bahan.findOne({
      pemilik: payload.pemilik,
      namaBahan: regex,
      statusAktif: true,
    });
    if (!existing) {
      const stripped = nama.replace(/\s*\(.+\)\s*/g, "").trim();
      if (stripped && stripped !== nama) {
        const regex2 = new RegExp(`^${escapeRegex(stripped)}$`, "i");
        existing = await Bahan.findOne({
          pemilik: payload.pemilik,
          namaBahan: regex2,
          statusAktif: true,
        });
      }
    }

    if (!existing) {
      const bahan = new Bahan(payload);
      await bahan.save();
      console.log(
        "✅ Bahan tersimpan:",
        bahan.namaBahan,
        "pemilik=",
        String(bahan.pemilik || "none")
      );
      return res.status(201).json({ sukses: true, data: bahan });
    } else {
      // attempt to combine amounts if units compatible
      const existingBase = convertToBase(
        existing.jumlahTersedia || 0,
        existing.satuan || ""
      );
      const newBase = convertToBase(
        payload.jumlahTersedia || payload.jumlah || 0,
        payload.satuan || ""
      );
      if (
        existingBase.unit &&
        newBase.unit &&
        existingBase.unit === newBase.unit
      ) {
        const sumBase = (existingBase.amount || 0) + (newBase.amount || 0);
        const back = fromBaseToUnit(
          sumBase,
          existing.satuan || existingBase.unit
        );
        existing.jumlahTersedia = back.amount;
        // update tanggalKadaluarsa conservatively to the later date if provided
        if (
          payload.tanggalKadaluarsa &&
          (!existing.tanggalKadaluarsa ||
            existing.tanggalKadaluarsa < payload.tanggalKadaluarsa)
        )
          existing.tanggalKadaluarsa = payload.tanggalKadaluarsa;
        existing.lokasiPenyimpanan =
          payload.lokasiPenyimpanan || existing.lokasiPenyimpanan;
        await existing.save();
        console.log(
          `🔁 Bahan diperbarui (merge): ${existing.namaBahan} pemilik=${payload.pemilik} jumlah=${existing.jumlahTersedia} ${existing.satuan}`
        );
        return res.json({
          sukses: true,
          data: existing,
          pesan: "Stok bahan diperbarui (digabung dengan item yang ada)",
        });
      } else {
        // unit mismatch: create a new entry
        const bahan = new Bahan(payload);
        await bahan.save();
        console.log(
          `➕ Bahan baru dibuat (unit mismatch): ${bahan.namaBahan} pemilik=${payload.pemilik} jumlah=${bahan.jumlahTersedia} ${bahan.satuan}`
        );
        return res.status(201).json({ sukses: true, data: bahan });
      }
    }
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

    await Bahan.findByIdAndDelete(req.params.id);
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
      return res
        .status(401)
        .json({ sukses: false, pesan: "Autentikasi diperlukan" });

    // cleanup expired items before generating pantry challenge
    try {
      await Bahan.deleteMany({
        pemilik: sessId,
        tanggalKadaluarsa: { $lt: new Date() },
      });
    } catch (e) {
      console.warn(
        "[CLEANUP] gagal hapus bahan kadaluarsa (pantry-challenge):",
        e.message || e
      );
    }

    const bahanHampir = await Bahan.dapatkanHampirKadaluarsa(sessId, 3);
    console.log(`[PANTRY-DEBUG] sessId=${sessId} requested pantry-challenge`);
    console.log(
      `[PANTRY-DEBUG] found ${bahanHampir ? bahanHampir.length : 0} items`
    );
    if (bahanHampir && bahanHampir.length) {
      bahanHampir.forEach((b) =>
        console.log(
          `[PANTRY-DEBUG] id=${b._id} nama=${b.namaBahan} tanggalKadaluarsa=${b.tanggalKadaluarsa}`
        )
      );
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

    // helper: recommend default location and expiry days based on name
    const rekomendasiLokasi = (nama) => {
      if (!nama) return "rak_dapur";
      const s = String(nama).toLowerCase();
      if (/daging|ayam|sapi|kambing|ikan|seafood|udang|salmon/.test(s))
        return "kulkas";
      if (/es|beku|frozen/.test(s)) return "freezer";
      if (/sayur|sayuran|bayam|wortel|selada/.test(s)) return "kulkas";
      if (/buah|apel|pisang|jeruk|mangga|pepaya/.test(s)) return "rak_dapur";
      if (/telur/.test(s)) return "kulkas";
      if (/roti|tawar/.test(s)) return "rak_dapur";
      if (/minyak|oil|olive|butter|mentega/.test(s)) return "rak_dapur";
      if (/susu|yoghurt|keju|cream/.test(s)) return "kulkas";
      return "rak_dapur";
    };
    const rekomendasiDays = (nama, lokasi) => {
      const s = String(nama || "").toLowerCase();
      // default long shelf
      let days = 30;
      // meat & similar: prefer 2 days at room, 14 days in fridge
      if (/daging|sapi|kambing/.test(s)) {
        if (lokasi === "kulkas") days = 14;
        else if (lokasi === "lemari" || lokasi === "rak_dapur") days = 2;
        else days = 3; // fallback
      } else if (/ayam|ikan|seafood|udang|salmon/.test(s)) {
        if (lokasi === "kulkas") days = 14;
        else days = 2;
      } else if (/sayur|sayuran|bayam|wortel|selada/.test(s)) days = 5;
      else if (/buah|apel|pisang|jeruk|mangga|pepaya/.test(s)) days = 7;
      else if (/telur/.test(s)) days = 21;
      else if (/roti/.test(s)) days = 3;
      else if (/minyak|oil|olive|butter|mentega/.test(s)) days = 365;
      else if (/susu|yoghurt/.test(s)) days = 7;
      // cap at 14 days if storing in fridge or freezer per request for non-meat items
      if ((lokasi === "kulkas" || lokasi === "freezer") && days > 14) return 14;
      return days;
    };

    // Normalize and prepare items, then perform merge/upsert to avoid duplicates
    const escapeRegex = (s) =>
      String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const convertToBase = (jumlah, satuan) => {
      const u = String(satuan || "")
        .trim()
        .toLowerCase();
      if (u === "kg") return { amount: Number(jumlah) * 1000, unit: "gram" };
      if (u === "g" || u === "gram")
        return { amount: Number(jumlah), unit: "gram" };
      if (u === "l" || u === "liter" || u === "litre")
        return { amount: Number(jumlah) * 1000, unit: "ml" };
      if (u === "ml" || u === "milliliter")
        return { amount: Number(jumlah), unit: "ml" };
      return { amount: Number(jumlah) || 0, unit: u || "" };
    };
    const fromBaseToUnit = (amountBase, targetUnit) => {
      const u = String(targetUnit || "")
        .trim()
        .toLowerCase();
      if (u === "kg") return { amount: amountBase / 1000, unit: "kg" };
      if (u === "g" || u === "gram")
        return { amount: amountBase, unit: "gram" };
      if (u === "liter" || u === "l" || u === "litre")
        return { amount: amountBase / 1000, unit: "liter" };
      if (u === "ml" || u === "milliliter")
        return { amount: amountBase, unit: "ml" };
      return { amount: amountBase, unit: u || "" };
    };

    const results = [];
    for (const b of daftarBahan) {
      const item = { ...b, pemilik: userId };
      item.tanggalPembelian = item.tanggalPembelian
        ? new Date(item.tanggalPembelian)
        : new Date();
      item.lokasiPenyimpanan =
        item.lokasiPenyimpanan ||
        rekomendasiLokasi(item.namaBahan || item.nama || "");
      // compute suggested days and cap at 14 if stored in fridge/freezer
      let days = rekomendasiDays(
        item.namaBahan || item.nama || "",
        item.lokasiPenyimpanan
      );
      if (["kulkas", "freezer"].includes(item.lokasiPenyimpanan))
        days = Math.min(days, 14);
      const t = new Date(item.tanggalPembelian);
      t.setDate(t.getDate() + (Number.isFinite(days) ? days : 0));
      item.tanggalKadaluarsa = item.tanggalKadaluarsa
        ? new Date(item.tanggalKadaluarsa)
        : t;

      // Try to merge with existing bahan (case-insensitive exact name match)
      const nama = item.namaBahan || item.nama || "";
      const regex = new RegExp(`^${escapeRegex(nama)}$`, "i");
      let existing = await Bahan.findOne({
        pemilik: userId,
        namaBahan: regex,
        statusAktif: true,
      });
      // fallback: try stripping parenthetical qualifiers (e.g., "Bumbu rendang (halus)" -> "Bumbu rendang")
      if (!existing) {
        const stripped = String(nama || "")
          .replace(/\s*\(.+\)\s*/g, "")
          .trim();
        if (stripped && stripped !== nama) {
          const regex2 = new RegExp(`^${escapeRegex(stripped)}$`, "i");
          existing = await Bahan.findOne({
            pemilik: userId,
            namaBahan: regex2,
            statusAktif: true,
          });
        }
      }
      if (!existing) {
        const created = await Bahan.create(item);
        console.log(
          `➕ Bahan baru dibuat: ${created.namaBahan} pemilik=${userId} jumlah=${created.jumlahTersedia} ${created.satuan}`
        );
        results.push(created);
      } else {
        // attempt to combine amounts if units compatible
        const existingBase = convertToBase(
          existing.jumlahTersedia || 0,
          existing.satuan || ""
        );
        const newBase = convertToBase(
          item.jumlahTersedia || item.jumlah || 0,
          item.satuan || ""
        );
        if (
          existingBase.unit &&
          newBase.unit &&
          existingBase.unit === newBase.unit
        ) {
          const sumBase = (existingBase.amount || 0) + (newBase.amount || 0);
          // convert back to existing unit
          const back = fromBaseToUnit(
            sumBase,
            existing.satuan || existingBase.unit
          );
          existing.jumlahTersedia = back.amount;
          // update tanggalKadaluarsa conservatively to the later date
          if (
            !existing.tanggalKadaluarsa ||
            existing.tanggalKadaluarsa < item.tanggalKadaluarsa
          )
            existing.tanggalKadaluarsa = item.tanggalKadaluarsa;
          existing.lokasiPenyimpanan =
            item.lokasiPenyimpanan || existing.lokasiPenyimpanan;
          await existing.save();
          console.log(
            `🔁 Bahan diperbarui (merge): ${existing.namaBahan} pemilik=${userId} jumlah=${existing.jumlahTersedia} ${existing.satuan}`
          );
          results.push(existing);
        } else {
          // can't merge due to unit mismatch — create separate entry
          const created = await Bahan.create(item);
          console.log(
            `➕ Bahan baru dibuat (unit mismatch): ${created.namaBahan} pemilik=${userId} jumlah=${created.jumlahTersedia} ${created.satuan}`
          );
          results.push(created);
        }
      }
    }

    res.status(201).json({ sukses: true, data: results });
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
    if (!sessId)
      return res
        .status(401)
        .json({ sukses: false, pesan: "Autentikasi diperlukan" });

    // days parameter controls how many days into the future to consider (inclusive)
    const days = Math.max(0, parseInt(req.query.days || "3", 10));

    const batas = new Date();
    batas.setHours(23, 59, 59, 999);
    batas.setDate(batas.getDate() + days);

    // find items that have tanggalKadaluarsa <= end of target day
    const items = await Bahan.find({
      pemilik: sessId,
      statusAktif: true,
      tanggalKadaluarsa: { $exists: true, $lte: batas },
    }).sort({ tanggalKadaluarsa: 1 });

    console.log(
      `[PANTRY-DEBUG] sessId=${sessId} days=${days} targetDate=${batas.toISOString()} foundExpired=${
        items.length
      }`
    );
    items.forEach((b) =>
      console.log(
        `[PANTRY-DEBUG] expired id=${b._id} nama=${b.namaBahan} tanggalKadaluarsa=${b.tanggalKadaluarsa}`
      )
    );

    res.json({ sukses: true, data: { kadaluarsa: items } });
  } catch (err) {
    console.error("❌ Gagal dapatkan bahan kadaluarsa:", err);
    res
      .status(500)
      .json({ sukses: false, pesan: "Gagal mengambil bahan kadaluarsa" });
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
