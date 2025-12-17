// sudah berisi inisialisasi namespace /memasak dan /notifikasi (lihat versi lengkap sebelumnya)
const timerAktif = new Map();
const sesiMemasak = new Map();

const inisialisasiSoketTimer = (io) => {
  const nsMemasak = io.of('/memasak');
  nsMemasak.on('connection', socket => {
    console.log('Socket /memasak terhubung:', socket.id);
    socket.on('pesan_chat', data => {
      socket.emit('koki_mengetik', { status: true });
      setTimeout(() => {
        socket.emit('respons_koki', { pesan: `Koki AI: ${data.pesan}` });
        socket.emit('koki_mengetik', { status: false });
      }, 700);
    });
    // timer events: mulai_timer, jeda_timer, lanjutkan_timer, hentikan_timer (impl seperti sebelumnya)
  });
  const nsNotifikasi = io.of('/notifikasi');
  nsNotifikasi.on('connection', socket => {
    socket.on('berlangganan', data => socket.join(`pengguna_${data.idPengguna}`));
  });
};

const kirimNotifikasiKePengguna = (io, idPengguna, dataNotifikasi) => {
  io.of('/notifikasi').to(`pengguna_${idPengguna}`).emit('notifikasi_baru', { ...dataNotifikasi, waktu: new Date().toISOString() });
};

module.exports = { inisialisasiSoketTimer, kirimNotifikasiKePengguna };