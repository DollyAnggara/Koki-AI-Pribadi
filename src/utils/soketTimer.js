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
        const prompt = `Anda adalah asisten memasak bernama Koki AI. Jawablah pertanyaan pengguna dengan jelas, ringkas, dan berfokus pada langkah praktis atau resep. Jika diperlukan, sertakan estimasi waktu dan bahan.\nPengguna: ${userMsg}\nKoki AI:`;

        // First attempt (include raw to inspect structure)
        const resp1 = await panggilDeepseek(prompt, {
          maxTokens: 512,
          includeRaw: true,
        });
        const textFromResp = (r) => {
          if (!r) return "";
          if (typeof r === "string") return r;
          if (r.text) return r.text;
          if (r.raw && typeof r.raw === "object") {
            // try to extract common shapes
            if (r.raw.output && Array.isArray(r.raw.output) && r.raw.output[0])
              return r.raw.output[0].content || r.raw.output[0];
            if (r.raw.choices && r.raw.choices[0])
              return (
                r.raw.choices[0].text ||
                (r.raw.choices[0].message && r.raw.choices[0].message.content)
              );
            if (typeof r.raw.text === "string") return r.raw.text;
          }
          return JSON.stringify(r);
        };

        let text1 = String(textFromResp(resp1) || "").trim();
        const isEcho = text1 === prompt.trim() || text1 === userMsg.trim();

        if (isEcho) {
          console.info(
            "Deepseek returned an echo; attempting a retry with instruction prefix"
          );
          const instrPrompt = `Instruksi: Jangan ulangi pertanyaan. Jawab langsung dan singkat. Pengguna: ${userMsg}\nKoki AI:`;
          const resp2 = await panggilDeepseek(instrPrompt, {
            maxTokens: 512,
            includeRaw: true,
            temperature: 0.4,
          });
          let text2 = String(textFromResp(resp2) || "").trim();

          if (text2 && text2 !== userMsg.trim() && text2 !== prompt.trim()) {
            socket.emit("respons_koki", { pesan: text2 });
          } else {
            socket.emit("respons_koki", {
              pesan:
                "Maaf, Koki AI belum berhasil menjawab—coba lagi sebentar.",
            });
            console.warn(
              "Deepseek still echoed prompt on retry. Raw responses and URLs:",
              {
                resp1,
                resp2,
                url1: resp1 && resp1.url,
                url2: resp2 && resp2.url,
              }
            );
          }
        } else {
          socket.emit("respons_koki", { pesan: text1 });
        }
      } catch (err) {
        console.error("Deepseek error:", err && err.stack ? err.stack : err);
        // Build a compact, non-sensitive hint for the user
        let hintParts = [];
        if (err && err.message) hintParts.push(err.message);
        if (err && err.attempts) {
          const triedUrls = err.attempts
            .map((a) => `${a.url}${a.ok ? "" : " (failed)"}`)
            .slice(0, 5);
          if (triedUrls.length)
            hintParts.push(`tried: ${triedUrls.join(", ")}`);
        }
        if (err && err.suggestion) hintParts.push(err.suggestion);
        const hint = hintParts.length ? ` (${hintParts.join("; ")})` : "";

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
