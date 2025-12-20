// basic chatbot + AI recipe suggestion helper
const OpenAI = require('openai');
const Resep = require('../models/Resep');

const prosesPercakapan = async (idSesi, pesan) => ({ sukses: true, pesan: `Saya menerima: ${pesan}` });

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
      const prompt = `You are a helpful cooking assistant. Given these available ingredients: ${daftarBahan.join(", ")}. Suggest up to 6 recipe ideas that primarily use these ingredients. For each recipe return a JSON object with keys: name, description, missingIngredients (array), estimatedMatch (integer 0-100). Return only a JSON array.`;
      const resp = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful cooking assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 600
      });
      const text = resp?.choices?.[0]?.message?.content;
      if (!text) return { sukses: false, pesan: 'AI tidak mengembalikan teks' };

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
      console.error('❌ OpenAI saranResep error:', err);
      // fall through to fallback
    }
  }

  // Fallback: local matching using Resep collection
  try {
    const semua = await Resep.find();
    const daftarLower = daftarBahan.map((x) => String(x).toLowerCase());
    const hasil = semua
      .map((r) => {
        const bahanResep = (r.daftarBahan || []).map((b) => b.namaBahan.toLowerCase());
        let cocok = 0;
        for (const b of daftarLower) {
          if (bahanResep.some((br) => br.includes(b) || b.includes(br))) cocok++;
        }
        const persen = Math.round((cocok / (bahanResep.length || 1)) * 100);
        const bahanKurang = (r.daftarBahan || []).filter(
          (b) => !daftarLower.some((d) => b.namaBahan.toLowerCase().includes(d))
        );
        return {
          name: r.namaResep,
          description: r.deskripsi || '',
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
    console.error('❌ Fallback saranResep error:', err);
    return { sukses: false, pesan: 'Gagal menghasilkan saran' };
  }
};

module.exports = { prosesPercakapan, saranResep };