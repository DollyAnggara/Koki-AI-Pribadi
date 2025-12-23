/* public/js/app.js
*/
const API_URL = "http://localhost:3000/api";
let soketMemasak = null;
let soketNotifikasi = null;

// ID sesi per-tab yang stabil: simpan di sessionStorage sehingga reload mempertahankan riwayat sampai tab ditutup
let idSesiChat = sessionStorage.getItem("koki_chat_session_id");
if (!idSesiChat) {
  idSesiChat = "sesi_" + Date.now();
  sessionStorage.setItem("koki_chat_session_id", idSesiChat);
}

// Riwayat chat untuk tab saat ini (disimpan di sessionStorage dengan kunci koki_chat_<session>)
let chatHistory = [];
const CHAT_STORAGE_KEY = `koki_chat_${idSesiChat}`;

let daftarTimerAktif = new Map();
let idTimerCounter = 1;
// Lacak ID yang baru saja dihentikan secara lokal untuk menghindari pembuatan ulang kartu saat server mengirim update segera setelah berhenti
let suppressedTimerCreates = new Set();

function inisialisasiSocket() {
  soketMemasak = io("http://localhost:3000/memasak");

  soketMemasak.on("connect", () => {
    // Jika sudah menampilkan notifikasi koneksi bersama pesan sambutan, lewati menampilkan lagi
    try {
      const alreadyShown = sessionStorage.getItem("koki_connect_shown");
      if (alreadyShown === "1") {
        console.log(
          "✅ Terhubung ke server memasak (already shown with welcome)"
        );
        sessionStorage.removeItem("koki_connect_shown");
      } else {
        // Tampilkan notifikasi koneksi hanya jika baru saja diset setelah login
        const ts = parseInt(sessionStorage.getItem("koki_show_connect_ts"), 10);
        if (ts && Date.now() - ts <= 5000) {
          console.log(
            "✅ Terhubung ke server memasak (notify immediate post-login)"
          );
          tampilkanNotifikasi("Terhubung ke Koki AI", "sukses");
        } else {
          console.log("✅ Terhubung ke server memasak (silent)");
        }
      }
    } catch (e) {
      console.log(
        "✅ Terhubung ke server memasak (silent, error reading flag)"
      );
    }
    // Selalu bersihkan kunci sementara agar tidak tampil lagi saat navigasi
    try {
      sessionStorage.removeItem("koki_show_connect_ts");
      sessionStorage.removeItem("koki_connect_shown");
    } catch (e) {}
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
    // Gunakan modal eksplisit untuk notifikasi timer agar muncul terpusat dengan judul yang sesuai
    tampilkanNotifikasi(`⏰ ${data.namaTimer} sudah selesai!`, "peringatan", {
      modal: true,
      title: `Timer selesai!`,
    });
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

let isNavigating = false;

function waitForTransitionEnd(el, timeout = 800) {
  return new Promise((resolve) => {
    if (!el) return resolve();
    let done = false;
    const onEnd = (e) => {
      if (e.target !== el) return;
      el.removeEventListener("transitionend", onEnd);
      if (!done) {
        done = true;
        resolve();
      }
    };
    el.addEventListener("transitionend", onEnd);
    // fallback (cadangan jika event transitionend tidak terpanggil)
    setTimeout(() => {
      if (!done) {
        done = true;
        el.removeEventListener("transitionend", onEnd);
        resolve();
      }
    }, timeout);
  });
}

async function fadeOut(el) {
  if (!el) return;
  el.classList.add("page-fade");
  // pastikan status awal terlihat
  el.classList.remove("page-hidden");
  // paksa reflow agar perubahan kelas diterapkan
  void el.offsetWidth;
  el.classList.add("page-hidden");
  await waitForTransitionEnd(el, 900);
}

async function fadeIn(el) {
  if (!el) return;
  el.classList.add("page-fade");
  // pastikan status awal tersembunyi
  el.classList.add("page-hidden");
  // paksa reflow
  void el.offsetWidth;
  el.classList.remove("page-hidden");
  await waitForTransitionEnd(el, 900);
}

function inisialisasiNavigasi() {
  const tombolNav = document.querySelectorAll(".tombol-nav");
  const panels = document.querySelectorAll(".panel");
  const main =
    document.querySelector("main.kontainer-utama") ||
    document.querySelector("main") ||
    document.querySelector(".kontainer-admin");
  // Target cadangan untuk animasi jika target utama tidak ada (beberapa halaman seperti halaman otentikasi menggunakan tata letak yang berbeda)
  const fadeTarget =
    main ||
    document.querySelector("#app") ||
    document.body ||
    document.documentElement;

  // Animasi masuk awal: pastikan kelas page-fade ada dan animasikan masuk.
  if (fadeTarget) {
    fadeTarget.classList.add("page-fade");
    if (!fadeTarget.classList.contains("page-hidden")) {
      fadeTarget.classList.add("page-hidden");
      requestAnimationFrame(() =>
        setTimeout(() => fadeTarget.classList.remove("page-hidden"), 20)
      );
    }
  }

  // Jika navigasi menggunakan tautan (halaman per tampilan), tandai tautan aktif dengan jalur file.
  tombolNav.forEach((tombol) => {
    if (tombol.tagName === "A") {
      // tandai aktif
      try {
        const urlPath = new URL(tombol.href).pathname;
        if (urlPath === location.pathname) tombol.classList.add("aktif");
        else tombol.classList.remove("aktif");
      } catch (e) {}

      // saat klik: fade-out + navigasi menggunakan transitionend untuk akurasi
      tombol.addEventListener("click", async (e) => {
        // izinkan perilaku browser normal: klik ctrl/meta, klik tengah, target="_blank"
        if (e.defaultPrevented) return;
        if (
          e.button !== 0 ||
          tombol.target === "_blank" ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        )
          return;
        // hanya mencegat navigasi same-origin
        try {
          const url = new URL(tombol.href);
          if (url.origin !== location.origin) return;
        } catch (err) {}

        if (isNavigating) return;
        e.preventDefault();
        isNavigating = true;
        const href = tombol.href;
        // umpan balik visual: tandai aktif segera
        tombolNav.forEach((t) => t.classList.remove("aktif"));
        tombol.classList.add("aktif");
        if (fadeTarget) await fadeOut(fadeTarget);
        // menavigasi setelah transisi
        window.location.href = href;
      });
    } else {
      // perilaku lama (tombol yang beralih antar panel di sisi klien)
      tombol.addEventListener("click", async () => {
        if (isNavigating) return;
        isNavigating = true;
        if (fadeTarget) await fadeOut(fadeTarget);
        tombolNav.forEach((t) => t.classList.remove("aktif"));
        panels.forEach((p) => p.classList.remove("aktif"));
        tombol.classList.add("aktif");
        const panelId = "panel" + kapitalisasi(tombol.dataset.panel);
        const el = document.getElementById(panelId);
        if (el) el.classList.add("aktif");
        if (fadeTarget) await fadeIn(fadeTarget);
        isNavigating = false;
      });
    }
  });
}

function inisialisasiChat() {
  const formChat = document.getElementById("formChat");
  const inputPesan = document.getElementById("inputPesan");
  if (!formChat) return;

  // Pulihkan riwayat (jika ada)
  const hist = loadChatHistory();
  const areaPesan = document.getElementById("areaPesan");
  if (areaPesan) {
    areaPesan.innerHTML = ""; // bersihkan konten statis untuk menghindari duplikasi
    if (hist && hist.length) {
      hist.forEach((m) => {
        // render tanpa menyimpan kembali
        tambahPesanChat(m.pesan, m.tipe, {
          save: false,
          timestamp: m.timestamp,
        });
      });
    } else {
      // Tidak ada riwayat: tampilkan pesan sambutan awal dan simpan
      const welcome =
        "Halo! 👋 Saya Koki AI, asisten memasak virtual Anda. Apa yang ingin Anda masak hari ini?";
      tambahPesanChat(welcome, "koki", { save: true });
    }
  }

  formChat.addEventListener("submit", (e) => {
    e.preventDefault();
    const pesan = inputPesan.value.trim();
    if (pesan) {
      tambahPesanChat(pesan, "pengguna");
      inputPesan.value = "";

      // Kirim pesan dengan session ID jika ada
      const msgData = { pesan };
      if (typeof idSessionAktif !== "undefined" && idSessionAktif) {
        msgData.idSession = idSessionAktif;
        msgData.idPengguna = document.body.dataset.userId;
      }
      soketMemasak.emit("pesan_chat", msgData);
    }
  });
}

// Renderer mirip Markdown yang minimal dan aman untuk pesan chat
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(s) {
  // cetak tebal **teks**
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // miring *teks* (hindari menangkap **cetak tebal**)
  s = s.replace(/\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>");
  // kode inline `kode`
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // tautkan otomatis URL
  s = s.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

function renderChatMarkdown(text) {
  if (!text) return "";
  text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Perbaiki newline tidak sengaja di dalam kata seperti "a\nir" -> "air" tetapi hindari merubah format
  // Penanda format (list, bullets, headings). Gunakan huruf Unicode agar aman.
  try {
    text = text.replace(/([\p{L}])\n([\p{L}])/gu, "$1$2");
  } catch (e) {
    // Jika Unicode property escapes tidak didukung, fallback ke huruf ASCII sederhana
    text = text.replace(/([A-Za-z])\n([A-Za-z])/g, "$1$2");
  }

  const lines = text.split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let paraBuf = [];

  const flushParagraph = () => {
    if (paraBuf.length === 0) return;
    // gabungkan baris dalam paragraf dengan <br> untuk mempertahankan jeda baris tunggal yang memang dimaksud
    const joined = paraBuf.map((l) => escapeHtml(l.trim())).join("<br>");
    out.push("<p>" + inlineMarkdown(joined) + "</p>");
    paraBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(
      /^\s*[\-\*\u2022\u2023\u25E6\u2043\u2219·\u2013\u2014]\s+(.*)/
    ); // dukung peluru umum termasuk • · – —
    const olMatch = line.match(/^\s*(\d+)[\.)]\s+(.*)/); // dukung "1." dan "1)"
    const continuationMatch = line.match(/^\s{2,}(.*)/); // indentasi lanjutan untuk item daftar sebelumnya

    if (ulMatch) {
      flushParagraph();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push("<li>" + inlineMarkdown(escapeHtml(ulMatch[1])) + "</li>");
      continue;
    } else if (inUl) {
      out.push("</ul>");
      inUl = false;
    }

    if (olMatch) {
      flushParagraph();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push("<li>" + inlineMarkdown(escapeHtml(olMatch[2])) + "</li>");
      continue;
    } else if (inOl) {
      out.push("</ol>");
      inOl = false;
    }

    // tangani baris lanjutan yang diberi indent di dalam item daftar (setelah memeriksa penanda daftar)
    if (continuationMatch && (inUl || inOl)) {
      // tambahkan ke <li> terakhir di out (pertahankan jeda baris)
      for (let j = out.length - 1; j >= 0; j--) {
        if (/^\s*<li>/.test(out[j])) {
          const addition =
            "<br>" + inlineMarkdown(escapeHtml(continuationMatch[1].trim()));
          out[j] = out[j].replace(/<\/li>\s*$/, "") + addition + "</li>";
          break;
        }
      }
      continue;
    }

    if (olMatch) {
      flushParagraph();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push("<li>" + inlineMarkdown(escapeHtml(olMatch[2])) + "</li>");
      continue;
    } else if (inOl) {
      out.push("</ol>");
      inOl = false;
    }

    if (line.trim() === "") {
      // baris kosong memisahkan paragraf
      flushParagraph();
    } else {
      // terakumulasi ke dalam buffer paragraf
      paraBuf.push(line);
    }
  }

  // buang sisa buffer paragraf
  flushParagraph();

  if (inUl) out.push("</ul>");
  if (inOl) out.push("</ol>");
  return out.join("");
}

function saveChatHistory() {
  try {
    const toSave = chatHistory.slice(-300);
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Gagal menyimpan riwayat chat", e);
  }
}

function loadChatHistory() {
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    chatHistory = parsed;
    return parsed;
  } catch (e) {
    console.warn("Gagal memuat riwayat chat", e);
    return [];
  }
}

function clearChatHistory() {
  chatHistory = [];
  saveChatHistory();
  const area = document.getElementById("areaPesan");
  if (area) area.innerHTML = "";
}

function tambahPesanChat(pesan, tipe, opts = { save: true, timestamp: null }) {
  const areaPesan = document.getElementById("areaPesan");
  if (!areaPesan) return;

  const wrapper = document.createElement("div");
  wrapper.className = `pesan-wrapper pesan-wrapper-${tipe}`;

  const avatar = document.createElement("div");
  avatar.className = "pesan-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = tipe === "pengguna" ? "U" : "K";

  const msg = document.createElement("div");
  msg.className = `pesan pesan-${tipe}`;
  msg.innerHTML = renderChatMarkdown(pesan);

  // meta timestamp (tampilan singkat + tooltip lengkap)
  const meta = document.createElement("div");
  meta.className = "pesan-meta";
  try {
    const now = opts.timestamp ? new Date(opts.timestamp) : new Date();
    meta.textContent = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    meta.setAttribute("title", now.toLocaleString());
    meta.dataset.iso = now.toISOString();
  } catch (e) {
    meta.textContent = "";
  }

  msg.appendChild(meta);

  if (tipe === "pengguna") {
    wrapper.appendChild(msg);
    wrapper.appendChild(avatar);
  } else {
    wrapper.appendChild(avatar);
    wrapper.appendChild(msg);
  }

  areaPesan.appendChild(wrapper);

  if (opts.save) {
    chatHistory.push({
      tipe,
      pesan,
      timestamp: opts.timestamp || new Date().toISOString(),
    });
    saveChatHistory();
  }

  areaPesan.scrollTo({ top: areaPesan.scrollHeight, behavior: "smooth" });
  document.getElementById("inputPesan")?.focus();
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
    const jam = parseInt(
      document.getElementById("jamTimerBaru")
        ? document.getElementById("jamTimerBaru").value
        : 0
    );
    const menit = parseInt(document.getElementById("menitTimerBaru").value);
    const detik = parseInt(
      document.getElementById("detikTimerBaru")
        ? document.getElementById("detikTimerBaru").value
        : 0
    );
    const durasi =
      (isNaN(jam) ? 0 : jam * 3600) +
      (isNaN(menit) ? 0 : menit * 60) +
      (isNaN(detik) ? 0 : detik);
    if (namaTimer && durasi > 0) {
      buatTimerBaru(namaTimer, durasi);
      document.getElementById("namaTimerBaru").value = "";
      if (document.getElementById("jamTimerBaru"))
        document.getElementById("jamTimerBaru").value = "";
      document.getElementById("menitTimerBaru").value = "";
      if (document.getElementById("detikTimerBaru"))
        document.getElementById("detikTimerBaru").value = "";
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
  // Jika kita baru saja menghentikan timer secara manual, jangan membuat ulang ketika server mengirim update
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
    <div class="progress-timer"><div class="progress-bar" id="progress_${idTimer}" style="width:${
    data && typeof data.persentase !== "undefined" ? data.persentase : 0
  }%"></div></div>
    <div class="kontrol-timer">
      <button class="tombol-timer tombol-jeda" onclick="jedaTimer('${idTimer}')">⏸️ Jeda</button>
      <button class="tombol-timer tombol-lanjut hidden" id="lanjut_${idTimer}" onclick="lanjutkanTimer('${idTimer}')">▶️ Lanjutkan</button>
      <button class="tombol-timer tombol-berhenti" onclick="hentikanTimer('${idTimer}')">⏹️ Stop</button>
    </div>
  `;
  kontainerTimer.appendChild(kartuTimer);
}

function updateTampilanTimer(idTimer, data) {
  // Jika kartu tidak ada (misalnya, setelah penyegaran), buatlah
  ensureTimerCardExists(idTimer, data || {});

  const tampilan = document.getElementById(`tampilan_${idTimer}`);
  const progress = document.getElementById(`progress_${idTimer}`);
  const tombolJeda = document.querySelector(`#kartu_${idTimer} .tombol-jeda`);
  const tombolLanjut = document.getElementById(`lanjut_${idTimer}`);
  if (tampilan && data.formatWaktu) tampilan.textContent = data.formatWaktu;
  if (progress && typeof data.persentase !== "undefined")
    progress.style.width = `${data.persentase}%`;

  // sesuaikan kontrol berdasarkan status 'paused'
  if (data.paused) {
    if (tombolJeda) tombolJeda.classList.add("hidden");
    if (tombolLanjut) tombolLanjut.classList.remove("hidden");
  } else {
    if (tombolJeda) tombolJeda.classList.remove("hidden");
    if (tombolLanjut) tombolLanjut.classList.add("hidden");
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
  // Cegah pembuatan ulang kartu pengatur waktu ini secara langsung jika server 'update_timer' tiba.
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

// Inisialisasi fungsi tombol tambah bahan
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
        // Muat ulang daftar otoritatif dari server
        await loadDaftarBahan();
        // mengatur ulang bidang
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

// Modal Edit Bahan Fungsi
function bukaModalEditBahan(bahan) {
  document.getElementById("idBahanEdit").value = bahan._id || "";
  document.getElementById("namaBahanEdit").value = bahan.namaBahan || "";
  document.getElementById("jumlahBahanEdit").value = bahan.jumlahTersedia || 0;
  document.getElementById("satuanBahanEdit").value = bahan.satuan || "gram";
  document.getElementById("kategoriBahanEdit").value =
    bahan.kategoriBahan || "lainnya";
  document.getElementById("lokasiPenyimpananEdit").value =
    bahan.lokasiPenyimpanan || "rak_dapur";

  // Format tanggal untuk input[type="date"]
  if (bahan.tanggalPembelian) {
    const tglPembelian = new Date(bahan.tanggalPembelian);
    document.getElementById("tanggalPembelianEdit").value = tglPembelian
      .toISOString()
      .split("T")[0];
  }

  if (bahan.tanggalKadaluarsa) {
    const tglKadaluarsa = new Date(bahan.tanggalKadaluarsa);
    document.getElementById("tanggalKadaluarsaEdit").value = tglKadaluarsa
      .toISOString()
      .split("T")[0];
  }

  const modal = document.getElementById("modal-edit-bahan");
  if (modal) {
    modal.style.display = "flex";
    // Kunci gulir tubuh saat modal terbuka
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
  }
}

function tutupModalEditBahan() {
  const modal = document.getElementById("modal-edit-bahan");
  if (modal) {
    modal.style.display = "none";
    // Aktifkan kembali gulir tubuh saat modal ditutup
    document.body.style.overflow = "";
    document.body.classList.remove("modal-open");
  }
}

async function simpanPerubahanBahan() {
  try {
    const idBahan = document.getElementById("idBahanEdit").value;
    if (!idBahan) {
      tampilkanNotifikasi("ID bahan tidak ditemukan", "error");
      return;
    }

    const nama = document.getElementById("namaBahanEdit").value.trim();
    if (!nama) {
      tampilkanNotifikasi("Nama bahan tidak boleh kosong", "error");
      return;
    }

    const payload = {
      namaBahan: nama,
      jumlahTersedia:
        parseInt(document.getElementById("jumlahBahanEdit").value) || 0,
      satuan: document.getElementById("satuanBahanEdit").value,
      kategoriBahan: document.getElementById("kategoriBahanEdit").value,
      lokasiPenyimpanan: document.getElementById("lokasiPenyimpananEdit").value,
      tanggalPembelian:
        document.getElementById("tanggalPembelianEdit").value || undefined,
      tanggalKadaluarsa:
        document.getElementById("tanggalKadaluarsaEdit").value || undefined,
    };

    const resp = await fetch(`/api/bahan/${idBahan}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });

    const data = await resp.json();
    if (resp.ok && data.sukses) {
      tampilkanNotifikasi("Bahan berhasil diperbarui", "sukses");
      tutupModalEditBahan();
      await loadDaftarBahan();
    } else {
      tampilkanNotifikasi(data.pesan || "Gagal memperbarui bahan", "error");
    }
  } catch (err) {
    console.error("Error updating bahan:", err);
    tampilkanNotifikasi("Gagal memperbarui bahan", "error");
  }
}

async function hapusBahanItem(idBahan) {
  try {
    const resp = await fetch(`/api/bahan/${idBahan}`, {
      method: "DELETE",
      credentials: "same-origin",
    });

    const data = await resp.json();
    if (resp.ok && data.sukses) {
      tampilkanNotifikasi("Bahan berhasil dihapus", "sukses");
      await loadDaftarBahan();
    } else {
      tampilkanNotifikasi(data.pesan || "Gagal menghapus bahan", "error");
    }
  } catch (err) {
    console.error("Error deleting bahan:", err);
    tampilkanNotifikasi("Gagal menghapus bahan", "error");
  }
}

// Inisialisasi pendengar event modal edit
function inisialisasiModalEditBahan() {
  const btnTutup = document.getElementById("tombol-tutup-modal-edit");
  const btnBatal = document.getElementById("tombol-batal-edit");
  const btnSimpan = document.getElementById("tombol-simpan-edit");
  const modal = document.getElementById("modal-edit-bahan");

  if (btnTutup) {
    btnTutup.addEventListener("click", tutupModalEditBahan);
  }

  if (btnBatal) {
    btnBatal.addEventListener("click", tutupModalEditBahan);
  }

  if (btnSimpan) {
    btnSimpan.addEventListener("click", simpanPerubahanBahan);
  }

  // Tutup modal saat klik di luar konten modal
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        tutupModalEditBahan();
      }
    });
  }
}

// --- Pencarian resep: pemuat dan perender sisi klien ---
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function debounce(fn, delay = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

async function loadDaftarResep(q = "") {
  const kontainer = document.getElementById("daftarResep");
  if (!kontainer) return;
  kontainer.innerHTML = '<div class="kartu"><p>🔄 Mencari resep...</p></div>';
  try {
    const url = q ? `/api/resep?q=${encodeURIComponent(q)}` : "/api/resep";
    const resp = await fetch(url, { credentials: "same-origin" });
    const data = await resp.json();
    if (!data || !data.sukses) {
      kontainer.innerHTML =
        '<div class="kartu"><p>Gagal memuat resep</p></div>';
      return;
    }
    renderResepList(data.data || []);
  } catch (err) {
    console.error("Load resep failed", err);
    kontainer.innerHTML = '<div class="kartu"><p>Gagal memuat resep</p></div>';
  }
}

function renderResepList(items) {
  const kontainer = document.getElementById("daftarResep");
  if (!kontainer) return;
  if (!items || items.length === 0) {
    kontainer.innerHTML =
      '<div class="kartu"><p>Tidak ada resep untuk ditampilkan. Coba tambah resep atau jalankan seed database.</p></div>';
    return;
  }
  kontainer.innerHTML = "";
  items.forEach((r) => {
    const waktu = (r.waktuPersiapanMenit || 0) + (r.waktuMemasakMenit || 0);
    const kaloriVal =
      r.nutrisiPerPorsi && (r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal)
        ? r.nutrisiPerPorsi.kalori || r.nutrisiPerPorsi.kcal
        : null;
    const kalori = kaloriVal ? Math.round(kaloriVal) : "-";
    const nama = r.namaResep || r.nama || "Resep";
    const idResep = r._id || r.recipeId || "";
    const div = document.createElement("div");
    div.className = "kartu-resep";
    if (idResep) div.dataset.id = idResep;
    div.innerHTML = `\n      <div class="gambar-resep">🍲</div>\n      <div class="info-resep">\n        <div class="nama-resep">${escapeHtml(
      nama
    )}</div>\n        <div class="meta-resep"><span>⏱️ ${waktu} menit</span><span>🔥 ${kalori} kkal</span></div>\n      </div>\n      <div class="detail-resep" id="detail_${idResep}" style="display:none;margin-top:8px;"></div>`;

    // klik kartu (kecuali pada tombol internal) menavigasi ke halaman detail resep
    div.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.tagName === "A") return; // abaikan klik tombol/tautan
      if (!idResep) return;
      window.location.href = `/resep/${idResep}`;
    });

    kontainer.appendChild(div);
  });
}

function inisialisasiPencarianResep() {
  const input = document.getElementById("cariResep");
  if (!input) return;
  const handler = debounce(() => {
    const q = input.value.trim();
    loadDaftarResep(q);
  }, 300);
  input.addEventListener("input", handler);
}

// --- Tambah Resep: form handling ---
let daftarBahanForm = []; // Array untuk menyimpan bahan yang diinput

function inisialisasiTambahResep() {
  const btn = document.getElementById("tombolTambahResep");
  const form = document.getElementById("formTambahResep");
  if (!btn || !form) return;
  const inputNama = document.getElementById("inputNamaResep");
  const inputDeskripsi = document.getElementById("inputDeskripsi");
  const inputPorsi = document.getElementById("inputPorsi");
  const inputWaktuPersiapan = document.getElementById("inputWaktuPersiapan");
  const inputWaktuMemasak = document.getElementById("inputWaktuMemasak");
  const inputBahan = document.getElementById("inputBahan");
  const inputLangkah = document.getElementById("inputLangkah");
  const tombolSimpan = document.getElementById("tombolSimpanResep");
  const tombolBatal = document.getElementById("tombolBatalResep");
  const tombolTambahBahanForm = document.getElementById(
    "tombolTambahBahanForm"
  );

  // Setup bahan input form
  if (tombolTambahBahanForm) {
    tombolTambahBahanForm.addEventListener("click", tambahBahanKeFormResep);
    const inputNamaBahan = document.getElementById("inputNamaBahanForm");
    if (inputNamaBahan) {
      inputNamaBahan.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          tambahBahanKeFormResep();
        }
      });
    }
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    form.style.display = "block";
    form.scrollIntoView({ behavior: "smooth" });
  });

  tombolBatal.addEventListener("click", (e) => {
    e.preventDefault();
    form.style.display = "none";
    daftarBahanForm = [];
    renderDaftarBahanForm();
  });

  tombolSimpan.addEventListener("click", async (e) => {
    e.preventDefault();
    const nama = (inputNama.value || "").trim();
    if (!nama) return tampilkanNotifikasi("Nama resep wajib diisi", "error");
    const deskripsi = inputDeskripsi.value || "";
    const porsi = Number(inputPorsi.value) || 1;
    const waktuPersiapan = Number(inputWaktuPersiapan.value) || 0;
    const waktuMemasak = Number(inputWaktuMemasak.value) || 0;
    const kaloriPerPorsi = (() => {
      const v = (document.getElementById('inputKaloriResep') || {}).value;
      if (!v || String(v).trim() === '') return null;
      const n = parseFloat(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    })();

    // Gunakan daftarBahanForm atau fallback ke textarea jika kosong
    let daftarBahan = [];
    if (daftarBahanForm.length > 0) {
      daftarBahan = daftarBahanForm.map((b) => ({
        namaBahan: b.nama,
        jumlah: b.jumlah,
        satuan: b.satuan,
      }));
    } else {
      const bahanLines = (inputBahan.value || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      daftarBahan = bahanLines
        .map((line) => {
          // format titik koma yang kompatibel: 'nama;jumlah;satuan'
          if (line.indexOf(";") !== -1) {
            const parts = line.split(";").map((s) => s.trim());
            return {
              namaBahan: parts[0] || "",
              jumlah: Number(parts[1]) || 0,
              satuan: parts[2] || "",
            };
          }

          // lebih memilih format yang dipisahkan spasi: 'Nama [jumlah] [satuan]'
          const toks = line.split(/\s+/).filter(Boolean);
          // token tunggal -> hanya nama
          if (toks.length === 1)
            return { namaBahan: toks[0], jumlah: 0, satuan: "" };

          // mendeteksi token numerik (bilangan bulat atau desimal, mendukung koma sebagai pemisah desimal)
          const isNumeric = (s) => /^\d+(?:[.,]\d+)?$/.test(String(s));
          const last = toks[toks.length - 1];
          const secondLast = toks[toks.length - 2];

          if (isNumeric(secondLast)) {
            // pattern: 'Nama ... <jumlah> <satuan>'
            const jumlah = Number(String(secondLast).replace(",", ".")) || 0;
            const satuan = last || "";
            const nama = toks.slice(0, toks.length - 2).join(" ") || toks[0];
            return { namaBahan: nama, jumlah, satuan };
          }

          if (isNumeric(last)) {
            // pattern: 'Nama ... <jumlah>' (no unit)
            const jumlah = Number(String(last).replace(",", ".")) || 0;
            const nama = toks.slice(0, toks.length - 1).join(" ") || toks[0];
            return { namaBahan: nama, jumlah, satuan: "" };
          }

          // fallback: anggap seluruh baris sebagai nama
          return { namaBahan: line, jumlah: 0, satuan: "" };
        })
        .filter((b) => b.namaBahan);
    }

    if (daftarBahan.length === 0) {
      return tampilkanNotifikasi("Tambahkan minimal satu bahan", "error");
    }

    const langkahLines = (inputLangkah.value || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const langkah = langkahLines.map((lk, idx) => ({
      nomorUrut: idx + 1,
      deskripsi: lk,
    }));

    const payload = {
      namaResep: nama,
      deskripsi,
      porsi,
      waktuPersiapanMenit: waktuPersiapan,
      waktuMemasakMenit: waktuMemasak,
      daftarBahan,
      langkah,
    };

    // Sertakan kalori jika user mengisi (kalori per porsi)
    if (kaloriPerPorsi !== null) payload.kalori = kaloriPerPorsi;

    try {
      tombolSimpan.disabled = true;
      tombolSimpan.textContent = "Menyimpan...";
      const res = await fetch("/api/resep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.sukses) {
        tampilkanNotifikasi(data.pesan || "Gagal menyimpan resep", "error");
        tombolSimpan.disabled = false;
        tombolSimpan.textContent = "Simpan";
        return;
      }
      // Jika resep dibuat sebagai pending, beri tahu pengguna bahwa resep menunggu tinjauan admin
      const created = data.data || {};
      if (created.status === "pending") {
        tampilkanNotifikasi(
          "Resep berhasil dikirim. Akan ditinjau oleh admin sebelum dipublikasikan.",
          "sukses"
        );
      } else {
        tampilkanNotifikasi("Resep berhasil disimpan", "sukses");
      }
      // reset formulir
      inputNama.value = "";
      inputDeskripsi.value = "";
      inputPorsi.value = "";
      inputWaktuPersiapan.value = "";
      inputWaktuMemasak.value = "";
      inputBahan.value = "";
      inputLangkah.value = "";
      daftarBahanForm = [];
      renderDaftarBahanForm();
      form.style.display = "none";
      // menyegarkan daftar
      loadDaftarResep();
    } catch (err) {
      console.error("Gagal submit resep", err);
      tampilkanNotifikasi("Gagal menyimpan resep", "error");
    } finally {
      tombolSimpan.disabled = false;
      tombolSimpan.textContent = "Simpan";
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
  // Hanya tampilkan modal terpusat jika diminta secara eksplisit (options.modal === true).
  // Jika tidak, peringatan (tipe 'peringatan') akan ditampilkan sebagai toast untuk menghindari popup modal yang tidak diinginkan pada halaman lain.
  if (options.modal) {
    const modalCont = document.getElementById("kontainerModalNotifikasi");
    if (!modalCont) return;
    modalCont.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    const card = document.createElement("div");
    card.className = "modal-card";

    // Ikon + judul
    const icon = document.createElement("div");
    icon.className = "modal-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⏰";
    card.appendChild(icon);

    const title = document.createElement("h3");
    title.className = "modal-title";
    title.textContent = options.title || "Timer selesai!";
    card.appendChild(title);

    const pesanEl = document.createElement("p");
    pesanEl.innerHTML = pesan;
    card.appendChild(pesanEl);

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const ok = document.createElement("button");
    ok.className = "notifikasi-oke";
    ok.textContent = options.okLabel || "OK";
    ok.addEventListener("click", () => {
      try {
        stopBunyi();
      } catch (e) {}
      modalCont.classList.remove("active");
      modalCont.setAttribute("aria-hidden", "true");
      modalCont.innerHTML = "";
      document.body.classList.remove("modal-open");
    });
    actions.appendChild(ok);

    // sekunder kedua (tutup dengan tenang)
    const close = document.createElement("button");
    close.className = "notifikasi-secondary";
    close.textContent = "Tutup";
    close.addEventListener("click", () => {
      try {
        stopBunyi();
      } catch (e) {}
      modalCont.classList.remove("active");
      modalCont.setAttribute("aria-hidden", "true");
      modalCont.innerHTML = "";
      document.body.classList.remove("modal-open");
    });
    actions.appendChild(close);

    card.appendChild(actions);
    modalCont.appendChild(backdrop);
    modalCont.appendChild(card);
    modalCont.classList.add("active");
    modalCont.setAttribute("aria-hidden", "false");
    // kunci gulir latar belakang saat modal terlihat
    document.body.classList.add("modal-open");

    // Jika tidak persisten, sembunyikan otomatis setelah timeout
    if (!options.persistent) {
      setTimeout(() => {
        try {
          stopBunyi();
        } catch (e) {}
        modalCont.classList.remove("active");
        modalCont.setAttribute("aria-hidden", "true");
        modalCont.innerHTML = "";
        document.body.classList.remove("modal-open");
      }, options.timeout || 5000);
    }

    return;
  }

  // Jika tidak, tampilkan sebagai toast di kanan atas
  const kontainer = document.getElementById("kontainerToasts");
  if (!kontainer) return;
  const notifikasi = document.createElement("div");
  notifikasi.className = `notifikasi ${tipe}`;

  const pesanEl = document.createElement("div");
  pesanEl.className = "notifikasi-pesan";
  pesanEl.innerHTML = pesan;
  notifikasi.appendChild(pesanEl);

  // hapus otomatis setelah timeout
  setTimeout(() => notifikasi.remove(), options.timeout || 5000);

  kontainer.appendChild(notifikasi);
}

/**
 * Tampilkan modal konfirmasi dan kembalikan Promise<boolean> yang akan terpenuhi dengan true saat dikonfirmasi.
 * opsi: { title, message, okLabel, cancelLabel }
 */
function showConfirmModal({ title = "Konfirmasi", message = "", okLabel = "Ya", cancelLabel = "Batal" } = {}) {
  return new Promise((resolve) => {
    const modalCont = document.getElementById("kontainerModalNotifikasi");
    if (!modalCont) return resolve(false);
    modalCont.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const card = document.createElement("div");
    card.className = "modal-card modal-card--panjang";

    const icon = document.createElement("div");
    icon.className = "modal-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "⚠️";
    const titleEl = document.createElement("h3");
    titleEl.className = "modal-title";
    titleEl.textContent = title;

    const konten = document.createElement("div");
    konten.className = "modal-konten";
    const msg = document.createElement("p");
    msg.innerHTML = message;
    konten.appendChild(msg);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const btnCancel = document.createElement("button");
    btnCancel.className = "notifikasi-secondary";
    btnCancel.textContent = cancelLabel;
    const btnOk = document.createElement("button");
    btnOk.className = "notifikasi-oke";
    btnOk.textContent = okLabel;

    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);

    card.appendChild(icon);
    card.appendChild(titleEl);
    card.appendChild(konten);
    card.appendChild(actions);

    modalCont.appendChild(backdrop);
    modalCont.appendChild(card);
    modalCont.classList.add("active");
    modalCont.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    function cleanup() {
      modalCont.classList.remove("active");
      modalCont.setAttribute("aria-hidden", "true");
      modalCont.innerHTML = "";
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKey);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        cleanup();
        resolve(false);
      }
    }

    btnCancel.addEventListener("click", () => {
      cleanup();
      resolve(false);
    });

    backdrop.addEventListener("click", () => {
      cleanup();
      resolve(false);
    });

    btnOk.addEventListener("click", () => {
      cleanup();
      resolve(true);
    });

    document.addEventListener("keydown", onKey);
  });
}

/**
 * Tampilkan modal prompt dengan textarea dan kembalikan Promise<string|null> (null jika dibatalkan)
 */
function showPromptModal({ title = "Input", message = "", placeholder = "", okLabel = "Kirim", cancelLabel = "Batal" } = {}) {
  return new Promise((resolve) => {
    const modalCont = document.getElementById("kontainerModalNotifikasi");
    if (!modalCont) return resolve(null);
    modalCont.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const card = document.createElement("div");
    card.className = "modal-card modal-card--panjang";

    const icon = document.createElement("div");
    icon.className = "modal-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✍️";
    const titleEl = document.createElement("h3");
    titleEl.className = "modal-title";
    titleEl.textContent = title;

    const konten = document.createElement("div");
    konten.className = "modal-konten";
    const msg = document.createElement("p");
    msg.innerHTML = message;

    const textarea = document.createElement("textarea");
    textarea.className = "form-input";
    textarea.placeholder = placeholder;
    textarea.style.width = "100%";
    textarea.style.minHeight = "100px";
    textarea.style.marginTop = "10px";

    konten.appendChild(msg);
    konten.appendChild(textarea);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const btnCancel = document.createElement("button");
    btnCancel.className = "notifikasi-secondary";
    btnCancel.textContent = cancelLabel;
    const btnOk = document.createElement("button");
    btnOk.className = "notifikasi-oke";
    btnOk.textContent = okLabel;

    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);

    card.appendChild(icon);
    card.appendChild(titleEl);
    card.appendChild(konten);
    card.appendChild(actions);

    modalCont.appendChild(backdrop);
    modalCont.appendChild(card);
    modalCont.classList.add("active");
    modalCont.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    textarea.focus();

    function cleanup() {
      modalCont.classList.remove("active");
      modalCont.setAttribute("aria-hidden", "true");
      modalCont.innerHTML = "";
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKey);
    }

    function onKey(e) {
      if (e.key === "Escape") {
        cleanup();
        resolve(null);
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Enter untuk kirim
        e.preventDefault();
        const val = textarea.value.trim();
        cleanup();
        resolve(val);
      }
    }

    btnCancel.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    backdrop.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    btnOk.addEventListener("click", () => {
      const val = textarea.value.trim();
      cleanup();
      resolve(val);
    });

    document.addEventListener("keydown", onKey);
  });
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
let bunyisekarang = null;
function playBunyi() {
  try {
    if (bunyisekarang) return; // sedang
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audioCtx = new AudioCtx();

    const beeper = { audioCtx, intervalId: null, oscillators: [] };

    const beepMs = 500; // durasi bunyi beep
    const gapMs = 300; // jeda antar bunyi beep

    function playBeep() {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      // variasi frekuensi kecil untuk suara alarm yang lebih natural
      osc.frequency.value = 800 + Math.floor(Math.random() * 400);
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.01);
      osc.start(now);
      // berhenti setelah durasi beepMs
      setTimeout(() => {
        try {
          gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
        } catch (e) {}
        try {
          osc.stop(audioCtx.currentTime + 0.06);
        } catch (e) {}
      }, beepMs);
      beeper.oscillators.push({ osc, gain });
    }

    // mulai segera lalu ulangi terus
    playBeep();
    beeper.intervalId = setInterval(playBeep, beepMs + gapMs);

    // getarkan perangkat jika didukung
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

    bunyisekarang = beeper;
  } catch (e) {
    console.warn("Audio not supported", e);
  }
}

function stopBunyi() {
  try {
    if (!bunyisekarang) return;
    const { audioCtx, intervalId, oscillators } = bunyisekarang;
    if (intervalId) clearInterval(intervalId);
    // hentikan oscillator yang tersisa dengan aman
    oscillators.forEach(({ osc, gain }) => {
      try {
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
      } catch (e) {}
      try {
        osc.stop(audioCtx.currentTime + 0.06);
      } catch (e) {}
    });
    setTimeout(() => {
      try {
        audioCtx.close();
      } catch (e) {}
    }, 150);
    bunyisekarang = null;
    if (navigator.vibrate) navigator.vibrate(0);
  } catch (e) {
    console.warn("stopBunyi error", e);
  }
}

// Penangan delegasi global untuk .tombol-mulai agar konsisten membuka modal konfirmasi Masak
(function () {
  // Pastikan handler hanya dilampirkan sekali
  if (window.__masakDelegateAttached) return;
  window.__masakDelegateAttached = true;

  async function openMasakModalGlobal({
    resepId,
    daftarBahan = [],
    basePorsi = 1,
  }) {
    try {
      const modalCont = document.getElementById("kontainerModalNotifikasi");
      if (!modalCont) return console.warn("kontainerModalNotifikasi not found");
      modalCont.innerHTML = "";

      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      const card = document.createElement("div");
      card.className = "modal-card modal-card--panjang";

      const icon = document.createElement("div");
      icon.className = "modal-icon";
      icon.textContent = "🍳";
      const title = document.createElement("h3");
      title.className = "modal-title";
      title.textContent = "Konfirmasi Masak";
      const konten = document.createElement("div");
      konten.className = "modal-konten";

      // Gunakan porsi di tingkat halaman (baca dari #inputPorsi) dan tampilkan area bahan yang hilang di bagian atas
      const pagePorsi =
        Number(document.getElementById("inputPorsi")?.value || basePorsi) ||
        basePorsi;

      const missingDiv = document.createElement("div");
      missingDiv.style.display = "none";
      missingDiv.style.marginBottom = "10px";
      konten.appendChild(missingDiv);

      // Hapus daftar <ul> terpisah untuk semua bahan
      // Sekarang hanya tampilkan bahan yang hilang dari server

      // preview bahan yang hilang menggunakan server
      (async () => {
        try {
          const resp = await fetch("/api/resep/" + resepId + "/masak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ porsi: pagePorsi, preview: true }),
          });
          const data = await resp.json();

          // Tampilkan semua bahan terlebih dahulu
          let html =
            '<div><strong>🥘 Bahan resep:</strong><ul class="konfirmasi-daftar-bahan">';
          (daftarBahan || []).forEach((b) => {
            const nama = b.namaBahan || b.nama || b.name || String(b || "");
            const jumlah = b.jumlah
              ? Number(b.jumlah || 0) * Number(pagePorsi || 1)
              : "";
            const satuan = b.satuan || "";
            html += `<li><span class="bahan-nama">${escapeHtml(
              nama
            )}</span><span class="qty">${escapeHtml(
              jumlah !== "" ? jumlah + " " + satuan : ""
            )}</span></li>`;
          });
          html += "</ul></div>";

          // Kemudian tampilkan bahan yang hilang jika ada
          if (data && data.missing && data.missing.length) {
            html +=
              '<div><strong>🛒 Bahan yang perlu dibeli:</strong><ul class="konfirmasi-daftar-bahan">';
            data.missing.forEach(
              (m) =>
                (html += `<li><span class="bahan-nama">${escapeHtml(
                  m.namaBahan || m.nama || ""
                )}</span><span class="qty">${escapeHtml(
                  String(m.jumlah || m.alasan || "")
                )} ${escapeHtml(m.satuan || "")}</span></li>`)
            );
            html += "</ul></div>";
          } else {
            html +=
              '<div style="color:var(--warna-sukses)">✓ Semua bahan tersedia</div>';
          }

          missingDiv.innerHTML = html;
          missingDiv.style.display = "block";
        } catch (e) {
          console.warn("preview masak failed", e);
          missingDiv.innerHTML =
            '<div style="color:var(--warna-peringatan)">Tidak dapat memuat preview bahan</div>';
          missingDiv.style.display = "block";
        }
      })();

      const actions = document.createElement("div");
      actions.className = "modal-actions";
      const btnClose = document.createElement("button");
      btnClose.className = "notifikasi-secondary";
      btnClose.textContent = "Tutup";
      const btnMasak = document.createElement("button");
      btnMasak.className = "notifikasi-oke";
      btnMasak.textContent = "Masak Sekarang";
      actions.appendChild(btnClose);
      actions.appendChild(btnMasak);

      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(konten);
      card.appendChild(actions);
      modalCont.appendChild(backdrop);
      modalCont.appendChild(card);
      modalCont.classList.add("active");
      modalCont.setAttribute("aria-hidden", "false");
      document.body.classList.add("modal-open");

      // posisikan kartu modal di tengah container agar tampilan lebih rapi
      card.style.margin = "0 auto";
      card.style.maxWidth = "720px";

      btnClose.addEventListener("click", () => {
        modalCont.classList.remove("active");
        modalCont.setAttribute("aria-hidden", "true");
        modalCont.innerHTML = "";
        document.body.classList.remove("modal-open");
      });
      backdrop.addEventListener("click", () => {
        btnClose.click();
      });

      // klik tunggal: lakukan preview segera (tanpa mengubah stok)
      btnMasak.addEventListener("click", async () => {
        try {
          btnMasak.disabled = true;
          btnMasak.textContent = "Memproses...";
          missingDiv.style.display = "none";
          missingDiv.innerHTML = "";

          const porsi =
            Number(document.getElementById("inputPorsi")?.value || basePorsi) ||
            basePorsi;
          const resp = await fetch("/api/resep/" + resepId + "/masak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ porsi }),
          });
          const data = await resp.json();

          if (!data.sukses) {
            if (data.missing && data.missing.length) {
              let html =
                '<div><strong>⚠️ Bahan kurang:</strong><ul class="konfirmasi-daftar-bahan">';
              data.missing.forEach(
                (m) =>
                  (html += `<li><span class="bahan-nama">${escapeHtml(
                    m.namaBahan || m.nama || ""
                  )}</span><span class="qty">${escapeHtml(
                    String(m.jumlah || m.alasan || "")
                  )} ${escapeHtml(m.satuan || "")}</span></li>`)
              );
              html += "</ul></div>";
              missingDiv.innerHTML = html;
              missingDiv.style.display = "block";
              try {
                tampilkanNotifikasi(
                  "Beberapa bahan kurang — periksa daftar bahan",
                  "peringatan"
                );
              } catch (e) {}
            } else {
              missingDiv.innerHTML = `<div style="color:var(--warna-peringatan)">Gagal: ${escapeHtml(
                data.pesan || "Terjadi kesalahan"
              )}</div>`;
              missingDiv.style.display = "block";
              try {
                tampilkanNotifikasi(
                  data.pesan || "Gagal memproses masak",
                  "error"
                );
              } catch (e) {}
            }
            btnMasak.disabled = false;
            btnMasak.textContent = "Masak Sekarang";
            return;
          }

          // sukses: stok berhasil dikurangi
          konten.innerHTML = `<div style="color:var(--warna-sukses)"><strong>✅ ${escapeHtml(
            data.pesan || "Berhasil"
          )}</strong></div>`;
          if (data.dihapus)
            konten.innerHTML += `<div style="margin-top:8px;color:var(--warna-teks-sekunder);">${data.dihapus} bahan dihapus karena habis/kadaluarsa</div>`;
          try {
            tampilkanNotifikasi(
              data.pesan || "Resep dimasak, stok diperbarui",
              "sukses"
            );
          } catch (e) {}
          setTimeout(() => {
            btnClose.click();
            window.location.href = "/bahan";
          }, 900);
        } catch (err) {
          console.warn("openMasakModalGlobal error", err);
          missingDiv.innerHTML =
            '<div style="color:var(--warna-peringatan)">Gagal menghubungi server</div>';
          missingDiv.style.display = "block";
          btnMasak.disabled = false;
          btnMasak.textContent = "Masak Sekarang";
          try {
            tampilkanNotifikasi("Gagal menghubungi server", "error");
          } catch (e) {}
        }
      });

      function escapeHtml(s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }
    } catch (e) {
      console.warn("openMasakModalGlobal top error", e);
    }
  }

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest && ev.target.closest(".tombol-mulai");
    if (!btn) return;
    // hanya jalankan jika tombol ini memiliki atribut data resep
    const resepId = btn.dataset.resepId;
    const daftar = btn.dataset.daftarBahan
      ? JSON.parse(btn.dataset.daftarBahan)
      : null;
    const base = Number(btn.dataset.basePorsi) || 1;
    if (!resepId) return; // not a recipe-level masak
    ev.preventDefault();
    console.log("masak button clicked (open modal)", {
      resepId,
      base,
      daftarCount: (daftar || []).length,
    });
    try {
      tampilkanNotifikasi("Menyiapkan konfirmasi masak...", "info");
    } catch (e) {}
    // Open the centralized modal for Masak confirmation
    try {
      openMasakModalGlobal({
        resepId,
        daftarBahan: daftar || [],
        basePorsi: base,
      });
    } catch (err) {
      console.warn("Failed to open Masak modal", err);
      try {
        tampilkanNotifikasi("Gagal membuka konfirmasi masak", "error");
      } catch (e) {}
    }
  });
})();

async function loadDaftarBahan() {
  try {
    const resp = await fetch("/api/bahan", { credentials: "same-origin" });
    const ul = document.getElementById("daftar-bahan-saya");
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
        ? Math.max(
            0,
            Math.floor(
              (new Date(b.tanggalKadaluarsa) - new Date()) /
                (1000 * 60 * 60 * 24)
            )
          )
        : null; // floor-based: 3 -> 2 -> 1 countdown
      const kategoriTag = b.kategoriBahan
        ? `<span class="tag">${escapeHtml(
            String(b.kategoriBahan || "")
          )}</span>`
        : "";
      const sisaBadge =
        sisaHari !== null
          ? `<span class="badge-kadaluarsa ${
              sisaHari <= 1 ? "segera" : sisaHari <= 3 ? "perhatian" : ""
            }">${
              sisaHari <= 1
                ? "Gunakan segera"
                : sisaHari <= 3
                ? sisaHari + " hari lagi"
                : ""
            }</span>`
          : "";
      const tglPembelian = b.tanggalPembelian
        ? `<div class="meta-col"><div class="meta-label">Pembelian</div><div class="meta-val">${formatTimestamp(
            b.tanggalPembelian
          )}</div></div>`
        : "";
      const tglKadaluarsa = b.tanggalKadaluarsa
        ? `<div class="meta-col"><div class="meta-label">Kadaluarsa</div><div class="meta-val">${formatTimestamp(
            b.tanggalKadaluarsa
          )}</div></div>`
        : "";
      const added = b.createdAt
        ? `<div class="meta-col"><div class="meta-label">Ditambahkan</div><div class="meta-val">${formatTimestamp(
            b.createdAt
          )}</div></div>`
        : "";

      li.innerHTML = `
        <div class="bahan-left">
          <div class="bahan-name">${escapeHtml(
            b.namaBahan
          )} <span class="bahan-satuan">${b.jumlahTersedia || 0} ${
        b.satuan || ""
      }</span></div>
          <div class="bahan-badges">${kategoriTag} ${sisaBadge}</div>
        </div>
        <div class="bahan-mid">${tglPembelian}${added}${tglKadaluarsa}</div>
        <div class="bahan-actions">
          <button class="btn-edit-bahan" data-id="${
            b._id
          }" data-bahan='${JSON.stringify(b).replace(
        /'/g,
        "&apos;"
      )}'>✏️ Edit</button>
          <button class="btn-hapus-bahan" data-id="${b._id}">🗑️ Hapus</button>
        </div>
      `;
      ul.appendChild(li);

      // Lampirkan pendengar event untuk tombol edit dan hapus
      const btnEdit = li.querySelector(".btn-edit-bahan");
      const btnHapus = li.querySelector(".btn-hapus-bahan");

      if (btnEdit) {
        btnEdit.addEventListener("click", () => {
          bukaModalEditBahan(b);
        });
      }

      if (btnHapus) {
        btnHapus.addEventListener("click", async () => {
          try {
            const confirmed = await showConfirmModal({
              title: "Hapus bahan",
              message: `Apakah Anda yakin ingin menghapus "${escapeHtml(
                b.namaBahan || b.nama || b.name || ""
              )}"?`,
              okLabel: "Hapus",
              cancelLabel: "Batal",
            });
            if (!confirmed) return;
            await hapusBahanItem(b._id);
          } catch (e) {
            console.error("Gagal hapus bahan:", e);
          }
        });
      }
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
  inisialisasiModalEditBahan();
  inisialisasiPencarianResep();
  inisialisasiTambahResep();
  inisialisasiMenu();
  inisialisasiPantryChallenge();

  // Menu minggu

  let currentRencanaId = null;
  let currentMenuMingguan = null;

  function getISOWeekAndYear(d = new Date()) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return { mingguKe: weekNo, tahun: date.getUTCFullYear() };
  }

  function renderMenuMingguan(menuMingguan) {
    const kont = document.getElementById("menuMingguanContainer");
    if (!kont) return;
    currentMenuMingguan = menuMingguan || [];
    kont.innerHTML = "";
    if (!currentMenuMingguan || currentMenuMingguan.length === 0) {
      kont.innerHTML =
        '<p>Tidak ada saran menu. Klik "Generate Menu dengan AI" untuk membuat saran.</p>';
      document.getElementById("tombolSimpanRencana").style.display = "none";
      return;
    }

    const namaResepOrText = (val) => {
      if (!val) return "-";
      if (typeof val === "string") return val;
      if (val.namaResep) return val.namaResep;
      if (val.name) return val.name;
      if (val._id) return String(val._id);
      return "-";
    };

    let html = '<div class="daftar-hari">';
    currentMenuMingguan.forEach((h, idx) => {
      const s =
        h._populated && h._populated.sarapan
          ? h._populated.sarapan.namaResep
          : h.menu && h.menu.sarapan
          ? namaResepOrText(h.menu.sarapan)
          : "-";
      const siang =
        h._populated && h._populated.makanSiang
          ? h._populated.makanSiang.namaResep
          : h.menu && h.menu.makanSiang
          ? namaResepOrText(h.menu.makanSiang)
          : "-";
      const malam =
        h._populated && h._populated.makanMalam
          ? h._populated.makanMalam.namaResep
          : h.menu && h.menu.makanMalam
          ? namaResepOrText(h.menu.makanMalam)
          : "-";
      html += `<div class="kartu-mini"><strong>${escapeHtml(
        h.hari || "Hari"
      )}</strong><div>Sarapan: ${escapeHtml(
        s
      )}</div><div>Makan siang: ${escapeHtml(
        siang
      )}</div><div>Makan malam: ${escapeHtml(malam)}</div></div>`;
    });
    html += "</div>";
    kont.innerHTML = html;
    document.getElementById("tombolSimpanRencana").style.display =
      "inline-block";
  }

  async function simpanRencana() {
    const main = document.querySelector("main.kontainer-utama");
    const idPengguna = main ? main.dataset.userId : null;
    if (!idPengguna)
      return tampilkanNotifikasi(
        "Silakan login untuk menyimpan rencana",
        "error"
      );
    if (!currentMenuMingguan || currentMenuMingguan.length === 0)
      return tampilkanNotifikasi("Tidak ada menu untuk disimpan", "error");
    const { mingguKe, tahun } = getISOWeekAndYear();

    const menuUntukKirim = currentMenuMingguan.map((h) => ({
      hari: h.hari,
      menu: {
        sarapan: h._populated?.sarapan?._id || h.menu.sarapan || null,
        makanSiang: h._populated?.makanSiang?._id || h.menu.makanSiang || null,
        makanMalam: h._populated?.makanMalam?._id || h.menu.makanMalam || null,
      },
    }));

    try {
      const res = await fetch(`${API_URL}/menu`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idPengguna,
          mingguKe,
          tahun,
          menuMingguan: menuUntukKirim,
        }),
      });
      const data = await res.json();
      if (!data.sukses)
        return tampilkanNotifikasi(
          data.pesan || "Gagal simpan rencana",
          "error"
        );
      currentRencanaId = data.data._id;
      tampilkanNotifikasi("Rencana tersimpan", "sukses");
      // tampilkan ringkasan kalori tersimpan jika tersedia
      if (data.data && data.data.totalKaloriMingguan) {
        renderKaloriInfo(
          { perHari: [], totalMingguan: data.data.totalKaloriMingguan },
          null
        );
      }
      // load daftar belanja
      await loadDaftarBelanjaRencana(currentRencanaId);
      // tampilkan kedua tombol (Konfirmasi terlihat bahkan sebelum checkbox dicentang)
      const btnKonf = document.getElementById("tombolKonfirmasi");
      if (btnKonf) btnKonf.style.display = "inline-block";
      // tampilkan tombol 'Kirim ke Email' agar pengguna dapat mengirim rencana tersimpan
      const btnKirim = document.getElementById("tombolKirimEmail");
      if (btnKirim) btnKirim.style.display = "inline-block";
    } catch (err) {
      console.error("Gagal simpan rencana", err);
      tampilkanNotifikasi("Gagal simpan rencana", "error");
    }
  }

  async function loadDaftarBelanjaRencana(id) {
    try {
      const res = await fetch(`${API_URL}/menu/${id}/daftar-belanja`);
      const data = await res.json();
      if (!data.sukses) return;
      const daftar = data.data || [];
      if (!daftar.length) {
        // Tidak ada item belanja tersisa — tampilkan pesan kosong dan sembunyikan tombol aksi
        const ul = document.getElementById("daftarBelanja");
        if (ul)
          ul.innerHTML =
            '<p style="color:var(--warna-teks-sekunder);padding:8px 12px;margin:0;">Tidak ada daftar belanja.</p>';
        const btnKonf = document.getElementById("tombolKonfirmasi");
        if (btnKonf) btnKonf.style.display = "none";
        const btnKirim = document.getElementById("tombolKirimEmail");
        if (btnKirim) btnKirim.style.display = "none";
        return;
      }

      renderDaftarBelanja(daftar);

      // tampilkan tombol kirim + konfirmasi saat rencana ada (Konfirmasi tetap terlihat meski tidak ada yang dicentang)
      const btnKirim = document.getElementById("tombolKirimEmail");
      if (btnKirim)
        btnKirim.style.display = currentRencanaId ? "inline-block" : "none";
      const btnKonf = document.getElementById("tombolKonfirmasi");
      if (btnKonf)
        btnKonf.style.display = currentRencanaId ? "inline-block" : "none";
    } catch (err) {
      console.error("Gagal load daftar belanja", err);
    }
  }

  function renderDaftarBelanja(items) {
    const ul = document.getElementById("daftarBelanja");
    if (!ul) return;
    ul.innerHTML = "";
    const fmt = (n) => {
      if (typeof n === "undefined" || n === null) return "";
      const num = Number(n);
      if (Number.isInteger(num)) return String(num);
      // tampilkan hingga 2 desimal, hapus nol di ujung
      let s = (Math.round(num * 100) / 100).toFixed(2);
      s = s.replace(/\.00$/, "");
      s = s.replace(/\.(\d)0$/, ".$1");
      return s;
    };

    items.forEach((it, idx) => {
      const li = document.createElement("li");
      li.className = "item-bahan";
      li.dataset.index = idx;
      li.dataset.namaBahan = it.namaBahan || "";
      li.dataset.jumlah =
        typeof it.jumlah !== "undefined" ? String(it.jumlah) : "";
      li.dataset.satuan = it.satuan || "";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!it.sudahDibeli;

      // storage select
      const storageSelect = document.createElement("select");
      storageSelect.className = "select-penyimpanan";
      const options = [
        { v: "rak_dapur", t: "Rak Dapur" },
        { v: "lemari", t: "Lemari" },
        { v: "kulkas", t: "Kulkas" },
        { v: "freezer", t: "Freezer" },
      ];
      options.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.v;
        opt.textContent = o.t;
        storageSelect.appendChild(opt);
      });
      // set selected option based on item suggestion if available
      storageSelect.value = it.lokasiPenyimpanan || "rak_dapur";

      const onCheckChange = async () => {
        // (Konfirmasi button is always visible when a rencana exists; no show/hide on checkbox change)

        if (!currentRencanaId) return; // hanya update server jika rencana ada
        try {
          const res = await fetch(
            `${API_URL}/menu/${currentRencanaId}/daftar-belanja/${idx}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sudahDibeli: checkbox.checked }),
            }
          );
          const d = await res.json();
          if (!d.sukses) throw new Error(d.pesan || "Gagal update");
          tampilkanNotifikasi("Status item diperbarui", "sukses");
        } catch (err) {
          console.error("Gagal update status", err);
          tampilkanNotifikasi("Gagal update status", "error");
          checkbox.checked = !checkbox.checked; // revert
        }
      };

      checkbox.addEventListener("change", onCheckChange);

      const jumlahText = fmt(it.jumlah);
      li.innerHTML = `<span style="display:inline-block;margin-right:8px;">${escapeHtml(
        it.namaBahan
      )}${
        jumlahText
          ? " - " + escapeHtml(jumlahText) + " " + escapeHtml(it.satuan || "")
          : ""
      }</span>`;
      // append storage select and checkbox
      const container = document.createElement("span");
      container.style.display = "inline-flex";
      container.style.alignItems = "center";
      container.style.gap = "8px";
      const label = document.createElement("label");
      label.style.display = "inline-flex";
      label.style.alignItems = "center";
      label.style.gap = "6px";
      // determine default storage based on name/category heuristic and pre-select it (no visible suggestion text)
      const recommend = (name) => {
        const s = String(name || "").toLowerCase();
        if (/daging|ayam|sapi|kambing|ikan|seafood|udang|salmon/.test(s))
          return "kulkas";
        if (/es|beku|frozen/.test(s)) return "freezer";
        if (/sayur|sayuran|bayam|wortel|selada/.test(s)) return "kulkas";
        if (/buah|apel|pisang|jeruk|mangga|pepaya/.test(s)) return "rak_dapur";
        if (/telur/.test(s)) return "kulkas";
        if (/roti|tawar/.test(s)) return "rak_dapur";
        if (/minyak|oil|olive|butter|mentega/.test(s)) return "rak_dapur";
        if (/susu|yoghurt|keju|cream/.test(s)) return "kulkas";
        return "rak_dapur";
      };
      // pre-select storage (use provided lokasiPenyimpanan if available, otherwise choose from heuristic)
      storageSelect.value =
        it.lokasiPenyimpanan || recommend(it.namaBahan || it.nama || "");
      label.appendChild(storageSelect);
      // CATATAN: pindahkan checkbox ke kolom sendiri di kanan agar baris tetap sejajar
      const checkboxWrapper = document.createElement("div");
      checkboxWrapper.className = "checkbox-wrap";
      checkboxWrapper.style.display = "inline-flex";
      checkboxWrapper.style.alignItems = "center";
      checkboxWrapper.style.justifyContent = "center";
      checkboxWrapper.appendChild(checkbox);

      // tampilan kadaluarsa untuk tempat penyimpanan yang dipilih (catatan: kolom kadaluarsa terpisah sehingga tidak mengganggu tata letak)
      const expirySpan = document.createElement("small");
      expirySpan.className = "expiry-note";
      const updateExpiry = () => {
        const lokasi = storageSelect.value;
        const name = it.namaBahan || it.nama || "";
        const days = (function (nama, lok) {
          const s = String(nama || "").toLowerCase();
          let d = 30;
          if (/daging|sapi|kambing/.test(s)) {
            if (lok === "lemari" || lok === "rak_dapur") d = 2;
            else d = 3;
          } else if (/ayam|ikan|seafood|udang|salmon/.test(s)) {
            d = 2;
          } else if (/sayur|sayuran|bayam|wortel|selada/.test(s)) d = 5;
          else if (/buah|apel|pisang|jeruk|mangga|pepaya/.test(s)) d = 7;
          else if (/telur/.test(s)) d = 21;
          else if (/roti/.test(s)) d = 3;
          else if (/minyak|oil|olive|butter|mentega/.test(s)) d = 365;
          else if (/susu|yoghurt/.test(s)) d = 7;
          // if stored in fridge/freezer get additional 2 weeks
          if (lok === "kulkas" || lok === "freezer") d = d + 14;
          return d;
        })(name, lokasi);
        if (!isFinite(days) || days <= 0) {
          expirySpan.textContent = "";
          return;
        }
        const d = new Date();
        d.setDate(d.getDate() + days);
        expirySpan.textContent = `Kadaluarsa: ${formatTimestamp(d)}`;
      };
      storageSelect.addEventListener("change", updateExpiry);
      updateExpiry();

      // append label (select) and expiry as siblings; checkbox sits in its own column at the end
      container.appendChild(label);
      li.appendChild(container);
      li.appendChild(expirySpan);
      li.appendChild(checkboxWrapper);
      ul.appendChild(li);
    });
  }

  async function okieTambahKePantry() {
    if (!currentRencanaId)
      return tampilkanNotifikasi("Tidak ada rencana yang dipilih", "error");
    const ul = document.getElementById("daftarBelanja");
    if (!ul) return;
    const checked = Array.from(ul.querySelectorAll("li.item-bahan")).filter(
      (li) => li.querySelector("input[type=checkbox]")?.checked
    );
    if (!checked.length)
      return tampilkanNotifikasi("Tidak ada item yang dicentang", "error");
    // build daftar untuk ditambahkan
    const daftarBahan = checked.map((li) => {
      const nama =
        li.dataset.namaBahan || li.textContent.split(" - ")[0].trim();
      const jumlah = parseFloat(li.dataset.jumlah || "0") || 0;
      const satuan = li.dataset.satuan || "gram";
      const select = li.querySelector(".select-penyimpanan");
      const lokasi = select ? select.value : "rak_dapur";
      // infer if meat/fish/ayam based on name keyword
      const meatRegex =
        /\b(daging|ayam|sapi|ikan|udang|seafood|dori|tuna|salmon)\b/i;
      const isMeat = meatRegex.test(nama);
      // compute tanggal kadaluarsa suggestion if not provided
      let tanggalKadaluarsa = undefined;
      if (isMeat) {
        const now = new Date();
        if (lokasi === "lemari" || lokasi === "rak_dapur") {
          now.setDate(now.getDate() + 2);
        } else if (lokasi === "kulkas") {
          // base 2 days + 14 days extra
          now.setDate(now.getDate() + 2 + 14);
        } else if (lokasi === "freezer") {
          // freezer keeps longer + 2 weeks extra
          now.setDate(now.getDate() + 90 + 14);
        }
        tanggalKadaluarsa = now.toISOString();
      }
      // normalize name by removing parenthetical qualifiers to improve merge chances on server
      const namaNormalized =
        (nama || "").replace(/\s*\(.+\)\s*/g, "").trim() || nama;
      return {
        namaBahan: namaNormalized,
        jumlahTersedia: jumlah,
        satuan: satuan,
        lokasiPenyimpanan: lokasi,
        tanggalPembelian: new Date(),
        tanggalKadaluarsa,
      };
    });

    try {
      // tambah massal ke pantry
      const main = document.querySelector("main.kontainer-utama");
      const idPengguna = main ? main.dataset.userId : null;
      const res = await fetch(`${API_URL}/bahan/tambah-banyak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daftarBahan, idPengguna }),
      });
      const data = await res.json();
      if (!data.sukses)
        return tampilkanNotifikasi(
          data.pesan || "Gagal menambahkan bahan",
          "error"
        );
      // Option: mark items as sudahDibeli (not strictly necessary) - we will clear the whole daftar after adding
      try {
        await fetch(`${API_URL}/menu/${currentRencanaId}/hapus-semua`, {
          method: "POST",
        });
      } catch (err) {
        console.warn("Gagal hapus semua daftar", err);
      }

      tampilkanNotifikasi(
        "Bahan berhasil ditambahkan; daftar belanja dikosongkan",
        "sukses"
      );
      await loadDaftarBelanjaRencana(currentRencanaId);
      await loadDaftarBahan();
    } catch (err) {
      console.error("Gagal menambahkan ke bahan", err);
      tampilkanNotifikasi("Gagal menambahkan ke bahan", "error");
    }
  }

  function renderKaloriInfo(kaloriSummary, targetKaloriHarian) {
    const el = document.getElementById("kaloriInfo");
    if (!el) return;
    if (!kaloriSummary || !kaloriSummary.perHari) {
      el.textContent = "";
      return;
    }
    const hariStr = kaloriSummary.perHari
      .map((p) => `${p.hari}: ${p.totalHari} kkal`)
      .join(" • ");
    let txt = `Kalori: ${hariStr} — Total minggu: ${kaloriSummary.totalMingguan} kkal`;
    if (targetKaloriHarian) {
      // Tampilkan target harian tanpa indikator kecocokan
      txt += ` • Target harian: ${targetKaloriHarian} kkal`;
    }
    el.textContent = txt;
  }

  async function kirimEmailRencana() {
    if (!currentRencanaId)
      return tampilkanNotifikasi("Tidak ada rencana yang dipilih", "error");
    try {
      const res = await fetch(
        `${API_URL}/menu/${currentRencanaId}/kirim-email`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.sukses) {
        tampilkanNotifikasi("Email rencana dikirim", "sukses");
      } else {
        tampilkanNotifikasi(data.pesan || "Gagal mengirim email", "error");
      }
    } catch (err) {
      console.error("Gagal kirim email", err);
      tampilkanNotifikasi("Gagal kirim email", "error");
    }
  }

  async function loadCurrentRencana() {
    const main = document.querySelector("main.kontainer-utama");
    const idPengguna = main ? main.dataset.userId : null;
    if (!idPengguna) return;
    const { mingguKe, tahun } = getISOWeekAndYear();
    try {
      const res = await fetch(
        `${API_URL}/menu/${idPengguna}/${tahun}/${mingguKe}`
      );
      const data = await res.json();
      if (data && data.sukses && data.data) {
        // set current rencana id and render menu + daftar belanja
        currentRencanaId = data.data._id;
        renderMenuMingguan(data.data.menuMingguan || []);
        await loadDaftarBelanjaRencana(currentRencanaId);
      }
    } catch (err) {
      console.warn("Gagal load rencana sekarang", err);
    }
  }

  function inisialisasiMenu() {
    const btnGen = document.getElementById("tombolGenerateMenu");
    const btnSimpan = document.getElementById("tombolSimpanRencana");
    const btnKonf = document.getElementById("tombolKonfirmasi");
    const btnKirim = document.getElementById("tombolKirimEmail");

    // If it's Monday, clear old rencana before loading
    const main = document.querySelector("main.kontainer-utama");
    const idPengguna = main ? main.dataset.userId : null;
    const today = new Date();
    if (today.getDay() === 1 && idPengguna) {
      fetch(`${API_URL}/menu/clear-old/${idPengguna}`, {
        method: "POST",
      }).catch((e) => console.warn("Gagal bersihkan rencana lama", e));
    }

    // Load current rencana if present
    loadCurrentRencana();

    if (btnGen)
      btnGen.addEventListener("click", async () => {
        try {
          btnGen.disabled = true;
          btnGen.textContent = "🔄 Meng-generate...";
          const pilihanDietEl = document.getElementById("pilihanDiet");
          const pilihanDiet = pilihanDietEl ? pilihanDietEl.value : "";
          // baca input target kalori jika user mengisi (nilai ini menjadi satu-satunya sumber untuk target kalori)
          const inputTargetEl = document.getElementById("inputTargetKalori");
          let nilaiTargetKalori = null;
          if (inputTargetEl) {
            const v = parseInt(inputTargetEl.value, 10);
            if (!Number.isNaN(v) && v > 0) nilaiTargetKalori = v;
          }

          // gunakan nilai dari input (kosongkan untuk tanpa batas)
          const targetKaloriHarian = nilaiTargetKalori;

          const res = await fetch(`${API_URL}/menu/generate-saran`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              idPengguna,
              pilihanDiet,
              targetKaloriHarian,
            }),
          });
        
          const data = await res.json();
          if (!data.sukses)
            return tampilkanNotifikasi(
              data.pesan || "Gagal generate menu",
              "error"
            );
          // Jika server mengembalikan keterangan/penjelasan (mis. preferensi tidak dapat dipenuhi), tampilkan peringatan
          if (data.keterangan) tampilkanNotifikasi(data.keterangan, "peringatan");
          renderMenuMingguan(data.data.menuMingguan);
          // tampilkan info kalori jika server mengirimkannya
          if (data.data && data.data.kaloriSummary)
            renderKaloriInfo(data.data.kaloriSummary, targetKaloriHarian);
          // Perubahan: tidak melakukan preview daftar belanja otomatis — daftar akan dikirim ke email saja setelah menyimpan rencana.
        } catch (err) {
          console.error("Gagal generate menu", err);
          tampilkanNotifikasi("Gagal generate menu", "error");
        } finally {
          btnGen.disabled = false;
          btnGen.textContent = "🤖 Generate Menu dengan AI";
        }
      });
    if (btnSimpan) btnSimpan.addEventListener("click", simpanRencana);
    if (btnKonf) btnKonf.addEventListener("click", okieTambahKePantry);
    if (btnKirim) btnKirim.addEventListener("click", kirimEmailRencana);
  }

  // --- Pantry Challenge ---
  // sumber rekomendasi saat ini: 'kadaluarsa' (kami sengaja membatasi ke item yang akan kadaluarsa saja)
  let currentRecommendationSource = "kadaluarsa";

  async function loadPantryChallenge() {
    // default: use server-side default (3 days)
    // pastikan cache pantry terisi sehingga kita bisa menandai kecocokan saat menampilkan resep
    await loadPantryItems();

    // clear previous recommendations to avoid stale display
    const kont = document.getElementById("rekomendasiPantry");
    if (kont) kont.innerHTML = "";
    const titleEl = document.getElementById("rekomendasiTitle");
    if (titleEl) titleEl.textContent = "";
    const msgEl = document.getElementById("rekomendasiMessage");
    if (msgEl) msgEl.textContent = "";

    try {
      const res = await fetch(`${API_URL}/bahan/kadaluarsa`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401)
          return tampilkanNotifikasi(
            "Silakan login untuk melihat Pantry Challenge",
            "error"
          );
        console.warn("Kadaluarsa request failed", res.status);
        return;
      }
      const data = await res.json();
      if (!data.sukses)
        return tampilkanNotifikasi(
          data.pesan || "Tidak ada data kadaluarsa",
          "info"
        );
      const bahan = data.data.kadaluarsa || [];
      // store last kadaluarsa items globally for strict client-side checks
      window.__lastKadaluarsaItems = bahan;
      renderBahanHampir(bahan);

      // Utama: rekomendasi berdasarkan item yang akan kadaluarsa saja
      const daftarNamaKadaluarsa = bahan
        .map((b) => b.namaBahan)
        .filter(Boolean)
        .slice(0, 12);
      const msgEl = document.getElementById("rekomendasiMessage");
      if (daftarNamaKadaluarsa.length) {
        currentRecommendationSource = "kadaluarsa";
        document.getElementById("rekomendasiTitle").textContent =
          "Rekomendasi berdasarkan bahan hampir kadaluarsa";
        if (msgEl) msgEl.textContent = "";
        const ada = await cariResepBerdasarkanBahanKadaluarsa(
          daftarNamaKadaluarsa
        );
        if (ada) return; // done (we had matches based on expiring items)
        // no matches found
        if (msgEl)
          msgEl.textContent =
            "Tidak ditemukan resep yang cocok dengan bahan hampir kadaluarsa.";
        return;
      }

      // Jika tidak ada bahan yang akan kadaluarsa sama sekali, tampilkan pesan dan hentikan (tidak ada fallback pantry)
      currentRecommendationSource = "kadaluarsa";
      if (msgEl) msgEl.textContent = "Tidak ada bahan hampir kadaluarsa.";
      return;
    } catch (err) {
      console.error("Gagal load kadaluarsa", err);
      tampilkanNotifikasi("Gagal memuat bahan kadaluarsa", "error");
    }
  }

  function renderBahanHampir(items) {
    const ul = document.getElementById("bahanHampirKadaluarsa");
    if (!ul) return;
    ul.innerHTML = "";
    items.forEach((b) => {
      const li = document.createElement("li");
      const sisa = b.sisaHariKadaluarsa;
      const kelas =
        sisa === null
          ? ""
          : sisa <= 1
          ? "segera"
          : sisa <= 3
          ? "perhatian"
          : "";
      li.className = "item-bahan " + kelas;
      const badge =
        sisa === null
          ? ""
          : `<span class="badge-kadaluarsa ${kelas}">${
              sisa <= 1 ? "Gunakan segera" : sisa + " hari lagi"
            }</span>`;
      li.innerHTML = `<span>🍽️ ${escapeHtml(b.namaBahan)} - ${
        b.jumlahTersedia || 0
      } ${b.satuan || ""}</span>${badge}`;
      ul.appendChild(li);
    });
  }

  async function cariResepDenganBahan(daftarNama, minKecocokan = 30) {
    try {
      const res = await fetch(`${API_URL}/resep/cari-dengan-bahan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daftarBahan: daftarNama,
          minimumKecocokan: minKecocokan,
        }),
      });
      const data = await res.json();
      if (!data.sukses) return renderRekomendasi([]);
      renderRekomendasi(data.data || []);
    } catch (err) {
      console.error("Gagal cari resep pantry", err);
      renderRekomendasi([]);
    }
  }

  // Coba cari resep yang secara khusus cocok dengan bahan yang akan kadaluarsa
  async function cariResepBerdasarkanBahanKadaluarsa(daftarNamaKadaluarsa) {
    try {
      const res = await fetch(`${API_URL}/resep/cari-dengan-bahan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daftarBahan: daftarNamaKadaluarsa,
          minimumKecocokan: 10,
        }),
      });
      const data = await res.json();
      if (!data.sukses || !Array.isArray(data.data) || data.data.length === 0)
        return false;
      // Filter hasil hanya untuk resep yang mengandung minimal satu bahan yang akan kadaluarsa
      const expLower = daftarNamaKadaluarsa.map((x) => String(x).toLowerCase());
      // stricter matching: use normalized whole-word/token matching to avoid substrings (eg 'bayam' vs 'ayam')
      const filtered = data.data.filter((entry) => {
        const r = entry.resep || entry;
        const daftar = (r.daftarBahan || []).map((b) =>
          normalizeName(b.namaBahan || "")
        );
        return daftar.some((d) =>
          expLower.some((e) => {
            const term = normalizeName(e);
            if (!term) return false;
            const re = new RegExp("\\b" + escapeRegExp(term) + "\\b");
            if (re.test(d)) return true;
            const dtoks = d.split(" ").filter(Boolean);
            // token intersection for tokens length >= 3
            if (term.length >= 3 && dtoks.includes(term)) return true;
            return false;
          })
        );
      });
      if (!filtered.length) return false;
      // Enhance each with count of expiring ingredient matches
      const enhanced = filtered.map((entry) => {
        const r = entry.resep || entry;
        const daftar = (r.daftarBahan || []).map((b) =>
          normalizeName(b.namaBahan || "")
        );
        const expMatches = expLower.reduce((acc, e) => {
          const term = normalizeName(e);
          if (!term) return acc;
          const re = new RegExp("\\b" + escapeRegExp(term) + "\\b");
          const found = daftar.some(
            (d) =>
              re.test(d) || (term.length >= 3 && d.split(" ").includes(term))
          );
          return acc + (found ? 1 : 0);
        }, 0);
        return Object.assign({}, entry, { expMatches });
      });
      // Urutkan berdasarkan expMatches menurun, lalu estimatedMatch/persen
      enhanced.sort(
        (a, b) =>
          b.expMatches - a.expMatches ||
          (b.estimatedMatch || b.persentaseKecocokan || 0) -
            (a.estimatedMatch || a.persentaseKecocokan || 0)
      );
      // Render but annotate name with expiring match count inside renderRekomendasi we will use presentCount; for now pass entries as-is
      renderRekomendasi(enhanced);
      // tambahkan catatan kecil
      const titleEl = document.getElementById("rekomendasiTitle");
      if (titleEl)
        titleEl.textContent = `Rekomendasi berdasarkan bahan hampir kadaluarsa (menyesuaikan yang paling cocok)`;
      return true;
    } catch (err) {
      console.error("Gagal cari resep berdasarkan kadaluarsa", err);
      return false;
    }
  }

  // Cache pantry untuk nama bahan (huruf kecil)
  let pantryIngredientNames = new Set();

  async function loadPantryItems() {
    try {
      const res = await fetch(`${API_URL}/bahan`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.sukses) return;
      pantryIngredientNames = new Set(
        (data.data || []).map((b) => (b.namaBahan || "").toLowerCase())
      );
    } catch (err) {
      console.error("Gagal load pantry items", err);
    }
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function normalizeName(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // remove diacritics
      .replace(/[^a-z0-9\s]/g, " ") // keep letters/numbers/spaces
      .replace(/\s+/g, " ")
      .trim();
  }

  function ingredientMatchesPantry(name) {
    if (!name) return false;
    const n = normalizeName(name);
    if (!n) return false;

    // prefer token / whole-word matches to avoid substring false positives (e.g., 'bayam' vs 'ayam')
    const nTokens = n.split(" ").filter(Boolean);

    for (const rawP of pantryIngredientNames) {
      if (!rawP) continue;
      const p = normalizeName(rawP);
      if (!p) continue;

      // exact whole-word match either way
      const reN = new RegExp("\\b" + escapeRegExp(n) + "\\b");
      const reP = new RegExp("\\b" + escapeRegExp(p) + "\\b");
      if (reP.test(n) || reN.test(p)) return true;

      // token intersection: require tokens of length >= 3 to avoid tiny-word matches
      const pTokens = p.split(" ").filter(Boolean);
      for (const t of nTokens) {
        if (t.length < 3) continue;
        if (pTokens.includes(t)) return true;
      }
    }
    return false;
  }

  async function lihatBahanResep(id, holder) {
    if (!id || !holder) return;
    const target =
      holder.querySelector(`#bahan_${id}`) ||
      holder.querySelector(`#detail_${id}`);
    if (!target) return;
    if (target.dataset.loaded === "1") {
      target.style.display = target.style.display === "none" ? "block" : "none";
      return;
    }
    try {
      target.innerHTML = "<p>Memuat detail…</p>";
      const res = await fetch(`${API_URL}/resep/${id}`);
      const data = await res.json();
      if (!data.sukses) {
        target.innerHTML = "<p>Gagal memuat detail resep</p>";
        return;
      }
      muatDetailResepToElement(target, data.data);
      target.dataset.loaded = "1";
    } catch (err) {
      console.error("Gagal load detail resep", err);
      target.innerHTML = "<p>Gagal memuat detail resep</p>";
    }
  }

  // helper: populate a detail container with bahan + langkah for a recipe object
  function muatDetailResepToElement(el, resep) {
    if (!el || !resep) return;
    let html = "";
    // ingredients can be objects or strings; support alternative keys
    const daftar = resep.daftarBahan || resep.bahan || resep.ingredients || [];
    html += "<h4>Bahan</h4>";
    if (!daftar.length) html += "<p><em>Tidak ada informasi bahan.</em></p>";
    else {
      html += '<ul class="daftar-bahan-resep">';
      daftar.forEach((it) => {
        let nama = "";
        let jumlah = "";
        let satuan = "";
        if (!it) {
          nama = "";
        } else if (typeof it === "string") {
          nama = it;
        } else {
          nama = it.namaBahan || it.nama || it.name || it.item || "";
          jumlah = it.jumlah || it.qty || it.jumlahTersedia || "";
          satuan = it.satuan || it.unit || "";
        }
        html += `<li>${escapeHtml(nama)} ${
          jumlah
            ? "- " + escapeHtml(String(jumlah)) + " " + escapeHtml(satuan)
            : ""
        }</li>`;
      });
      html += "</ul>";
    }

    // steps can be objects or strings; support alternative keys
    const langkah = resep.langkah || resep.steps || resep.instruksi || [];
    html += "<h4>Langkah</h4>";
    if (!langkah.length && resep.deskripsi) {
      html += `<p>${escapeHtml(resep.deskripsi)}</p>`;
    } else if (!langkah.length) {
      html += "<p><em>Tidak ada instruksi langkah.</em></p>";
    } else {
      html += '<ol class="daftar-langkah-resep">';
      langkah.forEach((lk) => {
        let desc = "";
        let dur = "";
        let tips = "";
        if (!lk) {
          desc = "";
        } else if (typeof lk === "string") {
          desc = lk;
        } else {
          desc =
            lk.deskripsi ||
            lk.text ||
            lk.instruksi ||
            lk.step ||
            lk.title ||
            "";
          dur = lk.durasiMenit || lk.duration || "";
          tips = lk.tips || lk.catatan || "";
        }
        html += `<li>${escapeHtml(desc)}${
          dur ? ` <em>(${escapeHtml(String(dur))} menit)</em>` : ""
        }${tips ? `<div class="tip">💡 ${escapeHtml(tips)}</div>` : ""}</li>`;
      });
      html += "</ol>";
    }

    el.innerHTML = html;
  }

  // Toggle detail (ambil pertama kali, lalu tampilkan/sembunyikan)
  async function toggleResepDetail(id, holder, card) {
    if (!id || !holder) return;
    // if already visible, hide
    if (holder.style.display === "block") {
      holder.style.display = "none";
      if (card) card.classList.remove("expanded");
      return;
    }
    // if not loaded yet, fetch
    if (holder.dataset.loaded !== "1") {
      holder.innerHTML = "<p>🔄 Memuat detail resep...</p>";
      try {
        const res = await fetch(`${API_URL}/resep/${id}`);
        const data = await res.json();
        if (!data.sukses) {
          holder.innerHTML = `<p>❌ ${data.pesan || "Gagal memuat detail"}</p>`;
          return;
        }
        muatDetailResepToElement(holder, data.data);
        holder.dataset.loaded = "1";
      } catch (err) {
        console.error("Gagal memuat detail resep", err);
        holder.innerHTML = "<p>❌ Gagal memuat detail resep</p>";
        return;
      }
    }

    // tampilkan
    holder.style.display = "block";
    if (card) card.classList.add("expanded");
  }

  function renderRekomendasi(list) {
    const kont = document.getElementById("rekomendasiPantry");
    if (!kont) return;
    kont.innerHTML = "";
    if (!list || list.length === 0) {
      kont.innerHTML =
        '<div class="kartu"><p>Tidak ada rekomendasi saat ini. Tambahkan bahan ke pantry atau refresh.</p></div>';
      return;
    }

    // Jika merekomendasikan khusus untuk kadaluarsa, tampilkan hanya resep yang secara eksplisit mengandung minimal satu bahan yang akan kadaluarsa
    if (currentRecommendationSource === "kadaluarsa") {
      // build normalized expiring tokens from the global last kadaluarsa fetch
      const expItems = (window.__lastKadaluarsaItems || [])
        .map((b) => normalizeName(b.namaBahan || ""))
        .filter(Boolean);
      const expSet = new Set(expItems);

      list = (list || []).filter((e) => {
        if (!e) return false;
        // prefer server-supplied expMatches if available
        if (e.expMatches && e.expMatches > 0) return true;
        const r = e.resep || e;
        const daftarTokens = (r.daftarBahan || [])
          .map((b) => normalizeName(b.namaBahan || ""))
          .filter(Boolean);
        // require at least one token to match exactly
        return daftarTokens.some((tok) => expSet.has(tok));
      });

      if (!list.length) {
        kont.innerHTML =
          '<div class="kartu"><p>Tidak ditemukan resep yang cocok dengan bahan hampir kadaluarsa.</p></div>';
        return;
      }
    }

    // Enrich list with presentCount/totalBahan and sort by presentCount desc, then estimatedMatch
    const enriched = list.map((entry) => {
      const r = entry.resep || entry;
      let totalBahan = null;
      let missingCount = null;
      if (r && r.daftarBahan && Array.isArray(r.daftarBahan)) {
        totalBahan = r.daftarBahan.length;
        let miss = 0;
        r.daftarBahan.forEach((b) => {
          const name = (b.namaBahan || "").toLowerCase();
          if (!ingredientMatchesPantry(name)) miss++;
        });
        missingCount = miss;
      } else if (entry.bahanKurang && Array.isArray(entry.bahanKurang)) {
        missingCount = entry.bahanKurang.length;
      } else if (
        entry.missingIngredients &&
        Array.isArray(entry.missingIngredients)
      ) {
        missingCount = entry.missingIngredients.length;
      }
      const presentCount =
        totalBahan !== null && missingCount !== null
          ? totalBahan - missingCount
          : null;
      const estimated = entry.estimatedMatch || entry.persentaseKecocokan || 0;
      const score = presentCount !== null ? presentCount : estimated;
      return { entry, r, presentCount, totalBahan, score };
    });

    enriched.sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0))
        return (b.score || 0) - (a.score || 0);
      return (
        (b.entry.estimatedMatch || b.entry.persentaseKecocokan || 0) -
        (a.entry.estimatedMatch || a.entry.persentaseKecocokan || 0)
      );
    });

    enriched.slice(0, 12).forEach(({ entry, r, presentCount, totalBahan }) => {
      const sourceLabel =
        currentRecommendationSource === "kadaluarsa"
          ? " (dari bahan hampir kadaluarsa)"
          : "";
      const nama = r.namaResep || r.name || r.nama || "Resep";
      const waktu = (r.waktuPersiapanMenit || 0) + (r.waktuMemasakMenit || 0);
      const kecocokan = entry.persentaseKecocokan
        ? `${entry.persentaseKecocokan}% cocok`
        : entry.estimatedMatch
        ? `${entry.estimatedMatch}% cocok`
        : "";
      const kurang =
        entry.bahanKurang && entry.bahanKurang.length
          ? ` - butuh: ${entry.bahanKurang.join(", ")}`
          : entry.missingIngredients && entry.missingIngredients.length
          ? ` - butuh: ${entry.missingIngredients.join(", ")}`
          : "";
      const idResep = r._id || r.recipeId || "";
      const div = document.createElement("div");
      div.className = "kartu-resep";
      if (idResep) div.dataset.id = idResep;
      div.innerHTML = `
        <div class="gambar-resep">🍲</div>
        <div class="info-resep">
          <div class="nama-resep">${escapeHtml(nama)}${sourceLabel}</div>
          <div class="meta-resep"><span>⏱️ ${waktu} menit</span><span>${escapeHtml(
        kecocokan
      )}</span>${
        presentCount !== null
          ? `<span style="margin-left:8px;">• <strong>${presentCount}/${totalBahan}</strong> bahan ada</span>`
          : ""
      }${
        entry.expMatches
          ? `<span style="margin-left:8px;color:var(--warna-utama);">• ${entry.expMatches} bahan hampir kadaluarsa cocok</span>`
          : ""
      }</div>
          ${
            entry.description
              ? `<div style="margin-top:6px;color:var(--warna-teks-sekunder);">${escapeHtml(
                  entry.description
                )}</div>`
              : ""
          }
          <div style="margin-top:8px;">
            ${
              idResep
                ? `<button class="tombol-kecil tombol-utama lihat-bahan" data-id="${idResep}">🔎 Lihat Detail</button>`
                : ""
            }
            ${
              kurang
                ? `<small style="display:block;margin-top:6px;color:var(--warna-teks-sekunder);">${escapeHtml(
                    kurang
                  )}</small>`
                : ""
            }
          </div>
          <div class="detail-resep" id="detail_${idResep}" style="display:none;margin-top:8px;"></div>
        </div>`;
      kont.appendChild(div);

      // attach click handler for lihat detail (navigate to detail page)
      const lihatBtn = div.querySelector(".lihat-bahan");
      if (lihatBtn)
        lihatBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = lihatBtn.dataset.id;
          if (id) window.location.href = `/resep/${id}`;
        });
    });
  }

  async function loadAISaranForPantry() {
    const ul = document.getElementById("bahanHampirKadaluarsa");
    if (!ul) return;
    const items = Array.from(ul.querySelectorAll(".item-bahan"))
      .map((li) => li.querySelector("span")?.textContent || "")
      .filter(Boolean);
    // extract only names (format: '🍽️ Name - qty')
    const names = items.map((t) =>
      t
        .replace(/^[^a-zA-Z0-9]*/, "")
        .split(" - ")[0]
        .trim()
    );
    if (!names.length)
      return tampilkanNotifikasi("Tidak ada bahan untuk dianalisis", "error");
    try {
      const res = await fetch(`${API_URL}/resep/saran-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daftarBahan: names }),
      });
      const data = await res.json();
      if (!data.sukses)
        return tampilkanNotifikasi(
          data.pesan || "Gagal dapatkan saran AI",
          "error"
        );
      renderRekomendasi(
        data.data.map((x) => ({
          name: x.name || x.nama,
          description: x.description,
          estimatedMatch: x.estimatedMatch,
          missingIngredients: x.missingIngredients,
          recipeId: x.recipeId,
        }))
      );
    } catch (err) {
      console.error("Gagal saran AI pantry", err);
      tampilkanNotifikasi("Gagal dapatkan saran AI", "error");
    }
  }

  function inisialisasiPantryChallenge() {
    const btn = document.getElementById("tombolRefreshPantry");
    if (btn) btn.addEventListener("click", () => loadPantryChallenge());
    // Coba muat otomatis saat berada di halaman pantry
    const onPantry =
      document.getElementById("rekomendasiPantry") ||
      document.getElementById("bahanHampirKadaluarsa");
    if (onPantry) setTimeout(() => loadPantryChallenge(), 100);
  }

  await loadDaftarBahan();
  // Load initial recipe list if on recipe page
  setTimeout(() => loadDaftarResep(), 0);

  // Delegasikan klik untuk kartu resep yang dirender server (jika ada) agar klik kartu menavigasi ke halaman detail
  const daftarResepEl = document.getElementById("daftarResep");
  if (daftarResepEl) {
    daftarResepEl.addEventListener("click", (e) => {
      const card = e.target.closest(".kartu-resep");
      if (!card) return;
      if (e.target.closest("button") || e.target.tagName === "A") return;
      const id = card.dataset.id;
      if (!id) return;
      window.location.href = `/resep/${id}`;
    });
  }

  // Tampilkan notifikasi selamat datang hanya saat dialihkan setelah login berhasil
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      // tampilkan lalu hapus param dari URL untuk mencegah muncul lagi saat refresh
      setTimeout(
        () =>
          tampilkanNotifikasi(
            "Selamat datang di Koki AI Pribadi! 🍳",
            "sukses"
          ),
        600
      );
      // Also show the 'Terhubung ke Koki AI' notification at the same time and mark it shown
      setTimeout(() => {
        try {
          tampilkanNotifikasi("Terhubung ke Koki AI", "sukses");
          sessionStorage.setItem("koki_connect_shown", "1");
        } catch (e) {}
      }, 620);
      // Izinkan socket 'connect' juga menampilkan notifikasi jika terhubung sebentar setelah login (cadangan)
      try {
        sessionStorage.setItem("koki_show_connect_ts", String(Date.now()));
      } catch (e) {}
      // hapus param 'welcome' dari URL tanpa memuat ulang
      params.delete("welcome");
      const newUrl =
        window.location.pathname +
        (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState({}, "", newUrl);
    }
  } catch (e) {
    // ignore errors
  }

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

    // Saat submit, simpan atau hapus kredensial di localStorage berdasarkan checkbox
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
      try {
        const confirmed = await showConfirmModal({
          title: "Keluar",
          message: "Yakin ingin keluar?",
          okLabel: "Ya, keluar",
          cancelLabel: "Batal",
        });
        if (!confirmed) return;
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
      const errEl = document.getElementById("register-error");
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
            form.submit(); // kirim karena OTP diverifikasi
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
      const errEl = document.getElementById("reset-error");
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

  // Inisialisasi animasi statistik sekarang (jika nilai sudah ada) dan pastikan animasi tersebut akan terpicu pada pembaruan mendatang.
  initStatsCountUp();

  // Initialize bahan input untuk halaman resep baru
  inisialisasiBahanResepBaru();
});

// ==========================================
// Bahan Input untuk Form Resep (User Biasa)
// ==========================================

function tambahBahanKeFormResep() {
  const namaBahan = document.getElementById("inputNamaBahanForm").value.trim();
  const jumlahBahan = document.getElementById("inputJumlahBahanForm").value;
  const satuanBahan = document.getElementById("inputSatuanBahanForm").value;

  if (!namaBahan) {
    tampilkanNotifikasi("Masukkan nama bahan", "error");
    return;
  }

  if (!jumlahBahan || parseFloat(jumlahBahan) <= 0) {
    tampilkanNotifikasi("Masukkan jumlah bahan yang valid", "error");
    return;
  }

  // Add to list
  const bahan = {
    id: Date.now(),
    nama: namaBahan,
    jumlah: parseFloat(jumlahBahan),
    satuan: satuanBahan,
  };

  daftarBahanForm.push(bahan);

  // Bersihkan input
  document.getElementById("inputNamaBahanForm").value = "";
  document.getElementById("inputJumlahBahanForm").value = "";
  document.getElementById("inputSatuanBahanForm").value = "gram";

  // Render daftar
  renderDaftarBahanForm();

  // Fokus kembali ke input nama
  document.getElementById("inputNamaBahanForm").focus();
}

function renderDaftarBahanForm() {
  const container = document.getElementById("bahanListContainerForm");
  if (!container) return;

  if (daftarBahanForm.length === 0) {
    container.innerHTML =
      '<p style="color: #999; text-align: center; margin: 10px 0; font-size: 13px;">Belum ada bahan ditambahkan</p>';
    return;
  }

  container.innerHTML = daftarBahanForm
    .map(
      (bahan) => `
    <div style="display: flex; align-items: center; justify-content: space-between; background: white; padding: 8px; border-radius: 4px; border-left: 3px solid #27ae60; font-size: 13px;">
      <div style="flex: 1;">
        <strong>${bahan.nama}</strong>
        <span style="color: #666; margin-left: 8px;">${bahan.jumlah} ${bahan.satuan}</span>
      </div>
      <button
        type="button"
        onclick="hapusBahanDariFormResep(${bahan.id})"
        style="background: #e74c3c; color: white; border: none; padding: 6px 10px; border-radius: 3px; cursor: pointer; font-size: 11px;"
      >
        Hapus
      </button>
    </div>
  `
    )
    .join("");
}

function hapusBahanDariFormResep(id) {
  daftarBahanForm = daftarBahanForm.filter((b) => b.id !== id);
  renderDaftarBahanForm();
}

// ==========================================
// Bahan Input untuk Resep Baru
// ==========================================

let daftarBahanResepBaru = [];

function inisialisasiBahanResepBaru() {
  const tombolTambah = document.getElementById("tombolTambahBahanResep");
  if (!tombolTambah) return;

  tombolTambah.addEventListener("click", tambahBahanKeResep);

  // Izinkan Enter untuk menambah bahan
  const inputNama = document.getElementById("inputNamaBahanResep");
  if (inputNama) {
    inputNama.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tambahBahanKeResep();
      }
    });
  }

  // Tangani pengiriman form untuk menyiapkan daftarBahanHidden
  const form = document.querySelector("form[action='/admin/resep']");
  if (form) {
    form.addEventListener("submit", (e) => {
      try {
        // Pastikan hidden textarea terisi dari daftar internal
        updateDaftarBahanHidden();
        const hidden = document.getElementById("daftarBahanHidden");
        // Debug: log ketika submit pada halaman admin untuk membantu troubleshooting
        console.log("[admin.resep] Submit form admin: daftarBahanResepBaru.length=", daftarBahanResepBaru.length, "hidden.value=", hidden ? hidden.value : null);

        // Pastikan daftar bahan benar-benar terisi (cek juga hidden.value karena form bisa di-render ulang oleh server)
        if (daftarBahanResepBaru.length === 0 || !hidden || !hidden.value || !hidden.value.trim()) {
          e.preventDefault();
          tampilkanNotifikasi("Tambahkan minimal satu bahan", "error");
          return;
        }

        // tampilkan pemberitahuan singkat bahwa pengiriman sedang diproses (akan diarahkan jika berhasil)
        tampilkanNotifikasi("Mengirim resep...", "info");
      } catch (err) {
        console.error("[admin.resep] Error saat submit form:", err);
      }
    });
  }

  // Jika halaman di-render ulang oleh server dengan nilai daftarBahan pada hidden textarea,
  // isi ulang state internal agar admin melihat daftar bahan yang sudah diisi.
  const hiddenInit = document.getElementById("daftarBahanHidden");
  if (hiddenInit && hiddenInit.value && daftarBahanResepBaru.length === 0) {
    const lines = hiddenInit.value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const isNumeric = (s) => /^(\d+(?:[.,]\d+)?)$/.test(String(s));

    daftarBahanResepBaru = lines.map((line) => {
      const parts = line.split(/\s+/).filter(Boolean);
      let nama = line;
      let jumlah = 0;
      let satuan = "";

      if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        const secondLast = parts[parts.length - 2];
        if (isNumeric(secondLast)) {
          jumlah = Number(String(secondLast).replace(',', '.'));
          satuan = last;
          nama = parts.slice(0, parts.length - 2).join(' ');
        } else if (isNumeric(last)) {
          jumlah = Number(String(last).replace(',', '.'));
          nama = parts.slice(0, parts.length - 1).join(' ');
        }
      }

      return { id: Date.now() + Math.random(), nama, jumlah, satuan };
    });

    renderDaftarBahanResep();
  }
}

function tambahBahanKeResep() {
  const namaBahan = document.getElementById("inputNamaBahanResep").value.trim();
  const jumlahBahan = document.getElementById("inputJumlahBahanResep").value;
  const satuanBahan = document.getElementById("inputSatuanBahanResep").value;

  if (!namaBahan) {
    tampilkanNotifikasi("Masukkan nama bahan", "error");
    return;
  }

  if (!jumlahBahan || parseFloat(jumlahBahan) <= 0) {
    tampilkanNotifikasi("Masukkan jumlah bahan yang valid", "error");
    return;
  }

  // Add to list
  const bahan = {
    id: Date.now(),
    nama: namaBahan,
    jumlah: parseFloat(jumlahBahan),
    satuan: satuanBahan,
  };

  daftarBahanResepBaru.push(bahan);

  // Bersihkan input
  document.getElementById("inputNamaBahanResep").value = "";
  document.getElementById("inputJumlahBahanResep").value = "";
  document.getElementById("inputSatuanBahanResep").value = "gram";

  // Render daftar dan perbarui nilai tersembunyi
  renderDaftarBahanResep();
  updateDaftarBahanHidden();

  // Fokus kembali ke input nama
  document.getElementById("inputNamaBahanResep").focus();
}

function renderDaftarBahanResep() {
  const container = document.getElementById("bahanListContainer");
  if (!container) return;

  if (daftarBahanResepBaru.length === 0) {
    container.innerHTML =
      '<p style="color: #999; text-align: center; margin: 20px 0;">Belum ada bahan ditambahkan</p>';
    return;
  }

  container.innerHTML = daftarBahanResepBaru
    .map(
      (bahan) => `
    <div style="display: flex; align-items: center; justify-content: space-between; background: white; padding: 12px; border-radius: 6px; border-left: 3px solid #3498db;">
      <div style="flex: 1;">
        <strong>${bahan.nama}</strong>
        <span style="color: #666; margin-left: 8px;">${bahan.jumlah} ${bahan.satuan}</span>
      </div>
      <button
        type="button"
        onclick="hapusBahanDariResep(${bahan.id})"
        style="background: #e74c3c; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px;"
      >
        Hapus
      </button>
    </div>
  `
    )
    .join("");
}

function hapusBahanDariResep(id) {
  daftarBahanResepBaru = daftarBahanResepBaru.filter((b) => b.id !== id);
  renderDaftarBahanResep();
  updateDaftarBahanHidden();
}

function updateDaftarBahanHidden() {
  const hidden = document.getElementById("daftarBahanHidden");
  if (hidden) {
    hidden.value = daftarBahanResepBaru
      .map((b) => `${b.nama} ${b.jumlah} ${b.satuan}`)
      .join("\n");
  }
}
