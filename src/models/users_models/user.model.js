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
    trim: true
  },
  
  // Authentication & Contact
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    
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
  // Note: No enum validation here - Organization model is the source of truth for valid types
  // This allows adding new organization types without updating User model
  organizationType: {
    type: String,
    required: false, // Can be set later for existing users
    trim: true
  },
  
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: false,
    
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
  
  // AUTHORITY: Explicit, persisted, never inferred
  authority: {
    type: Number,
    required: true,
    default: 20,
    min: 20,
    max: 100
  },

  // AUTHORITY AUDIT TRAIL
  authority_changed_at: {
    type: Date,
    required: false
  },

  authority_changed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // ROLES: Embedded array of role references with authority
  roles: [{
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true
    },
    roleCode: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    roleAuthority: {
      type: Number,
      required: true,
      min: 20,
      max: 100
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
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  
  // ORGANIZATIONS: Embedded array (coordinators can have multiple)
  organizations: [{
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    organizationName: {
      type: String,
      required: true,
      trim: true
    },
    organizationType: {
      type: String,
      required: true,
      trim: true
      // No enum validation - Organization.type is the source of truth
    },
    isPrimary: {
      type: Boolean,
      default: false
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }
  }],
  
  // COVERAGE: For coordinators (district-level)
  coverageAreas: [{
    coverageAreaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CoverageArea',
      required: true
    },
    coverageAreaName: {
      type: String,
      required: true,
      trim: true
    },
    districtIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location'
    }],
    municipalityIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location'
    }],
    isPrimary: {
      type: Boolean,
      default: false
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }
  }],
  
  // LOCATION: For stakeholders (municipality/barangay)
  locations: {
    municipalityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: false
    },
    municipalityName: {
      type: String,
      required: false,
      trim: true
    },
    barangayId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: false
    },
    barangayName: {
      type: String,
      required: false,
      trim: true
    }
  },
  
  // System Admin Flag
  // Simplified flag for system administrators (replaces SystemAdmin model)
  isSystemAdmin: {
    type: Boolean,
    default: false,
    
  },
  
  // Account Status
  isActive: {
    type: Boolean,
    default: true,
    
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
userSchema.index({ authority: 1 });
userSchema.index({ 'roles.roleId': 1 });
userSchema.index({ 'organizations.organizationId': 1 });
userSchema.index({ 'coverageAreas.coverageAreaId': 1 });
userSchema.index({ 'locations.municipalityId': 1 });

// PERFORMANCE: Compound indexes for stakeholder filtering queries
// These dramatically accelerate coverage-area filtered stakeholder lookups
userSchema.index({
  authority: 1,
  isActive: 1,
  'locations.municipalityId': 1
}, { name: 'idx_stakeholder_filter_by_municipality' });

userSchema.index({
  authority: 1,
  isActive: 1,
  'locations.districtId': 1
}, { name: 'idx_stakeholder_filter_by_district' });

// Index for organization type filtering
userSchema.index({
  authority: 1,
  'organizations.organizationType': 1,
  isActive: 1
}, { name: 'idx_stakeholder_filter_by_orgtype' });

// Index for authority + active status (common predicate in most queries)
userSchema.index({
  authority: 1,
  isActive: 1
}, { name: 'idx_authority_active' });

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

// Pre-save hook to track authority changes
userSchema.pre('save', function(next) {
  if (this.isModified('authority')) {
    this.authority_changed_at = new Date();
    // authority_changed_by should be set by the controller/service calling save()
    // If not set, leave as is (allows tracking of system-level updates)
  }
  next();
});

// Pre-save hook to validate user completeness
userSchema.pre('save', async function(next) {
  // Skip validation for system admins
  if (this.isSystemAdmin) {
    return next();
  }

  // Check if user has coordinator roles (even if authority not yet updated)
  const hasCoordinatorRole = this.roles && this.roles.some(role => {
    return role.roleAuthority >= 60 || role.roleCode === 'coordinator';
  });
  
  // Check if user has coverage areas assigned (indicates coordinator)
  const hasCoverageAreas = this.coverageAreas && this.coverageAreas.length > 0;
  
  // Check if user has organizations assigned (indicates coordinator if authority >= 60)
  const hasOrganizations = this.organizations && this.organizations.length > 0;
  
  // Determine if this is a coordinator based on authority, roles, or coverage areas
  const isCoordinator = this.authority >= 60 || hasCoordinatorRole || hasCoverageAreas;
  
  // Check if this is a new document (first save)
  const isNewDocument = this.isNew;

  // Skip validation for new documents during initial creation
  // Data will be assigned in subsequent saves within the transaction
  if (isNewDocument) {
    return next();
  }

  // For existing documents, only validate if user has roles assigned
  // This indicates the user creation process has progressed beyond initial setup
  const hasRoles = this.roles && this.roles.length > 0;
  
  // If no roles assigned yet, skip validation (still in creation process)
  if (!hasRoles) {
    return next();
  }

  // For coordinators: Validate only when both organizations AND coverage areas are present
  // This allows intermediate saves during creation without failing validation
  if (isCoordinator) {
    const hasOrganizations = this.organizations && this.organizations.length > 0;
    const hasCoverageAreas = this.coverageAreas && this.coverageAreas.length > 0;
    
    // Only validate if BOTH are present (creation is complete)
    // If either is missing, skip validation (still in creation process)
    if (hasOrganizations && hasCoverageAreas) {
      // Both are present, validation passes (no need to check again)
      return next();
    }
    
    // If either is missing, skip validation (still in creation process)
    // This allows saves after roles, after coverage areas, or after organizations
    // without failing validation until both are present
    return next();
  }

  // Stakeholders (authority < 60 and no coordinator indicators) must have municipality
  // Only validate if user has been fully created (has roles assigned)
  // Also check if user has coordinator roles or coverage areas (even if authority not updated)
  const hasCoordinatorIndicators = hasCoordinatorRole || hasCoverageAreas;
  const hasStakeholderRole = this.roles && this.roles.some(role => {
    return role.roleCode === 'stakeholder' || (role.roleAuthority < 60 && role.roleAuthority >= 30);
  });
  
  // Only validate stakeholders if:
  // 1. Not a new document (has been saved at least once)
  // 2. Has roles assigned (creation has progressed)
  // 3. Has stakeholder role (not a coordinator)
  // 4. No coordinator indicators (definitely a stakeholder)
  // 5. Authority < 60 (stakeholder level)
  // 6. Municipality is missing AND this is NOT during creation
  //    During creation, municipality is assigned after roles but before organizations
  //    So if organizations are assigned, creation is complete and municipality should exist
  if (!isCoordinator && !hasCoordinatorIndicators && hasStakeholderRole && this.authority < 60) {
    if (!isNewDocument && hasRoles) {
      // Check if this is during creation (organizations not assigned yet)
      // During stakeholder creation flow:
      // 1. User created with locations: {}
      // 2. Roles assigned and saved (locations still {}, no organizations) - SKIP validation
      // 3. Municipality assigned and saved (locations.municipalityId exists) - SKIP (organizations not assigned yet)
      // 4. Organizations assigned and saved (organizations exist) - VALIDATE (creation complete)
      const hasOrganizations = this.organizations && this.organizations.length > 0;
      
      // Only validate if municipality is missing AND organizations are assigned (creation is complete)
      // If organizations are not assigned yet, we're still in creation - municipality will be assigned
      if (!this.locations?.municipalityId && hasOrganizations) {
        return next(new Error('Stakeholders must have a municipality assignment'));
      }
      // If organizations are not assigned yet, allow save to proceed - creation in progress
    }
  }

  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;
