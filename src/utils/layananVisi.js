// placeholder identifikasi gambar
const identifikasiBahanDariBuffer = async (buffer, mimeType='image/jpeg') => ({ sukses:true, data:{ bahanTeridentifikasi: [{ nama:'Wortel', estimasiJumlah:'200', satuanTersarankan:'gram' }], saranResep:['Sup Wortel'] }});
module.exports = { identifikasiBahanDariBuffer };