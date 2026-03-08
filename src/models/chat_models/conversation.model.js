const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  participants: [{
    userId: {
      type: String,
      required: true,
      trim: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  type: {
    type: String,
    enum: ['direct', 'group'],
    default: 'direct'
  },
  lastMessage: {
    messageId: String,
    content: String,
    senderId: String,
    timestamp: Date
  },
  unreadCount: {
    type: Map,
    of: Number,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Tenant / organization scope
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
conversationSchema.index({ organizationId: 1, 'participants.userId': 1 });
conversationSchema.index({ organizationId: 1, updatedAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;