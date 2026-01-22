/**
 * Debug: Check which database we're connected to and inspect it
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/users_models/user.model');

async function checkDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;

    console.log('📍 Connection Details:');
    console.log(`  URI: ${mongoUri?.substring(0, 50)}...`);
    console.log(`  Expected DB Name: ${dbName}\n`);

    console.log('📍 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: dbName,
    });

    const connection = mongoose.connection;
    console.log(`✓ Connected!\n`);
    console.log(`📊 Current Database: ${connection.db.databaseName}`);
    console.log(`📊 Connected Host: ${connection.host}`);

    // List all collections
    console.log('\n📋 Collections in this database:');
    const collections = await connection.db.listCollections().toArray();
    if (collections.length === 0) {
      console.log('  (No collections found - database is empty)');
    } else {
      for (const col of collections) {
        const count = await connection.db.collection(col.name).countDocuments();
        console.log(`  - ${col.name}: ${count} documents`);
      }
    }

    // Try to count users
    console.log('\n📍 Checking User collection:');
    const userCount = await User.countDocuments();
    console.log(`  Total users: ${userCount}`);

    if (userCount > 0) {
      console.log('\n  Sample users:');
      const samples = await User.find().limit(5).select('firstName lastName authority').lean();
      for (const user of samples) {
        console.log(`    - ${user.firstName} ${user.lastName} (Authority: ${user.authority})`);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

checkDatabase();
