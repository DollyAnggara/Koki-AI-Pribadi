// nodemailer wrapper (fungsi kirimEmailMenuMingguan & kirimNotifikasiKadaluarsa)
const nodemailer = require("nodemailer");
// Jika dotenv belum dimuat oleh app saat modul ini di-require,
// coba muat di sini agar modul lebih tahan saat di-require langsung.
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  try {
    require("dotenv").config();
  } catch (e) {
    /* ignore */
  }
}

// info diagnostik: tampilkan user yang dimask dan apakah pass ter-set (jangan cetak secret)
const _rawUser =
  process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.EMAIL;
const _rawPass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;
const _maskedUser = _rawUser
  ? String(_rawUser).replace(/^(.{2}).+(@.+)$/, "$1***$2")
  : "<not set>";
console.log(`🔍 Email env: user=${_maskedUser}, passSet=${!!_rawPass}`);
const ensureEmailConfig = () => {
  // Dukung nama env alternatif dan berikan output debug yang membantu jika hilang
  const user =
    process.env.EMAIL_USER || process.env.EMAIL_USERNAME || process.env.EMAIL;
  const pass = process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    console.warn(
      `⚠️ Email credentials not configured. Found EMAIL_USER=${!!user}, EMAIL_PASS=${!!pass}. Set EMAIL_USER and EMAIL_PASS (or EMAIL_USERNAME/EMAIL_PASSWORD) in your .env to enable email sending.`
    );
    return false;
  }

  // Normalisasi ke kunci yang diharapkan untuk sisa modul
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
  // Tentukan email penerima
  const to = (penerima && penerima.email) ? penerima.email : String(penerima || '');

  // Buat menu HTML/text yang mudah dibaca
  const appName = process.env.APP_NAME || 'Koki AI Pribadi';
  let menuHtml = '';
  const namaResepOrText = (val) => {
    if (!val) return '-';
    if (typeof val === 'string') return val;
    if (val.namaResep) return val.namaResep;
    if (val.name) return val.name;
    if (val._id) return String(val._id);
    return '-';
  };

  if (rencana && Array.isArray(rencana.menuMingguan)) {
    menuHtml += '<h3>Rencana Menu Mingguan</h3><ul>';
    for (const h of rencana.menuMingguan) {
      const s = h._populated && h._populated.sarapan ? h._populated.sarapan.namaResep : (h.menu && h.menu.sarapan ? namaResepOrText(h.menu.sarapan) : '-');
      const siang = h._populated && h._populated.makanSiang ? h._populated.makanSiang.namaResep : (h.menu && h.menu.makanSiang ? namaResepOrText(h.menu.makanSiang) : '-');
      const malam = h._populated && h._populated.makanMalam ? h._populated.makanMalam.namaResep : (h.menu && h.menu.makanMalam ? namaResepOrText(h.menu.makanMalam) : '-');
      menuHtml += `<li><strong>${h.hari || 'Hari'}</strong>: Sarapan: ${s} | Makan siang: ${siang} | Makan malam: ${malam}</li>`;
    }
    menuHtml += '</ul>';
  }

  let daftarHtml = '';
  const rekomendasiLokasi = (nama, given) => {
    if (given) return given;
    if (!nama) return 'Rak Dapur';
    const s = String(nama).toLowerCase();
    if (/daging|ayam|sapi|kambing|ikan|seafood|udang|salmon/.test(s)) return 'Kulkas';
    if (/es|beku|frozen/.test(s)) return 'Freezer';
    if (/sayur|sayuran|bayam|wortel|selada/.test(s)) return 'Kulkas';
    if (/buah|apel|pisang|jeruk|mangga|pepaya/.test(s)) return 'Rak Dapur';
    if (/telur/.test(s)) return 'Kulkas';
    if (/roti|tawar/.test(s)) return 'Rak Dapur';
    if (/minyak|oil|olive|butter|mentega/.test(s)) return 'Rak Dapur';
    if (/susu|yoghurt|keju|cream/.test(s)) return 'Kulkas';
    return 'Rak Dapur';
  };

  if (rencana && Array.isArray(rencana.daftarBelanja)) {
    // Buat gaya dua kolom yang jelas: nama di kiri, jumlah di kanan (tanpa pemotongan atau '...')
    daftarHtml += '<h3>Daftar Belanja</h3><ul style="padding:0;list-style:none;margin:0;">';
    for (const it of rencana.daftarBelanja) {
      const jumlahText = (it.jumlah || '') ? `<strong style="float:right;">${it.jumlah} ${it.satuan || ''}</strong>` : '';
      daftarHtml += `<li style="padding:8px 0;border-bottom:1px solid #eef2f6;overflow:visible;">` +
                   `<span style="display:inline-block;max-width:70%;">${it.namaBahan}</span>` +
                   `${jumlahText}` +
                   `</li>`;
    }
    daftarHtml += '</ul>';
  }

  const html = `<!doctype html><html><body style="font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;margin:0;padding:20px;color:#222;background:#f6f9fc;"><div style="max-width:640px;margin:0 auto;background:#fff;padding:20px;border-radius:8px;border:1px solid #eee;"><h2 style="margin-top:0;">${appName} - Rencana Menu Mingguan</h2>${menuHtml}${daftarHtml}<p style="color:#6b7280;">Setelah Anda membeli bahan, kembali ke halaman Rencana Menu dan centang item yang dibeli lalu tekan tombol "Okie" untuk menambahkannya ke bahan.</p></div></body></html>`;

  const textParts = [];
  if (rencana && rencana.menuMingguan) {
    textParts.push('Rencana Menu Mingguan:');
    rencana.menuMingguan.forEach((h) => {
      const s = h._populated && h._populated.sarapan ? h._populated.sarapan.namaResep : (h.menu && h.menu.sarapan ? h.menu.sarapan : '-');
      const siang = h._populated && h._populated.makanSiang ? h._populated.makanSiang.namaResep : (h.menu && h.menu.makanSiang ? h.menu.makanSiang : '-');
      const malam = h._populated && h._populated.makanMalam ? h._populated.makanMalam.namaResep : (h.menu && h.menu.makanMalam ? h.menu.makanMalam : '-');
      textParts.push(`${h.hari || 'Hari'}: Sarapan: ${s} | Siang: ${siang} | Malam: ${malam}`);
    });
  }
  if (rencana && rencana.daftarBelanja) {
    textParts.push('\nDaftar Belanja:');
    const rekomendasiLokasiText = (nama, given) => {
      if (given) return given;
      if (!nama) return 'Rak Dapur';
      const s = String(nama).toLowerCase();
      if (/daging|ayam|sapi|kambing|ikan|seafood|udang|salmon/.test(s)) return 'Kulkas';
      if (/es|beku|frozen/.test(s)) return 'Freezer';
      if (/sayur|sayuran|bayam|wortel|selada/.test(s)) return 'Kulkas';
      if (/buah|apel|pisang|jeruk|mangga|pepaya/.test(s)) return 'Rak Dapur';
      if (/telur/.test(s)) return 'Kulkas';
      if (/roti|tawar/.test(s)) return 'Rak Dapur';
      if (/minyak|oil|olive|butter|mentega/.test(s)) return 'Rak Dapur';
      if (/susu|yoghurt|keju|cream/.test(s)) return 'Kulkas';
      return 'Rak Dapur';
    };
    rencana.daftarBelanja.forEach((it) => {
    // tampilkan nama lengkap dan jumlah pada satu baris (tidak dipotong)
      textParts.push(`${it.namaBahan} - ${it.jumlah || ''} ${it.satuan || ''}`);
    });
  }
  textParts.push('\nSetelah membeli bahan, centang item yang dibeli di halaman Rencana Menu lalu tekan "Okie" untuk menambahkannya ke bahan.');

  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: ` ${appName} - Rencana Menu Mingguan`,
    text: textParts.join('\n'),
    html
  });
};

const kirimNotifikasiKadaluarsa = async (penerima, daftar) => {
  if (!ensureEmailConfig())
    throw new Error(
      "Email config missing. Set EMAIL_USER and EMAIL_PASS in .env"
    );
  const transporter = buatTransporter();
  // Implementasikan logika pengiriman di sini
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

const kirimPesanKontak = async (pengirimEmail, pesan) => {
  if (!ensureEmailConfig())
    throw new Error(
      "Email config missing. Set EMAIL_USER and EMAIL_PASS in .env"
    );
  const transporter = buatTransporter();
  const appName = process.env.APP_NAME || "Koki AI Pribadi";
  const supportEmail = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER;
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const subject = `${appName} - Pesan Kontak`;
  const text = `Pesan dari: ${pengirimEmail}\n\n${pesan}`;

  return transporter.sendMail({
    from: fromAddress,
    to: supportEmail,
    replyTo: pengirimEmail,
    subject,
    text,
  });
};

module.exports = {
  kirimEmailMenuMingguan,
  kirimNotifikasiKadaluarsa,
  kirimOtpEmail,
  kirimResetEmail,
  verifyTransport,
  kirimPesanKontak,
};
