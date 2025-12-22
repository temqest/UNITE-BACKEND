const mongoose = require('mongoose');

/**
 * User Location Assignment Model
 * 
 * Links users to locations with flexible scope coverage.
 * Supports multiple location assignments per user with different scopes.
 * 
 * Scope Types:
 * - 'exact': User has access only to the specific location
 * - 'descendants': User has access to the location and all its children
 * - 'ancestors': User has access to the location and all its parents
 * - 'all': User has access to the location, all ancestors, and all descendants
 * 
 * Use Cases:
 * - Coordinator assigned to district with 'descendants' scope → access to all municipalities
 * - Stakeholder assigned to municipality with 'exact' scope → access only to that municipality
 * - Province-wide organization with 'all' scope → access to entire province
 * 
 * @see Location model for location hierarchy
 * @see User model for user information
 */
const userLocationSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Location reference
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true,
    index: true
  },
  
  // Coverage scope
  scope: {
    type: String,
    enum: ['exact', 'descendants', 'ancestors', 'all'],
    required: true,
    default: 'exact',
    index: true
  },
  
  // Primary location flag (user's main/primary location assignment)
  isPrimary: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Assignment timestamp
  assignedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  // User who assigned this location (admin/system)
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // Optional expiration date for temporary assignments
  expiresAt: {
    type: Date,
    required: false,
    index: true
  },
  
  // Active status (for soft deletion)
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
userLocationSchema.index({ userId: 1, isActive: 1 });
userLocationSchema.index({ locationId: 1, isActive: 1 });
userLocationSchema.index({ userId: 1, isPrimary: 1, isActive: 1 });
userLocationSchema.index({ userId: 1, locationId: 1 }, { unique: true }); // Prevent duplicate assignments
userLocationSchema.index({ expiresAt: 1 }, { sparse: true }); // Sparse index for optional field

// Method to check if assignment is expired
userLocationSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to check if assignment is valid (active and not expired)
userLocationSchema.methods.isValid = function() {
  return this.isActive && !this.isExpired();
};

// Static method to find all active locations for a user
userLocationSchema.statics.findUserLocations = function(userId, includeInactive = false) {
  const query = { userId };
  if (!includeInactive) {
    query.isActive = true;
    query.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ];
  }
  return this.find(query).populate('locationId');
};

// Static method to find primary location for a user
userLocationSchema.statics.findPrimaryLocation = function(userId) {
  return this.findOne({ 
    userId, 
    isPrimary: true, 
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate('locationId');
};

// Static method to find all users assigned to a location
userLocationSchema.statics.findLocationUsers = function(locationId, includeInactive = false) {
  const query = { locationId };
  if (!includeInactive) {
    query.isActive = true;
    query.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: { $gt: new Date() } }
    ];
  }
  return this.find(query).populate('userId');
};

// Static method to assign location to user
userLocationSchema.statics.assignLocation = async function(userId, locationId, options = {}) {
  const {
    scope = 'exact',
    isPrimary = false,
    assignedBy = null,
    expiresAt = null,
    session = null
  } = options;
  
  // If setting as primary, unset other primary locations for this user
  if (isPrimary) {
    await this.updateMany(
      { userId, isPrimary: true },
      { isPrimary: false }
    ).session(session);
  }
  
  // Check if assignment already exists
  const existing = await this.findOne({ userId, locationId }).session(session);
  
  if (existing) {
    // Update existing assignment
    existing.scope = scope;
    existing.isPrimary = isPrimary;
    existing.assignedBy = assignedBy;
    existing.expiresAt = expiresAt;
    existing.isActive = true;
    existing.assignedAt = new Date();
    return existing.save({ session });
  } else {
    // Create new assignment
    return this.create([{
      userId,
      locationId,
      scope,
      isPrimary,
      assignedBy,
      expiresAt,
      assignedAt: new Date()
    }], { session }).then(docs => docs[0]);
  }
};

// Static method to revoke location assignment
userLocationSchema.statics.revokeLocation = function(userId, locationId) {
  return this.updateOne(
    { userId, locationId },
    { isActive: false }
  );
};

// Pre-save hook to ensure only one primary location per user
userLocationSchema.pre('save', async function(next) {
  if (this.isPrimary && this.isNew) {
    // Unset other primary locations for this user
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id }, isPrimary: true },
      { isPrimary: false }
    );
  }
  next();
});

const UserLocation = mongoose.model('UserLocation', userLocationSchema);

module.exports = UserLocation;
