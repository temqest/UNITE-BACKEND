const mongoose = require('mongoose');

/**
 * Unified User Model
 * 
 * Replaces BloodbankStaff, SystemAdmin, Coordinator, and Stakeholder models.
 * Supports RBAC through UserRole relationships.
 * 
 * @see Role, Permission, UserRole models for RBAC implementation
 */
const userSchema = new mongoose.Schema({
  // Legacy ID for backward compatibility
  // Maps to: BloodbankStaff.ID, SystemAdmin.Admin_ID, Coordinator.Coordinator_ID, Stakeholder.Stakeholder_ID
  userId: {
    type: String,
    required: false, // Optional for new users, required for migrated users
    unique: true,
    sparse: true, // Allows multiple null values
    trim: true
  },
  
  // Authentication & Contact
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  
  password: {
    type: String,
    required: true
  },
  
  // Personal Information
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  
  middleName: {
    type: String,
    required: false,
    trim: true
  },
  
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  
  phoneNumber: {
    type: String,
    required: false,
    trim: true
  },
  
  // Organization Information
  organizationType: {
    type: String,
    enum: ['LGU', 'NGO', 'Hospital', 'RedCross', 'Non-LGU', 'Other'],
    required: false // Can be set later for existing users
  },
  
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization', // Future model reference
    required: false
  },
  
  // Additional organization details (from Stakeholder model)
  organizationInstitution: {
    type: String,
    required: false,
    trim: true
  },
  
  field: {
    type: String,
    required: false,
    trim: true
  },
  
  registrationCode: {
    type: String,
    required: false,
    trim: true
  },
  
  // System Admin Flag
  // Simplified flag for system administrators (replaces SystemAdmin model)
  isSystemAdmin: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  lastLoginAt: {
    type: Date,
    required: false
  },
  
  // Flexible metadata field for future extensions
  // Can store: AccessLevel (from SystemAdmin), accountType (from Coordinator/Stakeholder), etc.
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for common queries
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ userId: 1 }, { unique: true, sparse: true });
userSchema.index({ isActive: 1, isSystemAdmin: 1 });
userSchema.index({ organizationType: 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  const parts = [this.firstName];
  if (this.middleName) parts.push(this.middleName);
  parts.push(this.lastName);
  return parts.join(' ');
});

// Method to check if user is active
userSchema.methods.isAccountActive = function() {
  return this.isActive === true;
};

// Method to update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

// Static method to find by email
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Static method to find by legacy userId
userSchema.statics.findByLegacyId = function(userId) {
  return this.findOne({ userId: userId });
};

// Pre-save hook to ensure email is lowercase
userSchema.pre('save', function(next) {
  if (this.isModified('email')) {
    this.email = this.email.toLowerCase();
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
