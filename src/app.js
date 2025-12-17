/**
 * src/app.js
 * Inisialisasi Express + Socket.io + view engine (views di src/templates/views)
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const exphbs = require('express-handlebars');
const cron = require('node-cron');
require('dotenv').config();

// utils
const hubungkanDatabase = require('./utils/database');
const soketTimer = require('./utils/soketTimer');
const layananEmail = require('./utils/emailService');

// routes
const ruteHome = require('./routes/home');
const ruteResep = require('./routes/resep');
const ruteBahan = require('./routes/bahan');
const rutePengguna = require('./routes/pengguna');
const ruteMenu = require('./routes/menu');
const ruteOtp = require('./routes/otp');

const Pengguna = require('./models/Pengguna');
const Bahan = require('./models/Bahan');

const jalankanServer = async () => {
  await hubungkanDatabase();

  const aplikasi = express();
  const serverHttp = http.createServer(aplikasi);

  const io = new Server(serverHttp, {
    cors: { origin: '*', methods: ['GET','POST'] }
  });

  // inisialisasi soket
  soketTimer.inisialisasiSoketTimer(io);

  // middleware
  aplikasi.use(express.json({ limit: '50mb' }));
  aplikasi.use(express.urlencoded({ extended: true, limit: '50mb' }));
  aplikasi.use(cors());

  // static files
  aplikasi.use(express.static(path.join(__dirname, '..', 'public')));

  // view engine: gunakan folder src/templates sebagai root views
  aplikasi.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: 'layout',
    layoutsDir: path.join(__dirname, 'templates', 'layouts'),
    partialsDir: path.join(__dirname, 'templates', 'partials')
  }));
  aplikasi.set('view engine', 'hbs');
  aplikasi.set('views', path.join(__dirname, 'templates', 'views'));

  // mount routes
  aplikasi.use('/', ruteHome);
  aplikasi.use('/api/resep', ruteResep);
  aplikasi.use('/api/bahan', ruteBahan);
  aplikasi.use('/api/pengguna', rutePengguna);
  aplikasi.use('/api/menu', ruteMenu);
  aplikasi.use('/api/otp', ruteOtp);

  aplikasi.get('/api/status', (req, res) => {
    res.json({ sukses: true, pesan: '🍳 Koki AI Pribadi berjalan', waktuServer: new Date().toISOString() });
  });

  // cron: notifikasi bahan hampir kadaluarsa setiap hari jam 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('🕘 Cron: cek bahan hampir kadaluarsa');
    try {
      const daftarPengguna = await Pengguna.find({ 'pengaturanNotifikasi.emailPengingatKadaluarsa': true, statusAktif: true });
      for (const pengguna of daftarPengguna) {
        const bahanHampir = await Bahan.dapatkanHampirKadaluarsa(pengguna._id, 3);
        if (bahanHampir.length > 0) {
          await layananEmail.kirimNotifikasiKadaluarsa(pengguna, bahanHampir);
          soketTimer.kirimNotifikasiKePengguna(io, pengguna._id.toString(), {
            tipe: 'peringatan_kadaluarsa',
            pesan: `Ada ${bahanHampir.length} bahan hampir kadaluarsa`,
            data: bahanHampir.map(b => ({ nama: b.namaBahan, sisaHari: b.sisaHariKadaluarsa }))
          });
        }
      }
    } catch (err) {
      console.error('❌ Cron gagal:', err);
    }
  }, { timezone: 'Asia/Jakarta' });

  // 404 handler
  aplikasi.use((req, res) => {
    if (req.accepts('html')) return res.status(404).render('404', { judul: '404 - Tidak Ditemukan' });
    return res.status(404).json({ sukses: false, pesan: 'Endpoint tidak ditemukan' });
  });

  // global error
  aplikasi.use((err, req, res, next) => {
    console.error('❌ Error global:', err);
    res.status(err.status || 500).json({ sukses: false, pesan: err.message || 'Internal server error' });
  });

  const PORT = process.env.PORT || 3000;
  await new Promise(resolve => {
    serverHttp.listen(PORT, () => {
      console.log(`🚀 Server: http://localhost:${PORT}`);
      console.log('📡 Socket.io namespaces: /memasak, /notifikasi');
      resolve();
    });
  });

  return { aplikasi, io, serverHttp };
};

module.exports = { jalankanServer };