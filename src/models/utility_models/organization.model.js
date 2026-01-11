const mongoose = require('mongoose');

/**
 * Organization Model
 * 
 * Represents organizations such as NGOs, blood banks, hospitals, LGUs, etc.
 * Organizations can operate in one or many geographic units through Coverage Areas.
 * 
 * Features:
 * - Supports multiple organization types (LGU, NGO, Hospital, BloodBank, etc.)
 * - Can be linked to Coverage Areas for operational coverage
 * - Flexible metadata for custom organization-specific data
 * 
 * @see CoverageArea model for operational coverage
 * @see User model for organization membership
 */
const organizationSchema = new mongoose.Schema({
  // Organization name (e.g., "Red Cross Bicol", "Naga City Blood Bank")
  name: {
    type: String,
    required: true,
    trim: true,
    
  },
  
  // Unique code (slug-based, e.g., 'red-cross-bicol', 'naga-blood-bank')
  code: {
    type: String,
    required: false,
    trim: true,
    lowercase: true,
    
  },
  
  // Organization type
  type: {
    type: String,
    enum: ['LGU', 'NGO', 'Hospital', 'BloodBank', 'RedCross', 'Non-LGU', 'Other'],
    required: true,
    
  },
  
  // Description of the organization
  description: {
    type: String,
    required: false,
    trim: true
  },
  
  // Contact information
  contactInfo: {
    email: {
      type: String,
      required: false,
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: false,
      trim: true
    },
    address: {
      type: String,
      required: false,
      trim: true
    }
  },
  
  // Active status
  isActive: {
    type: Boolean,
    default: true,
    
  },
  
  // Flexible metadata for custom organization-specific data
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for common queries
organizationSchema.index({ name: 1, type: 1 });
organizationSchema.index({ code: 1 }, { unique: true, sparse: true });
organizationSchema.index({ isActive: 1, type: 1 });

// Static method to find by code
organizationSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toLowerCase(), isActive: true });
};

// Static method to find by type
organizationSchema.statics.findByType = function(type) {
  return this.find({ type, isActive: true }).sort({ name: 1 });
};

// Pre-save hook to generate code from name if not provided
organizationSchema.pre('save', async function(next) {
  if (!this.code && this.name) {
    // Generate code from name
    this.code = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Ensure uniqueness
    let counter = 1;
    let uniqueCode = this.code;
    while (await this.constructor.findOne({ code: uniqueCode, _id: { $ne: this._id } })) {
      uniqueCode = `${this.code}-${counter}`;
      counter++;
    }
    this.code = uniqueCode;
  }
  
  // Ensure email is lowercase
  if (this.contactInfo?.email) {
    this.contactInfo.email = this.contactInfo.email.toLowerCase();
  }
  
  next();
});

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;

