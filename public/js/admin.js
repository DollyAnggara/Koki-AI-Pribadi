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
    const data = await postJson('/admin/resep/'+id+'/approve');
    if (data.sukses) { alert('Resep disetujui'); location.reload(); } else alert('Gagal: '+(data.pesan||''));
  }
  if (btn.dataset.rejectId) {
    const note = prompt('Alasan penolakan (opsional)');
    if (note === null) return;
    const id = btn.dataset.rejectId;
    const data = await postJson('/admin/resep/'+id+'/reject', { moderationNote: note });
    if (data.sukses) { alert('Resep ditolak'); location.reload(); } else alert('Gagal: '+(data.pesan||''));
  }
});
