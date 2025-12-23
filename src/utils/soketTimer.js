// sudah berisi inisialisasi namespace /memasak dan /notifikasi (lihat versi lengkap sebelumnya)
const timerAktif = new Map();
const sesiMemasak = new Map();
// Menghapus dependensi Deepseek langsung; gunakan abstraksi layananChatBot yang dapat menggunakan Deepseek atau OpenRouter
const layananChatBot = require("./layananChatBot");
const SesiChat = require("../models/sesiChat");

const inisialisasiSoketTimer = (io) => {
  const nsMemasak = io.of("/memasak");
  nsMemasak.on("connection", (socket) => {
    console.log("Socket /memasak terhubung:", socket.id);

    // Saat client terhubung, kirim timer aktif saat ini agar UI dapat memulihkan setelah refresh
    try {
      for (const [id, t] of Array.from(timerAktif.entries())) {
        nsMemasak.to(socket.id).emit("update_timer", {
          idTimer: t.idTimer,
          formatWaktu: formatWaktu(t.sisa),
          persentase: Math.round(
            ((t.durasiTotal - t.sisa) / t.durasiTotal) * 100
          ),
          paused: t.paused,
          namaTimer: t.namaTimer,
        });
      }
    } catch (e) {
      console.warn("sync timers on connect failed", e);
    }

    socket.on("pesan_chat", async (data) => {
      // data harus berupa { pesan: string, idSession: string (opsional), idPengguna: string }
      try {
        const userMsg =
          data && data.pesan ? String(data.pesan).trim().toLowerCase() : "";
        const idSession = data?.idSession;
        const idPengguna = data?.idPengguna;

        // Deteksi sapaan sederhana dan respon langsung tanpa memanggil AI
        const greetings = {
          halo: "Halo! 👋 Saya Koki AI, asisten memasak Anda. Apa yang ingin Anda masak hari ini?",
          hi: "Hai! 👋 Saya Koki AI. Ada yang bisa saya bantu untuk memasak?",
          hey: "Hey! 👋 Selamat datang. Apa resep atau tips memasak yang Anda cari?",
          "selamat pagi":
            "Selamat pagi! ☀️ Semoga hari Anda menyenangkan. Ada ide masakan untuk hari ini?",
          "selamat siang":
            "Selamat siang! 🌤️ Apa yang bisa saya bantu dalam memasak?",
          "selamat malam":
            "Selamat malam! 🌙 Apakah Anda menyiapkan makan malam?",
          "terima kasih": "Sama-sama! 😊 Senang membantu. Ada pertanyaan lagi?",
          thanks: "You're welcome! 😊 Happy cooking!",
          "apa kabar":
            "Saya dalam kondisi baik, terima kasih! 😄 Bagaimana dengan Anda? Ada yang bisa dibantu?",
          "how are you":
            "I'm doing great, thanks! 😄 How can I help you cook today?",
        };

        // Periksa kecocokan sapaan (exact match atau sapaan saja dengan tanda baca opsional)
        let isGreeting = false;
        let greetingResponse = "";

        for (const [greeting, response] of Object.entries(greetings)) {
          // Exact match atau match with punctuation di akhir
          if (
            userMsg === greeting ||
            userMsg === greeting + "?" ||
            userMsg === greeting + "!"
          ) {
            greetingResponse = response;
            isGreeting = true;
            break;
          }
        }

        // Jika ini sapaan, respon langsung
        if (isGreeting) {
          socket.emit("respons_koki", { pesan: greetingResponse });
          // Simpan greeting ke session jika disediakan
          if (idSession && idPengguna) {
            try {
              await SesiChat.findOneAndUpdate(
                { _id: idSession, idPengguna },
                {
                  $push: {
                    riwayatChat: [
                      {
                        tipe: "pengguna",
                        pesan: data.pesan,
                        timestamp: new Date(),
                      },
                      {
                        tipe: "koki",
                        pesan: greetingResponse,
                        timestamp: new Date(),
                      },
                    ],
                  },
                }
              );
            } catch (e) {
              console.warn("Gagal menyimpan greeting ke session:", e);
            }
          }
          return;
        }

        // Untuk pesan selain sapaan, gunakan AI
        socket.emit("koki_mengetik", { status: true });

        const prompt = `Anda adalah asisten memasak bernama Koki AI. Jawablah pertanyaan pengguna dengan jelas, ringkas, dan berfokus pada langkah praktis atau resep. Jika diperlukan, sertakan estimasi waktu dan bahan.\nPengguna: ${userMsg}`;

        // Panggil penyedia chat yang terkonfigurasi melalui abstraksi layananChatBot
        const result = await layananChatBot.prosesPercakapan(socket.id, prompt);
        const text = String(result.pesan || result).trim();
        if (text) {
          socket.emit("respons_koki", { pesan: text });

          // Simpan pesan pengguna dan respons AI ke session
          if (idSession && idPengguna) {
            try {
              await SesiChat.findOneAndUpdate(
                { _id: idSession, idPengguna },
                {
                  $push: {
                    riwayatChat: [
                      {
                        tipe: "pengguna",
                        pesan: data.pesan,
                        timestamp: new Date(),
                      },
                      { tipe: "koki", pesan: text, timestamp: new Date() },
                    ],
                  },
                }
              );
            } catch (e) {
              console.warn("Gagal menyimpan pesan ke session:", e);
            }
          }
        } else {
          const pesanError =
            "Maaf, Koki AI belum berhasil menjawab—coba lagi sebentar.";
          socket.emit("respons_koki", { pesan: pesanError });

          // Simpan respons error
          if (idSession && idPengguna) {
            try {
              await SesiChat.findOneAndUpdate(
                { _id: idSession, idPengguna },
                {
                  $push: {
                    riwayatChat: [
                      {
                        tipe: "pengguna",
                        pesan: data.pesan,
                        timestamp: new Date(),
                      },
                      {
                        tipe: "koki",
                        pesan: pesanError,
                        timestamp: new Date(),
                      },
                    ],
                  },
                }
              );
            } catch (e) {
              console.warn("Gagal menyimpan error ke session:", e);
            }
          }
        }
      } catch (err) {
        // Catat detail lengkap di server untuk debugging (jangan ekspos ke client)
        console.error(
          "Chat service error:",
          err && err.stack ? err.stack : err
        );

        // Beri hint singkat yang tidak sensitif kepada pengguna
        let hint = "";
        if (err && err.status === 401) {
          // Kegagalan autentikasi umum terjadi dan perlu tindakan
          hint = " (masalah autentikasi layanan AI — hubungi administrator.)";
        } else if (err && typeof err.status === "number") {
          hint = ` (gangguan layanan eksternal: kode ${err.status})`;
        }

        const pesanError = `Maaf, Koki AI sedang mengalami gangguan—silakan coba lagi nanti.${hint}`;
        socket.emit("respons_koki", {
          pesan: pesanError,
        });

        // Simpan error ke session jika disediakan
        if (data?.idSession && data?.idPengguna) {
          try {
            await SesiChat.findOneAndUpdate(
              { _id: data.idSession, idPengguna: data.idPengguna },
              {
                $push: {
                  riwayatChat: [
                    {
                      tipe: "pengguna",
                      pesan: data.pesan,
                      timestamp: new Date(),
                    },
                    { tipe: "koki", pesan: pesanError, timestamp: new Date() },
                  ],
                },
              }
            );
          } catch (e) {
            console.warn("Gagal menyimpan error ke session:", e);
          }
        }
      } finally {
        socket.emit("koki_mengetik", { status: false });
      }
    });
    // event timer: mulai_timer, jeda_timer, lanjutkan_timer, hentikan_timer

    socket.on("mulai_timer", (data) => {
      try {
        const { idTimer, durasiDetik, namaTimer } = data || {};
        if (!idTimer || !durasiDetik) return;
        // cegah duplicate timers
        if (timerAktif.has(idTimer)) {
          // jika sudah ada, hentikan yang ada terlebih dahulu
          const t = timerAktif.get(idTimer);
          if (t.intervalId) clearInterval(t.intervalId);
          timerAktif.delete(idTimer);
        }
        const timer = {
          idTimer,
          namaTimer: namaTimer || "Timer",
          durasiTotal: durasiDetik,
          sisa: durasiDetik,
          paused: false,
          intervalId: null,
        };

        const sendUpdate = () => {
          const persentase = Math.max(
            0,
            Math.min(
              100,
              ((timer.durasiTotal - timer.sisa) / timer.durasiTotal) * 100
            )
          );
          nsMemasak.emit("update_timer", {
            idTimer: timer.idTimer,
            formatWaktu: formatWaktu(timer.sisa),
            persentase: Math.round(persentase),
            paused: timer.paused,
            namaTimer: timer.namaTimer,
          });
        };

        const tick = () => {
          if (timer.paused) return;
          timer.sisa -= 1;
          if (timer.sisa <= 0) {
            if (timer.intervalId) clearInterval(timer.intervalId);
            nsMemasak.emit("timer_selesai", {
              idTimer: timer.idTimer,
              namaTimer: timer.namaTimer,
            });
            timerAktif.delete(timer.idTimer);
            return;
          }
          sendUpdate();
        };

        timer.intervalId = setInterval(tick, 1000);
        // kirim update awal
        sendUpdate();
        timerAktif.set(idTimer, timer);
      } catch (err) {
        console.error("mulai_timer error", err);
      }
    });

    socket.on("jeda_timer", (data) => {
      const { idTimer } = data || {};
      const t = timerAktif.get(idTimer);
      if (!t) return;
      t.paused = true;
      if (t.intervalId) clearInterval(t.intervalId);
      t.intervalId = null;
      nsMemasak.emit("update_timer", {
        idTimer: t.idTimer,
        formatWaktu: formatWaktu(t.sisa),
        persentase: Math.round(
          ((t.durasiTotal - t.sisa) / t.durasiTotal) * 100
        ),
        paused: true,
        namaTimer: t.namaTimer,
      });
    });

    socket.on("lanjutkan_timer", (data) => {
      const { idTimer } = data || {};
      const t = timerAktif.get(idTimer);
      if (!t || !t.paused) return;
      t.paused = false;
      const tick = () => {
        if (t.paused) return;
        t.sisa -= 1;
        if (t.sisa <= 0) {
          if (t.intervalId) clearInterval(t.intervalId);
          nsMemasak.emit("timer_selesai", {
            idTimer: t.idTimer,
            namaTimer: t.namaTimer,
          });
          timerAktif.delete(t.idTimer);
          return;
        }
        nsMemasak.emit("update_timer", {
          idTimer: t.idTimer,
          formatWaktu: formatWaktu(t.sisa),
          persentase: Math.round(
            ((t.durasiTotal - t.sisa) / t.durasiTotal) * 100
          ),
          paused: false,
          namaTimer: t.namaTimer,
        });
      };
      t.intervalId = setInterval(tick, 1000);
      // update langsung
      nsMemasak.emit("update_timer", {
        idTimer: t.idTimer,
        formatWaktu: formatWaktu(t.sisa),
        persentase: Math.round(
          ((t.durasiTotal - t.sisa) / t.durasiTotal) * 100
        ),
        paused: false,
        namaTimer: t.namaTimer,
      });
    });

    socket.on("hentikan_timer", (data) => {
      const { idTimer } = data || {};
      const t = timerAktif.get(idTimer);
      if (!t) return;
      if (t.intervalId) clearInterval(t.intervalId);
      timerAktif.delete(idTimer);
      // beri tahu klien bahwa timer telah dihentikan
      nsMemasak.emit("update_timer", {
        idTimer,
        formatWaktu: formatWaktu(0),
        persentase: 100,
        paused: true,
        namaTimer: t.namaTimer,
      });
    });

    // helper untuk memformat detik menjadi H:MM:SS atau MM:SS
    function formatWaktu(sec) {
      sec = Math.max(0, parseInt(sec, 10) || 0);
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      const mm = String(m).padStart(2, "0");
      const ss = String(s).padStart(2, "0");
      return `${h}:${mm}:${ss}`;
    }
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
