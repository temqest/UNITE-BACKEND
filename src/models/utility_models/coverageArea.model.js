const mongoose = require('mongoose');

/**
 * Coverage Area Model
 * 
 * Represents logical groupings of geographic units (locations).
 * Coverage areas are flexible, non-hierarchical, and can overlap.
 * 
 * Features:
 * - Can contain any mix of geographic units (provinces, cities, districts, municipalities)
 * - Can overlap with other coverage areas
 * - Can be owned by an organization
 * - Supports special cases like "Camarines Norte – Unified", multi-province coverage, etc.
 * 
 * Examples:
 * - "Camarines Norte – Unified" → Contains province + all districts + all municipalities
 * - "Naga City & Iriga City" → Contains two cities
 * - "Region V Multi-Province" → Contains multiple provinces
 * 
 * @see Location model for geographic units
 * @see Organization model for organization ownership
 * @see UserCoverageAssignment model for staff assignments
 */
const coverageAreaSchema = new mongoose.Schema({
  // Coverage area name (e.g., "Camarines Norte – Unified", "Naga City & Iriga City")
  name: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  // Unique code (slug-based, e.g., 'camarines-norte-unified', 'naga-iriga')
  code: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // Allows multiple null values
    trim: true,
    lowercase: true,
    index: true
  },
  
  // Description of the coverage area
  description: {
    type: String,
    required: false,
    trim: true
  },
  
  // Array of geographic unit IDs (Location references)
  // Can contain any mix: provinces, cities, districts, municipalities, etc.
  geographicUnits: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: true
  }],
  
  // Optional: Organization that owns/operates this coverage area
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: false,
    index: true
  },
  
  // Active status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Metadata for additional configuration
  metadata: {
    // Default coverage for an organization
    isDefault: {
      type: Boolean,
      default: false
    },
    
    // Tags for filtering/searching (e.g., ['unified', 'multi-province', 'city-group'])
    tags: [{
      type: String,
      trim: true
    }],
    
    // Additional flexible metadata
    custom: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }
}, {
  timestamps: true
});

// Indexes for common queries
coverageAreaSchema.index({ name: 1, isActive: 1 });
coverageAreaSchema.index({ code: 1 }, { unique: true, sparse: true });
coverageAreaSchema.index({ organizationId: 1, isActive: 1 });
coverageAreaSchema.index({ geographicUnits: 1 }); // For reverse lookup
coverageAreaSchema.index({ 'metadata.isDefault': 1, organizationId: 1 });
coverageAreaSchema.index({ 'metadata.tags': 1 });

// Static method to find by code
coverageAreaSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toLowerCase(), isActive: true });
};

// Static method to find coverage areas containing a specific geographic unit
coverageAreaSchema.statics.findByGeographicUnit = function(geographicUnitId) {
  return this.find({
    geographicUnits: geographicUnitId,
    isActive: true
  });
};

// Static method to find coverage areas for an organization
coverageAreaSchema.statics.findByOrganization = function(organizationId) {
  return this.find({
    organizationId,
    isActive: true
  }).sort({ 'metadata.isDefault': -1, name: 1 });
};

// Method to check if coverage area contains a geographic unit
coverageAreaSchema.methods.containsGeographicUnit = function(geographicUnitId) {
  return this.geographicUnits.some(unit => 
    unit.toString() === geographicUnitId.toString()
  );
};

// Method to add a geographic unit
coverageAreaSchema.methods.addGeographicUnit = function(geographicUnitId) {
  if (!this.containsGeographicUnit(geographicUnitId)) {
    this.geographicUnits.push(geographicUnitId);
  }
  return this;
};

// Method to remove a geographic unit
coverageAreaSchema.methods.removeGeographicUnit = function(geographicUnitId) {
  this.geographicUnits = this.geographicUnits.filter(unit => 
    unit.toString() !== geographicUnitId.toString()
  );
  return this;
};

// Pre-save hook to generate code from name if not provided
coverageAreaSchema.pre('save', async function(next) {
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
  
  // Ensure at least one geographic unit
  if (this.geographicUnits.length === 0) {
    return next(new Error('Coverage area must contain at least one geographic unit'));
  }
  
  next();
});

// Pre-save hook to ensure only one default coverage per organization
coverageAreaSchema.pre('save', async function(next) {
  if (this.metadata?.isDefault && this.organizationId) {
    // Unset other default coverage areas for this organization
    await this.constructor.updateMany(
      {
        organizationId: this.organizationId,
        _id: { $ne: this._id },
        'metadata.isDefault': true
      },
      {
        $set: { 'metadata.isDefault': false }
      }
    );
  }
  next();
});

const CoverageArea = mongoose.model('CoverageArea', coverageAreaSchema);

module.exports = CoverageArea;

