/**
 * Diagnostic + optional migration helper
 * Usage:
 *   node scripts/migrateUsersFromBahans.js        -> lists candidate docs
 *   node scripts/migrateUsersFromBahans.js --do  -> moves candidates into pengguna collection (new singular naming)
 */

const mongoose = require('mongoose');
const Bahan = require('../src/models/Bahan');
const Pengguna = require('../src/models/Pengguna');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/koki-ai';

async function run() {
  await mongoose.connect(uri);
  console.log('Connected to DB for migration check');

  // Raw access to collections: check both legacy plural 'bahans' and desired singular 'bahan'
  const db = mongoose.connection.db;
  const candidatesFromBahans = await db.collection('bahans').find({ $or: [{ namaPengguna: { $exists: true } }, { email: { $exists: true } }] }).toArray().catch(() => []);
  const candidatesFromBahan = await db.collection('bahan').find({ $or: [{ namaPengguna: { $exists: true } }, { email: { $exists: true } }] }).toArray().catch(() => []);
  const candidates = [...candidatesFromBahans, ...candidatesFromBahan];
  console.log(`Found ${candidates.length} candidate document(s) in 'bahans'/'bahan' that look like pengguna records:`);
  candidates.forEach((c, i) => console.log(`${i+1}. _id=${c._id} keys=${Object.keys(c).join(', ')}`));

  if (candidates.length === 0) {
    console.log('No action required.');
    await mongoose.disconnect();
    return;
  }

  if (!process.argv.includes('--do')) {
    console.log('\nRun with `--do` to migrate these records to `pengguna` (non-destructive: originals will be kept in bahans/bahan).');
    await mongoose.disconnect();
    return;
  }

  console.log('\nMigrating...');
  for (const doc of candidates) {
    // Build user object from fields commonly used
    const user = {
      namaPengguna: doc.namaPengguna || doc.username || (`user_${doc._id}`),
      email: doc.email || (`no-reply+${doc._id}@local`),
      kataSandi: doc.kataSandi || Math.random().toString(36).slice(2, 10),
      namaLengkap: doc.namaLengkap || doc.nama || ''
    };

    try {
      const created = await Pengguna.create(user);
      console.log(`-> Migrated doc ${doc._id} => pengguna._id=${created._id}`);
    } catch (err) {
      console.error('Failed to migrate doc', doc._id, err.message);
    }
  }

  console.log('Migration done (original bahans/bahan documents preserved).');
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });