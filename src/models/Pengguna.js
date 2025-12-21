const mongoose = require("mongoose");
const crypto = require("crypto");
let bcrypt;
let bcryptFallback = null;
try {
  bcrypt = require("bcrypt");
} catch (e) {
  try {
    bcryptFallback = require("bcryptjs");
    console.warn("bcrypt not found, using bcryptjs fallback");
  } catch (err) {
    bcrypt = null;
    bcryptFallback = null;
    console.warn(
      "bcrypt and bcryptjs not available; password verification for bcrypt hashed passwords will fail"
    );
  }
}

const skemaPengguna = new mongoose.Schema(
  {
    namaPengguna: { type: String, required: true, unique: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    kataSandi: { type: String, required: true },
    namaLengkap: String,
    preferensiDiet: Object,
    pengaturanNotifikasi: Object,
    resepFavorit: [{ type: mongoose.Schema.Types.ObjectId, ref: "Resep" }],
    tanggalDaftar: { type: Date, default: Date.now },
    statusAktif: { type: Boolean, default: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { collection: "pengguna" }
);

skemaPengguna.pre("save", async function () {
  // Use async hook (returning a promise) to avoid callback-style expectations.
  try {
    if (!this.isModified("kataSandi")) return;
    // Prefer bcrypt if available for stronger hashing
    if (bcrypt && typeof bcrypt.hash === "function") {
      // use saltRounds = 10
      this.kataSandi = await bcrypt.hash(this.kataSandi, 10);
      return;
    }
    // fallback to sha256 if bcrypt is not installed
    this.kataSandi = crypto
      .createHash("sha256")
      .update(this.kataSandi)
      .digest("hex");
  } catch (err) {
    console.error("Error in pre-save hook (Pengguna):", err);
    throw err;
  }
});

skemaPengguna.methods.verifikasiKataSandi = function (kataSandiInput) {
  // If password stored with bcrypt ($2...), verify with bcrypt if available
  if (typeof this.kataSandi === "string" && this.kataSandi.startsWith("$2")) {
    // Prefer native bcrypt if available
    if (bcrypt && typeof bcrypt.compareSync === "function") {
      try {
        return bcrypt.compareSync(kataSandiInput, this.kataSandi);
      } catch (e) {
        return false;
      }
    }
    // Fallback to bcryptjs if available
    if (bcryptFallback && typeof bcryptFallback.compareSync === "function") {
      try {
        return bcryptFallback.compareSync(kataSandiInput, this.kataSandi);
      } catch (e) {
        return false;
      }
    }
    // Cannot verify bcrypt-style hash without bcrypt or bcryptjs
    return false;
  }
  // Fallback to sha256 hex compare
  const hash = crypto.createHash("sha256").update(kataSandiInput).digest("hex");
  return hash === this.kataSandi;
};

module.exports = mongoose.model("Pengguna", skemaPengguna);
