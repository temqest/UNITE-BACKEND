/**
 * Check actual authority levels in coordinators
 */

const mongoose = require('mongoose');
const User = require('../../models/users_models/user.model');
require('dotenv').config();

async function checkAuthorityLevels() {
  try {
    console.log('🔍 Checking authority levels in system...\n');

    const users = await User.find({
      isActive: true
    }).select('firstName lastName authority organizations').populate('organizations');

    // Group by authority
    const byAuthority = {};
    users.forEach(user => {
      const auth = user.authority || 0;
      if (!byAuthority[auth]) {
        byAuthority[auth] = [];
      }
      byAuthority[auth].push(user);
    });

    console.log('Authority levels distribution:\n');
    Object.keys(byAuthority)
      .map(Number)
      .sort((a, b) => b - a)
      .forEach(auth => {
        const count = byAuthority[auth].length;
        console.log(`Authority ${auth}: ${count} user(s)`);
        byAuthority[auth].slice(0, 3).forEach(user => {
          const orgTypes = (user.organizations || []).map(o => o.organizationType).join(', ');
          console.log(`  - ${user.firstName} ${user.lastName} [${orgTypes || 'no org'}]`);
        });
        if (byAuthority[auth].length > 3) {
          console.log(`  ... and ${byAuthority[auth].length - 3} more`);
        }
        console.log();
      });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/unite')
  .then(() => {
    console.log('✅ Connected to MongoDB\n');
    checkAuthorityLevels();
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
