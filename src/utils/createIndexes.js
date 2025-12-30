const mongoose = require('mongoose');
const { connect, disconnect, getConnectionUri } = require('./dbConnection');

async function createIndexes() {
  try {
    const uri = getConnectionUri();
    await connect(uri);
    console.log('Connected to MongoDB');

    const Event = require('../models/events_models/event.model');
    const { EventRequest } = require('../models/index'); // Use new model from index
    const Message = require('../models/chat_models/message.model');
    const Conversation = require('../models/chat_models/conversation.model');
    const Presence = require('../models/chat_models/presence.model');

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
    // Composite indexes for performance optimization
    await EventRequest.collection.createIndex({ status: 1, createdAt: -1 });
    await EventRequest.collection.createIndex({ status: 1, district: 1 });
    await EventRequest.collection.createIndex({ status: 1, province: 1 });
    await EventRequest.collection.createIndex({ Category: 1, status: 1 });
    await EventRequest.collection.createIndex({ 'requester.userId': 1, status: 1 });
    await EventRequest.collection.createIndex({ 'reviewer.userId': 1, status: 1 });
    console.log('EventRequest indexes created');

    // Create indexes for Message
    await Message.collection.createIndex({ conversationId: 1, timestamp: -1 });
    await Message.collection.createIndex({ senderId: 1, receiverId: 1, timestamp: -1 });
    await Message.collection.createIndex({ status: 1 });
    console.log('Message indexes created');

    // Create indexes for Conversation
    await Conversation.collection.createIndex({ 'participants.userId': 1 });
    await Conversation.collection.createIndex({ updatedAt: -1 });
    console.log('Conversation indexes created');

    // Create indexes for Presence
    await Presence.collection.createIndex({ userId: 1 }, { unique: true });
    await Presence.collection.createIndex({ status: 1 });
    console.log('Presence indexes created');

    console.log('All indexes created successfully');
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await disconnect();
  }
}

if (require.main === module) createIndexes();