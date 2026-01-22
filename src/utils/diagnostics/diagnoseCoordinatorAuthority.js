/**
 * Diagnostic: Check coordinator authority in production database
 * Shows what authority levels exist and which users should be coordinators
 */

const mongoose = require('mongoose');
const User = require('../../models/users_models/user.model');
require('dotenv').config();

async function diagnoseCoordinators() {
  try {
    console.log('🔍 Diagnosing coordinator authority in database...\n');

    // Get all users with roles that indicate they should be coordinators
    const usersWithCoordinatorRole = await User.find({
      'roles.roleCode': { $in: ['coordinator', 'co-ordinator', 'coord'] },
      isActive: true
    }).select('firstName lastName authority roles organizations coverageAreas');

    console.log(`Found ${usersWithCoordinatorRole.length} users with coordinator role:\n`);
    usersWithCoordinatorRole.forEach(user => {
      const orgCount = (user.organizations || []).length;
      const covCount = (user.coverageAreas || []).length;
      console.log(`${user.firstName} ${user.lastName}`);
      console.log(`  Authority: ${user.authority || 'undefined'}`);
      console.log(`  Roles: ${user.roles.map(r => r.roleCode).join(', ')}`);
      console.log(`  Organizations: ${orgCount}, Coverage Areas: ${covCount}`);
    });

    // Check authority distribution
    console.log('\n\n📊 Authority distribution across active users:\n');
    const allUsers = await User.find({ isActive: true }).select('authority');
    const authorityMap = {};
    allUsers.forEach(u => {
      const auth = u.authority || 0;
      authorityMap[auth] = (authorityMap[auth] || 0) + 1;
    });

    Object.keys(authorityMap)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach(auth => {
        console.log(`Authority ${auth}: ${authorityMap[auth]} user(s)`);
      });

    // Check what the query currently returns
    console.log('\n\n🔎 Current query (authority 60-79) returns:\n');
    const current = await User.find({
      authority: { $gte: 60, $lt: 80 },
      isActive: true
    }).select('firstName lastName authority');
    console.log(`${current.length} results\n`);
    current.slice(0, 5).forEach(u => console.log(`${u.firstName} ${u.lastName} (${u.authority})`));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('✅ Connected to MongoDB\n');
  diagnoseCoordinators();
}).catch(err => {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
});
