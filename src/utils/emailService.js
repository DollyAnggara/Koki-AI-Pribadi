// nodemailer wrapper (sama seperti sebelumnya) - fungsi kirimEmailMenuMingguan & kirimNotifikasiKadaluarsa
const nodemailer = require("nodemailer");
// If dotenv hasn't been loaded by the app by the time this module is required,
// try to load it here so the module is more robust when required directly.
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  try {
    require("dotenv").config();
  } catch (e) {
    /* ignore */
  }
}

// diagnostic info: show masked user and whether pass is set (do not print secrets)
const _rawUser =
  process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.EMAIL;
const _rawPass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
const _maskedUser = _rawUser
  ? String(_rawUser).replace(/^(.{2}).+(@.+)$/, "$1***$2")
  : "<not set>";
console.log(`🔍 Email env: user=${_maskedUser}, passSet=${!!_rawPass}`);
const ensureEmailConfig = () => {
  // Support alternate env names and provide helpful debug output when missing
  const user =
    process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.EMAIL;
  const pass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    console.warn(
      `⚠️ Email credentials not configured. Found EMAIL_USER=${!!user}, EMAIL_PASS=${!!pass}. Set EMAIL_USER and EMAIL_PASS (or EMAIL_USERNAME/EMAIL_PASSWORD) in your .env to enable email sending.`
    );
    return false;
  }

  // Normalize to the expected keys for the rest of the module
  process.env.EMAIL_USER =
    process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.EMAIL;
  process.env.EMAIL_PASS = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
  return true;
};

const buatTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const kirimEmailMenuMingguan = async (penerima, rencana) => {
  if (!ensureEmailConfig())
    throw new Error(
      "Email config missing. Set EMAIL_USER and EMAIL_PASS in .env"
    );
  const transporter = buatTransporter();
  // Implement sending logic here
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: penerima,
    subject: "Menu Mingguan",
    text: "Isi menu...",
  });
};

const kirimNotifikasiKadaluarsa = async (penerima, daftar) => {
  if (!ensureEmailConfig())
    throw new Error(
      "Email config missing. Set EMAIL_USER and EMAIL_PASS in .env"
    );
  const transporter = buatTransporter();
  // Implement sending logic here
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: penerima,
    subject: "Peringatan Kadaluarsa",
    text: "Ada bahan hampir kadaluarsa.",
  });
};

const kirimOtpEmail = async (penerima, kode) => {
  if (!ensureEmailConfig())
    throw new Error(
      "Email config missing. Set EMAIL_USER and EMAIL_PASS in .env"
    );
  const transporter = buatTransporter();
  const appName = process.env.APP_NAME || "Koki AI Pribadi";
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const subject = `${appName} - Kode OTP Anda`;
  const text = `Halo,\n\nKode OTP Anda: ${kode}\nKode ini berlaku selama 5 menit.\n\nJika Anda tidak meminta kode ini, abaikan email ini.\n\nSalam,\n${appName}`;

  // Simple, mobile-friendly HTML template with inline styles
  const html = `<!doctype html>
  <html>
  <body style="margin:0;padding:20px;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;color:#222;background:#f6f9fc;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eef2f7;">
      <div style="text-align:center;margin-bottom:16px;">
        <img src="https://placehold.co/120x40?text=KokiAI" alt="${appName}" style="height:40px;object-fit:contain;" />
      </div>
      <h2 style="margin:0 0 8px;color:#111;font-size:20px;">Kode OTP Anda</h2>
      <p style="margin:0 0 16px;color:#6b7280;">Terima kasih telah menggunakan <strong>${appName}</strong>. Gunakan kode di bawah untuk melanjutkan proses verifikasi.</p>
      <div style="text-align:center;margin:18px 0;padding:16px;background:#f4f8ff;border-radius:8px;border:1px solid #e6eefb;">
        <span style="display:inline-block;font-size:28px;letter-spacing:6px;font-weight:700;color:#0f172a;">${kode}</span>
      </div>
      <p style="color:#6b7280;margin:0 0 6px;">Kode ini berlaku selama <strong>5 menit</strong>.</p>
      <p style="color:#6b7280;margin:0 0 18px;">Jika Anda tidak meminta kode ini, abaikan email ini atau <a href="mailto:${supportEmail}">hubungi kami</a>.</p>
      <hr style="border:none;border-top:1px solid #eef2f6;margin:18px 0;" />
      <p style="color:#9ca3af;font-size:13px;margin:0;">Email ini dikirim oleh ${appName}. Jika Anda mengalami masalah, balas ke <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
    </div>
  </body>
  </html>`;

  return transporter.sendMail({
    from: fromAddress,
    to: penerima,
    subject,
    text,
    html,
  });
};

const kirimResetEmail = async (penerima, link) => {
  if (!ensureEmailConfig())
    throw new Error(
      "Email config missing. Set EMAIL_USER and EMAIL_PASS in .env"
    );
  const transporter = buatTransporter();
  const appName = process.env.APP_NAME || "Koki AI Pribadi";
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  const subject = `${appName} - Permintaan Reset Password`;
  const text = `Anda menerima email ini karena ada permintaan untuk mereset password akun Anda. Buka tautan berikut untuk mereset password: ${link}`;
  const html = `<!doctype html>
  <html>
  <body style="margin:0;padding:20px;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial;color:#222;background:#f6f9fc;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;border:1px solid #eef2f7;">
      <div style="text-align:center;margin-bottom:16px;">
        <img src="https://placehold.co/120x40?text=KokiAI" alt="${appName}" style="height:40px;object-fit:contain;" />
      </div>
      <h2 style="margin:0 0 8px;color:#111;font-size:20px;">Permintaan Reset Password</h2>
      <p style="margin:0 0 16px;color:#6b7280;">Kami menerima permintaan untuk mereset password akun yang terkait dengan email ini.</p>
      <div style="text-align:center;margin:18px 0;padding:16px;">
        <a href="${link}" style="display:inline-block;padding:12px 20px;background:#e74c3c;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">Reset Password</a>
      </div>
      <p style="color:#6b7280;margin:0 0 18px;">Jika Anda tidak meminta reset ini, abaikan email ini atau hubungi <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
      <hr style="border:none;border-top:1px solid #eef2f6;margin:18px 0;" />
      <p style="color:#9ca3af;font-size:13px;margin:0;">Email ini dikirim oleh ${appName}.</p>
    </div>
  </body>
  </html>`;
  return transporter.sendMail({
    from: fromAddress,
    to: penerima,
    subject,
    text,
    html,
  });
};

const verifyTransport = async () => {
  if (!ensureEmailConfig())
    throw new Error(
      "Email config missing. Set EMAIL_USER and EMAIL_PASS in .env"
    );
  const transporter = buatTransporter();
  return transporter.verify();
};

module.exports = {
  kirimEmailMenuMingguan,
  kirimNotifikasiKadaluarsa,
  kirimOtpEmail,
  kirimResetEmail,
  verifyTransport,
};
