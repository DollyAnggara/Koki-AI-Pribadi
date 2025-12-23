// chatbot dasar + pembantu saran resep AI
const OpenAI = require("openai");
const Resep = require("../models/Resep");
const { panggilOpenRouter } = require("./layananOpenRouter");

/**
 * Clean up dan format recipe output untuk tampilan yang rapi dan profesional
 */
const formatRecipeOutput = (teks) => {
  if (!teks || typeof teks !== "string") return teks;

  let formatted = teks;

  // STEP 1: Hapus markdown yang tidak diinginkan
  formatted = formatted.replace(/\*+/g, "");
  formatted = formatted.replace(/_{2,}/g, "");
  // Hapus sintaks heading markdown (###, ##, #)
  formatted = formatted.replace(/#+\s+/g, "");

  // STEP 2: Tambahkan newline setelah header bagian yang tidak memilikinya
  // Perbaiki pola seperti "Bahan:-" → "Bahan:\n-"
  formatted = formatted.replace(
    /^(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):([^ \n\n])/gm,
    "$1:\n\n$2"
  );

  // STEP 3: Perbaiki header bagian yang muncul setelah teks/tanda baca tanpa newline
  // Menangani pola seperti "minyak.Langkah:" → "minyak.\n\nLangkah:"
  formatted = formatted.replace(
    /([.!?])(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/g,
    "$1\n\n$2:"
  );

  // STEP 3B: Perbaiki header bagian yang muncul langsung setelah teks tanpa pemisah apapun
  // Menangani pola seperti "airLangkah:", "TajikanTips:", "rasaWaktu:", "salamTopping:" dll.
  // Harus datang SEBELUM langkah berikut yang mencari teks tanpa tanda baca
  formatted = formatted.replace(
    /([a-z])(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/g,
    "$1\n\n$2:"
  );

  // STEP 4: Perbaiki header bagian - pastikan memiliki spasi/newline yang tepat sebelum header
  const sections = [
    "Bahan:",
    "Langkah:",
    "Tips:",
    "Persiapan:",
    "Memasak:",
    "Nutrisi:",
    "Cara Membuat:",
    "Waktu:",
    "Porsi:",
    "Untuk:",
    "Catatan:",
    "Bumbu:",
    "Bumbu Halus:",
    "Pelengkap:",
    "Toppings:",
    "Topping:",
  ];

  sections.forEach((header) => {
    // Cocokkan karakter kata sebelum header dan tambahkan baris baru ganda
    const regex = new RegExp(
      `(\\S)(${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "g"
    );
    formatted = formatted.replace(regex, `$1\n\n$2`);
  });

  // STEP 5: Pastikan header bagian yang dimulai dari awal memiliki spasi
  // Tambahkan spasi sebelum header bagian yang belum memilikinya
  formatted = formatted.replace(
    /^(?![\n\n])(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/gm,
    "\n\n$1:"
  );

  // STEP 6: Perbaiki metadata (Waktu/Porsi) yang muncul langsung setelah tips tanpa newline
  // Menangani pola seperti "kesegaran" + "Waktu:" atau tips yang diakhiri + "Waktu:"
  formatted = formatted.replace(/([a-z])(Waktu|Porsi):/g, "$1\n\n$2:");

  // STEP 7: Perbaiki "Waktu:" dan "Porsi:" yang muncul pada baris yang sama
  // Menangani pola seperti "Waktu: 40 menitPorsi:" → pisahkan mereka
  formatted = formatted.replace(/(Waktu:\s*\d+\s*menit)(Porsi:)/g, "$1\n\n$2");

  // Also handle reversed order: Porsi followed by Waktu
  formatted = formatted.replace(/(Porsi:\s*\d+\s*orang)(Waktu:)/g, "$1\n\n$2");

  // STEP 8: Pisahkan agresif pola "- " yang muncul tanpa newline sebelumnya
  // Ini mengubah "text- item" atau "- item1- item2" menjadi baris terpisah yang benar
  formatted = formatted.replace(/([^\n])- /g, "$1\n- ");

  // STEP 9: Pisahkan item bernomor yang digabung pada satu baris
  // Menangani pola seperti "...something2. Next step" atau "...something5. text"
  formatted = formatted.replace(/([.!?)])(\d+\.)/g, "$1\n$2"); // Termasuk tanda kurung penutup
  formatted = formatted.replace(/([.!?])(\d+\.)/g, "$1\n$2"); // Pola asli
  // Juga tangani ketika tidak ada tanda baca sebelum angka (untuk skenario langkah 4-5 digabung)
  formatted = formatted.replace(/([a-zA-Z])(\d+\.)/g, "$1\n$2");

  // STEP 10: Pastikan bullets dan angka memiliki spasi setelahnya
  formatted = formatted.replace(/^- (?! )/gm, "- ");
  formatted = formatted.replace(/^(\d+\.)(?! )/gm, "$1 ");

  // STEP 11: Bersihkan spasi berlebih
  formatted = formatted.replace(/  +/g, " ");

  // STEP 12: Hapus whitespace di akhir baris
  formatted = formatted.replace(/\s+\n/g, "\n");

  // STEP 13: Normalisasi newline sebelum header (pastikan tepat 2 newline sebelum setiap bagian)
  formatted = formatted.replace(
    /\n\n+(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/g,
    "\n\n$1:"
  );

  // STEP 14: Tambahkan format bold ke header bagian
  // Bungkus header bagian dengan ** untuk bold markdown
  formatted = formatted.replace(
    /^(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/gm,
    "**$1:**"
  );

  // STEP 15: Bersihkan newline berlebihan (tetap pertahankan double break untuk section)
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  // STEP 16: Trim
  formatted = formatted.trim();

  return formatted;
};

/**
 * Proses pesan pengguna dan kembalikan respons yang diformat
 */
const prosesPercakapan = async (idSesi, pesan) => {
  const prompt = `Anda adalah Koki AI, asisten memasak profesional dari Indonesia.

INSTRUKSI PENTING:
1. Berikan respon yang TERSTRUKTUR dengan format JELAS
2. Pisahkan SETIAP bagian dengan newline/baris baru
3. Gunakan format seperti ini:

Bahan:
- item 1
- item 2
- item 3

Langkah:
1. Deskripsi langkah pertama
2. Deskripsi langkah kedua
3. Deskripsi langkah ketiga

Tips:
- tip 1
- tip 2
- tip 3

Waktu: X menit
Porsi: X orang

JANGAN:
- Tidak boleh menggabungkan beberapa item dalam satu baris
- Tidak boleh menghilangkan newline/spasi antar item
- Tidak boleh mengulangi pertanyaan user
- LANGSUNG KE JAWABAN

Pertanyaan pengguna: ${pesan}`;

  const teks = await panggilOpenRouter(prompt, {
    maxTokens: 2000,
    temperature: 0.7,
    maxContinuations: 3,
  });

  // Format output untuk tampilan rapi
  const formatted = formatRecipeOutput(teks);

  return { sukses: true, pesan: formatted };
};

/**
 * saranResep(daftarBahan, preferensi)
 * - Jika OPENAI_API_KEY ada, gunakan model chat untuk menghasilkan daftar saran resep (diformat JSON)
 * - Jika tidak, lakukan fallback lokal dengan mencocokkan resep berdasarkan nama bahan
 */
const saranResep = async (daftarBahan = [], preferensi = {}) => {
  if (!Array.isArray(daftarBahan)) daftarBahan = [];

  // Coba OpenAI jika OPENAI_API_KEY tersedia
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const prompt = `Anda adalah asisten memasak profesional yang memahami masakan Indonesia. 
Diberikan bahan-bahan berikut: ${daftarBahan.join(", ")}.
Sarankan hingga 6 ide resep yang dapat dibuat dari bahan-bahan tersebut.
Untuk setiap resep, kembalikan JSON object dengan kunci: name, description, missingIngredients (array), estimatedMatch (integer 0-100).
Kembalikan hanya JSON array tanpa teks tambahan.`;
      const resp = await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful Indonesian cooking assistant. Return only valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
      });
      const text = resp?.choices?.[0]?.message?.content;
      if (!text) return { sukses: false, pesan: "AI tidak mengembalikan teks" };

      // parse JSON dengan aman
      let parsed = [];
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // coba ekstrak substring JSON
        const m = text.match(/(\[.*\])/s);
        if (m) parsed = JSON.parse(m[1]);
        else throw e;
      }
      return { sukses: true, data: parsed };
    } catch (err) {
      console.error("❌ OpenAI saranResep error:", err);
      // lanjut ke fallback
    }
  }

  // falback: pencocokan lokal menggunakan koleksi Resep.
  try {
    const semua = await Resep.find();
    const daftarLower = daftarBahan.map((x) => String(x).toLowerCase());
    const hasil = semua
      .map((r) => {
        const bahanResep = (r.daftarBahan || []).map((b) =>
          b.namaBahan.toLowerCase()
        );
        let cocok = 0;
        for (const b of daftarLower) {
          if (bahanResep.some((br) => br.includes(b) || b.includes(br)))
            cocok++;
        }
        const persen = Math.round((cocok / (bahanResep.length || 1)) * 100);
        const bahanKurang = (r.daftarBahan || []).filter(
          (b) => !daftarLower.some((d) => b.namaBahan.toLowerCase().includes(d))
        );
        return {
          name: r.namaResep,
          description: r.deskripsi || "",
          estimatedMatch: persen,
          missingIngredients: bahanKurang.map((x) => x.namaBahan),
          recipeId: r._id,
        };
      })
      .filter((x) => x.estimatedMatch >= 25)
      .sort((a, b) => b.estimatedMatch - a.estimatedMatch)
      .slice(0, 8);
    return { sukses: true, data: hasil };
  } catch (err) {
    console.error("❌ Fallback saranResep error:", err);
    return { sukses: false, pesan: "Gagal menghasilkan saran" };
  }
};

module.exports = { prosesPercakapan, saranResep };
