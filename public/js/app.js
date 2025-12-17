/* public/js/app.js — frontend behavior (cleaned from provided inline script)
   Note: avoid syntax errors caused by extra spaces before dots or incorrect selectors.
*/
const API_URL = 'http://localhost:3000/api';
let soketMemasak = null;
let soketNotifikasi = null;
let idSesiChat = 'sesi_' + Date.now();
let daftarTimerAktif = new Map();
let idTimerCounter = 1;

function inisialisasiSocket() {
  soketMemasak = io('http://localhost:3000/memasak');

  soketMemasak.on('connect', () => {
    console.log('✅ Terhubung ke server memasak');
    tampilkanNotifikasi('Terhubung ke Koki AI', 'sukses');
  });

  soketMemasak.on('respons_koki', (data) => {
    sembunyikanIndikatorMengetik();
    tambahPesanChat(data.pesan, 'koki');
  });

  soketMemasak.on('koki_mengetik', (data) => {
    if (data.status) tampilkanIndikatorMengetik(); else sembunyikanIndikatorMengetik();
  });

  soketMemasak.on('update_timer', (data) => updateTampilanTimer(data.idTimer, data));
  soketMemasak.on('timer_selesai', (data) => {
    tampilkanNotifikasi(`⏰ ${data.namaTimer} sudah selesai!`, 'peringatan');
    playBunyi();
    hapusTimerDariTampilan(data.idTimer);
  });
  soketMemasak.on('peringatan_timer', (data) => tampilkanNotifikasi(data.pesan, 'info'));

  soketNotifikasi = io('http://localhost:3000/notifikasi');
  soketNotifikasi.on('connect', () => console.log('✅ Terhubung ke notifikasi'));
  soketNotifikasi.on('notifikasi_baru', (data) => tampilkanNotifikasi(data.pesan, data.tipe || 'info'));
}

function inisialisasiNavigasi() {
  const tombolNav = document.querySelectorAll('.tombol-nav');
  const panels = document.querySelectorAll('.panel');
  tombolNav.forEach(tombol => {
    tombol.addEventListener('click', () => {
      tombolNav.forEach(t => t.classList.remove('aktif'));
      panels.forEach(p => p.classList.remove('aktif'));
      tombol.classList.add('aktif');
      const panelId = 'panel' + kapitalisasi(tombol.dataset.panel);
      const el = document.getElementById(panelId);
      if (el) el.classList.add('aktif');
    });
  });
}

function inisialisasiChat() {
  const formChat = document.getElementById('formChat');
  const inputPesan = document.getElementById('inputPesan');
  if (!formChat) return;
  formChat.addEventListener('submit', (e) => {
    e.preventDefault();
    const pesan = inputPesan.value.trim();
    if (pesan) {
      tambahPesanChat(pesan, 'pengguna');
      inputPesan.value = '';
      soketMemasak.emit('pesan_chat', { pesan });
    }
  });
}

function tambahPesanChat(pesan, tipe) {
  const areaPesan = document.getElementById('areaPesan');
  const divPesan = document.createElement('div');
  divPesan.className = `pesan pesan-${tipe}`;
  divPesan.innerHTML = pesan.replace(/\n/g, '<br>');
  if (areaPesan) { areaPesan.appendChild(divPesan); areaPesan.scrollTop = areaPesan.scrollHeight; }
}

function tampilkanIndikatorMengetik() { const el = document.getElementById('indikatorMengetik'); if (el) el.style.display = 'flex'; }
function sembunyikanIndikatorMengetik() { const el = document.getElementById('indikatorMengetik'); if (el) el.style.display = 'none'; }

function inisialisasiTimer() {
  const tombolBuatTimer = document.getElementById('tombolBuatTimer');
  if (!tombolBuatTimer) return;
  tombolBuatTimer.addEventListener('click', (e) => {
    e.preventDefault();
    const namaTimer = document.getElementById('namaTimerBaru').value.trim();
    const menit = parseInt(document.getElementById('menitTimerBaru').value);
    if (namaTimer && menit > 0) {
      buatTimerBaru(namaTimer, menit);
      document.getElementById('namaTimerBaru').value = '';
      document.getElementById('menitTimerBaru').value = '';
    } else tampilkanNotifikasi('Masukkan nama timer dan durasi yang valid', 'error');
  });
}

function buatTimerBaru(nama, menit) {
  const idTimer = 'timer_' + idTimerCounter++;
  const durasiDetik = menit * 60;
  const kontainerTimer = document.getElementById('daftarTimer');
  if (!kontainerTimer) return;
  const kartuTimer = document.createElement('div');
  kartuTimer.className = 'kartu-timer';
  kartuTimer.id = `kartu_${idTimer}`;
  kartuTimer.innerHTML = `
    <h4>${nama}</h4>
    <div class="tampilan-timer" id="tampilan_${idTimer}">${formatWaktu(durasiDetik)}</div>
    <div class="progress-timer"><div class="progress-bar" id="progress_${idTimer}" style="width:0%"></div></div>
    <div class="kontrol-timer"><button class="tombol-timer tombol-jeda" onclick="jedaTimer('${idTimer}')">⏸️ Jeda</button><button class="tombol-timer tombol-berhenti" onclick="hentikanTimer('${idTimer}')">⏹️ Stop</button></div>
  `;
  kontainerTimer.appendChild(kartuTimer);
  daftarTimerAktif.set(idTimer, { nama, durasiTotal: durasiDetik });
  if (soketMemasak && soketMemasak.connected) soketMemasak.emit('mulai_timer', { idTimer, durasiDetik, namaTimer: nama });
  tampilkanNotifikasi(`Timer "${nama}" dimulai!`, 'sukses');
}

function updateTampilanTimer(idTimer, data) {
  const tampilan = document.getElementById(`tampilan_${idTimer}`);
  const progress = document.getElementById(`progress_${idTimer}`);
  if (tampilan && data.formatWaktu) tampilan.textContent = data.formatWaktu;
  if (progress && typeof data.persentase !== 'undefined') progress.style.width = `${data.persentase}%`;
}

function jedaTimer(idTimer) { if (soketMemasak) soketMemasak.emit('jeda_timer', { idTimer }); tampilkanNotifikasi('Timer dijeda', 'info'); }
function hentikanTimer(idTimer) { if (soketMemasak) soketMemasak.emit('hentikan_timer', { idTimer }); hapusTimerDariTampilan(idTimer); tampilkanNotifikasi('Timer dihentikan', 'info'); }
function hapusTimerDariTampilan(idTimer) { const kartu = document.getElementById(`kartu_${idTimer}`); if (kartu) kartu.remove(); daftarTimerAktif.delete(idTimer); }

function inisialisasiUploadGambar() {
  const areaUpload = document.getElementById('areaUpload');
  const inputGambar = document.getElementById('inputGambar');
  const previewGambar = document.getElementById('previewGambar');
  if (!areaUpload || !inputGambar) return;
  areaUpload.addEventListener('click', () => inputGambar.click());
  areaUpload.addEventListener('dragover', (e) => { e.preventDefault(); areaUpload.classList.add('dragover'); });
  areaUpload.addEventListener('dragleave', () => areaUpload.classList.remove('dragover'));
  areaUpload.addEventListener('drop', (e) => { e.preventDefault(); areaUpload.classList.remove('dragover'); const file = e.dataTransfer.files[0]; if (file && file.type.startsWith('image/')) prosesGambar(file); });
  inputGambar.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) prosesGambar(file); });
}

async function prosesGambar(file) {
  const previewGambar = document.getElementById('previewGambar');
  const hasilIdentifikasi = document.getElementById('hasilIdentifikasi');
  if (previewGambar) {
    const reader = new FileReader();
    reader.onload = (e) => { previewGambar.src = e.target.result; previewGambar.style.display = 'block'; };
    reader.readAsDataURL(file);
  }
  if (hasilIdentifikasi) hasilIdentifikasi.innerHTML = '<p>🔄 Menganalisis gambar...</p>';
  try {
    const formData = new FormData(); formData.append('gambar', file);
    const response = await fetch(`${API_URL}/bahan/identifikasi-gambar`, { method: 'POST', body: formData });
    const data = await response.json();
    if (data.sukses) tampilkanHasilIdentifikasi(data.data); else if (hasilIdentifikasi) hasilIdentifikasi.innerHTML = `<p style="color:red;">❌ ${data.pesan}</p>`;
  } catch (err) { if (hasilIdentifikasi) hasilIdentifikasi.innerHTML = '<p style="color:red;">❌ Gagal mengidentifikasi gambar</p>'; }
}

function tampilkanHasilIdentifikasi(data) {
  const hasilIdentifikasi = document.getElementById('hasilIdentifikasi');
  if (!hasilIdentifikasi) return;
  if (data && data.bahanTeridentifikasi && data.bahanTeridentifikasi.length > 0) {
    let html = '<h4>✅ Bahan Teridentifikasi:</h4><ul>';
    data.bahanTeridentifikasi.forEach(b => { html += `<li>${b.nama} - ${b.estimasiJumlah} ${b.satuanTersarankan} (${b.kategori})</li>`; });
    html += '</ul>';
    if (data.saranResep && data.saranResep.length) { html += '<h4>💡 Saran Resep:</h4><ul>'; data.saranResep.forEach(r => { html += `<li>${r}</li>`; }); html += '</ul>'; }
    hasilIdentifikasi.innerHTML = html;
  } else hasilIdentifikasi.innerHTML = '<p>Tidak ada bahan yang teridentifikasi</p>';
}

function tampilkanNotifikasi(pesan, tipe='info') {
  const kontainer = document.getElementById('kontainerNotifikasi'); if (!kontainer) return;
  const notifikasi = document.createElement('div'); notifikasi.className = `notifikasi ${tipe}`; notifikasi.innerHTML = pesan; kontainer.appendChild(notifikasi);
  setTimeout(() => notifikasi.remove(), 5000);
}

function formatWaktu(detik) { const menit = Math.floor(detik/60); const sisaDetik = detik % 60; return `${menit.toString().padStart(2,'0')}:${sisaDetik.toString().padStart(2,'0')}`; }
function kapitalisasi(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
function playBunyi() { try { const audioCtx = new (window.AudioContext||window.webkitAudioContext)(); const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); osc.frequency.value = 800; osc.type = 'sine'; gain.gain.value = 0.3; osc.start(); setTimeout(()=>osc.stop(),500); } catch (e) { console.warn('Audio not supported', e); } }

document.addEventListener('DOMContentLoaded', () => {
  console.log('🍳 Koki AI Pribadi - Frontend Dimulai');
  inisialisasiNavigasi();
  inisialisasiSocket();
  inisialisasiChat();
  inisialisasiTimer();
  inisialisasiUploadGambar();
  setTimeout(()=>tampilkanNotifikasi('Selamat datang di Koki AI Pribadi! 🍳','sukses'),1000);

  // Toggle password eye for auth pages (target the input inside the same .input-with-icon)
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const img = btn.querySelector('img');
      const container = btn.closest('.input-with-icon');
      const target = container ? container.querySelector('.password-field') : null;
      if (!target) return;

      const isPassword = target.getAttribute('type') === 'password';
      target.setAttribute('type', isPassword ? 'text' : 'password');

      if (img) {
        img.src = isPassword ? (img.dataset.open || img.src) : (img.dataset.closed || img.src);
        img.setAttribute('alt', isPassword ? 'Sembunyikan password' : 'Tampilkan password');
      }

      btn.setAttribute('aria-pressed', String(isPassword));
      btn.title = isPassword ? 'Sembunyikan password' : 'Tampilkan password';
    });
  });

  // Register form client validation (password confirmation) + OTP verification before submit
  document.querySelectorAll('.register-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      const pw = form.querySelector('input[name="kataSandi"]');
      const pwc = form.querySelector('input[name="kataSandiConfirm"]');
      const errEl = document.getElementById('registerError');
      if (pw && pwc && pw.value !== pwc.value) {
        e.preventDefault();
        if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Password dan konfirmasi tidak cocok.'; }
        return false;
      }
      // OTP verification
      const email = form.querySelector('input[name="email"]');
      const otpInput = form.querySelector('input[name="otp"]');
      if (otpInput && email) {
        e.preventDefault();
        const kode = otpInput.value.trim();
        if (!kode) {
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Masukkan kode OTP sebelum mendaftar.'; }
          return false;
        }
        try {
          const resp = await fetch(`${API_URL}/otp/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.value, kode }) });
          const data = await resp.json();
          if (data.sukses) {
            if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
            form.submit(); // submit now that OTP is verified
          } else {
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = data.pesan || 'Verifikasi OTP gagal'; }
          }
        } catch (err) {
          if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Gagal memverifikasi OTP'; }
        }
        return false;
      }
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    });
  });

  // OTP button: send OTP to given email and start cooldown
  document.querySelectorAll('.otp-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const form = btn.closest('form');
      const emailEl = form ? form.querySelector('input[name="email"]') : null;
      if (!emailEl || !emailEl.value) { tampilkanNotifikasi('Masukkan alamat email terlebih dahulu', 'error'); return; }
      btn.disabled = true;
      const originalText = btn.textContent;
      try {
        const resp = await fetch(`${API_URL}/otp/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailEl.value }) });
        const data = await resp.json();
        if (data.sukses) {
          tampilkanNotifikasi(data.pesan || 'Kode OTP dikirim', 'sukses');
        } else {
          tampilkanNotifikasi(data.pesan || 'Gagal mengirim OTP', 'error');
          btn.disabled = false;
          return;
        }
      } catch (err) {
        tampilkanNotifikasi('Gagal mengirim permintaan OTP', 'error');
        btn.disabled = false;
        return;
      }

      // Cooldown countdown (60s)
      let sisa = 60;
      btn.textContent = `Terkirim (${sisa}s)`;
      const interval = setInterval(() => {
        sisa -= 1;
        if (sisa <= 0) { clearInterval(interval); btn.disabled = false; btn.textContent = originalText; }
        else btn.textContent = `Terkirim (${sisa}s)`;
      }, 1000);
    });
  });
});
