// basic chatbot + AI recipe suggestion helper
const OpenAI = require("openai");
const Resep = require("../models/Resep");
const { panggilOpenRouter } = require("./layananOpenRouter");

/**
 * Clean up dan format recipe output untuk tampilan yang rapi dan profesional
 */
const formatRecipeOutput = (teks) => {
  if (!teks || typeof teks !== "string") return teks;

  let formatted = teks;

  // STEP 1: Remove unwanted markdown
  formatted = formatted.replace(/\*+/g, "");
  formatted = formatted.replace(/_{2,}/g, "");
  // Remove markdown heading syntax (###, ##, #)
  formatted = formatted.replace(/#+\s+/g, "");

  // STEP 2: Add newlines after section headers that don't have them
  // Fix patterns like "Bahan:-" → "Bahan:\n-"
  formatted = formatted.replace(
    /^(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):([^ \n\n])/gm,
    "$1:\n\n$2"
  );

  // STEP 3: Fix section headers that appear after text/punctuation without newline
  // Handles patterns like "minyak.Langkah:" → "minyak.\n\nLangkah:"
  formatted = formatted.replace(
    /([.!?])(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/g,
    "$1\n\n$2:"
  );

  // STEP 3B: Fix section headers that appear directly after text without any separator
  // Handles patterns like "airLangkah:", "TajikanTips:", "rasaWaktu:", "salamTopping:" etc.
  // Must come BEFORE the next step that looks for non-punctuated text
  formatted = formatted.replace(
    /([a-z])(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/g,
    "$1\n\n$2:"
  );

  // STEP 4: Fix section headers - ensure they have proper spacing with newlines before
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
    // Match word character before header and add double newline
    const regex = new RegExp(
      `(\\S)(${header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "g"
    );
    formatted = formatted.replace(regex, `$1\n\n$2`);
  });

  // STEP 5: Ensure section headers that start at beginning have spacing
  // Add spacing before section headers that don't have it
  formatted = formatted.replace(
    /^(?![\n\n])(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/gm,
    "\n\n$1:"
  );

  // STEP 6: Fix metadata (Waktu/Porsi) that appear directly after tips without newline
  // Handles patterns like "kesegaran" + "Waktu:" or tips ending + "Waktu:"
  formatted = formatted.replace(/([a-z])(Waktu|Porsi):/g, "$1\n\n$2:");

  // STEP 7: Fix "Waktu:" and "Porsi:" that appear on same line
  // Handles patterns like "Waktu: 40 menitPorsi:" → separate them
  formatted = formatted.replace(/(Waktu:\s*\d+\s*menit)(Porsi:)/g, "$1\n\n$2");

  // Also handle reversed order: Porsi followed by Waktu
  formatted = formatted.replace(/(Porsi:\s*\d+\s*orang)(Waktu:)/g, "$1\n\n$2");

  // STEP 8: Aggressively split "- " patterns that appear without preceding newline
  // This converts "text- item" or "- item1- item2" into proper separate lines
  formatted = formatted.replace(/([^\n])- /g, "$1\n- ");

  // STEP 9: Split numbered items that are combined on one line
  // Handles patterns like "...something2. Next step" or "...something5. text"
  formatted = formatted.replace(/([.!?)])(\d+\.)/g, "$1\n$2"); // Includes closing parenthesis
  formatted = formatted.replace(/([.!?])(\d+\.)/g, "$1\n$2"); // Original pattern
  // Also handle when there's no punctuation before a number (for step 4-5 combined scenario)
  formatted = formatted.replace(/([a-zA-Z])(\d+\.)/g, "$1\n$2");

  // STEP 10: Ensure bullets and numbers have spaces after them
  formatted = formatted.replace(/^- (?! )/gm, "- ");
  formatted = formatted.replace(/^(\d+\.)(?! )/gm, "$1 ");

  // STEP 11: Clean up multiple spaces
  formatted = formatted.replace(/  +/g, " ");

  // STEP 12: Remove trailing whitespace on lines
  formatted = formatted.replace(/\s+\n/g, "\n");

  // STEP 13: Normalize newlines before headers (ensure exactly 2 newlines before each section)
  formatted = formatted.replace(
    /\n\n+(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/g,
    "\n\n$1:"
  );

  // STEP 14: Add bold formatting to section headers
  // Wrap section headers with ** for markdown bold
  formatted = formatted.replace(
    /^(Bahan|Langkah|Tips|Catatan|Persiapan|Memasak|Nutrisi|Cara Membuat|Waktu|Porsi|Bumbu|Bumbu Halus|Pelengkap|Toppings|Topping):/gm,
    "**$1:**"
  );

  // STEP 15: Clean up excessive newlines (but preserve double breaks for sections)
  formatted = formatted.replace(/\n{3,}/g, "\n\n");

  // STEP 16: Trim
  formatted = formatted.trim();

  return formatted;
};

/**
 * Process user message dan return formatted response
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

  // Try OpenAI if key present
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

      // parse JSON safely
      let parsed = [];
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        // attempt to extract JSON substring
        const m = text.match(/(\[.*\])/s);
        if (m) parsed = JSON.parse(m[1]);
        else throw e;
      }
      return { sukses: true, data: parsed };
    } catch (err) {
      console.error("❌ OpenAI saranResep error:", err);
      // fall through to fallback
    }
  }

  // Fallback: local matching using Resep collection
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
