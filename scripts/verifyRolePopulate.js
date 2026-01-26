require('dotenv').config();
const mongoose = require('mongoose');
const UserRole = require('../src/models/users_models/userRole.model');
const Role = require('../src/models/users_models/role.model'); // Load Role model

async function verifyRolePopulate() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME || 'unite_bmc_production';
    
    await mongoose.connect(mongoUri, { dbName });
    console.log(`✅ Connected to MongoDB - Database: ${dbName}`);

    const userId = '697711a3dbbebe7c7c6cb7a8';
    
    // Get UserRole with populated roleId
    const userRoles = await UserRole.find({ 
      userId,
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } }
      ]
    }).populate('roleId');
    
    console.log('\n📋 UserRole documents found:', userRoles.length);
    
    userRoles.forEach((ur, index) => {
      console.log(`\nUserRole ${index + 1}:`, {
        _id: ur._id,
        userId: ur.userId,
        userRoleIsActive: ur.isActive,
        roleId: ur.roleId?._id,
        roleCode: ur.roleId?.code,
        roleName: ur.roleId?.name,
        roleIsActive: ur.roleId?.isActive,
        roleHasIsActiveField: 'isActive' in (ur.roleId || {}),
        expiresAt: ur.expiresAt
      });
    });
    
    // Apply the same filter as coordinatorContext validation
    const activeRoles = userRoles.filter(ur => {
      const role = ur.roleId;
      return role && role.isActive;
    });
    
    console.log(`\n✅ Active roles after filter: ${activeRoles.length}`);
    console.log('Role codes:', activeRoles.map(ur => ur.roleId?.code));
    
    if (activeRoles.length === 0 && userRoles.length > 0) {
      console.log('\n❌ PROBLEM: UserRoles exist but none pass the filter!');
      console.log('This means the populated Role documents are missing isActive: true');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyRolePopulate();
