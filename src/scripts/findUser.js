/**
 * Quick User Lookup Script
 * Finds users by name to get their actual email and ID
 * 
 * USAGE:
 *   node src/scripts/findUser.js David
 *   node src/scripts/findUser.js Ben
 */

require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/users_models/user.model');

async function findUser() {
  try {
    const searchName = process.argv[2];
    
    if (!searchName) {
      console.log('Usage: node src/scripts/findUser.js <firstName or lastName>');
      process.exit(1);
    }

    // Get MongoDB URI and ensure database name is appended
    const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    const mongoDbName = process.env.MONGO_DB_NAME;
    
    let mongoUri = rawMongoUri;
    if (mongoDbName) {
      const idx = rawMongoUri.indexOf('?');
      const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
      const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
      if (!hasDb) {
        if (idx === -1) {
          mongoUri = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
        } else {
          mongoUri = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
        }
      }
    }
    
    console.log(`\n📊 Connecting to MongoDB (${mongoDbName})...`);
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    
    console.log(`\n🔍 Searching for users with name containing "${searchName}"...\n`);

    const users = await User.find({
      $or: [
        { firstName: { $regex: searchName, $options: 'i' } },
        { lastName: { $regex: searchName, $options: 'i' } },
        { email: { $regex: searchName, $options: 'i' } }
      ]
    }).select('_id firstName lastName email authority roles isActive').lean();

    if (users.length === 0) {
      console.log(`❌ No users found matching "${searchName}"`);
    } else {
      console.log(`✅ Found ${users.length} user(s):\n`);
      
      users.forEach((user, idx) => {
        console.log(`${idx + 1}. ${user.firstName} ${user.lastName}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   ID: ${user._id}`);
        console.log(`   Authority: ${user.authority}`);
        console.log(`   Active: ${user.isActive}`);
        console.log(`   Roles: ${(user.roles || []).map(r => r.roleName).join(', ')}`);
        console.log('');
      });
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findUser();
