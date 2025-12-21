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
    return res
      .status(500)
      .render("admin/resep_list", {
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
    return res
      .status(500)
      .render("admin/resep_list", {
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
    return res
      .status(500)
      .render("admin/resep_pending", {
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
    const daftarBahan =
      typeof body.daftarBahan === "string"
        ? body.daftarBahan
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : Array.isArray(body.daftarBahan)
        ? body.daftarBahan
        : [];

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
    return res
      .status(500)
      .render("admin/resep_new", {
        judul: "Tambah Resep Baru",
        error: "Gagal menyimpan resep",
      });
  }
};

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
    } else if (typeof r.daftarBahan === "string") {
      r.daftarBahanText = r.daftarBahan;
    } else {
      r.daftarBahanText = "";
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

    // parse fields and map to model names
    const update = {
      namaResep: data.namaResep || undefined,
      deskripsi: data.deskripsi || undefined,
      kategori: data.kategori || undefined,
      porsi: data.porsi ? Number(data.porsi) : undefined,
      waktuPersiapanMenit: data.waktuPersiapan
        ? Number(data.waktuPersiapan)
        : undefined,
      waktuMemasakMenit: data.waktuMemasak
        ? Number(data.waktuMemasak)
        : undefined,
      status: data.status || undefined,
    };

    // if status is set to approved, record approval metadata
    if (update.status === "approved") {
      update.approvedAt = new Date();
      update.moderationBy = req.session.user ? req.session.user._id : undefined;
    }
    // parse daftarBahan and langkah from textarea to arrays of strings
    if (typeof data.daftarBahan === "string") {
      update.daftarBahan = data.daftarBahan
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(data.daftarBahan)) {
      update.daftarBahan = data.daftarBahan
        .map((s) => (typeof s === "string" ? s.trim() : s))
        .filter(Boolean);
    }

    if (typeof data.langkah === "string") {
      update.langkah = data.langkah
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (Array.isArray(data.langkah)) {
      update.langkah = data.langkah
        .map((s) => (typeof s === "string" ? s.trim() : s))
        .filter(Boolean);
    }

    // remove undefined keys
    Object.keys(update).forEach(
      (k) => update[k] === undefined && delete update[k]
    );

    await Resep.findByIdAndUpdate(id, update, { new: true });
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
