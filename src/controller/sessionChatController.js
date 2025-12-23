const SesiChat = require("../models/sesiChat");
const Pengguna = require("../models/Pengguna");

// Buat sesi chat baru
exports.buatSessionChat = async (req, res) => {
  try {
    const idPengguna = req.session.user?._id;
    if (!idPengguna) {
      return res.status(401).json({ error: "Tidak terautentikasi" });
    }

    const sessionBaru = new SesiChat({
      idPengguna,
      namaSession: `Sesi ${new Date().toLocaleDateString("id-ID")}`,
    });

    await sessionBaru.save();
    res.json({
      sukses: true,
      data: {
        _id: sessionBaru._id,
        namaSession: sessionBaru.namaSession,
        tanggalDibuat: sessionBaru.tanggalDibuat,
        riwayatChat: [],
      },
    });
  } catch (err) {
    console.error("Gagal membuat session chat:", err);
    res.status(500).json({ error: "Gagal membuat sesi" });
  }
};

// Ambil semua sesi chat pengguna
exports.ambilSemuaSessionChat = async (req, res) => {
  try {
    const idPengguna = req.session.user?._id;
    if (!idPengguna) {
      return res.status(401).json({ error: "Tidak terautentikasi" });
    }

    const sessions = await SesiChat.find({ idPengguna, aktif: true })
      .sort({ tanggalDiperbarui: -1 })
      .select("_id namaSession tanggalDibuat tanggalDiperbarui riwayatChat");

    const sessionsFormated = sessions.map((s) => ({
      _id: s._id,
      namaSession: s.namaSession,
      tanggalDibuat: s.tanggalDibuat,
      tanggalDiperbarui: s.tanggalDiperbarui,
      jumlahPesan: s.riwayatChat?.length || 0,
      previewPesan:
        s.riwayatChat?.[s.riwayatChat.length - 1]?.pesan?.substring(0, 50) ||
        "",
    }));

    res.json({ sukses: true, data: sessionsFormated });
  } catch (err) {
    console.error("Gagal ambil session chat:", err);
    res.status(500).json({ error: "Gagal mengambil sesi" });
  }
};

// Ambil detail sesi chat
exports.ambilDetailSessionChat = async (req, res) => {
  try {
    const idPengguna = req.session.user?._id;
    const { idSession } = req.params;

    if (!idPengguna) {
      return res.status(401).json({ error: "Tidak terautentikasi" });
    }

    const session = await SesiChat.findOne({
      _id: idSession,
      idPengguna,
      aktif: true,
    });

    if (!session) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }

    res.json({
      sukses: true,
      data: {
        _id: session._id,
        namaSession: session.namaSession,
        tanggalDibuat: session.tanggalDibuat,
        tanggalDiperbarui: session.tanggalDiperbarui,
        riwayatChat: session.riwayatChat,
      },
    });
  } catch (err) {
    console.error("Gagal ambil detail session:", err);
    res.status(500).json({ error: "Gagal mengambil detail sesi" });
  }
};

// Perbarui nama sesi
exports.perbaruiNamaSession = async (req, res) => {
  try {
    const idPengguna = req.session.user?._id;
    const { idSession } = req.params;
    const { namaSession } = req.body;

    if (!idPengguna) {
      return res.status(401).json({ error: "Tidak terautentikasi" });
    }

    if (!namaSession || namaSession.trim().length === 0) {
      return res.status(400).json({ error: "Nama sesi tidak boleh kosong" });
    }

    const session = await SesiChat.findOneAndUpdate(
      { _id: idSession, idPengguna, aktif: true },
      { namaSession: namaSession.trim() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }

    res.json({ sukses: true, data: session });
  } catch (err) {
    console.error("Gagal perbarui nama session:", err);
    res.status(500).json({ error: "Gagal memperbarui sesi" });
  }
};

// Hapus sesi (soft delete)
exports.hapusSession = async (req, res) => {
  try {
    const idPengguna = req.session.user?._id;
    const { idSession } = req.params;

    if (!idPengguna) {
      return res.status(401).json({ error: "Tidak terautentikasi" });
    }

    const session = await SesiChat.findOneAndUpdate(
      { _id: idSession, idPengguna },
      { aktif: false },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }

    res.json({ sukses: true, message: "Sesi berhasil dihapus" });
  } catch (err) {
    console.error("Gagal hapus session:", err);
    res.status(500).json({ error: "Gagal menghapus sesi" });
  }
};

// Tambah pesan ke sesi
exports.tambahPesanKeSession = async (req, res) => {
  try {
    const idPengguna = req.session.user?._id;
    const { idSession } = req.params;
    const { tipe, pesan } = req.body;

    if (!idPengguna) {
      return res.status(401).json({ error: "Tidak terautentikasi" });
    }

    if (!["pengguna", "koki"].includes(tipe) || !pesan) {
      return res.status(400).json({ error: "Data pesan tidak valid" });
    }

    const session = await SesiChat.findOneAndUpdate(
      { _id: idSession, idPengguna, aktif: true },
      {
        $push: {
          riwayatChat: {
            tipe,
            pesan,
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Sesi tidak ditemukan" });
    }

    res.json({ sukses: true, data: session });
  } catch (err) {
    console.error("Gagal tambah pesan session:", err);
    res.status(500).json({ error: "Gagal menambah pesan" });
  }
};
