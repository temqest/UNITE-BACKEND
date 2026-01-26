const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'unite_bmc_production';

const mongoUrl = MONGODB_URI.includes(MONGO_DB_NAME) 
  ? MONGODB_URI 
  : `${MONGODB_URI}/${MONGO_DB_NAME}`;

console.log('Connecting to:', mongoUrl.replace(/\/\/[^@]*@/, '//***@'));

const User = require('../src/models/users_models/user.model');

async function checkRoles() {
  try {
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB\n');

    // Users to check
    const userIds = [
      '697711a3dbbebe7c7c6cb7a8',  // UNITE Dev
      '69771226dbbebe7c7c6cc1dc'   // UNITE Dis 2 Dev
    ];

    for (const userId of userIds) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Checking user: ${userId}`);
      console.log('='.repeat(60));

      const user = await User.findById(userId);
      
      if (!user) {
        console.log('User not found');
        continue;
      }

      console.log(`Name: ${user.firstName} ${user.lastName}`);
      console.log(`\nRole Assignments (${user.roles?.length || 0} total):`);
      
      if (user.roles && user.roles.length > 0) {
        user.roles.forEach((role, index) => {
          console.log(`\n  [${index}]`);
          console.log(`    - roleId: ${role.roleId}`);
          console.log(`    - status: ${role.status}`);
          console.log(`    - active: ${role.active}`);
          console.log(`    - startDate: ${role.startDate}`);
          console.log(`    - endDate: ${role.endDate}`);
        });
      } else {
        console.log('  No role assignments');
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkRoles();
