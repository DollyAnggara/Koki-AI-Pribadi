// sederhana: hitungNutrisiResep(daftarBahan, jumlahPorsi)
const convertToGram = (jumlah, satuan) => {
  if (!jumlah) return null;
  if (!satuan) return null;
  const s = String(satuan).toLowerCase();
  if (/^g$|gram|gr/.test(s)) return jumlah;
  if (/^kg/.test(s)) return jumlah * 1000;
  if (/^mg/.test(s)) return jumlah / 1000;
  if (/^l$|liter/.test(s)) return jumlah * 1000; // approximate (1L ~ 1000g)
  if (/^ml/.test(s)) return jumlah;
  if (/sdm|sendok\s*makan/.test(s)) return jumlah * 15; // 1 sdm ~ 15g
  if (/sdt|sendok\s*teh/.test(s)) return jumlah * 5; // 1 sdt ~ 5g
  if (/butir|buah/.test(s)) return jumlah * 50; // fallback per-item ~50g
  if (/potong|iris|slice/.test(s)) return jumlah * 100; // fallback
  return null;
};

const safeNum = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);

const hitungNutrisiResep = (daftarBahan, jumlahPorsi = 1) => {
  // ensure safe defaults
  if (!Array.isArray(daftarBahan)) daftarBahan = [];
  jumlahPorsi = Number(jumlahPorsi) || 1;

  const total = { kalori: 0, protein: 0, lemak: 0, karbohidrat: 0 };
  let contributed = false;

  for (const b of daftarBahan) {
    if (!b) continue;
    // mencoba mencari data nutrisi per 100g.
    const nutr100 = b.nutrisiPer100g || b.nutrisi || b.nutrisi100 || {};

    // hitung berat dalam gram jika memungkinkan
    let beratGram = null;
    if (typeof b.beratGram === 'number') beratGram = b.beratGram;
    else beratGram = convertToGram(b.jumlah, b.satuan);

    // jika kita memiliki nutrisi per 100g dan jumlah atau beratGram, kita dapat menambahkan
    if (
      (nutr100 && (nutr100.kalori || nutr100.kcal || nutr100.protein || nutr100.lemak || nutr100.karbohidrat)) &&
      (beratGram !== null)
    ) {
      const factor = beratGram / 100;
      total.kalori += safeNum(nutr100.kalori || nutr100.kcal) * factor;
      total.protein += safeNum(nutr100.protein) * factor;
      total.lemak += safeNum(nutr100.lemak) * factor;
      total.karbohidrat += safeNum(nutr100.karbohidrat) * factor;
      contributed = true;
    }
  }

  // Jika tidak ada yang berkontribusi (tidak ada data per-100g), kembalikan nol tetapi tetap buat fungsi dapat diprediksi
  const perPorsi = {
    kalori: Math.round(total.kalori / jumlahPorsi) || 0,
    protein: Math.round(total.protein * 10) / 10 || 0,
    lemak: Math.round(total.lemak * 10) / 10 || 0,
    karbohidrat: Math.round(total.karbohidrat * 10) / 10 || 0,
  };

  return {
    nutrisiPerPorsi: perPorsi,
    totalNutrisi: {
      kalori: Math.round(total.kalori) || 0,
      protein: Math.round(total.protein * 10) / 10 || 0,
      lemak: Math.round(total.lemak * 10) / 10 || 0,
      karbohidrat: Math.round(total.karbohidrat * 10) / 10 || 0,
    },
    jumlahPorsi,
    estimasi: contributed,
  };
};

module.exports = { hitungNutrisiResep };