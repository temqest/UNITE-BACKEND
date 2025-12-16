// src/models/chat_models/message.model.js

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  senderId: {
    type: String,
    required: true,
    trim: true,
    ref: 'BloodbankStaff'
  },
  receiverId: {
    type: String,
    required: true,
    trim: true,
    ref: 'BloodbankStaff'
  },
  content: {
    type: String,
    required: function() { return this.messageType === 'text'; },
    trim: true,
    default: ''
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  attachments: [{
    filename: String,
    url: String,
    key: String,
    mime: String,
    fileType: String, // Renamed from 'type' to fix Mongoose CastError
    size: Number
  }],
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readAt: {
    type: Date
  },
  conversationId: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
messageSchema.index({ conversationId: 1, timestamp: -1 });
messageSchema.index({ senderId: 1, receiverId: 1, timestamp: -1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;