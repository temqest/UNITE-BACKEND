const mongoose = require('mongoose');

/**
 * User Notification Preferences Model
 * 
 * Stores user preferences for email notifications, digest mode, and notification type preferences.
 * One-to-one relationship with User model.
 */
const userNotificationPreferencesSchema = new mongoose.Schema({
  // User reference (one-to-one)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  // Global email notification toggle
  emailNotificationsEnabled: {
    type: Boolean,
    default: true,
    index: true
  },

  // Digest mode settings
  emailDigestMode: {
    type: Boolean,
    default: false,
    index: true
  },

  emailDigestFrequency: {
    type: String,
    enum: ['hourly', 'daily', 'never'],
    default: 'hourly'
  },

  // Per-notification-type preferences
  // If empty array, all types are enabled (default behavior)
  // If contains types, only those types are enabled
  enabledNotificationTypes: [{
    type: String,
    trim: true
  }],

  // Auto-digest settings
  autoDigestThreshold: {
    type: Number,
    default: 5, // emails per hour
    min: 1,
    max: 20
  },

  autoDigestRevertHours: {
    type: Number,
    default: 24,
    min: 1,
    max: 168 // 1 week max
  },

  // Temporary digest mode (auto-switched)
  temporaryDigestMode: {
    type: Boolean,
    default: false,
    index: true
  },

  temporaryDigestUntil: {
    type: Date,
    required: false
  },

  // Tracking fields
  lastDigestSentAt: {
    type: Date,
    required: false
  },

  lastEmailSentAt: {
    type: Date,
    required: false
  },

  // Email count tracking for rate limiting
  emailCountLastHour: {
    type: Number,
    default: 0,
    min: 0
  },

  emailCountResetAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000) // Reset in 1 hour
  },

  // Mute notifications temporarily
  mutedUntil: {
    type: Date,
    required: false,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for common queries
userNotificationPreferencesSchema.index({ userId: 1 }, { unique: true });
userNotificationPreferencesSchema.index({ emailDigestMode: 1, temporaryDigestMode: 1 });
userNotificationPreferencesSchema.index({ emailCountResetAt: 1 });
userNotificationPreferencesSchema.index({ mutedUntil: 1 });

// Static method to get or create preferences for a user
userNotificationPreferencesSchema.statics.getOrCreate = async function(userId) {
  let preferences = await this.findOne({ userId });
  
  if (!preferences) {
    preferences = new this({
      userId,
      emailNotificationsEnabled: true,
      emailDigestMode: false,
      emailDigestFrequency: 'hourly',
      enabledNotificationTypes: [], // Empty = all enabled
      autoDigestThreshold: 5,
      autoDigestRevertHours: 24,
      temporaryDigestMode: false,
      emailCountLastHour: 0,
      emailCountResetAt: new Date(Date.now() + 60 * 60 * 1000)
    });
    await preferences.save();
  }
  
  return preferences;
};

// Method to check if email notifications are enabled for a specific type
userNotificationPreferencesSchema.methods.isNotificationTypeEnabled = function(notificationType) {
  // If email notifications are globally disabled, return false
  if (!this.emailNotificationsEnabled) {
    return false;
  }

  // If enabledNotificationTypes is empty, all types are enabled
  if (!this.enabledNotificationTypes || this.enabledNotificationTypes.length === 0) {
    return true;
  }

  // Otherwise, check if this type is in the enabled list
  return this.enabledNotificationTypes.includes(notificationType);
};

// Method to check if user is in digest mode (permanent or temporary)
userNotificationPreferencesSchema.methods.isInDigestMode = function() {
  return this.emailDigestMode || this.temporaryDigestMode;
};

// Method to reset email count (called when hour passes)
userNotificationPreferencesSchema.methods.resetEmailCount = async function() {
  this.emailCountLastHour = 0;
  this.emailCountResetAt = new Date(Date.now() + 60 * 60 * 1000);
  await this.save();
};

// Method to increment email count
userNotificationPreferencesSchema.methods.incrementEmailCount = async function() {
  // Check if we need to reset the count (hour has passed)
  if (this.emailCountResetAt && new Date() >= this.emailCountResetAt) {
    await this.resetEmailCount();
  }
  
  this.emailCountLastHour += 1;
  this.lastEmailSentAt = new Date();
  await this.save();
};

// Method to enable temporary digest mode
userNotificationPreferencesSchema.methods.enableTemporaryDigest = async function() {
  this.temporaryDigestMode = true;
  this.temporaryDigestUntil = new Date(Date.now() + this.autoDigestRevertHours * 60 * 60 * 1000);
  await this.save();
};

// Method to disable temporary digest mode (manual override or auto-revert)
userNotificationPreferencesSchema.methods.disableTemporaryDigest = async function() {
  this.temporaryDigestMode = false;
  this.temporaryDigestUntil = null;
  await this.save();
};

// Method to check if user is currently muted
userNotificationPreferencesSchema.methods.isMuted = function() {
  if (!this.mutedUntil) {
    return false;
  }
  return new Date() < this.mutedUntil;
};

// Method to unmute user (clear mute status)
userNotificationPreferencesSchema.methods.unmute = async function() {
  this.mutedUntil = null;
  await this.save();
};

const UserNotificationPreferences = mongoose.model('UserNotificationPreferences', userNotificationPreferencesSchema);

module.exports = UserNotificationPreferences;

