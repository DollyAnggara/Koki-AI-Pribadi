/**
 * src/controller/kontrolerPengguna.js
 * Registrasi, login, profil, preferensi, favorit
 */

const Pengguna = require("../models/Pengguna");

const registrasiPengguna = async (req, res) => {
  try {
    let { namaPengguna, email, kataSandi, namaLengkap } = req.body;
    if (!email || !namaPengguna || !kataSandi)
      return res
        .status(400)
        .json({
          sukses: false,
          pesan: "Nama pengguna, email, dan kata sandi wajib diisi",
        });
    email = String(email).trim().toLowerCase();

    // simple email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res
        .status(400)
        .json({ sukses: false, pesan: "Format email tidak valid" });

    const sudah = await Pengguna.findOne({
      $or: [{ email }, { namaPengguna }],
    });
    if (sudah)
      return res
        .status(400)
        .json({ sukses: false, pesan: "Email atau username sudah terdaftar" });

    const pengguna = new Pengguna({
      namaPengguna,
      email,
      kataSandi,
      namaLengkap,
    });
    await pengguna.save();
    const out = pengguna.toObject();
    delete out.kataSandi;
    if (req.is("application/json")) {
      return res.status(201).json({ sukses: true, data: out });
    }

    return res.redirect("/login?success=1");
  } catch (err) {
    console.error("❌ Gagal registrasi:", err);
    // handle duplicate key error more clearly
    if (err && err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || "field";
      const pesan = `Nilai ${field} sudah terdaftar`;
      if (!req.is("application/json"))
        return res.redirect(`/register?error=${encodeURIComponent(pesan)}`);
      return res.status(400).json({ sukses: false, pesan });
    }

    if (!req.is("application/json")) {
      const pesan = encodeURIComponent(err.message || "Gagal registrasi");
      return res.redirect(`/register?error=${pesan}`);
    }
    res
      .status(400)
      .json({
        sukses: false,
        pesan: "Gagal registrasi",
        kesalahan: err.message,
      });
  }
};

// New: check if email is available
const cekEmail = async (req, res) => {
  try {
    const emailRaw = req.query.email;
    if (!emailRaw)
      return res
        .status(400)
        .json({ sukses: false, pesan: "Parameter email diperlukan" });
    const email = String(emailRaw).trim().toLowerCase();
    const ada = await Pengguna.exists({ email });
    res.json({ sukses: true, tersedia: !ada });
  } catch (err) {
    console.error("❌ Gagal cek email:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal memeriksa email" });
  }
};

const loginPengguna = async (req, res) => {
  try {
    const { email, kataSandi } = req.body;
    const pengguna = await Pengguna.findOne({ email, statusAktif: true });
    if (!pengguna || !pengguna.verifikasiKataSandi(kataSandi)) {
      if (!req.is("application/json"))
        return res.redirect(
          "/login?error=" + encodeURIComponent("Email atau kata sandi salah")
        );
      return res
        .status(401)
        .json({ sukses: false, pesan: "Email atau kata sandi salah" });
    }

    // Successful login
    // Attach to session for browser form submissions
    if (!req.is("application/json")) {
      req.session.user = {
        _id: pengguna._id,
        id: pengguna._id,
        namaPengguna: pengguna.namaPengguna,
        email: pengguna.email,
        role: pengguna.role || 'user'
      };

      // "Remember me" support: if the form included the remember field, make session persistent
      // and set a long-lived cookie with the remembered email so the client can pre-fill the login form.
      if (req.body && req.body.remember) {
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        req.session.cookie.maxAge = maxAge;
        // store a non-httpOnly cookie so client-side JS can read it to pre-fill the email
        res.cookie("rememberEmail", pengguna.email, {
          maxAge,
          httpOnly: false,
          sameSite: "Lax",
        });
        res.cookie("rememberMe", "1", {
          maxAge,
          httpOnly: false,
          sameSite: "Lax",
        });
      } else {
        // default: session cookie (expires on browser close) and clear any existing remember cookies
        req.session.cookie.maxAge = null;
        res.clearCookie("rememberEmail");
        res.clearCookie("rememberMe");
      }

      // Redirect admin users to explicit admin dashboard route, others to home
      if (pengguna.role === 'admin') return res.redirect('/admin/dashboard');
      return res.redirect("/?welcome=1");
    }

    const out = pengguna.toObject();
    delete out.kataSandi;
    res.json({ sukses: true, data: out });
  } catch (err) {
    console.error("❌ Gagal login:", err);
    if (!req.is("application/json"))
      return res.redirect("/login?error=" + encodeURIComponent("Gagal login"));
    res.status(500).json({ sukses: false, pesan: "Gagal login" });
  }
};

const dapatkanProfil = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id).select(
      "-kataSandi"
    );
    if (!pengguna)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Pengguna tidak ditemukan" });
    res.json({ sukses: true, data: pengguna });
  } catch (err) {
    console.error("❌ Gagal dapatkan profil:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal mendapatkan profil" });
  }
};

const perbaruiProfil = async (req, res) => {
  try {
    const data = req.body;
    delete data.kataSandi;
    const pengguna = await Pengguna.findByIdAndUpdate(req.params.id, data, {
      new: true,
      runValidators: true,
    }).select("-kataSandi");
    if (!pengguna)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Pengguna tidak ditemukan" });
    res.json({ sukses: true, data: pengguna });
  } catch (err) {
    console.error("❌ Gagal perbarui profil:", err);
    res.status(400).json({ sukses: false, pesan: "Gagal memperbarui profil" });
  }
};

const perbaruiPreferensiDiet = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Pengguna tidak ditemukan" });
    pengguna.preferensiDiet = {
      ...(pengguna.preferensiDiet || {}),
      ...(req.body || {}),
    };
    await pengguna.save();
    res.json({ sukses: true, data: pengguna.preferensiDiet });
  } catch (err) {
    console.error("❌ Gagal perbarui preferensi:", err);
    res
      .status(400)
      .json({ sukses: false, pesan: "Gagal memperbarui preferensi" });
  }
};

const perbaruiPengaturanNotifikasi = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Pengguna tidak ditemukan" });
    pengguna.pengaturanNotifikasi = {
      ...(pengguna.pengaturanNotifikasi || {}),
      ...(req.body || {}),
    };
    await pengguna.save();
    res.json({ sukses: true, data: pengguna.pengaturanNotifikasi });
  } catch (err) {
    console.error("❌ Gagal perbarui pengaturan:", err);
    res
      .status(400)
      .json({
        sukses: false,
        pesan: "Gagal memperbarui pengaturan notifikasi",
      });
  }
};

const tambahResepFavorit = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Pengguna tidak ditemukan" });
    if (!pengguna.resepFavorit.includes(req.params.idResep))
      pengguna.resepFavorit.push(req.params.idResep);
    await pengguna.save();
    res.json({ sukses: true, pesan: "Resep ditambahkan ke favorit" });
  } catch (err) {
    console.error("❌ Gagal tambah favorit:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal menambahkan favorit" });
  }
};

const hapusResepFavorit = async (req, res) => {
  try {
    const pengguna = await Pengguna.findById(req.params.id);
    if (!pengguna)
      return res
        .status(404)
        .json({ sukses: false, pesan: "Pengguna tidak ditemukan" });
    pengguna.resepFavorit = pengguna.resepFavorit.filter(
      (r) => String(r) !== String(req.params.idResep)
    );
    await pengguna.save();
    res.json({ sukses: true, pesan: "Resep dihapus dari favorit" });
  } catch (err) {
    console.error("❌ Gagal hapus favorit:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal menghapus favorit" });
  }
};

module.exports = {
  registrasiPengguna,
  cekEmail,
  loginPengguna,
  dapatkanProfil,
  perbaruiProfil,
  perbaruiPreferensiDiet,
  perbaruiPengaturanNotifikasi,
  tambahResepFavorit,
  hapusResepFavorit,
};
