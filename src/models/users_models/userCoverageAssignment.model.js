const mongoose = require('mongoose');

/**
 * User Coverage Assignment Model
 * 
 * Links users to coverage areas (not direct locations).
 * Replaces/enhances UserLocation model with coverage area-based assignments.
 * 
 * Features:
 * - Users can be assigned to multiple coverage areas
 * - Supports primary coverage assignment flag
 * - Supports temporary assignments with expiration
 * - Tracks who assigned the coverage and when
 * 
 * Use Cases:
 * - Coordinator assigned to "Camarines Norte – Unified" coverage area
 * - Staff member managing multiple provinces via multiple coverage areas
 * - Temporary assignment for special events
 * 
 * @see CoverageArea model for coverage area definitions
 * @see User model for user information
 * @see UserLocation model (legacy, for backward compatibility)
 */
const userCoverageAssignmentSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    
  },
  
  // Coverage area reference
  coverageAreaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CoverageArea',
    required: true,
    
  },
  
  // Primary coverage assignment flag (user's main/primary coverage)
  isPrimary: {
    type: Boolean,
    default: false,
    
  },
  
  // Auto-cover descendants flag
  // If true, user automatically covers all descendant locations (barangays) under this coverage area
  // For coordinators: typically true (auto-covers all barangays under their municipalities)
  // For stakeholders: typically false (assigned to specific municipality/barangay)
  autoCoverDescendants: {
    type: Boolean,
    default: false,
    
  },
  
  // User who assigned this coverage (admin/system)
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // Assignment timestamp
  assignedAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  
  // Optional expiration date for temporary assignments
  expiresAt: {
    type: Date,
    required: false,
    
  },
  
  // Active status (for soft deletion)
  isActive: {
    type: Boolean,
    default: true,
    
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
userCoverageAssignmentSchema.index({ userId: 1, isActive: 1 });
userCoverageAssignmentSchema.index({ coverageAreaId: 1, isActive: 1 });
userCoverageAssignmentSchema.index({ userId: 1, isPrimary: 1, isActive: 1 });
userCoverageAssignmentSchema.index({ userId: 1, coverageAreaId: 1 }, { unique: true }); // Prevent duplicate assignments
userCoverageAssignmentSchema.index({ expiresAt: 1 }, { sparse: true }); // Sparse index for optional field

// Method to check if assignment is expired
userCoverageAssignmentSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to check if assignment is valid (active and not expired)
userCoverageAssignmentSchema.methods.isValid = function() {
  return this.isActive && !this.isExpired();
};

// Static method to find all active coverage areas for a user
userCoverageAssignmentSchema.statics.findUserCoverageAreas = function(userId, includeInactive = false) {
  const query = { userId };
  if (!includeInactive) {
    query.isActive = true;
    query.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ];
  }
  // Populate coverageAreaId and nested geographicUnits
  return this.find(query).populate({
    path: 'coverageAreaId',
    populate: {
      path: 'geographicUnits',
      model: 'Location'
    }
  });
};

// Static method to find primary coverage area for a user
userCoverageAssignmentSchema.statics.findPrimaryCoverageArea = function(userId) {
  return this.findOne({ 
    userId, 
    isPrimary: true, 
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate({
    path: 'coverageAreaId',
    populate: {
      path: 'geographicUnits',
      model: 'Location'
    }
  });
};

// Static method to find all users assigned to a coverage area
userCoverageAssignmentSchema.statics.findCoverageAreaUsers = function(coverageAreaId, includeInactive = false) {
  const query = { coverageAreaId };
  if (!includeInactive) {
    query.isActive = true;
    query.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ];
  }
  return this.find(query).populate('userId');
};

// Static method to assign coverage area to user
userCoverageAssignmentSchema.statics.assignCoverageArea = async function(userId, coverageAreaId, options = {}) {
  const {
    isPrimary = false,
    autoCoverDescendants = false,
    assignedBy = null,
    expiresAt = null,
    session = null
  } = options;
  
  // If setting as primary, unset other primary assignments for this user
  if (isPrimary) {
    await this.updateMany(
      { userId, isPrimary: true },
      { isPrimary: false }
    ).session(session);
  }
  
  // Check if assignment already exists
  const existing = await this.findOne({ userId, coverageAreaId }).session(session);
  
  if (existing) {
    // Update existing assignment
    existing.isPrimary = isPrimary;
    existing.autoCoverDescendants = autoCoverDescendants;
    existing.assignedBy = assignedBy;
    existing.expiresAt = expiresAt;
    existing.isActive = true;
    existing.assignedAt = new Date();
    return existing.save({ session });
  } else {
    // Create new assignment
    return this.create([{
      userId,
      coverageAreaId,
      isPrimary,
      autoCoverDescendants,
      assignedBy,
      expiresAt,
      assignedAt: new Date()
    }], { session }).then(docs => docs[0]);
  }
};

// Static method to revoke coverage area assignment
userCoverageAssignmentSchema.statics.revokeCoverageArea = function(userId, coverageAreaId) {
  return this.updateOne(
    { userId, coverageAreaId },
    { isActive: false }
  );
};

// Pre-save hook to ensure only one primary coverage per user
userCoverageAssignmentSchema.pre('save', async function(next) {
  if (this.isPrimary && this.isNew) {
    // Unset other primary assignments for this user
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id }, isPrimary: true },
      { isPrimary: false }
    );
  }
  next();
});

const UserCoverageAssignment = mongoose.model('UserCoverageAssignment', userCoverageAssignmentSchema);

module.exports = UserCoverageAssignment;

