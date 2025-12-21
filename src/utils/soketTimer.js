// sudah berisi inisialisasi namespace /memasak dan /notifikasi (lihat versi lengkap sebelumnya)
const timerAktif = new Map();
const sesiMemasak = new Map();
// Removed direct Deepseek dependency; use layananChatBot abstraction which may use Deepseek or OpenRouter
const layananChatBot = require("./layananChatBot");
const SessionChat = require("../models/SessionChat");

const inisialisasiSoketTimer = (io) => {
  const nsMemasak = io.of("/memasak");
  nsMemasak.on("connection", (socket) => {
    console.log("Socket /memasak terhubung:", socket.id);

    // When a client connects, send current active timers so UI can restore after refresh
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
      // data should be { pesan: string, idSession: string (optional), idPengguna: string }
      try {
        const userMsg =
          data && data.pesan ? String(data.pesan).trim().toLowerCase() : "";
        const idSession = data?.idSession;
        const idPengguna = data?.idPengguna;

        // Detect simple greetings and respond immediately without calling AI
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

        // Check for greeting match (exact match or greeting only with optional punctuation)
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

        // If it's a greeting, respond directly
        if (isGreeting) {
          socket.emit("respons_koki", { pesan: greetingResponse });
          // Save greeting to session if provided
          if (idSession && idPengguna) {
            try {
              await SessionChat.findOneAndUpdate(
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

        // For non-greeting messages, use AI
        socket.emit("koki_mengetik", { status: true });

        const prompt = `Anda adalah asisten memasak bernama Koki AI. Jawablah pertanyaan pengguna dengan jelas, ringkas, dan berfokus pada langkah praktis atau resep. Jika diperlukan, sertakan estimasi waktu dan bahan.\nPengguna: ${userMsg}`;

        // Call configured chat provider through layananChatBot abstraction
        const result = await layananChatBot.prosesPercakapan(socket.id, prompt);
        const text = String(result.pesan || result).trim();
        if (text) {
          socket.emit("respons_koki", { pesan: text });

          // Save user message and AI response to session
          if (idSession && idPengguna) {
            try {
              await SessionChat.findOneAndUpdate(
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

          // Save error response
          if (idSession && idPengguna) {
            try {
              await SessionChat.findOneAndUpdate(
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
        // Log full details server-side for debugging (do not expose to clients)
        console.error(
          "Chat service error:",
          err && err.stack ? err.stack : err
        );

        // Provide a brief, non-sensitive hint to the user
        let hint = "";
        if (err && err.status === 401) {
          // Authentication failures are common and actionable
          hint = " (masalah autentikasi layanan AI — hubungi administrator.)";
        } else if (err && typeof err.status === "number") {
          hint = ` (gangguan layanan eksternal: kode ${err.status})`;
        }

        const pesanError = `Maaf, Koki AI sedang mengalami gangguan—silakan coba lagi nanti.${hint}`;
        socket.emit("respons_koki", {
          pesan: pesanError,
        });

        // Save error to session if provided
        if (data?.idSession && data?.idPengguna) {
          try {
            await SessionChat.findOneAndUpdate(
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
    // timer events: mulai_timer, jeda_timer, lanjutkan_timer, hentikan_timer

    socket.on("mulai_timer", (data) => {
      try {
        const { idTimer, durasiDetik, namaTimer } = data || {};
        if (!idTimer || !durasiDetik) return;
        // prevent duplicate timers
        if (timerAktif.has(idTimer)) {
          // if exists, stop existing first
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
        // send initial update
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
      // immediate update
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
      // notify clients that timer was stopped
      nsMemasak.emit("update_timer", {
        idTimer,
        formatWaktu: formatWaktu(0),
        persentase: 100,
        paused: true,
        namaTimer: t.namaTimer,
      });
    });

    // helper to format seconds into H:MM:SS or MM:SS
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
