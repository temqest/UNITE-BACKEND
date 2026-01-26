require('dotenv').config();
const mongoose = require('mongoose');
const UserRole = require('../src/models/users_models/userRole.model');

async function createUserRoleForUniteDev() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME || 'unite_bmc_production';
    
    await mongoose.connect(mongoUri, { dbName });
    console.log(`✅ Connected to MongoDB - Database: ${dbName}`);

    const userId = '697711a3dbbebe7c7c6cb7a8';
    
    // Get user document directly from collection
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({ 
      _id: mongoose.Types.ObjectId.createFromHexString(userId) 
    });
    
    if (!user) {
      console.error('❌ User not found');
      process.exit(1);
    }
    
    console.log(`\n👤 User: ${user.firstName} ${user.lastName}`);
    console.log(`📧 Email: ${user.email}`);
    
    // Check embedded roles
    console.log(`\n📋 Embedded roles array:`, JSON.stringify(user.roles, null, 2));
    
    // Check existing UserRole entries
    const existing = await UserRole.find({ userId });
    console.log(`\n🔍 Existing UserRole entries: ${existing.length}`);
    
    if (existing.length > 0) {
      console.log('Existing entries:', JSON.stringify(existing, null, 2));
      console.log('\n⚠️  UserRole entries already exist. Skipping creation.');
      process.exit(0);
    }
    
    // Create UserRole entry from embedded role
    if (user.roles && user.roles.length > 0) {
      const embeddedRole = user.roles[0]; // Get the first role
      
      console.log(`\n🔧 Creating UserRole entry...`);
      console.log(`   Role ID: ${embeddedRole.roleId}`);
      console.log(`   Role Code: ${embeddedRole.roleCode}`);
      console.log(`   Is Active: ${embeddedRole.isActive}`);
      
      const userRole = new UserRole({
        userId: userId,
        roleId: embeddedRole.roleId,
        assignedBy: embeddedRole.assignedBy,
        assignedAt: embeddedRole.assignedAt || new Date(),
        isActive: embeddedRole.isActive !== undefined ? embeddedRole.isActive : true,
        expiresAt: null // No expiration
      });
      
      await userRole.save();
      console.log('✅ UserRole entry created successfully!');
      
      // Verify
      const verify = await UserRole.find({ userId }).populate('roleId');
      console.log('\n✅ Verification - UserRole entries now:', JSON.stringify(verify, null, 2));
    } else {
      console.log('\n⚠️  No embedded roles found in user document');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

createUserRoleForUniteDev();
