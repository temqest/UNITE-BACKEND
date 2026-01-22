/**
 * Debug: Check user authority levels in database
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/users_models/user.model');

async function checkAuthorities() {
  try {
    console.log('📍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB_NAME,
    });
    console.log('✓ Connected to MongoDB\n');

    // Get count of users at each authority level
    console.log('📊 User distribution by authority level:');

    const authorities = [
      { label: 'System Admin (80+)', range: [80, Infinity] },
      { label: 'Coordinator (60-79)', range: [60, 79] },
      { label: 'Stakeholder (<60)', range: [0, 59] },
    ];

    for (const auth of authorities) {
      const count = await User.countDocuments({
        authority: { $gte: auth.range[0], $lte: auth.range[1] },
      });
      console.log(`  ${auth.label}: ${count}`);
    }

    // Show some sample coordinators if any exist
    console.log('\n📍 Sample users with authority >= 60:');
    const samples = await User.find({
      authority: { $gte: 60 },
      isActive: true,
    })
      .select('_id firstName lastName authority coverageAreas')
      .limit(5)
      .lean();

    if (samples.length === 0) {
      console.log('  (None found)');
    } else {
      for (const user of samples) {
        console.log(`  ${user.firstName} ${user.lastName} - Authority: ${user.authority}`);
      }
    }

    // Show the actual distribution
    console.log('\n📍 Actual authority values in database:');
    const pipeline = [
      { $group: { _id: '$authority', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ];

    const distribution = await User.aggregate(pipeline);
    for (const item of distribution) {
      console.log(`  Authority ${item._id}: ${item.count} users`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

checkAuthorities();
