/**
 * src/routes/pages.js
 * Render per-page views (file .hbs terpisah untuk setiap halaman utama)
 */
const express = require("express");
const router = express.Router();
const Resep = require("../models/Resep");

// Middleware: membutuhkan autentikasi
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect("/login");
  next();
}

router.get("/resep/:id", requireAuth, async (req, res) => {
  try {
    const r = await Resep.findById(req.params.id);
    if (!r)
      return res.status(404).render("resep_detail", {
        judul: "Resep Tidak Ditemukan",
        error: "Resep tidak ditemukan",
      });
    const waktu = (r.waktuPersiapanMenit || 0) + (r.waktuMemasakMenit || 0);
    const kalori =
      r.nutrisiPerPorsi && (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal)
        ? r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal
        : null;
    // Bangun tampilan yang ramah pengguna untuk menghindari menampilkan objek mentah di template
    const daftarRaw = r.daftarBahan || r.bahan || r.ingredients || [];
    const langkahRaw = r.langkah || r.steps || r.instruksi || [];

    const daftarBahanDisplay = (daftarRaw || []).map((it) => {
      if (!it) return "";
      if (typeof it === "string") return it;
      // mirip objek
      const nama = it.namaBahan || it.nama || it.name || it.item || "";
      const jumlah = it.jumlah || it.qty || it.jumlahTersedia || "";
      const satuan = it.satuan || it.unit || "";
      const parts = [];
      if (nama) parts.push(String(nama));
      if (jumlah !== undefined && jumlah !== "")
        parts.push(`${jumlah}${satuan ? " " + satuan : ""}`);
      return parts.join(" - ");
    });

    const langkahDisplay = (langkahRaw || []).map((lk, idx) => {
      if (!lk) return "";
      if (typeof lk === "string") return lk;
      const desc =
        lk.deskripsi || lk.text || lk.instruksi || lk.step || lk.title || "";
      const dur = lk.durasiMenit || lk.duration || "";
      const tips = lk.tips || lk.catatan || "";
      let s = `${desc}`;
      if (dur) s += ` (${dur} menit)`;
      if (tips) s += ` — Tips: ${tips}`;
      return s;
    });

    // Jika pengguna login, hitung bahan yang hilang dari pantry mereka
    let missingIngredients = [];
    try {
      if (
        req.session &&
        req.session.user &&
        (req.session.user._id || req.session.user.id)
      ) {
        const Bahan = require("../models/Bahan");
        const userId = req.session.user._id || req.session.user.id;

        const normalizeUnit = (u) => {
          if (!u) return "";
          const x = String(u).trim().toLowerCase();
          if (x === "g" || x === "gram" || x === "gramme") return "gram";
          if (x === "kg" || x === "kilogram") return "kg";
          if (x === "ml" || x === "milliliter") return "ml";
          if (x === "l" || x === "liter" || x === "litre") return "liter";
          if (x === "butir" || x === "potong" || x === "buah") return x;
          return x;
        };
        const toCanonical = (jumlah, satuan) => {
          const u = normalizeUnit(satuan);
          if (u === "kg") return { amount: (jumlah || 0) * 1000, unit: "gram" };
          if (u === "gram") return { amount: (jumlah || 0) * 1, unit: "gram" };
          if (u === "liter")
            return { amount: (jumlah || 0) * 1000, unit: "ml" };
          if (u === "ml") return { amount: (jumlah || 0) * 1, unit: "ml" };
          return { amount: jumlah || 0, unit: u || "" };
        };

        // memuat item pantry aktif pengguna sekali
        const pantry = await Bahan.find({ pemilik: userId, statusAktif: true });

        for (const b of daftarRaw || []) {
          const nama =
            typeof b === "string" ? b : b.namaBahan || b.nama || b.name || "";
          const reqJumlahRaw =
            b && typeof b === "object" ? b.jumlah || b.qty || 0 : 0;
          const reqSatuan =
            b && typeof b === "object" ? b.satuan || b.unit || "" : "";

          // Temukan padanan bahan makanan berdasarkan nama yang cocok
          const rx = new RegExp(
            (nama || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
          );
          const matches = pantry.filter((p) => rx.test(p.namaBahan || ""));

          if (!reqJumlahRaw || reqJumlahRaw === 0) {
            // Tidak ada jumlah yang ditentukan — cukup periksa ketersediaannya.
            if (!matches.length)
              missingIngredients.push({
                namaBahan: nama,
                alasan: "Tidak ada di daftar Bahan",
              });
            continue;
          }

          // jumlah total yang tersedia
          const reqCanon = toCanonical(Number(reqJumlahRaw) || 0, reqSatuan);
          let sumAvailable = 0;
          for (const m of matches) {
            const availableCanon = toCanonical(
              Number(m.jumlahTersedia || 0),
              m.satuan
            );
            if (
              availableCanon.unit &&
              reqCanon.unit &&
              availableCanon.unit === reqCanon.unit
            )
              sumAvailable += availableCanon.amount;
            // Jika satuan berbeda (misalnya, bahan makanan dalam kg dan permintaan dalam gram), Canonical akan menanganinya.
          }
          if (sumAvailable < (reqCanon.amount || 0)) {
            const needed = (reqCanon.amount || 0) - sumAvailable;
            // Konversi diperlukan kembali untuk meminta unit untuk ditampilkan.
            let displayAmount = needed;
            let displayUnit = reqCanon.unit;
            if (displayUnit === "gram" && displayAmount >= 1000) {
              displayAmount = Math.round((displayAmount / 1000) * 100) / 100;
              displayUnit = "kg";
            } else if (displayUnit === "ml" && displayAmount >= 1000) {
              displayAmount = Math.round((displayAmount / 1000) * 100) / 100;
              displayUnit = "liter";
            } else {
              displayAmount = Math.round(displayAmount * 100) / 100;
            }
            missingIngredients.push({
              namaBahan: nama,
              jumlah: displayAmount,
              satuan: displayUnit,
            });
          }
        }
      }
    } catch (err) {
      console.warn("Gagal hitung bahan hilang untuk resep:", err);
    }

    res.render("resep_detail", {
      judul: r.namaResep,
      resep: {
        _id: r._id,
        nama: r.namaResep,
        deskripsi: r.deskripsi,
        porsi: r.porsi,
        waktu,
        kalori: kalori ? Math.round(kalori) : "-",
        daftarBahan: daftarRaw,
        langkah: langkahRaw,
        // array yang diformat untuk rendering yang bersih
        daftarBahanDisplay,
        langkahDisplay,
        missingIngredients,
        // JSON mentah untuk penggunaan sisi klien (salinan aman)
        daftarBahanJSON: JSON.stringify(daftarRaw || []),
        missingIngredientsJSON: JSON.stringify(missingIngredients || []),
      },
    });
  } catch (err) {
    console.error("Gagal render detail resep:", err);
    res.status(500).render("resep_detail", {
      judul: "Resep",
      resep: null,
      error: "Gagal memuat resep",
    });
  }
});

router.get("/resep", requireAuth, async (req, res) => {
  try {
    // tampilkan resep yang disetujui untuk pengguna biasa; admin melihat semua
    const isAdmin =
      req.session && req.session.user && req.session.user.role === "admin";
    const baseFilter = isAdmin ? {} : { status: "approved" };

    const daftarResep = await Resep.find(baseFilter).limit(50);

    // hitung jumlah untuk diagnostik
    const [total, approvedCount, pendingCount, rejectedCount] =
      await Promise.all([
        Resep.countDocuments({}),
        Resep.countDocuments({ status: "approved" }),
        Resep.countDocuments({ status: "pending" }),
        Resep.countDocuments({ status: "rejected" }),
      ]);

    console.debug(
      `[GET /resep] isAdmin=${isAdmin} returned=${daftarResep.length} total=${total} approved=${approvedCount} pending=${pendingCount} rejected=${rejectedCount}`
    );

    // Pemetaan bidang ke bentuk yang ramah tampilan yang digunakan oleh template
    const resepUntukView = daftarResep.map((r) => {
      const waktu = (r.waktuPersiapanMenit || 0) + (r.waktuMemasakMenit || 0);
      const kalori =
        r.nutrisiPerPorsi &&
        (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal)
          ? r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal
          : null;
      return {
        _id: r._id,
        nama: r.namaResep,
        deskripsi: r.deskripsi,
        waktu,
        kalori: kalori ? Math.round(kalori) : "-",
      };
    });
    res.render("resep", {
      judul: "Resep - Koki AI Pribadi",
      resep: resepUntukView,
      counts: {
        total,
        approved: approvedCount,
        pending: pendingCount,
        rejected: rejectedCount,
      },
    });
  } catch (err) {
    console.error("Gagal render resep:", err);
    res.render("resep", {
      judul: "Resep - Koki AI Pribadi",
      resep: [],
      error: "Gagal memuat resep",
    });
  }
});

router.get("/chat", requireAuth, (req, res) => {
  res.render("chat", { judul: "Chat - Koki AI Pribadi" });
});

router.get("/timer", requireAuth, (req, res) => {
  res.render("timer", { judul: "Timer - Koki AI Pribadi" });
});

router.get("/menu", requireAuth, (req, res) => {
  res.render("menu", { judul: "Menu Mingguan - Koki AI Pribadi" });
});

router.get("/bahan", requireAuth, async (req, res) => {
  try {
    const Bahan = require("../models/Bahan");
    const penggunaId =
      req.session.user && (req.session.user._id || req.session.user.id);
    const daftarBahan = penggunaId
      ? await Bahan.find({ pemilik: penggunaId }).sort({ namaBahan: 1 })
      : [];
    res.render("bahan", {
      judul: "Bahan Saya - Koki AI Pribadi",
      bahan: daftarBahan,
    });
  } catch (err) {
    console.error("Gagal render bahan:", err);
    res.render("bahan", {
      judul: "Bahan Saya - Koki AI Pribadi",
      bahan: [],
      error: "Gagal memuat bahan",
    });
  }
});

// halaman pantry (rute opsional)
router.get("/pantry", requireAuth, (req, res) => {
  res.render("pantry", { judul: "Pantry - Koki AI Pribadi" });
});

module.exports = router;
