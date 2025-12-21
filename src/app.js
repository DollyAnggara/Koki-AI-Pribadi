/**
 * src/app.js
 * Inisialisasi Express + Socket.io + view engine (views di src/templates/views)
 */

const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");
const exphbs = require("express-handlebars");
const cron = require("node-cron");
require("dotenv").config();

// Determine available chat providers (Deepseek or OpenRouter)
// Warn only when neither provider is configured
const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;
const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
if (!hasDeepseek && !hasOpenRouter) {
  console.warn(
    "⚠️ Neither DEEPSEEK_API_KEY nor OPENROUTER_API_KEY are set. Koki AI chat will not be available until you set at least one provider in your .env."
  );
} else {
  console.log("ℹ️ Chat providers configured:", {
    DEEPSEEK: hasDeepseek ? "[set]" : "[not set]",
    OPENROUTER: hasOpenRouter ? "[set]" : "[not set]",
  });
}

// utils
const hubungkanDatabase = require("./utils/database");
const soketTimer = require("./utils/soketTimer");
const layananEmail = require("./utils/emailService");

// routes
const ruteHome = require("./routes/home");
const rutePages = require("./routes/pages");
const ruteResep = require("./routes/resep");
const ruteBahan = require("./routes/bahan");
const rutePengguna = require("./routes/pengguna");
const ruteMenu = require("./routes/menu");
const ruteOtp = require("./routes/otp");
const ruteDebug = require("./routes/debug");
const ruteKontak = require("./routes/kontak");
const ruteSessionChat = require("./routes/session-chat");

const Pengguna = require("./models/Pengguna");
const Bahan = require("./models/Bahan");

const jalankanServer = async () => {
  console.log("⏳ jalankanServer: mulai, mencoba menghubungkan database...");
  let dbConnected = false;
  try {
    await hubungkanDatabase();
    dbConnected = true;
    console.log("✅ jalankanServer: koneksi database berhasil");
  } catch (err) {
    console.warn(
      "⚠️ Tidak dapat menghubungkan database. Aplikasi akan berjalan dalam mode terbatas (beberapa fitur mungkin tidak bekerja)."
    );
  }

  const aplikasi = express();
  const serverHttp = http.createServer(aplikasi);

  const io = new Server(serverHttp, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // inisialisasi soket
  soketTimer.inisialisasiSoketTimer(io);

  // middleware
  aplikasi.use(express.json({ limit: "50mb" }));
  aplikasi.use(express.urlencoded({ extended: true, limit: "50mb" }));
  aplikasi.use(cors());

  // session (server-side) — used to track authenticated user
  const session = require("express-session");
  aplikasi.use(
    session({
      secret: process.env.SESSION_SECRET || "keyboard cat",
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 1 day
    })
  );

  // Make session user available in templates and flag admins
  // Refresh role from DB when it differs from the session copy (keeps sessions up-to-date)
  aplikasi.use(async (req, res, next) => {
    try {
      if (req.session && req.session.user) {
        try {
          const u = await Pengguna.findById(req.session.user._id)
            .select("role")
            .lean();
          if (u && u.role && u.role !== req.session.user.role) {
            req.session.user.role = u.role;
          }
        } catch (err) {
          // non-fatal: continue without blocking the request
          console.warn(
            "Could not refresh user role from DB:",
            err && err.message ? err.message : err
          );
        }
      }
    } catch (e) {
      console.error("Error in session middleware:", e);
    }

    res.locals.user = req.session ? req.session.user : null;
    res.locals.isAdmin =
      req.session && req.session.user && req.session.user.role === "admin";
    next();
  });

  // static files
  aplikasi.use(express.static(path.join(__dirname, "..", "public")));

  // view engine: gunakan folder src/templates sebagai root views
  aplikasi.engine(
    "hbs",
    exphbs.engine({
      extname: ".hbs",
      defaultLayout: "layout",
      layoutsDir: path.join(__dirname, "..", "templates", "layouts"),
      partialsDir: [
        path.join(__dirname, "..", "templates", "partials"),
        path.join(__dirname, "..", "templates", "views"),
      ],
    })
  );
  aplikasi.set("view engine", "hbs");
  aplikasi.set("views", path.join(__dirname, "..", "templates", "views"));

  // expose DB connection status to handlers & templates
  aplikasi.use((req, res, next) => {
    req.app.locals.dbConnected =
      typeof dbConnected !== "undefined" ? dbConnected : false;
    res.locals.dbConnected = req.app.locals.dbConnected;
    next();
  });

  // block API endpoints when DB is unavailable (allow /api/status)
  aplikasi.use("/api", (req, res, next) => {
    if (!req.app.locals.dbConnected && req.path !== "/status") {
      return res.status(503).json({
        sukses: false,
        pesan:
          "Layanan database tidak tersedia saat ini. Silakan coba lagi nanti.",
      });
    }
    next();
  });

  // mount routes
  aplikasi.use("/", ruteHome);
  // Page routes: separate views per page
  aplikasi.use("/", rutePages);
  aplikasi.use("/api/resep", ruteResep);
  aplikasi.use("/api/bahan", ruteBahan);
  aplikasi.use("/api/pengguna", rutePengguna);
  aplikasi.use("/api/menu", ruteMenu);
  aplikasi.use("/api/otp", ruteOtp);
  // Debug/test endpoints for development (deepseek test)
  aplikasi.use("/api/debug", ruteDebug);
  aplikasi.use("/api/kontak", ruteKontak);
  // Session chat endpoints
  aplikasi.use("/api/session-chat", ruteSessionChat);

  // admin routes (UI + actions)
  const ruteAdmin = require("./routes/admin");
  aplikasi.use("/admin", ruteAdmin);

  aplikasi.get("/api/status", (req, res) => {
    res.json({
      sukses: true,
      pesan: "🍳 Koki AI Pribadi berjalan",
      waktuServer: new Date().toISOString(),
    });
  });

  // Auth pages
  aplikasi.get("/login", (req, res) => {
    let successMessage = null;
    if (req.query.success === "1" || req.query.registered === "1")
      successMessage = "Akun berhasil dibuat. Silakan masuk.";
    else if (req.query.success) successMessage = req.query.success;
    return res.render("login", {
      layout: "auth",
      title: "Masuk - Koki AI Pribadi",
      successMessage,
      error: req.query.error,
    });
  });

  aplikasi.get("/register", (req, res) => {
    res.render("register", {
      layout: "auth",
      title: "Daftar - Koki AI Pribadi",
      error: req.query.error,
    });
  });

  // Forgot / Reset pages
  aplikasi.get("/forgot", (req, res) =>
    res.render("forgot", { layout: "auth" })
  );
  aplikasi.get("/reset", (req, res) =>
    res.render("reset", { layout: "auth", token: req.query.token })
  );

  // cron: notifikasi bahan hampir kadaluarsa setiap hari jam 09:00
  cron.schedule(
    "0 9 * * *",
    async () => {
      console.log("🕘 Cron: cek bahan hampir kadaluarsa");
      try {
        const daftarPengguna = await Pengguna.find({
          "pengaturanNotifikasi.emailPengingatKadaluarsa": true,
          statusAktif: true,
        });
        for (const pengguna of daftarPengguna) {
          const bahanHampir = await Bahan.dapatkanHampirKadaluarsa(
            pengguna._id,
            3
          );
          if (bahanHampir.length > 0) {
            await layananEmail.kirimNotifikasiKadaluarsa(pengguna, bahanHampir);
            soketTimer.kirimNotifikasiKePengguna(io, pengguna._id.toString(), {
              tipe: "peringatan_kadaluarsa",
              pesan: `Ada ${bahanHampir.length} bahan hampir kadaluarsa`,
              data: bahanHampir.map((b) => ({
                nama: b.namaBahan,
                sisaHari: b.sisaHariKadaluarsa,
              })),
            });
          }
        }
      } catch (err) {
        console.error("❌ Cron gagal:", err);
      }
    },
    { timezone: "Asia/Jakarta" }
  );

  // 404 handler (render the 404 partial via the 404 view and use auth layout)
  aplikasi.use((req, res) => {
    if (req.accepts("html"))
      return res
        .status(404)
        .render("404", { layout: "auth", judul: "404 - Tidak Ditemukan" });
    return res
      .status(404)
      .json({ sukses: false, pesan: "Endpoint tidak ditemukan" });
  });

  // global error
  aplikasi.use((err, req, res, next) => {
    console.error("❌ Error global:", err);
    res
      .status(err.status || 500)
      .json({ sukses: false, pesan: err.message || "Internal server error" });
  });

  const PORT = process.env.PORT || 3000;
  await new Promise((resolve) => {
    serverHttp.listen(PORT, () => {
      console.log(`🚀 Server: http://localhost:${PORT}`);
      console.log("📡 Socket.io namespaces: /memasak, /notifikasi");

      // Masked env summary for quick diagnostics
      const mask = (v) => (v ? "[set]" : "[not set]");
      console.log("🔐 Env summary:", {
        MONGO_URI: mask(process.env.MONGO_URI),
        DEEPSEEK_API_KEY: mask(process.env.DEEPSEEK_API_KEY),
        OPENROUTER_API_KEY: mask(process.env.OPENROUTER_API_KEY),
        SESSION_SECRET: mask(process.env.SESSION_SECRET),
      });

      resolve();
    });
  });

  return { aplikasi, io, serverHttp };
};

module.exports = { jalankanServer };
