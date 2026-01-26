/**
 * Direct Database Check - See actual request data
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    const connectionUri = dbName ? `${mongoUri}/${dbName}` : mongoUri;
    
    await mongoose.connect(connectionUri);
    console.log('✅ Connected to database\n');

    // Direct database query - NOT using models
    const db = mongoose.connection.db;
    
    // List all collections
    console.log('=== AVAILABLE COLLECTIONS ===\n');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log(collectionNames);
    
    // Find request collection
    const requestCollections = collectionNames.filter(c => 
      c.includes('event') || c.includes('request') || c.includes('Request')
    );
    
    console.log(`\n=== SEARCHING COLLECTIONS ===\n`);
    console.log(`Request-related collections: ${requestCollections.join(', ')}`);
    
    // Try different collection names
    const possibleNames = [
      'eventrequests',
      'eventRequests',
      'event_requests',
      'requests',
      ...requestCollections
    ];
    
    for (const collName of possibleNames) {
      try {
        const collection = db.collection(collName);
        const count = await collection.countDocuments();
        
        if (count > 0) {
          console.log(`\n✅ Found '${collName}' with ${count} documents`);
          
          // Get first document
          const firstDoc = await collection.findOne();
          console.log('\nFirst document structure:');
          console.log(`  _id: ${firstDoc._id}`);
          console.log(`  Request_ID: ${firstDoc.Request_ID}`);
          console.log(`  Event_Title: ${firstDoc.Event_Title}`);
          console.log(`  reviewer.userId: ${firstDoc.reviewer?.userId}`);
          console.log(`  reviewer.name: ${firstDoc.reviewer?.name}`);
          console.log(`  validCoordinators: ${JSON.stringify(firstDoc.validCoordinators)}`);
          console.log(`  validCoordinators count: ${firstDoc.validCoordinators?.length || 0}`);
          
          // Get 3 recent documents
          console.log('\n=== 3 RECENT REQUESTS ===\n');
          const recent = await collection
            .find()
            .sort({ createdAt: -1 })
            .limit(3)
            .toArray();
          
          recent.forEach((doc, i) => {
            console.log(`${i + 1}. ${doc.Request_ID} - ${doc.Event_Title}`);
            console.log(`   Reviewer: ${doc.reviewer?.name}`);
            console.log(`   Valid Coordinators: ${doc.validCoordinators?.length || 0}`);
            if (doc.validCoordinators && doc.validCoordinators.length > 0) {
              doc.validCoordinators.forEach(vc => {
                console.log(`     - ${vc.name}`);
              });
            } else {
              console.log(`     ⚠️  EMPTY - validCoordinators not populated!`);
            }
          });
          
          break;
        }
      } catch (e) {
        // Collection doesn't exist, continue
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDatabase();
