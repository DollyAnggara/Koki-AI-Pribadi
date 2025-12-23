// Manajemen Sesi Chat (file baru: sesi-chat.js)
let idSessionAktif = localStorage.getItem("idSessionAktif");
let daftarSessionChat = [];

// Inisialisasi sesi chat
async function inisialisasiSessionChat() {
  try {
    console.log("🔄 Inisialisasi sesi chat...");
    // Ambil semua sesi user
    const response = await fetch("/api/sesi-chat/daftar");
    const result = await response.json();

    console.log("Sesi daftar response:", result);

    if (result.sukses && result.data) {
      daftarSessionChat = result.data;
      renderDaftarSession();

      // Jika tidak ada session aktif, buat session baru
      if (!idSessionAktif && daftarSessionChat.length === 0) {
        console.log("📝 Tidak ada sesi, membuat sesi baru...");
        await buatSessionChatBaru();
      } else if (!idSessionAktif && daftarSessionChat.length > 0) {
        // Gunakan session terakhir
        idSessionAktif = daftarSessionChat[0]._id;
        localStorage.setItem("idSessionAktif", idSessionAktif);
        loadSessionChat(idSessionAktif);
      } else {
        // Verify session aktif masih ada
        const sessionExists = daftarSessionChat.find(
          (s) => s._id === idSessionAktif
        );
        if (!sessionExists && daftarSessionChat.length > 0) {
          idSessionAktif = daftarSessionChat[0]._id;
          localStorage.setItem("idSessionAktif", idSessionAktif);
        }
        loadSessionChat(idSessionAktif);
      }
    } else {
      console.error("❌ Gagal ambil sesi daftar:", result);
    }
  } catch (err) {
    console.error("❌ Gagal inisialisasi sesi chat:", err);
  }
}

// Render daftar sesi
function renderDaftarSession() {
  const daftarSessionEl = document.getElementById("daftarSession");
  if (!daftarSessionEl) return;

  if (daftarSessionChat.length === 0) {
    daftarSessionEl.innerHTML =
      '<div class="pesan-kosong-session">Tidak ada sesi. Buat sesi baru dengan menekan tombol "Baru"</div>';
    return;
  }

  daftarSessionEl.innerHTML = daftarSessionChat
    .map(
      (session) => `
    <div class="item-session ${
      session._id === idSessionAktif ? "aktif" : ""
    }" data-id="${session._id}">
      <div class="nama-session">${escapeHtml(session.namaSession)}</div>
      <div class="meta-session">
        <span>${new Date(session.tanggalDiperbarui).toLocaleString("id-ID", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}</span>
        <span class="jumlah-pesan">${session.jumlahPesan || 0}</span>
        <button class="btn-hapus-session" data-id="${
          session._id
        }" title="Hapus sesi">🗑️</button>
      </div>
    </div>
  `
    )
    .join("");

  // Event listeners untuk item sesi
  daftarSessionEl.querySelectorAll(".item-session").forEach((item) => {
    item.addEventListener("click", (e) => {
      if (e.target.closest(".btn-hapus-session")) return;
      const sessionId = item.dataset.id;
      loadSessionChat(sessionId);
    });
  });

  // Event listeners untuk tombol hapus
  daftarSessionEl.querySelectorAll(".btn-hapus-session").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const sessionId = btn.dataset.id;
      (async () => {
        const confirmed = await showConfirmModal({
          title: "Hapus sesi",
          message: "Apakah Anda yakin ingin menghapus sesi ini?",
          okLabel: "Hapus",
          cancelLabel: "Batal",
        });
        if (confirmed) hapusSessionChat(sessionId);
      })();
    });
  });
}

// Load sesi chat
async function loadSessionChat(sessionId) {
  try {
    const response = await fetch(`/api/sesi-chat/${sessionId}`);
    const result = await response.json();

    if (result.sukses && result.data) {
      idSessionAktif = sessionId;
      localStorage.setItem("idSessionAktif", sessionId);

      // Update header
      const namaSessionAktif = document.getElementById("namaSessionAktif");
      const tanggalSessionAktif = document.getElementById(
        "tanggalSessionAktif"
      );

      if (namaSessionAktif) {
        namaSessionAktif.textContent = result.data.namaSession;
      }
      if (tanggalSessionAktif) {
        const tanggal = new Date(result.data.tanggalDibuat);
        tanggalSessionAktif.textContent = tanggal.toLocaleDateString("id-ID", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }

      // membersihkan chat history dan load dari database
      clearChatHistory();
      const areaPesan = document.getElementById("areaPesan");
      if (areaPesan) {
        areaPesan.innerHTML = "";
      }

      // Render messages dari sesi
      if (result.data.riwayatChat && result.data.riwayatChat.length > 0) {
        result.data.riwayatChat.forEach((msg) => {
          tambahPesanChat(msg.pesan, msg.tipe, {
            save: true,
            timestamp: msg.timestamp,
            simpanKeDatabase: false,
          });
        });
      } else {
        // tidak ada history, tampilkan pesan selamat datang
        const welcome =
          "Halo! 👋 Saya Koki AI, asisten memasak virtual Anda. Apa yang ingin Anda masak hari ini?";
        tambahPesanChat(welcome, "koki", {
          save: true,
          simpanKeDatabase: false,
        });
      }

      // Update active session in sidebar
      renderDaftarSession();
    }
  } catch (err) {
    console.error("Gagal load sesi chat:", err);
    tampilkanNotifikasi("Gagal memuat sesi chat", "error");
  }
}

// Buat sesi chat baru
async function buatSessionChatBaru() {
  try {
    console.log("📝 Membuat sesi chat baru...");
    const response = await fetch("/api/sesi-chat/buat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    console.log("Response status:", response.status);
    const result = await response.json();

    console.log("Response data:", result);

    if (result.sukses) {
      const newSession = result.data;
      daftarSessionChat.unshift(newSession);
      idSessionAktif = newSession._id;
      localStorage.setItem("idSessionAktif", idSessionAktif);

      renderDaftarSession();
      loadSessionChat(newSession._id);

      tampilkanNotifikasi("Sesi baru berhasil dibuat", "sukses");
      console.log("✅ Sesi baru berhasil dibuat:", newSession._id);
    } else {
      console.error("❌ Response tidak sukses:", result);
      tampilkanNotifikasi(result.error || "Gagal membuat sesi baru", "error");
    }
  } catch (err) {
    console.error("❌ Gagal buat sesi chat baru:", err);
    tampilkanNotifikasi("Gagal membuat sesi baru: " + err.message, "error");
  }
}

// Hapus sesi chat
async function hapusSessionChat(sessionId) {
  try {
    const response = await fetch(`/api/sesi-chat/${sessionId}`, {
      method: "DELETE",
    });
    const result = await response.json();

    if (result.sukses) {
      daftarSessionChat = daftarSessionChat.filter((s) => s._id !== sessionId);

      // Jika session yang dihapus adalah yang aktif, gunakan session lainnya
      if (idSessionAktif === sessionId) {
        if (daftarSessionChat.length > 0) {
          idSessionAktif = daftarSessionChat[0]._id;
          localStorage.setItem("idSessionAktif", idSessionAktif);
          loadSessionChat(idSessionAktif);
        } else {
          // Tidak ada session lagi, buat yang baru
          idSessionAktif = null;
          localStorage.removeItem("idSessionAktif");
          clearChatHistory();
          buatSessionChatBaru();
        }
      }

      renderDaftarSession();
      tampilkanNotifikasi("Sesi berhasil dihapus", "sukses");
    }
  } catch (err) {
    console.error("Gagal hapus sesi chat:", err);
    tampilkanNotifikasi("Gagal menghapus sesi", "error");
  }
}

// Perbarui nama sesi
async function perbaruiNamaSession(sessionId, namaBaru) {
  try {
    const response = await fetch(`/api/sesi-chat/${sessionId}/nama`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namaSession: namaBaru }),
    });
    const result = await response.json();

    if (result.sukses) {
      // Update daftar
      const session = daftarSessionChat.find((s) => s._id === sessionId);
      if (session) {
        session.namaSession = namaBaru;
      }

      renderDaftarSession();
      if (idSessionAktif === sessionId) {
        const namaSessionAktif = document.getElementById("namaSessionAktif");
        if (namaSessionAktif) {
          namaSessionAktif.textContent = namaBaru;
        }
      }

      tampilkanNotifikasi("Nama sesi berhasil diperbarui", "sukses");
      tutupModalEditNama();
    }
  } catch (err) {
    console.error("Gagal perbarui nama sesi:", err);
    tampilkanNotifikasi("Gagal memperbarui nama sesi", "error");
  }
}

// Modal edit nama
function bukaModalEditNama() {
  const modal = document.getElementById("modalEditNama");
  const inputNama = document.getElementById("inputNamaSession");
  const namaAktif = document.getElementById("namaSessionAktif");

  if (modal && inputNama && namaAktif) {
    inputNama.value = namaAktif.textContent;
    modal.classList.add("aktif");
    inputNama.focus();
    inputNama.select();
  }
}

function tutupModalEditNama() {
  const modal = document.getElementById("modalEditNama");
  if (modal) {
    modal.classList.remove("aktif");
  }
}

// Override tambahPesanChat untuk save ke database
const originalTambahPesanChat = window.tambahPesanChat;
window.tambahPesanChat = function (
  pesan,
  tipe,
  opts = { save: true, timestamp: null, simpanKeDatabase: true }
) {
  // Call original function
  originalTambahPesanChat.call(this, pesan, tipe, {
    save: opts.save,
    timestamp: opts.timestamp,
  });

  // CATATAN: Jangan simpan ke database di frontend
  // Backend (soketTimer.js) sudah menangani saving untuk user messages
  // Frontend hanya butuh save ke local chatHistory untuk display
};

// Simpan pesan ke sesi di database
async function simpanPesanKeSession(sessionId, tipe, pesan) {
  try {
    await fetch(`/api/sesi-chat/${sessionId}/pesan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipe, pesan }),
    });
  } catch (err) {
    console.warn("Gagal simpan pesan ke sesi:", err);
  }
}

// Setup event listeners
function setupSessionChatListeners() {
  const btnSessionBaru = document.getElementById("btnSessionBaru");
  const btnEditNamaSession = document.getElementById("btnEditNamaSession");
  const formEditNama = document.getElementById("formEditNama");
  const btnBatalEditNama = document.getElementById("btnBatalEditNama");
  const modalEditNama = document.getElementById("modalEditNama");

  if (btnSessionBaru) {
    btnSessionBaru.addEventListener("click", async (e) => {
      e.preventDefault();
      await buatSessionChatBaru();
    });
  }

  if (btnEditNamaSession) {
    btnEditNamaSession.addEventListener("click", bukaModalEditNama);
  }

  if (formEditNama) {
    formEditNama.addEventListener("submit", async (e) => {
      e.preventDefault();
      const namaBaru = document.getElementById("inputNamaSession").value.trim();
      if (namaBaru && idSessionAktif) {
        await perbaruiNamaSession(idSessionAktif, namaBaru);
      }
    });
  }

  if (btnBatalEditNama) {
    btnBatalEditNama.addEventListener("click", tutupModalEditNama);
  }

  if (modalEditNama) {
    modalEditNama.addEventListener("click", (e) => {
      if (e.target === modalEditNama) {
        tutupModalEditNama();
      }
    });
  }
}

// Initialize sesi chat when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Hanya inisialisasi jika di halaman chat
  if (document.getElementById("sidebarSession")) {
    inisialisasiSessionChat();
    setupSessionChatListeners();
  }
});

// Reset session saat logout
window.addEventListener("beforeunload", () => {
  // Clear session cache saat user logout
  const logoutBtn = document.querySelector('a[href*="/logout"]');
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("idSessionAktif");
      sessionStorage.removeItem("koki_chat_session_id");
    });
  }
});
