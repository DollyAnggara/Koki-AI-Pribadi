/**
 * seed/seedDatabase.js
 * Script untuk mengisi database dengan data awal untuk testing
 * Jalankan: npm run seed
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Resep = require("../src/models/Resep");
const Pengguna = require("../src/models/Pengguna");
const Bahan = require("../src/models/Bahan");

const dataPengguna = [
  {
    namaPengguna: "budi_chef",
    email: "budi@example.com",
    kataSandi: "password123",
    namaLengkap: "Budi Santoso",
    pengaturanNotifikasi: {
      emailMenuMingguan: true,
      emailPengingatKadaluarsa: true,
    },
  },
  {
    namaPengguna: "siti_masak",
    email: "siti@example.com",
    kataSandi: "password123",
    namaLengkap: "Siti Rahayu",
    pengaturanNotifikasi: {
      emailMenuMingguan: true,
      emailPengingatKadaluarsa: true,
    },
  },
];

const dataResep = [
  {
    namaResep: "Nasi Goreng Spesial",
    deskripsi:
      "Nasi goreng dengan telur, ayam suwir, dan sayuran, cocok untuk sarapan atau makan malam cepat.",
    kategori: "makan_siang",
    tingkatKesulitan: "mudah",
    waktuPersiapanMenit: 10,
    waktuMemasakMenit: 15,
    porsi: 2,
    daftarBahan: [
      { namaBahan: "Nasi putih", jumlah: 400, satuan: "gram", wajib: true },
      { namaBahan: "Telur", jumlah: 2, satuan: "butir", wajib: true },
      { namaBahan: "Ayam suwir", jumlah: 150, satuan: "gram", wajib: false },
      {
        namaBahan: "Kecap manis",
        jumlah: 2,
        satuan: "sendok makan",
        wajib: true,
      },
      { namaBahan: "Bawang merah", jumlah: 2, satuan: "siung", wajib: true },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi: "Tumis bawang hingga harum.",
        durasiMenit: 3,
        tips: "Gunakan api sedang agar tidak gosong.",
      },
      {
        nomorUrut: 2,
        deskripsi: "Masukkan nasi dan bumbu, aduk rata.",
        durasiMenit: 5,
      },
      {
        nomorUrut: 3,
        deskripsi: "Tambahkan telur orak-arik dan ayam suwir.",
        durasiMenit: 4,
      },
    ],
    nutrisiPerPorsi: { kalori: 520, protein_g: 18, karbo_g: 70, lemak_g: 16 },
  },
  {
    namaResep: "Soto Ayam",
    deskripsi:
      "Sup ayam kuning khas Indonesia, segar dengan koya dan jeruk nipis.",
    kategori: "makan_siang",
    tingkatKesulitan: "sedang",
    waktuPersiapanMenit: 15,
    waktuMemasakMenit: 45,
    porsi: 4,
    daftarBahan: [
      { namaBahan: "Ayam", jumlah: 800, satuan: "gram", wajib: true },
      { namaBahan: "Sereh", jumlah: 2, satuan: "batang", wajib: true },
      { namaBahan: "Kunyit", jumlah: 1, satuan: "cm", wajib: true },
      { namaBahan: "Bawang putih", jumlah: 3, satuan: "siung", wajib: true },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi: "Rebus ayam hingga empuk, suwir dagingnya.",
        durasiMenit: 30,
      },
      {
        nomorUrut: 2,
        deskripsi: "Tumis bumbu halus, masukkan ke kuah, tambahkan sayuran.",
        durasiMenit: 10,
      },
    ],
    nutrisiPerPorsi: { kalori: 320, protein_g: 28, karbo_g: 8, lemak_g: 18 },
  },
  {
    namaResep: "Rendang Padang (Sederhana)",
    deskripsi:
      "Daging dimasak lama dengan bumbu kaya rempah — versi singkat untuk rumah.",
    kategori: "makan_malam",
    tingkatKesulitan: "sulit",
    waktuPersiapanMenit: 20,
    waktuMemasakMenit: 120,
    porsi: 6,
    daftarBahan: [
      { namaBahan: "Daging sapi", jumlah: 1000, satuan: "gram", wajib: true },
      { namaBahan: "Santan", jumlah: 400, satuan: "ml", wajib: true },
      {
        namaBahan: "Bumbu rendang (halus)",
        jumlah: 200,
        satuan: "gram",
        wajib: true,
      },
    ],
    langkah: [
      { nomorUrut: 1, deskripsi: "Tumis bumbu sampai harum.", durasiMenit: 15 },
      {
        nomorUrut: 2,
        deskripsi:
          "Masukkan daging dan santan; masak menggunakan api kecil hingga berminyak dan empuk.",
        durasiMenit: 90,
        tips: "Aduk sesekali agar bumbu meresap.",
      },
    ],
    nutrisiPerPorsi: { kalori: 650, protein_g: 40, karbo_g: 6, lemak_g: 48 },
  },
  {
    namaResep: "Gado-Gado",
    deskripsi: "Salad sayur dengan bumbu kacang, cocok sebagai lauk sehat.",
    kategori: "makan_siang",
    tingkatKesulitan: "mudah",
    waktuPersiapanMenit: 15,
    waktuMemasakMenit: 10,
    porsi: 3,
    daftarBahan: [
      { namaBahan: "Tauge", jumlah: 150, satuan: "gram" },
      { namaBahan: "Kentang rebus", jumlah: 300, satuan: "gram" },
      { namaBahan: "Tempe goreng", jumlah: 100, satuan: "gram" },
      { namaBahan: "Saus kacang", jumlah: 150, satuan: "gram", wajib: true },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi: "Susun sayuran dan tempe, siram saus kacang.",
        durasiMenit: 10,
      },
    ],
    nutrisiPerPorsi: { kalori: 350, protein_g: 12, karbo_g: 36, lemak_g: 18 },
  },
  {
    namaResep: "Pancake Pisang",
    deskripsi:
      "Pancake lembut dengan pisang, cocok untuk sarapan atau camilan.",
    kategori: "sarapan",
    tingkatKesulitan: "mudah",
    waktuPersiapanMenit: 10,
    waktuMemasakMenit: 10,
    porsi: 2,
    daftarBahan: [
      { namaBahan: "Tepung terigu", jumlah: 150, satuan: "gram" },
      { namaBahan: "Susu", jumlah: 150, satuan: "ml" },
      { namaBahan: "Pisang", jumlah: 1, satuan: "buah" },
    ],
    langkah: [
      { nomorUrut: 1, deskripsi: "Campur bahan hingga rata.", durasiMenit: 5 },
      {
        nomorUrut: 2,
        deskripsi: "Masak di wajan anti lengket hingga matang.",
        durasiMenit: 5,
      },
    ],
    nutrisiPerPorsi: { kalori: 300, protein_g: 6, karbo_g: 48, lemak_g: 8 },
  },
  {
    namaResep: "Sup Krim Jagung",
    deskripsi:
      "Sup lembut dengan jagung manis dan krim, nyaman untuk makan malam ringan.",
    kategori: "makan_malam",
    tingkatKesulitan: "mudah",
    waktuPersiapanMenit: 10,
    waktuMemasakMenit: 20,
    porsi: 4,
    daftarBahan: [
      { namaBahan: "Jagung manis", jumlah: 300, satuan: "gram", wajib: true },
      { namaBahan: "Susu", jumlah: 300, satuan: "ml", wajib: true },
      { namaBahan: "Kaldu ayam", jumlah: 500, satuan: "ml" },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi: "Rebus jagung dan blender sebagian untuk tekstur krim.",
        durasiMenit: 10,
      },
      {
        nomorUrut: 2,
        deskripsi: "Tambahkan susu dan kaldu, masak hingga mengental.",
        durasiMenit: 10,
      },
    ],
    nutrisiPerPorsi: { kalori: 220, protein_g: 6, karbo_g: 28, lemak_g: 10 },
  },
  {
    namaResep: "Spaghetti Bolognese",
    deskripsi: "Pasta saus daging klasik, favorit keluarga.",
    kategori: "makan_malam",
    tingkatKesulitan: "sedang",
    waktuPersiapanMenit: 15,
    waktuMemasakMenit: 30,
    porsi: 4,
    daftarBahan: [
      { namaBahan: "Spaghetti", jumlah: 400, satuan: "gram", wajib: true },
      { namaBahan: "Daging cincang", jumlah: 300, satuan: "gram", wajib: true },
      { namaBahan: "Saus tomat", jumlah: 300, satuan: "ml", wajib: true },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi: "Masak pasta sesuai instruksi.",
        durasiMenit: 10,
      },
      {
        nomorUrut: 2,
        deskripsi: "Tumis daging, tambahkan saus tomat dan bumbu.",
        durasiMenit: 20,
      },
    ],
    nutrisiPerPorsi: { kalori: 520, protein_g: 22, karbo_g: 70, lemak_g: 16 },
  },
  {
    namaResep: "Tumis Kangkung Bawang Putih",
    deskripsi: "Lauk cepat dan bergizi, cocok dimakan bersama nasi hangat.",
    kategori: "makan_siang",
    tingkatKesulitan: "mudah",
    waktuPersiapanMenit: 5,
    waktuMemasakMenit: 5,
    porsi: 2,
    daftarBahan: [
      { namaBahan: "Kangkung", jumlah: 300, satuan: "gram", wajib: true },
      { namaBahan: "Bawang putih", jumlah: 3, satuan: "siung", wajib: true },
      { namaBahan: "Garam", jumlah: 0.5, satuan: "sendok teh" },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi:
          "Tumis bawang putih, masukkan kangkung, beri garam, aduk cepat.",
        durasiMenit: 5,
      },
    ],
    nutrisiPerPorsi: { kalori: 70, protein_g: 4, karbo_g: 6, lemak_g: 3 },
  },
  {
    namaResep: "Ayam Bakar Kecap",
    deskripsi: "Ayam bakar manis gurih dengan kecap dan rempah sederhana.",
    kategori: "makan_malam",
    tingkatKesulitan: "sedang",
    waktuPersiapanMenit: 15,
    waktuMemasakMenit: 40,
    porsi: 4,
    daftarBahan: [
      { namaBahan: "Ayam potong", jumlah: 800, satuan: "gram", wajib: true },
      {
        namaBahan: "Kecap manis",
        jumlah: 4,
        satuan: "sendok makan",
        wajib: true,
      },
      { namaBahan: "Bawang merah", jumlah: 3, satuan: "siung", wajib: true },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi: "Marinasi ayam dengan kecap dan bumbu, diamkan 30 menit.",
        durasiMenit: 30,
      },
      {
        nomorUrut: 2,
        deskripsi: "Bakar sambil olesi bumbu hingga matang.",
        durasiMenit: 10,
      },
    ],
    nutrisiPerPorsi: { kalori: 480, protein_g: 35, karbo_g: 12, lemak_g: 28 },
  },
  {
    namaResep: "Smoothie Pisang Berry",
    deskripsi: "Minuman sehat dan cepat, baik untuk sarapan atau camilan.",
    kategori: "minuman",
    tingkatKesulitan: "mudah",
    waktuPersiapanMenit: 5,
    waktuMemasakMenit: 0,
    porsi: 2,
    daftarBahan: [
      { namaBahan: "Pisang", jumlah: 2, satuan: "buah", wajib: true },
      {
        namaBahan: "Blueberry beku",
        jumlah: 150,
        satuan: "gram",
        wajib: false,
      },
      { namaBahan: "Susu almond", jumlah: 300, satuan: "ml", wajib: true },
    ],
    langkah: [
      {
        nomorUrut: 1,
        deskripsi: "Blender semua bahan hingga halus.",
        durasiMenit: 3,
      },
    ],
    nutrisiPerPorsi: { kalori: 180, protein_g: 4, karbo_g: 35, lemak_g: 3 },
  },
];

const buatDataBahanUntukPengguna = (idPengguna) => {
  const hariIni = new Date();
  return [
    {
      namaBahan: "Wortel",
      kategoriBahan: "sayuran",
      jumlahTersedia: 500,
      satuan: "gram",
      tanggalPembelian: hariIni,
      tanggalKadaluarsa: new Date(hariIni.getTime() + 4 * 24 * 60 * 60 * 1000),
      lokasiPenyimpanan: "rak_dapur",
      pemilik: idPengguna,
    },
    {
      namaBahan: "Ayam",
      kategoriBahan: "daging",
      jumlahTersedia: 1000,
      satuan: "gram",
      tanggalPembelian: hariIni,
      tanggalKadaluarsa: new Date(hariIni.getTime() + 2 * 24 * 60 * 60 * 1000),
      lokasiPenyimpanan: "kulkas",
      pemilik: idPengguna,
    },
  ];
};

const jalankanSeed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(
      "🔗 Terhubung ke database untuk seed:",
      mongoose.connection.name
    );

    await Resep.deleteMany({});
    await Pengguna.deleteMany({});
    await Bahan.deleteMany({});
    console.log("🧹 Koleksi dihapus");

    // Create users using model.save() so pre-save hooks (password hashing) run
    const penggunaDisimpan = [];
    for (const p of dataPengguna) {
      const user = new Pengguna(p);
      await user.save();
      penggunaDisimpan.push(user);
    }
    console.log(`✅ ${penggunaDisimpan.length} pengguna ditambahkan`);

    const resepDenganPembuat = dataResep.map((r) => ({
      ...r,
      pembuatResep: penggunaDisimpan[0]._id,
    }));
    const resepDisimpan = await Resep.insertMany(resepDenganPembuat);
    console.log(`✅ ${resepDisimpan.length} resep ditambahkan`);
    const totalResep = await Resep.countDocuments();
    console.log(`📚 Total resep sekarang: ${totalResep}`);

    for (const pengguna of penggunaDisimpan) {
      const bahan = buatDataBahanUntukPengguna(pengguna._id);
      const hasil = await Bahan.insertMany(bahan);
      console.log(
        `✅ ${hasil.length} bahan ditambahkan untuk ${pengguna.namaPengguna}`
      );
    }

    console.log("🎉 SEED selesai");
  } catch (err) {
    console.error("❌ Seed gagal:", err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

jalankanSeed();
