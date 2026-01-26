#!/usr/bin/env node
const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
  const EventRequest = mongoose.model('EventRequest');
  const req = await EventRequest.findOne({ status: 'approved', validCoordinators: { $exists: true, $ne: [] } }).lean();
  if (!req) {
    console.log('No approved request with validCoordinators found');
    process.exit(0);
  }
  console.log('Request_ID:', req.Request_ID);
  console.log('validCoordinators length:', req.validCoordinators?.length || 0);
  console.dir(req.validCoordinators.slice(0, 3), { depth: 5 });
  await mongoose.connection.close();
}
main().catch(e => { console.error(e); process.exit(1); });
