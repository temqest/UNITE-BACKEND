const mongoose = require('mongoose');

const presenceSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    ref: 'BloodbankStaff'
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'idle'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  socketId: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const Presence = mongoose.model('Presence', presenceSchema);

module.exports = Presence;