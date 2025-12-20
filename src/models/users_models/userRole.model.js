const mongoose = require('mongoose');

/**
 * UserRole model - Links users to roles with optional location and organization scope
 * Note: References 'User' model which will be created in Phase 2 of the backend revamp
 */
const userRoleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Will be available after Phase 2 User model migration
    required: true
  },
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  expiresAt: {
    type: Date,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  context: {
    locationScope: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location'
    }],
    coverageAreaScope: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CoverageArea'
    }],
    organizationScope: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: false
    }
  }
}, {
  timestamps: true
});

// Indexes for faster lookups
userRoleSchema.index({ userId: 1, isActive: 1 });
userRoleSchema.index({ roleId: 1, isActive: 1 });
userRoleSchema.index({ userId: 1, roleId: 1 });
userRoleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for expired roles

const UserRole = mongoose.model('UserRole', userRoleSchema);

module.exports = UserRole;
