/**
 * Simple Request Check
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkRequests() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    const connectionUri = dbName ? `${mongoUri}/${dbName}` : mongoUri;
    
    await mongoose.connect(connectionUri);
    console.log('✅ Connected to database\n');

    const db = mongoose.connection.db;
    const collection = db.collection('eventrequests');
    
    const count = await collection.countDocuments();
    console.log(`Total requests in database: ${count}\n`);
    
    if (count === 0) {
      console.log('❌ No requests found');
      await mongoose.disconnect();
      return;
    }
    
    // Get 5 recent requests
    const recent = await collection
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();
    
    console.log('=== 5 MOST RECENT REQUESTS ===\n');
    
    recent.forEach((doc, i) => {
      console.log(`${i + 1}. ${doc.Request_ID}`);
      console.log(`   Title: ${doc.Event_Title}`);
      console.log(`   Reviewer: ${doc.reviewer?.name}`);
      console.log(`   validCoordinators count: ${doc.validCoordinators?.length || 0}`);
      
      if (doc.validCoordinators && doc.validCoordinators.length > 0) {
        console.log(`   ✅ validCoordinators POPULATED:`);
        doc.validCoordinators.forEach(vc => {
          console.log(`      - ${vc.name}`);
        });
      } else {
        console.log(`   ❌ validCoordinators EMPTY`);
      }
      console.log();
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkRequests();
