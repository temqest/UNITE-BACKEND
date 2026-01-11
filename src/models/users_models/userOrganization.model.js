const mongoose = require('mongoose');

/**
 * User Organization Model
 * 
 * Links users to organizations with support for multiple organizations per user.
 * Replaces/enhances single User.organizationId with a many-to-many relationship.
 * 
 * Features:
 * - Users can belong to multiple organizations
 * - Supports role within organization (coordinator, member, etc.)
 * - Primary organization flag
 * - Tracks assignment history
 * - Supports temporary assignments with expiration
 * 
 * Use Cases:
 * - Coordinator managing multiple organizations (LGU, NGO, Hospital)
 * - Stakeholder belonging to one organization
 * - Staff member with multiple organizational affiliations
 * 
 * @see User model for user information
 * @see Organization model for organization definitions
 */
const userOrganizationSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    
  },
  
  // Organization reference
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    
  },
  
  // Role within the organization (e.g., 'coordinator', 'member', 'admin')
  roleInOrg: {
    type: String,
    required: false,
    trim: true,
    default: 'member'
  },
  
  // Primary organization flag (user's main/primary organization)
  isPrimary: {
    type: Boolean,
    default: false,
    
  },
  
  // User who assigned this organization (admin/system)
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
userOrganizationSchema.index({ userId: 1, isActive: 1 });
userOrganizationSchema.index({ organizationId: 1, isActive: 1 });
userOrganizationSchema.index({ userId: 1, isPrimary: 1, isActive: 1 });
userOrganizationSchema.index({ userId: 1, organizationId: 1 }, { unique: true }); // Prevent duplicate assignments
userOrganizationSchema.index({ expiresAt: 1 }, { sparse: true }); // Sparse index for optional field

// Method to check if assignment is expired
userOrganizationSchema.methods.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Method to check if assignment is valid (active and not expired)
userOrganizationSchema.methods.isValid = function() {
  return this.isActive && !this.isExpired();
};

// Static method to find all active organizations for a user
userOrganizationSchema.statics.findUserOrganizations = function(userId, includeInactive = false) {
  const query = { userId };
  if (!includeInactive) {
    query.isActive = true;
    query.$or = [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ];
  }
  return this.find(query).populate('organizationId').sort({ isPrimary: -1, assignedAt: -1 });
};

// Static method to find primary organization for a user
userOrganizationSchema.statics.findPrimaryOrganization = function(userId) {
  return this.findOne({ 
    userId, 
    isPrimary: true, 
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate('organizationId');
};

// Static method to find all users in an organization
userOrganizationSchema.statics.findOrganizationUsers = function(organizationId, includeInactive = false) {
  const query = { organizationId };
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

// Static method to assign organization to user
userOrganizationSchema.statics.assignOrganization = async function(userId, organizationId, options = {}) {
  const {
    roleInOrg = 'member',
    isPrimary = false,
    assignedBy = null,
    expiresAt = null,
    session = null
  } = options;
  
  // If setting as primary, unset other primary organizations for this user
  if (isPrimary) {
    await this.updateMany(
      { userId, isPrimary: true },
      { isPrimary: false }
    ).session(session);
  }
  
  // Check if assignment already exists
  const existing = await this.findOne({ userId, organizationId }).session(session);
  
  if (existing) {
    // Update existing assignment
    existing.roleInOrg = roleInOrg;
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
      organizationId,
      roleInOrg,
      isPrimary,
      assignedBy,
      expiresAt,
      assignedAt: new Date()
    }], { session }).then(docs => docs[0]);
  }
};

// Static method to revoke organization assignment
userOrganizationSchema.statics.revokeOrganization = function(userId, organizationId, session = null) {
  return this.updateOne(
    { userId, organizationId },
    { isActive: false }
  ).session(session);
};

// Pre-save hook to ensure only one primary organization per user
userOrganizationSchema.pre('save', async function(next) {
  if (this.isPrimary && this.isNew) {
    // Unset other primary organizations for this user
    await this.constructor.updateMany(
      { userId: this.userId, _id: { $ne: this._id }, isPrimary: true },
      { isPrimary: false }
    );
  }
  next();
});

const UserOrganization = mongoose.model('UserOrganization', userOrganizationSchema);

module.exports = UserOrganization;

