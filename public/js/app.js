/* public/js/app.js — frontend behavior (cleaned from provided inline script)
   Note: avoid syntax errors caused by extra spaces before dots or incorrect selectors.
*/
const API_URL = "http://localhost:3000/api";
let soketMemasak = null;
let soketNotifikasi = null;

// Per-tab stable session id: keep in sessionStorage so reloads keep history until tab is closed
let idSesiChat = sessionStorage.getItem("koki_chat_session_id");
if (!idSesiChat) {
  idSesiChat = "sesi_" + Date.now();
  sessionStorage.setItem("koki_chat_session_id", idSesiChat);
}

// Chat history for current tab (kept in sessionStorage under key koki_chat_<session>)
let chatHistory = [];
const CHAT_STORAGE_KEY = `koki_chat_${idSesiChat}`;

let daftarTimerAktif = new Map();
let idTimerCounter = 1;
// Track IDs recently stopped locally to avoid re-creating cards when server emits update immediately after stop
let suppressedTimerCreates = new Set();

function inisialisasiSocket() {
  soketMemasak = io("http://localhost:3000/memasak");

  soketMemasak.on("connect", () => {
    // If we already showed a connect notification together with welcome, skip showing again
    try {
      const alreadyShown = sessionStorage.getItem("koki_connect_shown");
      if (alreadyShown === "1") {
        console.log(
          "✅ Terhubung ke server memasak (already shown with welcome)"
        );
        sessionStorage.removeItem("koki_connect_shown");
      } else {
        // Show connect notification only if it was set very recently after login
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
    // Always clear the temporary keys to avoid showing later on navigation
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
    // Use explicit modal for timer completion so it appears centered with proper title
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
    // fallback
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
  // ensure starting visible state
  el.classList.remove("page-hidden");
  // force reflow to ensure the class change is applied
  void el.offsetWidth;
  el.classList.add("page-hidden");
  await waitForTransitionEnd(el, 900);
}

async function fadeIn(el) {
  if (!el) return;
  el.classList.add("page-fade");
  // ensure starting hidden state
  el.classList.add("page-hidden");
  // force reflow
  void el.offsetWidth;
  el.classList.remove("page-hidden");
  await waitForTransitionEnd(el, 900);
}

function inisialisasiNavigasi() {
  const tombolNav = document.querySelectorAll(".tombol-nav");
  const panels = document.querySelectorAll(".panel");
  const main =
    document.querySelector("main.kontainer-utama") ||
    document.querySelector("main");
  // fallback target to animate if main isn't present (some pages like auth use different layout)
  const fadeTarget =
    main ||
    document.querySelector("#app") ||
    document.body ||
    document.documentElement;

  // initial enter animation: ensure page-fade class present and animate in
  if (fadeTarget) {
    fadeTarget.classList.add("page-fade");
    if (!fadeTarget.classList.contains("page-hidden")) {
      fadeTarget.classList.add("page-hidden");
      requestAnimationFrame(() =>
        setTimeout(() => fadeTarget.classList.remove("page-hidden"), 20)
      );
    }
  }

  // If navigation uses links (page-per-view), mark active link by pathname
  tombolNav.forEach((tombol) => {
    if (tombol.tagName === "A") {
      // mark active
      try {
        const urlPath = new URL(tombol.href).pathname;
        if (urlPath === location.pathname) tombol.classList.add("aktif");
        else tombol.classList.remove("aktif");
      } catch (e) {}

      // on click: fade-out + navigate using transitionend for accuracy
      tombol.addEventListener("click", async (e) => {
        // allow normal browser behaviors: ctrl/meta clicks, middle-click, target="_blank"
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
        // only intercept same-origin navigations
        try {
          const url = new URL(tombol.href);
          if (url.origin !== location.origin) return;
        } catch (err) {}

        if (isNavigating) return;
        e.preventDefault();
        isNavigating = true;
        const href = tombol.href;
        // visual feedback: mark active immediately
        tombolNav.forEach((t) => t.classList.remove("aktif"));
        tombol.classList.add("aktif");
        if (fadeTarget) await fadeOut(fadeTarget);
        // navigate after transition
        window.location.href = href;
      });
    } else {
      // legacy behavior (buttons toggling client-side panels)
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

  // Restore history (if any)
  const hist = loadChatHistory();
  const areaPesan = document.getElementById("areaPesan");
  if (areaPesan) {
    areaPesan.innerHTML = ""; // clear any static content to avoid duplicates
    if (hist && hist.length) {
      hist.forEach((m) => {
        // render without saving again
        tambahPesanChat(m.pesan, m.tipe, {
          save: false,
          timestamp: m.timestamp,
        });
      });
    } else {
      // No history: show initial welcome message and save it
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

// Minimal, safe markdown-like renderer for chat messages
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(s) {
  // bold **text**
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // italic *text* (avoid capturing **bold**)
  s = s.replace(/\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>");
  // inline code `code`
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // autolink URLs
  s = s.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  return s;
}

function renderChatMarkdown(text) {
  if (!text) return "";
  text = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Fix accidental in-word newlines like "a\nir" -> "air" but avoid touching
  // formatting markers (lists, bullets, headings). Use Unicode letters to be safe.
  try {
    text = text.replace(/([\p{L}])\n([\p{L}])/gu, "$1$2");
  } catch (e) {
    // If Unicode property escapes not supported, fallback to simple ASCII letters
    text = text.replace(/([A-Za-z])\n([A-Za-z])/g, "$1$2");
  }

  const lines = text.split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let paraBuf = [];

  const flushParagraph = () => {
    if (paraBuf.length === 0) return;
    // join lines in paragraph with <br> to preserve intentional single-line breaks
    const joined = paraBuf.map((l) => escapeHtml(l.trim())).join("<br>");
    out.push("<p>" + inlineMarkdown(joined) + "</p>");
    paraBuf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(
      /^\s*[\-\*\u2022\u2023\u25E6\u2043\u2219·\u2013\u2014]\s+(.*)/
    ); // support common bullets including • · – —
    const olMatch = line.match(/^\s*(\d+)[\.)]\s+(.*)/); // support "1." and "1)"
    const continuationMatch = line.match(/^\s{2,}(.*)/); // indented continuation for previous list item

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

    // handle indented continuation lines inside a list item (after checking for list markers)
    if (continuationMatch && (inUl || inOl)) {
      // append to the last <li> in out (preserve line break)
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
      // empty line separates paragraphs
      flushParagraph();
    } else {
      // accumulate into paragraph buffer
      paraBuf.push(line);
    }
  }

  // flush any remaining paragraph buffer
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

  // timestamp meta (short visible + full tooltip)
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

// Modal Edit Bahan Functions
function bukaModalEditBahan(bahan) {
  document.getElementById("idBahanEdit").value = bahan._id || "";
  document.getElementById("namaBahanEdit").value = bahan.namaBahan || "";
  document.getElementById("jumlahBahanEdit").value = bahan.jumlahTersedia || 0;
  document.getElementById("satuanBahanEdit").value = bahan.satuan || "gram";
  document.getElementById("kategoriBahanEdit").value =
    bahan.kategoriBahan || "lainnya";
  document.getElementById("lokasiPenyimpananEdit").value =
    bahan.lokasiPenyimpanan || "rak_dapur";

  // Format dates for input[type="date"]
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
    // Disable body scroll when modal is open
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");
  }
}

function tutupModalEditBahan() {
  const modal = document.getElementById("modal-edit-bahan");
  if (modal) {
    modal.style.display = "none";
    // Re-enable body scroll when modal is closed
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

// Initialize edit modal event listeners
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

  // Close modal when clicking outside the modal content
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        tutupModalEditBahan();
      }
    });
  }
}

// --- Recipe search: client-side loader and renderer ---
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

    // clicking the card (except on internal buttons) navigates to the recipe detail page
    div.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.tagName === "A") return; // ignore button/link clicks
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
          // backward-compatible semicolon format: 'nama;jumlah;satuan'
          if (line.indexOf(";") !== -1) {
            const parts = line.split(";").map((s) => s.trim());
            return {
              namaBahan: parts[0] || "",
              jumlah: Number(parts[1]) || 0,
              satuan: parts[2] || "",
            };
          }

          // prefer space-separated format: 'Nama [jumlah] [satuan]'
          const toks = line.split(/\s+/).filter(Boolean);
          // single token -> name only
          if (toks.length === 1)
            return { namaBahan: toks[0], jumlah: 0, satuan: "" };

          // detect numeric token (integer or decimal, supports comma as decimal separator)
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

          // fallback: treat entire line as name
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
      // If the recipe was created as pending, notify the user it's awaiting admin review
      const created = data.data || {};
      if (created.status === "pending") {
        tampilkanNotifikasi(
          "Resep berhasil dikirim. Akan ditinjau oleh admin sebelum dipublikasikan.",
          "sukses"
        );
      } else {
        tampilkanNotifikasi("Resep berhasil disimpan", "sukses");
      }
      // reset form
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
      // refresh list
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
  // Only render a centered modal when explicitly requested (options.modal === true).
  // Otherwise warnings (type 'peringatan') will be shown as a toast to avoid unexpected modal popups on unrelated pages.
  if (options.modal) {
    const modalCont = document.getElementById("kontainerModalNotifikasi");
    if (!modalCont) return;
    modalCont.innerHTML = "";

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    const card = document.createElement("div");
    card.className = "modal-card";

    // Icon + title
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

    // optional secondary (dismiss quietly)
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
    // lock background scroll while modal is visible
    document.body.classList.add("modal-open");

    // If not persistent, auto-hide after timeout
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

  // Otherwise, show as toast in top-right
  const kontainer = document.getElementById("kontainerToasts");
  if (!kontainer) return;
  const notifikasi = document.createElement("div");
  notifikasi.className = `notifikasi ${tipe}`;

  const pesanEl = document.createElement("div");
  pesanEl.className = "notifikasi-pesan";
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
      osc.type = "square";
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
        try {
          gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
        } catch (e) {}
        try {
          osc.stop(audioCtx.currentTime + 0.06);
        } catch (e) {}
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
    currentBunyi = null;
    if (navigator.vibrate) navigator.vibrate(0);
  } catch (e) {
    console.warn("stopBunyi error", e);
  }
}

// Global delegated handler for .tombol-mulai to reliably open the Masak confirmation modal
(function () {
  // Ensure handler only attached once
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

      // Use page-level porsi (read from #inputPorsi) and show missing items area at top
      const pagePorsi =
        Number(document.getElementById("inputPorsi")?.value || basePorsi) ||
        basePorsi;

      const missingDiv = document.createElement("div");
      missingDiv.style.display = "none";
      missingDiv.style.marginBottom = "10px";
      konten.appendChild(missingDiv);

      // Remove the separate ul list for all ingredients
      // Now only show missing items from server

      // preview missing ingredients using server
      (async () => {
        try {
          const resp = await fetch("/api/resep/" + resepId + "/masak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ porsi: pagePorsi, preview: true }),
          });
          const data = await resp.json();

          // Show all ingredients first
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

          // Then show missing items if any
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

      // center the card within the modal container for better visual alignment
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

      // single-click: perform preview (no stock change) immediately
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

          // success: stock was reduced
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
    // only trigger if this button has recipe data attributes
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

      // Attach event listeners to edit and delete buttons
      const btnEdit = li.querySelector(".btn-edit-bahan");
      const btnHapus = li.querySelector(".btn-hapus-bahan");

      if (btnEdit) {
        btnEdit.addEventListener("click", () => {
          bukaModalEditBahan(b);
        });
      }

      if (btnHapus) {
        btnHapus.addEventListener("click", async () => {
          if (confirm(`Apakah Anda yakin ingin menghapus "${b.namaBahan}"?`)) {
            await hapusBahanItem(b._id);
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
      // show saved calory summary if available
      if (data.data && data.data.totalKaloriMingguan) {
        renderKaloriInfo(
          { perHari: [], totalMingguan: data.data.totalKaloriMingguan },
          null
        );
      }
      // load daftar belanja
      await loadDaftarBelanjaRencana(currentRencanaId);
      // show both buttons (Konfirmasi visible even before any checkbox is ticked)
      const btnKonf = document.getElementById("tombolKonfirmasi");
      if (btnKonf) btnKonf.style.display = "inline-block";
      // show 'Kirim ke Email' button so user can send the saved rencana
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
        // No shopping items remain — show empty message and hide action buttons
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

      // show kirim + konfirmasi buttons when a rencana exists (Konfirmasi stays visible even if nothing is checked)
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
      // show up to 2 decimals, trim trailing zeros
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

        if (!currentRencanaId) return; // only update server if rencana exists
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
      // NOTE: move the checkbox to its own column on the right so rows stay aligned
      const checkboxWrapper = document.createElement("div");
      checkboxWrapper.className = "checkbox-wrap";
      checkboxWrapper.style.display = "inline-flex";
      checkboxWrapper.style.alignItems = "center";
      checkboxWrapper.style.justifyContent = "center";
      checkboxWrapper.appendChild(checkbox);

      // expiry display for chosen storage (note: expiry is a separate column so it doesn't affect layout)
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
      // bulk add to pantry
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
      // indicate whether average per-day meets target
      const avgPerDay = Math.round(
        kaloriSummary.totalMingguan / (kaloriSummary.perHari.length || 7)
      );
      const ok =
        Math.abs(avgPerDay - targetKaloriHarian) <=
        Math.round(targetKaloriHarian * 0.15); // within 15%
      txt += ` • Target harian: ${targetKaloriHarian} kkal (${
        ok ? "OK" : "Tidak sesuai"
      })`;
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
          // map simple presets to target calories
          let targetKaloriHarian = null;
          if (pilihanDiet === "kalori_1500") targetKaloriHarian = 1500;
          if (pilihanDiet === "kalori_1800") targetKaloriHarian = 1800;
          if (pilihanDiet === "kalori_2000") targetKaloriHarian = 2000;
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
          renderMenuMingguan(data.data.menuMingguan);
          // show calorie info if server sent it
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
  // current recommendation source: 'kadaluarsa' (we intentionally restrict to expiring items only)
  let currentRecommendationSource = "kadaluarsa";

  async function loadPantryChallenge() {
    // default: use server-side default (3 days)
    // ensure pantry cache is loaded so we can mark matches when showing recipes
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

      // Primary: recommend based on expiring items only
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

      // If no expiring ingredients at all, show message and stop (no pantry fallback)
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

  // Try to find recipes that specifically match expiring ingredients
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
      // Filter results to only those that include at least one of the expiring ingredients
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
      // Sort by expMatches desc, then by estimatedMatch/persen
      enhanced.sort(
        (a, b) =>
          b.expMatches - a.expMatches ||
          (b.estimatedMatch || b.persentaseKecocokan || 0) -
            (a.estimatedMatch || a.persentaseKecocokan || 0)
      );
      // Render but annotate name with expiring match count inside renderRekomendasi we will use presentCount; for now pass entries as-is
      renderRekomendasi(enhanced);
      // add small note
      const titleEl = document.getElementById("rekomendasiTitle");
      if (titleEl)
        titleEl.textContent = `Rekomendasi berdasarkan bahan hampir kadaluarsa (menyesuaikan yang paling cocok)`;
      return true;
    } catch (err) {
      console.error("Gagal cari resep berdasarkan kadaluarsa", err);
      return false;
    }
  }

  // Pantry cache of ingredient names (lowercase)
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

  // Toggle detail (fetch first time, then show/hide)
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

    // show
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

    // If recommending specifically for kadaluarsa, show only recipes that explicitly contain at least one expiring ingredient
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
    // Try load automatically when on pantry page
    const onPantry =
      document.getElementById("rekomendasiPantry") ||
      document.getElementById("bahanHampirKadaluarsa");
    if (onPantry) setTimeout(() => loadPantryChallenge(), 100);
  }

  await loadDaftarBahan();
  // Load initial recipe list if on recipe page
  setTimeout(() => loadDaftarResep(), 0);

  // Delegate clicks for server-rendered recipe cards (if any) so clicking card navigates to detail page
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

  // Show welcome notification only when redirected after successful login
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("welcome") === "1") {
      // show then remove param from URL to prevent re-showing on refresh
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
      // Allow socket 'connect' to also show if it connects very shortly after login (fallback)
      try {
        sessionStorage.setItem("koki_show_connect_ts", String(Date.now()));
      } catch (e) {}
      // remove 'welcome' query param without reloading
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

  // Initialize stats animation now (if values already present) and ensure it will trigger on future updates
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

  // Clear inputs
  document.getElementById("inputNamaBahanForm").value = "";
  document.getElementById("inputJumlahBahanForm").value = "";
  document.getElementById("inputSatuanBahanForm").value = "gram";

  // Render list
  renderDaftarBahanForm();

  // Focus back to nama input
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

  // Allow Enter key to add bahan
  const inputNama = document.getElementById("inputNamaBahanResep");
  if (inputNama) {
    inputNama.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tambahBahanKeResep();
      }
    });
  }

  // Handle form submission to prepare daftarBahanHidden
  const form = document.querySelector("form[action='/admin/resep']");
  if (form) {
    form.addEventListener("submit", (e) => {
      updateDaftarBahanHidden();
      if (daftarBahanResepBaru.length === 0) {
        e.preventDefault();
        tampilkanNotifikasi("Tambahkan minimal satu bahan", "error");
      }
    });
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

  // Clear inputs
  document.getElementById("inputNamaBahanResep").value = "";
  document.getElementById("inputJumlahBahanResep").value = "";
  document.getElementById("inputSatuanBahanResep").value = "gram";

  // Render list
  renderDaftarBahanResep();

  // Focus back to nama input
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
}

function updateDaftarBahanHidden() {
  const hidden = document.getElementById("daftarBahanHidden");
  if (hidden) {
    hidden.value = daftarBahanResepBaru
      .map((b) => `${b.nama} ${b.jumlah} ${b.satuan}`)
      .join("\n");
  }
}
