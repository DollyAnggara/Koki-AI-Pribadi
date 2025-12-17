const mongoose = require('mongoose');
const hubungkanDatabase = async () => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/koki_ai_pribadi';
  await mongoose.connect(uri, { maxPoolSize: 10 });
  console.log('✅ Terhubung ke MongoDB');
};
module.exports = hubungkanDatabase;