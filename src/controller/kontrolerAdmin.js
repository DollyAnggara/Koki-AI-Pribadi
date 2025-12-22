const Resep = require("../models/Resep");

// List all recipes (admin view)
const dashboardPage = async (req, res) => {
  try {
    const [totalResep, pendingCount, approvedCount] = await Promise.all([
      Resep.countDocuments({}),
      Resep.countDocuments({ status: "pending" }),
      Resep.countDocuments({ status: "approved" }),
    ]);
    return res.render("admin/dashboard", {
      judul: "Admin Dashboard",
      stats: { totalResep, pendingCount, approvedCount },
    });
  } catch (err) {
    console.error("❌ Gagal render dashboard admin:", err);
    return res.status(500).render("admin/resep_list", {
      judul: "Manajemen Resep",
      resep: [],
      error: "Gagal ambil data",
    });
  }
};

const listResepPage = async (req, res) => {
  try {
    // populate submittedBy so we can display the username in templates
    let semua = await Resep.find({})
      .sort({ tanggalDibuat: -1 })
      .populate("submittedBy", "namaPengguna")
      .lean();

    // Get stats for the header
    const [totalResep, pendingCount, approvedCount] = await Promise.all([
      Resep.countDocuments({}),
      Resep.countDocuments({ status: "pending" }),
      Resep.countDocuments({ status: "approved" }),
    ]);

    // map internal kategori values to human-friendly labels
    const kategoriMap = {
      makan_malam: "Makan Malam",
      makan_siang: "Makan Siang",
      sarapan: "Sarapan",
      minuman: "Minuman",
      cemilan: "Cemilan",
    };

    semua = semua.map((r) => {
      const isApproved = r.status === "approved";
      const isPending = r.status === "pending";
      const isRejected = r.status === "rejected";

      const approvedAt = isApproved
        ? new Date(
            r.approvedAt || r.tanggalDiperbarui || r.tanggalDibuat
          ).toLocaleString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : null;

      return {
        ...r,
        kategoriLabel:
          kategoriMap[r.kategori] || (r.kategori || "").replace("_", " "),
        isApproved,
        isPending,
        isRejected,
        approvedAt,
      };
    });

    return res.render("admin/resep_list", {
      judul: "Manajemen Resep",
      resep: semua,
      stats: { totalResep, pendingCount, approvedCount },
    });
  } catch (err) {
    console.error("❌ Gagal ambil resep untuk admin:", err);
    return res.status(500).render("admin/resep_list", {
      judul: "Manajemen Resep",
      resep: [],
      error: "Gagal ambil data",
    });
  }
};

const listPending = async (req, res) => {
  try {
    // populate submittedBy for pending list as well
    const pending = await Resep.find({ status: "pending" })
      .sort({ tanggalDibuat: -1 })
      .populate("submittedBy", "namaPengguna")
      .lean();
    return res.render("admin/resep_pending", {
      judul: "Konfirmasi Resep (Pending)",
      resep: pending,
    });
  } catch (err) {
    console.error("❌ Gagal ambil resep pending:", err);
    return res.status(500).render("admin/resep_pending", {
      judul: "Konfirmasi Resep (Pending)",
      resep: [],
      error: "Gagal ambil data",
    });
  }
};

const newResepPage = (req, res) => {
  return res.render("admin/resep_new", { judul: "Tambah Resep Baru" });
};

const createResep = async (req, res) => {
  try {
    const body = req.body || {};
    // normalize minimal fields and parse multiline textareas
    const daftarBahanRaw =
      typeof body.daftarBahan === "string"
        ? body.daftarBahan
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(body.daftarBahan)
        ? body.daftarBahan
        : [];

    // Parse bahan strings ke objects
    const daftarBahan = daftarBahanRaw.map(parseBahanString);

    const langkah =
      typeof body.langkah === "string"
        ? body.langkah
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(body.langkah)
        ? body.langkah
        : [];

    const r = new Resep({
      namaResep: body.namaResep || "Untitled",
      deskripsi: body.deskripsi || "",
      kategori: body.kategori || "",
      porsi: Number(body.porsi) || 1,
      waktuPersiapanMenit: Number(body.waktuPersiapan) || undefined,
      waktuMemasakMenit: Number(body.waktuMemasak) || undefined,
      daftarBahan: daftarBahan,
      langkah: langkah,
      status: body.status || "approved",
      submittedBy: req.session.user ? req.session.user._id : null,
      approvedAt:
        (body.status || "approved") === "approved" ? new Date() : undefined,
      moderationBy:
        (body.status || "approved") === "approved"
          ? req.session.user
            ? req.session.user._id
            : null
          : undefined,
    });
    await r.save();
    return res.redirect("/admin/resep");
  } catch (err) {
    console.error("❌ Gagal buat resep (admin):", err);
    return res.status(500).render("admin/resep_new", {
      judul: "Tambah Resep Baru",
      error: "Gagal menyimpan resep",
    });
  }
};

// Helper function untuk parse string bahan menjadi object
function parseBahanString(line) {
  if (!line || typeof line !== "string") {
    return { namaBahan: "", jumlah: 0, satuan: "" };
  }

  line = line.trim();
  if (!line) {
    return { namaBahan: "", jumlah: 0, satuan: "" };
  }

  // Handle format: "nama jumlah satuan"
  const parts = line.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { namaBahan: "", jumlah: 0, satuan: "" };
  }

  // Check if last two tokens are number + unit
  const isNumeric = (s) => /^(\d+(?:[.,]\d+)?)$/.test(String(s));

  if (parts.length >= 2) {
    const secondLast = parts[parts.length - 2];
    const last = parts[parts.length - 1];

    if (isNumeric(secondLast)) {
      // Pattern: "Nama ... <jumlah> <satuan>"
      const jumlah = Number(String(secondLast).replace(",", "."));
      const satuan = last;
      const nama = parts.slice(0, parts.length - 2).join(" ");
      return { namaBahan: nama, jumlah, satuan };
    }

    if (isNumeric(last)) {
      // Pattern: "Nama ... <jumlah>" (no unit)
      const jumlah = Number(String(last).replace(",", "."));
      const nama = parts.slice(0, parts.length - 1).join(" ");
      return { namaBahan: nama, jumlah, satuan: "" };
    }
  }

  // Fallback: treat entire line as name
  return { namaBahan: line, jumlah: 0, satuan: "" };
}

// Helper function untuk parse array langkah strings menjadi array objects
function parseLangkahArray(langkahArray) {
  if (!Array.isArray(langkahArray)) {
    return [];
  }

  return langkahArray
    .map((langkah, index) => {
      // Skip empty strings
      if (typeof langkah === "string" && langkah.trim()) {
        return {
          nomorUrut: index + 1,
          deskripsi: langkah.trim(),
          durasiMenit: undefined,
          tips: undefined,
        };
      }
      // If already an object, ensure it has required fields
      if (typeof langkah === "object" && langkah) {
        return {
          nomorUrut: langkah.nomorUrut || index + 1,
          deskripsi: langkah.deskripsi || "",
          durasiMenit: langkah.durasiMenit,
          tips: langkah.tips,
        };
      }
      return null;
    })
    .filter(Boolean); // Remove null entries
}

const editResepPage = async (req, res) => {
  try {
    // populate submittedBy so edit view can show who submitted the recipe
    const r = await Resep.findById(req.params.id)
      .populate("submittedBy", "namaPengguna")
      .lean();
    if (!r) return res.redirect("/admin/resep");

    // add convenience flags for templates
    r.isApproved = r.status === "approved";
    r.isPending = r.status === "pending";
    r.isRejected = r.status === "rejected";

    // prepare form-friendly fields: waktu and textareas
    r.waktuPersiapan = r.waktuPersiapanMenit || "";
    r.waktuMemasak = r.waktuMemasakMenit || "";

    // kalori dari nutrisiPerPorsi
    if (
      r.nutrisiPerPorsi &&
      (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal)
    ) {
      r.kalori = r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal;
    }

    // daftarBahan can be stored as array of objects or as text; normalize to newline string
    if (Array.isArray(r.daftarBahan) && r.daftarBahan.length) {
      r.daftarBahanText = r.daftarBahan
        .map((b) => {
          if (typeof b === "string") return b;
          const parts = [b.namaBahan || "", b.jumlah || "", b.satuan || ""].map(
            (p) => (p === undefined || p === null ? "" : String(p))
          );
          return parts.filter(Boolean).join(" ");
        })
        .join("\n");
      // Also provide JSON for JavaScript initialization
      r.daftarBahanJSON = JSON.stringify(r.daftarBahan);
    } else if (typeof r.daftarBahan === "string") {
      r.daftarBahanText = r.daftarBahan;
      r.daftarBahanJSON = "[]";
    } else {
      r.daftarBahanText = "";
      r.daftarBahanJSON = "[]";
    }

    // langkah as newline strings
    if (Array.isArray(r.langkah) && r.langkah.length) {
      r.langkahText = r.langkah
        .map((l) => (typeof l === "string" ? l : l.deskripsi || ""))
        .join("\n");
    } else if (typeof r.langkah === "string") {
      r.langkahText = r.langkah;
    } else {
      r.langkahText = "";
    }

    return res.render("admin/resep_edit", { judul: "Edit Resep", resep: r });
  } catch (err) {
    console.error("❌ Gagal ambil resep edit:", err);
    return res.redirect("/admin/resep");
  }
};

const updateResep = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body || {};

    console.log(
      "🔍 DEBUG - Semua data yang diterima dari form:",
      JSON.stringify(data, null, 2)
    );

    // parse fields and map to model names
    const update = {};

    if (data.namaResep) update.namaResep = data.namaResep;
    if (data.deskripsi !== undefined) update.deskripsi = data.deskripsi;
    if (data.kategori) update.kategori = data.kategori;
    if (data.porsi) update.porsi = Number(data.porsi);
    if (data.waktuPersiapan)
      update.waktuPersiapanMenit = Number(data.waktuPersiapan);
    if (data.waktuMemasak) update.waktuMemasakMenit = Number(data.waktuMemasak);
    if (data.status) update.status = data.status;

    // Handle kalori: simpan ke nutrisiPerPorsi menggunakan dot notation
    console.log(
      "🔍 DEBUG - data.kalori:",
      data.kalori,
      "type:",
      typeof data.kalori,
      "isEmpty:",
      data.kalori === ""
    );

    if (
      data.kalori !== undefined &&
      data.kalori !== null &&
      String(data.kalori).trim() !== ""
    ) {
      const kaloriValue = parseFloat(data.kalori);
      console.log(
        "📊 Kalori diterima:",
        data.kalori,
        "-> parseFloat:",
        kaloriValue,
        "isNaN:",
        isNaN(kaloriValue)
      );

      if (!isNaN(kaloriValue)) {
        // Gunakan dot notation untuk nested update
        update["nutrisiPerPorsi.kalori"] = kaloriValue;
        console.log("✅ Set nutrisiPerPorsi.kalori:", kaloriValue);
      }
    }

    // if status is set to approved, record approval metadata
    if (update.status === "approved") {
      update.approvedAt = new Date();
      update.moderationBy = req.session?.user?._id;
    }

    // parse daftarBahan and langkah from textarea to arrays
    if (typeof data.daftarBahan === "string") {
      const daftarBahanRaw = data.daftarBahan
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      // Parse bahan strings ke objects menggunakan helper function
      update.daftarBahan = daftarBahanRaw.map(parseBahanString);
    } else if (Array.isArray(data.daftarBahan)) {
      const daftarBahanRaw = data.daftarBahan
        .map((s) => (typeof s === "string" ? s.trim() : s))
        .filter(Boolean);
      update.daftarBahan = daftarBahanRaw.map(parseBahanString);
    }

    // Parse langkah dari string atau array ke proper schema format
    if (typeof data.langkah === "string") {
      const langkahRaw = data.langkah
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      update.langkah = parseLangkahArray(langkahRaw);
    } else if (Array.isArray(data.langkah)) {
      const langkahRaw = data.langkah
        .map((s) => (typeof s === "string" ? s.trim() : s))
        .filter(Boolean);
      update.langkah = parseLangkahArray(langkahRaw);
    }

    console.log("📝 Final update object:", JSON.stringify(update, null, 2));

    const hasil = await Resep.findByIdAndUpdate(id, update, { new: true });
    console.log("💾 Hasil update - nutrisiPerPorsi:", hasil?.nutrisiPerPorsi);
    return res.redirect("/admin/resep");
  } catch (err) {
    console.error("❌ Gagal update resep:", err);
    return res.status(500).redirect("/admin/resep");
  }
};

const deleteResep = async (req, res) => {
  try {
    const id = req.params.id;
    await Resep.findByIdAndDelete(id);
    if (req.xhr || req.headers.accept.indexOf("json") > -1)
      return res.json({ sukses: true });
    return res.redirect("/admin/resep");
  } catch (err) {
    console.error("❌ Gagal hapus resep:", err);
    if (req.xhr)
      return res.status(500).json({ sukses: false, pesan: "Gagal hapus" });
    return res.redirect("/admin/resep");
  }
};

const approveResep = async (req, res) => {
  try {
    const id = req.params.id;
    const note = req.body.moderationNote || "";
    const updates = {
      status: "approved",
      moderationNote: note,
      approvedAt: new Date(),
      moderationBy: req.session.user ? req.session.user._id : null,
    };
    const r = await Resep.findByIdAndUpdate(id, updates, { new: true });
    if (!r)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Resep tidak ditemukan" });
    return res.json({ sukses: true, pesan: "Resep disetujui" });
  } catch (err) {
    console.error("❌ Gagal approve resep:", err);
    return res
      .status(500)
      .json({ sukses: false, pesan: "Gagal setujui resep" });
  }
};

const rejectResep = async (req, res) => {
  try {
    const id = req.params.id;
    const note = req.body.moderationNote || "";
    const r = await Resep.findByIdAndUpdate(
      id,
      { status: "rejected", moderationNote: note },
      { new: true }
    );
    if (!r)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Resep tidak ditemukan" });
    return res.json({ sukses: true, pesan: "Resep ditolak" });
  } catch (err) {
    console.error("❌ Gagal reject resep:", err);
    return res.status(500).json({ sukses: false, pesan: "Gagal tolak resep" });
  }
};

module.exports = {
  dashboardPage,
  listResepPage,
  listPending,
  newResepPage,
  createResep,
  editResepPage,
  updateResep,
  deleteResep,
  approveResep,
  rejectResep,
};
