/* public/js/app.js — frontend behavior (cleaned from provided inline script)
   Note: avoid syntax errors caused by extra spaces before dots or incorrect selectors.
*/
const API_URL = "http://localhost:3000/api";
let soketMemasak = null;
let soketNotifikasi = null;
let idSesiChat = "sesi_" + Date.now();
let daftarTimerAktif = new Map();
let idTimerCounter = 1;
// Track IDs recently stopped locally to avoid re-creating cards when server emits update immediately after stop
let suppressedTimerCreates = new Set();

function inisialisasiSocket() {
  soketMemasak = io("http://localhost:3000/memasak");

  soketMemasak.on("connect", () => {
    console.log("✅ Terhubung ke server memasak");
    tampilkanNotifikasi("Terhubung ke Koki AI", "sukses");
  });

  soketMemasak.on("respons_koki", (data) => {
    sembunyikanIndikatorMengetik();
    tambahPesanChat(data.pesan, "koki");
  });

  soketMemasak.on("koki_mengetik", (data) => {
    if (data.status) tampilkanIndikatorMengetik();
    else sembunyikanIndikatorMengetik();
  });

  soketMemasak.on("update_timer", (data) =>
    updateTampilanTimer(data.idTimer, data)
  );
  soketMemasak.on("timer_selesai", (data) => {
    tampilkanNotifikasi(`⏰ ${data.namaTimer} sudah selesai!`, "peringatan");
    playBunyi();
    hapusTimerDariTampilan(data.idTimer);
  });
  soketMemasak.on("peringatan_timer", (data) =>
    tampilkanNotifikasi(data.pesan, "info")
  );

  soketNotifikasi = io("http://localhost:3000/notifikasi");
  soketNotifikasi.on("connect", () =>
    console.log("✅ Terhubung ke notifikasi")
  );
  soketNotifikasi.on("notifikasi_baru", (data) =>
    tampilkanNotifikasi(data.pesan, data.tipe || "info")
  );
}

function inisialisasiNavigasi() {
  const tombolNav = document.querySelectorAll(".tombol-nav");
  const panels = document.querySelectorAll(".panel");

  // If navigation uses links (page-per-view), mark active link by pathname
  tombolNav.forEach((tombol) => {
    if (tombol.tagName === 'A') {
      // mark active
      try {
        const urlPath = new URL(tombol.href).pathname;
        if (urlPath === location.pathname) tombol.classList.add('aktif');
        else tombol.classList.remove('aktif');
      } catch (e) {}

      // on click add active class (visual feedback before navigation)
      tombol.addEventListener('click', () => {
        tombolNav.forEach((t) => t.classList.remove('aktif'));
        tombol.classList.add('aktif');
      });
    } else {
      // legacy behavior (buttons toggling client-side panels)
      tombol.addEventListener("click", () => {
        tombolNav.forEach((t) => t.classList.remove("aktif"));
        panels.forEach((p) => p.classList.remove("aktif"));
        tombol.classList.add("aktif");
        const panelId = "panel" + kapitalisasi(tombol.dataset.panel);
        const el = document.getElementById(panelId);
        if (el) el.classList.add("aktif");
      });
    }
  });
}

function inisialisasiChat() {
  const formChat = document.getElementById("formChat");
  const inputPesan = document.getElementById("inputPesan");
  if (!formChat) return;
  formChat.addEventListener("submit", (e) => {
    e.preventDefault();
    const pesan = inputPesan.value.trim();
    if (pesan) {
      tambahPesanChat(pesan, "pengguna");
      inputPesan.value = "";
      soketMemasak.emit("pesan_chat", { pesan });
    }
  });
}

function tambahPesanChat(pesan, tipe) {
  const areaPesan = document.getElementById("areaPesan");
  const divPesan = document.createElement("div");
  divPesan.className = `pesan pesan-${tipe}`;
  divPesan.innerHTML = pesan.replace(/\n/g, "<br>");
  if (areaPesan) {
    areaPesan.appendChild(divPesan);
    areaPesan.scrollTop = areaPesan.scrollHeight;
  }
}

function tampilkanIndikatorMengetik() {
  const el = document.getElementById("indikatorMengetik");
  if (el) el.style.display = "flex";
}
function sembunyikanIndikatorMengetik() {
  const el = document.getElementById("indikatorMengetik");
  if (el) el.style.display = "none";
}

function inisialisasiTimer() {
  const tombolBuatTimer = document.getElementById("tombolBuatTimer");
  if (!tombolBuatTimer) return;
  tombolBuatTimer.addEventListener("click", (e) => {
    e.preventDefault();
      const namaTimer = document.getElementById("namaTimerBaru").value.trim();
    const jam = parseInt(document.getElementById("jamTimerBaru") ? document.getElementById("jamTimerBaru").value : 0);
    const menit = parseInt(document.getElementById("menitTimerBaru").value);
    const detik = parseInt(document.getElementById("detikTimerBaru") ? document.getElementById("detikTimerBaru").value : 0);
    const durasi = (isNaN(jam) ? 0 : jam * 3600) + (isNaN(menit) ? 0 : menit * 60) + (isNaN(detik) ? 0 : detik);
    if (namaTimer && durasi > 0) {
      buatTimerBaru(namaTimer, durasi);
      document.getElementById("namaTimerBaru").value = "";
      if (document.getElementById("jamTimerBaru")) document.getElementById("jamTimerBaru").value = "";
      document.getElementById("menitTimerBaru").value = "";
      if (document.getElementById("detikTimerBaru")) document.getElementById("detikTimerBaru").value = "";
    } else
      tampilkanNotifikasi("Masukkan nama timer dan durasi yang valid", "error");
  });
}

function buatTimerBaru(nama, durasiDetik) {
  const idTimer = "timer_" + idTimerCounter++;
  const kontainerTimer = document.getElementById("daftarTimer");
  if (!kontainerTimer) return;
  const kartuTimer = document.createElement("div");
  kartuTimer.className = "kartu-timer";
  kartuTimer.id = `kartu_${idTimer}`;
  kartuTimer.innerHTML = `
    <h4>${nama}</h4>
    <div class="tampilan-timer" id="tampilan_${idTimer}">${formatWaktu(
    durasiDetik
  )}</div>
    <div class="progress-timer"><div class="progress-bar" id="progress_${idTimer}" style="width:0%"></div></div>
    <div class="kontrol-timer">
      <button class="tombol-timer tombol-jeda" onclick="jedaTimer('${idTimer}')">⏸️ Jeda</button>
      <button class="tombol-timer tombol-lanjut hidden" id="lanjut_${idTimer}" onclick="lanjutkanTimer('${idTimer}')">▶️ Lanjutkan</button>
      <button class="tombol-timer tombol-berhenti" onclick="hentikanTimer('${idTimer}')">⏹️ Stop</button>
    </div>
  `;
  kontainerTimer.appendChild(kartuTimer);
  daftarTimerAktif.set(idTimer, { nama, durasiTotal: durasiDetik });
  if (soketMemasak && soketMemasak.connected)
    soketMemasak.emit("mulai_timer", { idTimer, durasiDetik, namaTimer: nama });
  tampilkanNotifikasi(`Timer "${nama}" dimulai!`, "sukses");
}

function ensureTimerCardExists(idTimer, data) {
  // If we just manually stopped this timer, don't recreate it when server emits an update
  if (suppressedTimerCreates.has(idTimer)) return;
  if (document.getElementById(`kartu_${idTimer}`)) return;
  const kontainerTimer = document.getElementById("daftarTimer");
  if (!kontainerTimer) return;
  const kartuTimer = document.createElement("div");
  kartuTimer.className = "kartu-timer";
  kartuTimer.id = `kartu_${idTimer}`;
  const nama = data && data.namaTimer ? data.namaTimer : "Timer";
  const waktu = data && data.formatWaktu ? data.formatWaktu : "0:00:00";
  kartuTimer.innerHTML = `
    <h4>${nama}</h4>
    <div class="tampilan-timer" id="tampilan_${idTimer}">${waktu}</div>
    <div class="progress-timer"><div class="progress-bar" id="progress_${idTimer}" style="width:${data && typeof data.persentase !== 'undefined' ? data.persentase : 0}%"></div></div>
    <div class="kontrol-timer">
      <button class="tombol-timer tombol-jeda" onclick="jedaTimer('${idTimer}')">⏸️ Jeda</button>
      <button class="tombol-timer tombol-lanjut hidden" id="lanjut_${idTimer}" onclick="lanjutkanTimer('${idTimer}')">▶️ Lanjutkan</button>
      <button class="tombol-timer tombol-berhenti" onclick="hentikanTimer('${idTimer}')">⏹️ Stop</button>
    </div>
  `;
  kontainerTimer.appendChild(kartuTimer);
}

function updateTampilanTimer(idTimer, data) {
  // If card doesn't exist (e.g., after refresh), create it
  ensureTimerCardExists(idTimer, data || {});

  const tampilan = document.getElementById(`tampilan_${idTimer}`);
  const progress = document.getElementById(`progress_${idTimer}`);
  const tombolJeda = document.querySelector(`#kartu_${idTimer} .tombol-jeda`);
  const tombolLanjut = document.getElementById(`lanjut_${idTimer}`);
  if (tampilan && data.formatWaktu) tampilan.textContent = data.formatWaktu;
  if (progress && typeof data.persentase !== "undefined")
    progress.style.width = `${data.persentase}%`;

  // toggle controls based on paused state
  if (data.paused) {
    if (tombolJeda) tombolJeda.classList.add('hidden');
    if (tombolLanjut) tombolLanjut.classList.remove('hidden');
  } else {
    if (tombolJeda) tombolJeda.classList.remove('hidden');
    if (tombolLanjut) tombolLanjut.classList.add('hidden');
  }
}

function jedaTimer(idTimer) {
  if (soketMemasak) soketMemasak.emit("jeda_timer", { idTimer });
  tampilkanNotifikasi("Timer dijeda", "info");
}
function lanjutkanTimer(idTimer) {
  if (soketMemasak) soketMemasak.emit("lanjutkan_timer", { idTimer });
  tampilkanNotifikasi("Timer dilanjutkan", "sukses");
}
function hentikanTimer(idTimer) {
  // Prevent immediate recreation of this timer card if a server 'update_timer' arrives
  suppressedTimerCreates.add(idTimer);
  setTimeout(() => suppressedTimerCreates.delete(idTimer), 1200);

  if (soketMemasak) soketMemasak.emit("hentikan_timer", { idTimer });
  hapusTimerDariTampilan(idTimer);
  tampilkanNotifikasi("Timer dihentikan", "info");
}
function hapusTimerDariTampilan(idTimer) {
  const kartu = document.getElementById(`kartu_${idTimer}`);
  if (kartu) kartu.remove();
  daftarTimerAktif.delete(idTimer);
}

function inisialisasiUploadGambar() {
  const areaUpload = document.getElementById("areaUpload");
  const inputGambar = document.getElementById("inputGambar");
  const previewGambar = document.getElementById("previewGambar");
  if (!areaUpload || !inputGambar) return;
  areaUpload.addEventListener("click", () => inputGambar.click());
  areaUpload.addEventListener("dragover", (e) => {
    e.preventDefault();
    areaUpload.classList.add("dragover");
  });
  areaUpload.addEventListener("dragleave", () =>
    areaUpload.classList.remove("dragover")
  );
  areaUpload.addEventListener("drop", (e) => {
    e.preventDefault();
    areaUpload.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) prosesGambar(file);
  });
  inputGambar.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) prosesGambar(file);
  });
}

// Initialize add-bahan button functionality
function inisialisasiTambahBahan() {
  const btn = document.getElementById("tombolTambahBahan");
  if (!btn) return;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    const namaEl = document.getElementById("namaBahanBaru");
    const jumlahEl = document.getElementById("jumlahBahanBaru");
    const nama = namaEl ? namaEl.value.trim() : "";
    const jumlah = jumlahEl ? parseFloat(jumlahEl.value) : 0;
    const satuan = document.getElementById("satuanBahanBaru")
      ? document.getElementById("satuanBahanBaru").value
      : "gram";
    const kategori = document.getElementById("kategoriBahanBaru")
      ? document.getElementById("kategoriBahanBaru").value
      : "lainnya";
    const lokasi = document.getElementById("lokasiPenyimpananBahanBaru")
      ? document.getElementById("lokasiPenyimpananBahanBaru").value
      : "rak_dapur";
    const tanggalPembelian = document.getElementById(
      "tanggalPembelianBahanBaru"
    )
      ? document.getElementById("tanggalPembelianBahanBaru").value
      : null;
    const tanggalKadaluarsa = document.getElementById(
      "tanggalKadaluarsaBahanBaru"
    )
      ? document.getElementById("tanggalKadaluarsaBahanBaru").value
      : null;

    if (!nama) {
      tampilkanNotifikasi("Masukkan nama bahan", "error");
      return;
    }

    if (tanggalKadaluarsa) {
      const tK = new Date(tanggalKadaluarsa);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      if (tK < now) {
        tampilkanNotifikasi(
          "Tanggal kadaluarsa tidak boleh di masa lalu",
          "error"
        );
        return;
      }
    }

    btn.disabled = true;
    const payload = {
      namaBahan: nama,
      jumlahTersedia: jumlah,
      satuan,
      kategoriBahan: kategori,
      lokasiPenyimpanan: lokasi,
      tanggalPembelian: tanggalPembelian || undefined,
      tanggalKadaluarsa: tanggalKadaluarsa || undefined,
    };
    try {
      const resp = await fetch("/api/bahan", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data && data.sukses && data.data) {
        tampilkanNotifikasi("Bahan ditambahkan", "sukses");
        // reload authoritative list from server
        await loadDaftarBahan();
        // reset fields
        if (namaEl) namaEl.value = "";
        if (jumlahEl) jumlahEl.value = "";
        const satuanEl = document.getElementById("satuanBahanBaru");
        const kategoriEl = document.getElementById("kategoriBahanBaru");
        const lokasiEl = document.getElementById("lokasiPenyimpananBahanBaru");
        const tglPembelianEl = document.getElementById(
          "tanggalPembelianBahanBaru"
        );
        const tglKadaluarsaEl = document.getElementById(
          "tanggalKadaluarsaBahanBaru"
        );
        if (satuanEl) satuanEl.value = "gram";
        if (kategoriEl) kategoriEl.value = "lainnya";
        if (lokasiEl) lokasiEl.value = "rak_dapur";
        if (tglPembelianEl) tglPembelianEl.value = "";
        if (tglKadaluarsaEl) tglKadaluarsaEl.value = "";
      } else {
        tampilkanNotifikasi(
          (data && data.pesan) || "Gagal menambahkan bahan",
          "error"
        );
      }
    } catch (err) {
      console.error("Add bahan failed", err);
      tampilkanNotifikasi("Gagal menambahkan bahan", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function formatTimestamp(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch (e) {
    return ts;
  }
}

async function prosesGambar(file) {
  const previewGambar = document.getElementById("previewGambar");
  const hasilIdentifikasi = document.getElementById("hasilIdentifikasi");
  if (previewGambar) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewGambar.src = e.target.result;
      previewGambar.style.display = "block";
    };
    reader.readAsDataURL(file);
  }
  if (hasilIdentifikasi)
    hasilIdentifikasi.innerHTML = "<p>🔄 Menganalisis gambar...</p>";
  try {
    const formData = new FormData();
    formData.append("gambar", file);
    const response = await fetch(`${API_URL}/bahan/identifikasi-gambar`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();
    if (data.sukses) tampilkanHasilIdentifikasi(data.data);
    else if (hasilIdentifikasi)
      hasilIdentifikasi.innerHTML = `<p style="color:red;">❌ ${data.pesan}</p>`;
  } catch (err) {
    if (hasilIdentifikasi)
      hasilIdentifikasi.innerHTML =
        '<p style="color:red;">❌ Gagal mengidentifikasi gambar</p>';
  }
}

function tampilkanHasilIdentifikasi(data) {
  const hasilIdentifikasi = document.getElementById("hasilIdentifikasi");
  if (!hasilIdentifikasi) return;
  if (
    data &&
    data.bahanTeridentifikasi &&
    data.bahanTeridentifikasi.length > 0
  ) {
    let html = "<h4>✅ Bahan Teridentifikasi:</h4><ul>";
    data.bahanTeridentifikasi.forEach((b) => {
      html += `<li>${b.nama} - ${b.estimasiJumlah} ${b.satuanTersarankan} (${b.kategori})</li>`;
    });
    html += "</ul>";
    if (data.saranResep && data.saranResep.length) {
      html += "<h4>💡 Saran Resep:</h4><ul>";
      data.saranResep.forEach((r) => {
        html += `<li>${r}</li>`;
      });
      html += "</ul>";
    }
    hasilIdentifikasi.innerHTML = html;
  } else
    hasilIdentifikasi.innerHTML = "<p>Tidak ada bahan yang teridentifikasi</p>";
}

function tampilkanNotifikasi(pesan, tipe = "info", options = {}) {
  // For timer alerts or when options.modal === true, render centered modal
  if (tipe === 'peringatan' || options.modal) {
    const modalCont = document.getElementById('kontainerModalNotifikasi');
    if (!modalCont) return;
    modalCont.innerHTML = '';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const card = document.createElement('div');
    card.className = 'modal-card';

    // Icon + title
    const icon = document.createElement('div');
    icon.className = 'modal-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⏰';
    card.appendChild(icon);

    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = options.title || 'Timer selesai!';
    card.appendChild(title);

    const pesanEl = document.createElement('p');
    pesanEl.innerHTML = pesan;
    card.appendChild(pesanEl);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const ok = document.createElement('button');
    ok.className = 'notifikasi-oke';
    ok.textContent = options.okLabel || 'OK';
    ok.addEventListener('click', () => {
      try { stopBunyi(); } catch (e) {}
      modalCont.classList.remove('active');
      modalCont.setAttribute('aria-hidden', 'true');
      modalCont.innerHTML = '';
    });
    actions.appendChild(ok);

    // optional secondary (dismiss quietly)
    const close = document.createElement('button');
    close.className = 'notifikasi-secondary';
    close.textContent = 'Tutup';
    close.addEventListener('click', () => {
      try { stopBunyi(); } catch (e) {}
      modalCont.classList.remove('active');
      modalCont.setAttribute('aria-hidden', 'true');
      modalCont.innerHTML = '';
    });
    actions.appendChild(close);

    card.appendChild(actions);
    modalCont.appendChild(backdrop);
    modalCont.appendChild(card);
    modalCont.classList.add('active');
    modalCont.setAttribute('aria-hidden', 'false');

    // If not persistent, auto-hide after timeout
    if (!options.persistent) {
      setTimeout(() => {
        try { stopBunyi(); } catch (e) {}
        modalCont.classList.remove('active');
        modalCont.innerHTML = '';
      }, options.timeout || 5000);
    }

    return;
  }

  // Otherwise, show as toast in top-right
  const kontainer = document.getElementById("kontainerToasts");
  if (!kontainer) return;
  const notifikasi = document.createElement("div");
  notifikasi.className = `notifikasi ${tipe}`;

  const pesanEl = document.createElement('div');
  pesanEl.className = 'notifikasi-pesan';
  pesanEl.innerHTML = pesan;
  notifikasi.appendChild(pesanEl);

  // auto-remove after timeout
  setTimeout(() => notifikasi.remove(), options.timeout || 5000);

  kontainer.appendChild(notifikasi);
}

function formatWaktu(detik) {
  const total = Math.max(0, parseInt(detik, 10) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return `${h}:${mm}:${ss}`;
}
function kapitalisasi(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
let currentBunyi = null;
function playBunyi() {
  try {
    if (currentBunyi) return; // already playing
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();

    const beeper = { audioCtx, intervalId: null, oscillators: [] };

    const beepMs = 500; // beep duration
    const gapMs = 300; // gap between beeps

    function playBeep() {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'square';
      // small frequency variation for more natural alarm sound
      osc.frequency.value = 800 + Math.floor(Math.random() * 400);
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.01);
      osc.start(now);
      // stop after beepMs
      setTimeout(() => {
        try { gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05); } catch (e) {}
        try { osc.stop(audioCtx.currentTime + 0.06); } catch(e) {}
      }, beepMs);
      beeper.oscillators.push({ osc, gain });
    }

    // start immediately and then loop
    playBeep();
    beeper.intervalId = setInterval(playBeep, beepMs + gapMs);

    // vibrate pattern if supported
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    currentBunyi = beeper;
  } catch (e) {
    console.warn("Audio not supported", e);
  }
}

function stopBunyi() {
  try {
    if (!currentBunyi) return;
    const { audioCtx, intervalId, oscillators } = currentBunyi;
    if (intervalId) clearInterval(intervalId);
    // stop remaining oscillators gracefully
    oscillators.forEach(({ osc, gain }) => {
      try { gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05); } catch(e) {}
      try { osc.stop(audioCtx.currentTime + 0.06); } catch(e) {}
    });
    setTimeout(() => {
      try { audioCtx.close(); } catch (e) {}
    }, 150);
    currentBunyi = null;
    if (navigator.vibrate) navigator.vibrate(0);
  } catch (e) {
    console.warn('stopBunyi error', e);
  }
}

// Load bahan list and render (top-level so we can call it from multiple places)
async function loadDaftarBahan() {
  try {
    const resp = await fetch("/api/bahan", { credentials: "same-origin" });
    const ul = document.getElementById("daftarBahanSaya");
    if (!ul) return;
    ul.innerHTML = "";

    // Handle auth/forbidden responses
    if (resp.status === 401) {
      // Not logged in -> redirect to login
      window.location.href = "/login";
      return;
    }
    if (resp.status === 403) {
      tampilkanNotifikasi(
        "Akses ditolak: tidak bisa melihat bahan pengguna lain",
        "error"
      );
      return;
    }

    const data = await resp.json();
    if (!data || !data.sukses) return;
    if (!data.data || data.data.length === 0) {
      ul.innerHTML =
        '<li class="item-bahan kosong">Belum ada bahan — tambahkan sekarang</li>';
      return;
    }
    data.data.forEach((b) => {
      const li = document.createElement("li");
      li.className = "item-bahan";
      const sisaHari = b.tanggalKadaluarsa
        ? Math.ceil(
            (new Date(b.tanggalKadaluarsa) - new Date()) / (1000 * 60 * 60 * 24)
          )
        : null;
      const kategoriTag = b.kategoriBahan
        ? `<span class="tag">${b.kategoriBahan}</span>`
        : "";
      const tglPembelian = b.tanggalPembelian
        ? `<div class="item-meta">Pembelian: ${formatTimestamp(
            b.tanggalPembelian
          )}</div>`
        : "";
      const tglKadaluarsa = b.tanggalKadaluarsa
        ? `<div class="item-meta">Kadaluarsa: ${formatTimestamp(
            b.tanggalKadaluarsa
          )}</div>`
        : "";
      const added = b.createdAt
        ? `<div class="item-meta">Ditambahkan: ${formatTimestamp(
            b.createdAt
          )}</div>`
        : "";
      li.innerHTML = `<div><span>${b.namaBahan} - ${b.jumlahTersedia || 0}${
        b.satuan ? " " + b.satuan : ""
      }${kategoriTag}</span>${
        sisaHari !== null
          ? `<span class="badge-kadaluarsa ${
              sisaHari <= 1 ? "segera" : sisaHari <= 3 ? "perhatian" : ""
            }">${
              sisaHari <= 1
                ? "SEGERA GUNAKAN!"
                : sisaHari <= 3
                ? sisaHari + " hari lagi"
                : ""
            }</span>`
          : ""
      }</div>${tglPembelian}${tglKadaluarsa}${added}`;
      ul.appendChild(li);
    });
  } catch (err) {
    console.error("Failed to load bahan", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  console.log("🍳 Koki AI Pribadi - Frontend Dimulai");
  inisialisasiNavigasi();
  inisialisasiSocket();
  inisialisasiChat();
  inisialisasiTimer();
  inisialisasiUploadGambar();
  inisialisasiTambahBahan();

  await loadDaftarBahan();
  setTimeout(
    () =>
      tampilkanNotifikasi("Selamat datang di Koki AI Pribadi! 🍳", "sukses"),
    1000
  );

  // Toggle password eye for auth pages (target the input inside the same .input-with-icon)
  document.querySelectorAll(".toggle-password").forEach((btn) => {
    btn.addEventListener("click", () => {
      const img = btn.querySelector("img");
      const container = btn.closest(".input-with-icon");
      const target = container
        ? container.querySelector(".password-field")
        : null;
      if (!target) return;

      const isPassword = target.getAttribute("type") === "password";
      target.setAttribute("type", isPassword ? "text" : "password");

      if (img) {
        img.src = isPassword
          ? img.dataset.open || img.src
          : img.dataset.closed || img.src;
        img.setAttribute(
          "alt",
          isPassword ? "Sembunyikan password" : "Tampilkan password"
        );
      }

      btn.setAttribute("aria-pressed", String(isPassword));
      btn.title = isPassword ? "Sembunyikan password" : "Tampilkan password";
    });
  });

  // "Remember me" support: pre-fill and save credentials locally when user opts in
  (function initRememberMe() {
    const loginForm = document.querySelector(".login-form");
    if (!loginForm) return;

    const emailEl = loginForm.querySelector('input[name="email"]');
    const pwEl = loginForm.querySelector('input[name="kataSandi"]');
    const rememberCheckbox = loginForm.querySelector('input[name="remember"]');

    function getCookie(name) {
      const match = document.cookie.match(
        "(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"
      );
      return match ? decodeURIComponent(match.pop()) : null;
    }

    // Prefill from server-set cookie or localStorage
    try {
      const savedEmail =
        getCookie("rememberEmail") || localStorage.getItem("remember:email");
      const savedPassword = localStorage.getItem("remember:password");
      if (emailEl && savedEmail) {
        emailEl.value = savedEmail;
        if (rememberCheckbox) rememberCheckbox.checked = true;
      }
      if (pwEl && savedPassword) {
        pwEl.value = savedPassword;
        if (rememberCheckbox) rememberCheckbox.checked = true;
      }
    } catch (e) {
      console.warn("Remember me: failed to access storage", e);
    }

    // On submit, persist or clear creds in localStorage based on checkbox
    loginForm.addEventListener("submit", () => {
      try {
        if (rememberCheckbox && rememberCheckbox.checked) {
          if (emailEl) localStorage.setItem("remember:email", emailEl.value);
          if (pwEl) localStorage.setItem("remember:password", pwEl.value);
        } else {
          localStorage.removeItem("remember:email");
          localStorage.removeItem("remember:password");
        }
      } catch (e) {
        console.warn("Remember me: failed to save credentials", e);
      }
    });
  })();

  // Logout confirmation and AJAX logout
  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", async (e) => {
      e.preventDefault();
      const confirmed = confirm("Yakin ingin keluar?");
      if (!confirmed) return;
      try {
        btnLogout.disabled = true;
        const url = btnLogout.dataset.logoutUrl || "/api/pengguna/logout";
        const resp = await fetch(url, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
        const data = await resp.json();
        if (data && data.sukses) {
          window.location.href = "/login";
        } else {
          tampilkanNotifikasi(data.pesan || "Gagal keluar", "error");
          btnLogout.disabled = false;
        }
      } catch (err) {
        console.error("Logout failed", err);
        tampilkanNotifikasi("Gagal keluar", "error");
        btnLogout.disabled = false;
      }
    });
  }

  // Register form client validation (password confirmation) + OTP verification before submit
  document.querySelectorAll(".register-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      const pw = form.querySelector('input[name="kataSandi"]');
      const pwc = form.querySelector('input[name="kataSandiConfirm"]');
      const errEl = document.getElementById("registerError");
      if (pw && pwc && pw.value !== pwc.value) {
        e.preventDefault();
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Password dan konfirmasi tidak cocok.";
        }
        return false;
      }
      // OTP verification
      const email = form.querySelector('input[name="email"]');
      const otpInput = form.querySelector('input[name="otp"]');
      if (otpInput && email) {
        e.preventDefault();
        const kode = otpInput.value.trim();
        if (!kode) {
          if (errEl) {
            errEl.style.display = "block";
            errEl.textContent = "Masukkan kode OTP sebelum mendaftar.";
          }
          return false;
        }
        try {
          const resp = await fetch(`${API_URL}/otp/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.value, kode }),
          });
          const data = await resp.json();
          if (data.sukses) {
            if (errEl) {
              errEl.style.display = "none";
              errEl.textContent = "";
            }
            form.submit(); // submit now that OTP is verified
          } else {
            if (errEl) {
              errEl.style.display = "block";
              errEl.textContent = data.pesan || "Verifikasi OTP gagal";
            }
          }
        } catch (err) {
          if (errEl) {
            errEl.style.display = "block";
            errEl.textContent = "Gagal memverifikasi OTP";
          }
        }
        return false;
      }
      if (errEl) {
        errEl.style.display = "none";
        errEl.textContent = "";
      }
    });
  });

  // OTP button: send OTP to given email and start cooldown
  document.querySelectorAll(".otp-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const form = btn.closest("form");
      const emailEl = form ? form.querySelector('input[name="email"]') : null;
      if (!emailEl || !emailEl.value) {
        tampilkanNotifikasi("Masukkan alamat email terlebih dahulu", "error");
        return;
      }
      btn.disabled = true;
      const originalText = btn.textContent;
      try {
        const resp = await fetch(`${API_URL}/otp/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: emailEl.value }),
        });
        const data = await resp.json();
        if (data.sukses) {
          tampilkanNotifikasi(data.pesan || "Kode OTP dikirim", "sukses");
        } else {
          tampilkanNotifikasi(data.pesan || "Gagal mengirim OTP", "error");
          btn.disabled = false;
          return;
        }
      } catch (err) {
        tampilkanNotifikasi("Gagal mengirim permintaan OTP", "error");
        btn.disabled = false;
        return;
      }

      // Cooldown countdown (60s)
      let sisa = 60;
      btn.textContent = `Terkirim (${sisa}s)`;
      const interval = setInterval(() => {
        sisa -= 1;
        if (sisa <= 0) {
          clearInterval(interval);
          btn.disabled = false;
          btn.textContent = originalText;
        } else btn.textContent = `Terkirim (${sisa}s)`;
      }, 1000);
    });
  });

  // Reset form client-side validation (password match)
  document.querySelectorAll(".reset-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      const errEl = document.getElementById("resetError");
      const pw = form.querySelector('input[name="kataSandi"]');
      const pwc = form.querySelector('input[name="kataSandiConfirm"]');
      if (!pw || !pwc) return true;
      if (pw.value !== pwc.value) {
        e.preventDefault();
        if (errEl) {
          errEl.style.display = "block";
          errEl.textContent = "Password dan konfirmasi tidak cocok.";
        }
        return false;
      }
      if (errEl) {
        errEl.style.display = "none";
        errEl.textContent = "";
      }
      return true;
    });
  });

  // Stat count-up animation (animates when values change or on load)
  function animateCount(el, target, duration = 800) {
    const from = parseInt(String(el.textContent).replace(/[^0-9]/g, "")) || 0;
    const to = parseInt(target, 10) || 0;
    if (from === to) return;
    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = Math.round(from + (to - from) * eased);
      el.textContent = String(value);
      if (t < 1) requestAnimationFrame(step);
      else {
        el.classList.add("pop");
        setTimeout(() => el.classList.remove("pop"), 300);
      }
    };
    requestAnimationFrame(step);
  }

  function initStatsCountUp() {
    document.querySelectorAll(".stat-value").forEach((el) => {
      const runIfReady = () => {
        const val = parseInt(String(el.textContent).replace(/[^0-9]/g, ""), 10);
        if (!isNaN(val) && val > 0) {
          animateCount(el, val, 900);
          return true;
        }
        return false;
      };

      if (!runIfReady()) {
        const mo = new MutationObserver((mutations) => {
          if (runIfReady()) mo.disconnect();
        });
        mo.observe(el, { characterData: true, childList: true, subtree: true });
      }
    });
  }

  // Initialize stats animation now (if values already present) and ensure it will trigger on future updates
  initStatsCountUp();
});
