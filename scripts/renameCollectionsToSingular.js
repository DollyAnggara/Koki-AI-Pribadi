/**
 * Safe collection renamer
 * Usage:
 *   node scripts/renameCollectionsToSingular.js        -> lists candidate collections to rename
 *   node scripts/renameCollectionsToSingular.js --do  -> performs rename when target doesn't exist
 *
 * WARNING: renaming collections is a potentially destructive operation in some contexts.
 * This script will only rename if the target collection does not already exist.
 */

const mongoose = require('mongoose');
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/koki-ai';

const mapping = {
  'bahans': 'bahan',
  'penggunas': 'pengguna',
  'reseps': 'resep',
  'rencanamenus': 'rencanamenu'
};

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const existing = await db.listCollections().toArray();
  const names = existing.map(c => c.name);

  const candidates = Object.entries(mapping).filter(([src, dst]) => names.includes(src) && !names.includes(dst));

  if (candidates.length === 0) {
    console.log('No collections need renaming (either no old plural collections, or target already exists).');
    await mongoose.disconnect();
    return;
  }

  console.log('The following renames are possible:');
  candidates.forEach(([src, dst]) => console.log(`- ${src}  ->  ${dst}`));

  if (!process.argv.includes('--do')) {
    console.log('\nRun with `--do` to perform these renames.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nRenaming collections now...');
  for (const [src, dst] of candidates) {
    try {
      await db.renameCollection(src, dst);
      console.log(`Renamed ${src} -> ${dst}`);
    } catch (err) {
      console.error(`Failed to rename ${src} -> ${dst}:`, err.message);
    }
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });