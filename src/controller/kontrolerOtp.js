const emailService = require("../utils/emailService");

// Penyimpanan sederhana dalam memori: { email -> { code, expiresAt } }
const otpStore = new Map();

const generateCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ sukses: false, pesan: "Email diperlukan" });

    const code = generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    otpStore.set(email.toLowerCase(), { code, expiresAt });

    try {
      const info = await emailService.kirimOtpEmail(email, code);

      // Samarkan alamat email penerima untuk log (jangan catat OTP itu sendiri).
      const maskedEmail = String(email).replace(/^(.{2}).+(@.+)$/, "$1***$2");
      console.log(
        `✅ OTP email sent to ${maskedEmail}. messageId=${
          info && info.messageId ? info.messageId : "n/a"
        }, accepted=${JSON.stringify(
          info && info.accepted ? info.accepted : []
        )}`
      );

      // Simpan entri log singkat yang tidak sensitif (tanpa OTP, tanpa rahasia)
      const fs = require("fs").promises;
      const path = require("path");
      (async () => {
        try {
          const logsDir = path.join(__dirname, "..", "..", "logs");
          await fs.mkdir(logsDir, { recursive: true });
          const logLine = `${new Date().toISOString()} | OTP_SENT | to=${maskedEmail} | messageId=${
            info && info.messageId ? info.messageId : ""
          } | accepted=${
            info && info.accepted ? info.accepted.join(",") : ""
          }\n`;
          await fs.appendFile(path.join(logsDir, "email.log"), logLine);
        } catch (e) {
          console.warn("⚠️ Failed to write email log:", e && e.message);
        }
      })();

      return res.json({
        sukses: true,
        pesan: "Kode OTP telah dikirim ke email Anda",
      });
    } catch (err) {
      console.error("❌ Gagal kirim OTP via SMTP:", err);
      // Cetak kode ke konsol untuk kemudahan pengembang, tetapi kembalikan error ke klien agar jelas pengiriman gagal
      console.log(`OTP for ${email}: ${code} (valid 5 min)`);
      return res.status(500).json({
        sukses: false,
        pesan: `Gagal mengirim OTP: ${err.message}. Periksa konfigurasi SMTP di .env dan coba GET /api/otp/test-smtp untuk verifikasi`,
      });
    }
  } catch (err) {
    console.error("❌ Gagal kirim OTP:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal mengirim OTP" });
  }
};

const verifyOtp = (req, res) => {
  try {
    const { email, kode } = req.body;
    if (!email || !kode)
      return res
        .status(400)
        .json({ sukses: false, pesan: "Email dan kode OTP diperlukan" });
    const data = otpStore.get(email.toLowerCase());
    if (!data)
      return res.status(400).json({
        sukses: false,
        pesan: "Kode OTP tidak ditemukan atau sudah kadaluarsa",
      });
    if (Date.now() > data.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res
        .status(400)
        .json({ sukses: false, pesan: "Kode OTP telah kadaluarsa" });
    }
    if (data.code !== String(kode))
      return res.status(400).json({ sukses: false, pesan: "Kode OTP salah" });
    // valid
    otpStore.delete(email.toLowerCase());
    return res.json({ sukses: true, pesan: "OTP valid" });
  } catch (err) {
    console.error("❌ Gagal verifikasi OTP:", err);
    res.status(500).json({ sukses: false, pesan: "Gagal verifikasi OTP" });
  }
};

const testSmtp = async (req, res) => {
  try {
    await emailService.verifyTransport();
    return res.json({ sukses: true, pesan: "SMTP connection OK" });
  } catch (err) {
    console.error("❌ SMTP verify failed:", err);
    return res
      .status(500)
      .json({ sukses: false, pesan: `SMTP verify failed: ${err.message}` });
  }
};

module.exports = { sendOtp, verifyOtp, testSmtp };