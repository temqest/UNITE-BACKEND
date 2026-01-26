const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'unite_bmc_production';

const mongoUrl = MONGODB_URI.includes(MONGO_DB_NAME) 
  ? MONGODB_URI 
  : `${MONGODB_URI}/${MONGO_DB_NAME}`;

console.log('Connecting to:', mongoUrl.replace(/\/\/[^@]*@/, '//***@'));

async function checkValidCoordinators() {
  try {
    await mongoose.connect(mongoUrl);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const collection = db.collection('eventrequests');

    // Get first few requests
    const requests = await collection.find({}).limit(5).toArray();
    
    console.log(`Found ${requests.length} requests\n`);

    for (const req of requests) {
      console.log(`Request: ${req.Request_ID}`);
      console.log(`  - validCoordinators count: ${req.validCoordinators?.length || 0}`);
      console.log(`  - validCoordinators:`, req.validCoordinators || []);
      console.log(`  - status: ${req.status}`);
      console.log();
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkValidCoordinators();
