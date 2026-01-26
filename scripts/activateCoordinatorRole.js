require('dotenv').config();
const mongoose = require('mongoose');

async function activateCoordinatorRole() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME || 'unite_bmc_production';
    
    await mongoose.connect(mongoUri, { dbName });
    console.log(`✅ Connected to MongoDB - Database: ${dbName}`);

    const roleId = '696086ef3f2b9335d7bc965a'; // coordinator role
    const db = mongoose.connection.db;
    
    // Check current state
    const before = await db.collection('roles').findOne({ 
      _id: mongoose.Types.ObjectId.createFromHexString(roleId) 
    }, { projection: { code: 1, name: 1, isActive: 1 } });
    
    console.log('\n📋 Before update:', before);
    
    // Update to add isActive: true
    const result = await db.collection('roles').updateOne(
      { _id: mongoose.Types.ObjectId.createFromHexString(roleId) },
      { $set: { isActive: true } }
    );
    
    console.log('\n🔄 Update result:', {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
    
    // Verify
    const after = await db.collection('roles').findOne({ 
      _id: mongoose.Types.ObjectId.createFromHexString(roleId) 
    }, { projection: { code: 1, name: 1, isActive: 1 } });
    
    console.log('\n✅ After update:', after);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

activateCoordinatorRole();
