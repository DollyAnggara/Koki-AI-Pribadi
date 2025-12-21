// Admin helpers for approve/reject in pending page
async function postJson(url, body) {
  const resp = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body||{}) });
  return resp.json();
}

document.addEventListener('click', async (e)=>{
  const btn = e.target;
  if (btn.dataset.approveId) {
    if (!confirm('Setujui resep ini?')) return;
    const id = btn.dataset.approveId;
    btn.disabled = true; btn.classList.add('sedang');
    try {
      const data = await postJson('/admin/resep/'+id+'/approve');
      if (data.sukses) { showToast('Resep disetujui'); location.reload(); } else showToast('Gagal: '+(data.pesan||''), true);
    } catch(err) { showToast('Gagal koneksi', true); }
    finally { btn.disabled = false; btn.classList.remove('sedang'); }
  }
  if (btn.dataset.rejectId) {
    const note = prompt('Alasan penolakan (opsional)');
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

// small toast helper
function showToast(m, isError) {
  let t = document.createElement('div');
  t.className = 'admin-toast' + (isError ? ' error' : '');
  t.textContent = m;
  t.style.position = 'fixed';
  t.style.right = '18px';
  t.style.bottom = '18px';
  t.style.padding = '10px 14px';
  t.style.borderRadius = '8px';
  t.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
  t.style.background = isError ? '#f8d7da' : '#dff0d8';
  t.style.color = isError ? '#7d1b1b' : '#194d19';
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.transition = 'opacity 0.3s'; t.style.opacity = '0'; setTimeout(()=>t.remove(),350); }, 2000);
}

// --- Grid / Table toggle + search filtering ---
document.addEventListener('DOMContentLoaded', ()=>{
  const root = document.querySelector('.admin-resep-list');
  if (!root) return;

  const btnGrid = document.getElementById('btnGrid');
  const btnTable = document.getElementById('btnTable');
  const input = document.getElementById('resepSearch');
  const grid = root.querySelector('.resep-grid');
  const table = root.querySelector('.tabel.admin-table');
  const totalEl = root.querySelector('.resep-meta .total strong');

  // set initial view based on class or localStorage
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

  // debounce helper
  function debounce(fn, ms=200){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); } }

  function updateCounts(visibleCount){
    if (totalEl) totalEl.textContent = visibleCount;
  }

  function filterItems(q){
    q = (q||'').trim().toLowerCase();
    let visible = 0;

    // filter cards
    if (grid) {
      const cards = Array.from(grid.querySelectorAll('.resep-card'));
      cards.forEach(card => {
        const text = (card.textContent||'').toLowerCase();
        const match = !q || text.indexOf(q) !== -1;
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });
    }

    // filter table rows
    if (table) {
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      rows.forEach(row => {
        const text = (row.textContent||'').toLowerCase();
        const match = !q || text.indexOf(q) !== -1;
        row.style.display = match ? '' : 'none';
        if (match && (!grid || grid.querySelectorAll('.resep-card[style*="display: none"]').length === 0)) {
          // if both exist, counting handled by grid/cards; but if table-only, count matches
        }
      });
      // if currently showing table, visible should be rows matching
      if (root.classList.contains('view-table')){
        visible = Array.from(table.querySelectorAll('tbody tr')).filter(r=> r.style.display !== 'none').length;
      }
    }

    // if grid visible, visible is handled above
    if (root.classList.contains('view-grid') && grid){
      visible = Array.from(grid.querySelectorAll('.resep-card')).filter(c => c.style.display !== 'none').length;
    }

    updateCounts(visible);
  }

  const onInput = debounce((e)=> filterItems(e.target.value), 200);
  if (input) input.addEventListener('input', onInput);

  // initialize counts
  const initialVisible = root.classList.contains('view-table') && table ? table.querySelectorAll('tbody tr').length : (grid ? grid.querySelectorAll('.resep-card').length : 0);
  updateCounts(initialVisible);
});
