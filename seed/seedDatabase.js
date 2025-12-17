/**
 * seed/seedDatabase.js
 * Script untuk mengisi database dengan data awal untuk testing
 * Jalankan: npm run seed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Resep = require('../src/models/Resep');
const Pengguna = require('../src/models/Pengguna');
const Bahan = require('../src/models/Bahan');

const dataPengguna = [
  { namaPengguna: 'budi_chef', email: 'budi@example.com', kataSandi: 'password123', namaLengkap: 'Budi Santoso', pengaturanNotifikasi: { emailMenuMingguan: true, emailPengingatKadaluarsa: true } },
  { namaPengguna: 'siti_masak', email: 'siti@example.com', kataSandi: 'password123', namaLengkap: 'Siti Rahayu', pengaturanNotifikasi: { emailMenuMingguan: true, emailPengingatKadaluarsa: true } }
];

const dataResep = [
  {
    namaResep: 'Nasi Goreng Spesial',
    deskripsi: 'Nasi goreng enak',
    kategori: 'makan_siang',
    waktuPersiapanMenit: 10,
    waktuMemasakMenit: 15,
    porsi: 2,
    daftarBahan: [{ namaBahan: 'Nasi putih', jumlah: 400, satuan: 'gram' }, { namaBahan: 'Telur', jumlah: 2, satuan: 'butir' }],
    langkah: [{ nomorUrut: 1, deskripsi: 'Tumis bumbu' }]
  },
  {
    namaResep: 'Tumis Kangkung Bawang Putih',
    deskripsi: 'Cepat dan sehat',
    kategori: 'makan_siang',
    waktuPersiapanMenit: 5,
    waktuMemasakMenit: 5,
    porsi: 2,
    daftarBahan: [{ namaBahan: 'Kangkung', jumlah: 300, satuan: 'gram' }, { namaBahan: 'Bawang putih', jumlah: 3, satuan: 'siung' }],
    langkah: [{ nomorUrut: 1, deskripsi: 'Tumis bawang, masukkan kangkung' }]
  }
];

const buatDataBahanUntukPengguna = (idPengguna) => {
  const hariIni = new Date();
  return [
    { namaBahan: 'Wortel', kategoriBahan: 'sayuran', jumlahTersedia: 500, satuan: 'gram', tanggalPembelian: hariIni, tanggalKadaluarsa: new Date(hariIni.getTime() + 4*24*60*60*1000), pemilik: idPengguna },
    { namaBahan: 'Ayam', kategoriBahan: 'daging', jumlahTersedia: 1000, satuan: 'gram', tanggalPembelian: hariIni, tanggalKadaluarsa: new Date(hariIni.getTime() + 2*24*60*60*1000), pemilik: idPengguna }
  ];
};

const jalankanSeed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🔗 Terhubung ke database untuk seed');

    await Resep.deleteMany({});
    await Pengguna.deleteMany({});
    await Bahan.deleteMany({});
    console.log('🧹 Koleksi dihapus');

    const penggunaDisimpan = await Pengguna.insertMany(dataPengguna);
    console.log(`✅ ${penggunaDisimpan.length} pengguna ditambahkan`);

    const resepDenganPembuat = dataResep.map(r => ({ ...r, pembuatResep: penggunaDisimpan[0]._id }));
    const resepDisimpan = await Resep.insertMany(resepDenganPembuat);
    console.log(`✅ ${resepDisimpan.length} resep ditambahkan`);

    for (const pengguna of penggunaDisimpan) {
      const bahan = buatDataBahanUntukPengguna(pengguna._id);
      const hasil = await Bahan.insertMany(bahan);
      console.log(`✅ ${hasil.length} bahan ditambahkan untuk ${pengguna.namaPengguna}`);
    }

    console.log('🎉 SEED selesai');
  } catch (err) {
    console.error('❌ Seed gagal:', err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

jalankanSeed();