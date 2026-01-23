/**
 * Create indexes for BugReport collection
 * 
 * Run with: node src/utils/createBugReportIndexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const BugReport = require('../models/utility_models/bugReport.model');

async function createBugReportIndexes() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    
    if (!mongoUri) {
      console.error('❌ MongoDB URI not found in environment variables');
      process.exit(1);
    }

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Create indexes
    console.log('\n📊 Creating BugReport indexes...');
    await BugReport.createIndexes();
    console.log('✅ BugReport indexes created successfully');

    // List all indexes
    const indexes = await BugReport.collection.getIndexes();
    console.log('\n📋 Current BugReport indexes:');
    Object.keys(indexes).forEach(indexName => {
      console.log(`  - ${indexName}`);
    });

    console.log('\n✅ All indexes created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

createBugReportIndexes();
