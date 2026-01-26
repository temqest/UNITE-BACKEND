const mongoose = require('mongoose');
require('dotenv').config();

console.log('Connection details:');
console.log('MONGODB_URI:', process.env.MONGODB_URI?.substring(0, 50) + '...');
console.log('MONGO_DB_NAME:', process.env.MONGO_DB_NAME);

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'unite_bmc_production';

const mongoUrl = MONGODB_URI.includes(MONGO_DB_NAME) 
  ? MONGODB_URI 
  : `${MONGODB_URI}/${MONGO_DB_NAME}`;

console.log('Final URL:', mongoUrl.replace(/\/\/[^@]*@/, '//***@'));

async function checkDatabase() {
  try {
    await mongoose.connect(mongoUrl);
    
    console.log('\nConnected to MongoDB');
    
    // Count documents in eventrequests using Mongoose
    const EventRequest = mongoose.model('EventRequest', new mongoose.Schema({}, { strict: false }), 'eventrequests');
    const count = await EventRequest.countDocuments();
    console.log(`eventrequests collection has ${count} documents`);

    if (count > 0) {
      const sample = await EventRequest.findOne().lean();
      console.log('\nSample request:');
      console.log('  Request_ID:', sample.Request_ID);
      console.log('  Status:', sample.status);
      console.log('  validCoordinators count:', sample.validCoordinators?.length || 0);
      if (sample.validCoordinators?.length > 0) {
        console.log('  validCoordinators:', sample.validCoordinators.slice(0, 2));
      }
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkDatabase();
