// Helper admin untuk approve/reject di halaman pending
async function postJson(url, body) {
  const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
  return resp.json();
}

document.addEventListener('click', async (e)=>{
  const btn = e.target;
  if (btn.dataset.approveId) {
    const confirmed = await showConfirmModal({
      title: 'Setujui resep',
      message: 'Setujui resep ini?',
      okLabel: 'Setujui',
      cancelLabel: 'Batal',
    });
    if (!confirmed) return;
    const id = btn.dataset.approveId;
    btn.disabled = true; btn.classList.add('sedang');
    try {
      const data = await postJson('/admin/resep/'+id+'/approve');
      if (data.sukses) { showToast('Resep disetujui'); location.reload(); } else showToast('Gagal: '+(data.pesan||''), true);
    } catch(err) { showToast('Gagal koneksi', true); }
    finally { btn.disabled = false; btn.classList.remove('sedang'); }
  }
  if (btn.dataset.rejectId) {
    const note = await showPromptModal({
      title: 'Tolak resep',
      message: 'Alasan penolakan (opsional)',
      placeholder: 'Masukkan alasan (opsional)'
    });
    if (note === null) return;
    const id = btn.dataset.rejectId;
    btn.disabled = true; btn.classList.add('sedang');
    try {
      const data = await postJson('/admin/resep/'+id+'/reject', { moderationNote: note });
      if (data.sukses) { showToast('Resep ditolak'); location.reload(); } else showToast('Gagal: '+(data.pesan||''), true);
    } catch(err) { showToast('Gagal koneksi', true); }
    finally { btn.disabled = false; btn.classList.remove('sedang'); }
  }
});

// Tangkap klik tombol hapus (.btn-delete-resep) untuk menampilkan modal konfirmasi
// Ini mencegah submit langsung yang tidak disengaja dan bekerja konsisten di berbagai browser.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.btn-delete-resep');
  if (!btn) return;
  e.preventDefault();
  // find the enclosing form
  const form = btn.closest('form.form-confirm-delete');
  if (!form) return;

  try {
    const confirmed = await showConfirmModal({
      title: 'Hapus resep',
      message: 'Yakin ingin menghapus resep ini?',
      okLabel: 'Hapus',
      cancelLabel: 'Batal',
    });
    if (!confirmed) return;
    // submit form secara programatis
    form.submit();
  } catch (err) {
    console.error('Error confirming delete (button):', err);
  }
});

// Cadangan: Tangkap submit untuk konfirmasi hapus (form dengan class .form-confirm-delete)
document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form || !form.classList || !form.classList.contains('form-confirm-delete')) return;
  // Jika form dipicu oleh handler tombol kami, itu sudah terkonfirmasi; namun kami tetap menampilkan konfirmasi sebagai langkah keamanan.
  e.preventDefault();
  try {
    const confirmed = await showConfirmModal({
      title: 'Hapus resep',
      message: 'Yakin ingin menghapus resep ini?',
      okLabel: 'Hapus',
      cancelLabel: 'Batal',
    });
    if (!confirmed) return;
    // Kirim form secara normal
    form.submit();
  } catch (err) {
    console.error('Error confirming delete (submit):', err);
  }
});

// --- Toggle Grid / Table + filter pencarian ---
document.addEventListener('DOMContentLoaded', ()=>{
  const root = document.querySelector('.admin-resep-list');
  if (!root) return;

  const btnGrid = document.getElementById('btnGrid');
  const btnTable = document.getElementById('btnTable');
  const input = document.getElementById('resepSearch');
  const grid = root.querySelector('.resep-grid');
  const table = root.querySelector('.tabel.admin-table');
  const totalEl = root.querySelector('.resep-meta .total strong');

  // atur tampilan awal berdasarkan class atau localStorage
  const saved = localStorage.getItem('resepView');
  const initial = saved || (root.classList.contains('view-grid') ? 'grid' : 'table');
  setView(initial);

  btnGrid.addEventListener('click', ()=> setView('grid'));
  btnTable.addEventListener('click', ()=> setView('table'));

  function setView(v){
    localStorage.setItem('resepView', v);
    root.classList.toggle('view-grid', v==='grid');
    root.classList.toggle('view-table', v==='table');
    btnGrid.classList.toggle('active', v==='grid');
    btnTable.classList.toggle('active', v==='table');
  }

  // helper debounce untuk menunda pemanggilan fungsi
  function debounce(fn, ms=200){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } }

  function updateCounts(visibleCount){
    if (totalEl) totalEl.textContent = visibleCount;
  }

  function filterItems(q){
    q = (q||'').trim().toLowerCase();
    let visible = 0;

    // saring kartu
    if (grid) {
      const cards = Array.from(grid.querySelectorAll('.resep-card'));
      cards.forEach(card => {
        const text = (card.textContent||'').toLowerCase();
        const match = !q || text.indexOf(q) !== -1;
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });
    }

    // saring baris tabel
    if (table) {
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      rows.forEach(row => {
        const text = (row.textContent||'').toLowerCase();
        const match = !q || text.indexOf(q) !== -1;
        row.style.display = match ? '' : 'none';
        if (match && (!grid || grid.querySelectorAll('.resep-card[style*="display: none"]').length === 0)) {
          // jika keduanya ada, penghitungan ditangani oleh grid/kartu; jika hanya tabel, hitung baris yang cocok
        }
      });
      // jika saat ini menampilkan tabel, visible adalah baris yang cocok
      if (root.classList.contains('view-table')){
        visible = Array.from(table.querySelectorAll('tbody tr')).filter(r=> r.style.display !== 'none').length;
      }
    }

    // Jika grid terlihat, visibilitas ditangani di atas.
    if (root.classList.contains('view-grid') && grid){
      visible = Array.from(grid.querySelectorAll('.resep-card')).filter(c => c.style.display !== 'none').length;
    }

    updateCounts(visible);
  }

  const onInput = debounce((e)=> filterItems(e.target.value), 200);
  if (input) input.addEventListener('input', onInput);

  // inisialisasi hitungan
  const initialVisible = root.classList.contains('view-table') && table ? table.querySelectorAll('tbody tr').length : (grid ? grid.querySelectorAll('.resep-card').length : 0);
  updateCounts(initialVisible);
});
