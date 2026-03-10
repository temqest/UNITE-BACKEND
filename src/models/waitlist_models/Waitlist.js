const mongoose = require('mongoose');

const waitlistSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
  },
  name: {
    type: String,
    trim: true,
    maxLength: [100, 'Name cannot exceed 100 characters'],
    default: null
  },
  source: {
    type: String,
    trim: true,
    maxLength: [50, 'Source cannot exceed 50 characters'],
    default: 'direct'
  },
  status: {
    type: String,
    enum: ['pending', 'invited', 'joined', 'unsubscribed'],
    default: 'pending'
  },
  // Analytics Tracking Fields
  ipAddress: {
    type: String,
    trim: true,
    default: null
  },
  userAgent: {
    type: String,
    trim: true,
    default: null
  },
  signupPage: {
    type: String,
    trim: true,
    default: null
  }
}, {
  timestamps: true // Automatically creates createdAt and updatedAt fields
});

// Create an index for faster queries and enforcing uniqueness inherently
waitlistSchema.index({ email: 1 });

const Waitlist = mongoose.model('Waitlist', waitlistSchema);

module.exports = Waitlist;
