const mongoose = require('mongoose');
require('dotenv').config();

const actionValidatorService = require('../src/services/eventRequests_services/actionValidator.service');
const models = require('../src/models/index');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'unite_bmc_production';
const mongoUrl = MONGODB_URI.includes(MONGO_DB_NAME) ? MONGODB_URI : `${MONGODB_URI}/${MONGO_DB_NAME}`;

async function run() {
  try {
    console.log('Connecting to Mongo:', mongoUrl.replace(/\/\/[^@]*@/, '//***@'));
    await mongoose.connect(mongoUrl);
    console.log('Connected');

    const { EventRequest } = models;

    // Find a few review-rescheduled requests
    const requests = await EventRequest.find({ $or: [{ status: 'review-rescheduled' }, { Status: 'review-rescheduled' }] }).limit(5).lean();
    console.log(`Found ${requests.length} review-rescheduled requests`);

    // Use the provided userId from logs (stakeholder/dev account)
    const userId = process.env.TEST_USER_ID || '69771226dbbebe7c7c6cc1dc';
    console.log('Testing available actions for user:', userId);

    for (const req of requests) {
      const actions = await actionValidatorService.getAvailableActions(userId, req, {});
      console.log(`Request ${req.Request_ID} (${req.status || req.Status}) -> actions:`, actions);
    }

    await mongoose.disconnect();
    console.log('Done');
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

run();
