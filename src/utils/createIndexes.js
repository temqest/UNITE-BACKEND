const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

async function createIndexes() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const Event = require('../models/events_models/event.model');
    const EventRequest = require('../models/request_models/eventRequest.model');

    // Create indexes for Event
    await Event.collection.createIndex({ Status: 1 });
    await Event.collection.createIndex({ Start_Date: 1 });
    await Event.collection.createIndex({ coordinator_id: 1 });
    await Event.collection.createIndex({ Location: 1 });
    await Event.collection.createIndex({ Event_Title: 1 });
    console.log('Event indexes created');

    // Create indexes for EventRequest
    await EventRequest.collection.createIndex({ Status: 1 });
    await EventRequest.collection.createIndex({ createdAt: 1 });
    await EventRequest.collection.createIndex({ coordinator_id: 1 });
    console.log('EventRequest indexes created');

    console.log('All indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) createIndexes();