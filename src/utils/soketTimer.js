// sudah berisi inisialisasi namespace /memasak dan /notifikasi (lihat versi lengkap sebelumnya)
const timerAktif = new Map();
const sesiMemasak = new Map();
const { panggilDeepseek } = require("./layananDeepseek");

const inisialisasiSoketTimer = (io) => {
  const nsMemasak = io.of("/memasak");
  nsMemasak.on("connection", (socket) => {
    console.log("Socket /memasak terhubung:", socket.id);
    socket.on("pesan_chat", async (data) => {
      // data should be { pesan: string, ... }
      socket.emit("koki_mengetik", { status: true });
      try {
        const userMsg = data && data.pesan ? String(data.pesan) : "";
        const prompt = `Anda adalah asisten memasak bernama Koki AI. Jawablah pertanyaan pengguna dengan jelas, ringkas, dan berfokus pada langkah praktis atau resep. Jika diperlukan, sertakan estimasi waktu dan bahan.\nPengguna: ${userMsg}`;

        // Call Deepseek API with proper chat/completions format
        const result = await panggilDeepseek(prompt, {
          maxTokens: 512,
          temperature: 0.7,
        });

        const text = String(result || "").trim();
        if (text) {
          socket.emit("respons_koki", { pesan: text });
        } else {
          socket.emit("respons_koki", {
            pesan: "Maaf, Koki AI belum berhasil menjawab—coba lagi sebentar.",
          });
        }
      } catch (err) {
        // Log full details server-side for debugging (do not expose to clients)
        console.error("Deepseek error:", err && err.stack ? err.stack : err);

        // Provide a brief, non-sensitive hint to the user
        let hint = "";
        if (err && err.status === 401) {
          // Authentication failures are common and actionable
          hint = " (masalah autentikasi layanan AI — hubungi administrator.)";
        } else if (err && typeof err.status === "number") {
          hint = ` (gangguan layanan eksternal: kode ${err.status})`;
        }

        socket.emit("respons_koki", {
          pesan: `Maaf, Koki AI sedang mengalami gangguan—silakan coba lagi nanti.${hint}`,
        });
      } finally {
        socket.emit("koki_mengetik", { status: false });
      }
    });
    // timer events: mulai_timer, jeda_timer, lanjutkan_timer, hentikan_timer (impl seperti sebelumnya)
  });
  const nsNotifikasi = io.of("/notifikasi");
  nsNotifikasi.on("connection", (socket) => {
    socket.on("berlangganan", (data) =>
      socket.join(`pengguna_${data.idPengguna}`)
    );
  });
};

const kirimNotifikasiKePengguna = (io, idPengguna, dataNotifikasi) => {
  io.of("/notifikasi")
    .to(`pengguna_${idPengguna}`)
    .emit("notifikasi_baru", {
      ...dataNotifikasi,
      waktu: new Date().toISOString(),
    });
};

module.exports = { inisialisasiSoketTimer, kirimNotifikasiKePengguna };
