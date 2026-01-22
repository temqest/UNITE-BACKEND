const mongoose = require('mongoose');

/**
 * Flexible Location Model
 * 
 * Supports flexible hierarchical location structure for Philippine administrative divisions.
 * Self-referencing parent-child relationships allow any hierarchy depth.
 * 
 * Features:
 * - Supports provinces, districts, cities, municipalities, barangays, and custom types
 * - Handles special cases: cities acting as districts, combined districts, province-wide coverage
 * - Denormalized province reference for efficient queries
 * - Metadata field for special case flags (isCity, isCombined, operationalGroup)
 * 
 * @see UserLocation model for user-location assignments
 */
const locationSchema = new mongoose.Schema({
  // Unique code (slug-based, e.g., 'camarines-sur', 'naga-city')
  code: {
    type: String,
    required: false,
    trim: true,
    lowercase: true
  },
  
  // Display name (e.g., 'Camarines Sur', 'Naga City')
  name: {
    type: String,
    required: true,
    trim: true,
    
  },
  
  // Location type
  type: {
    type: String,
    enum: ['province', 'district', 'city', 'municipality', 'barangay', 'custom'],
    required: true,
    
  },
  
  // Self-referencing parent location (optional for root/province level)
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: false,
    
  },
  
  // Hierarchical level (informational, not enforced)
  // 0 = root/province, 1 = district, 2 = municipality, etc.
  level: {
    type: Number,
    required: false,
    default: 0,
    
  },
  
  // Denormalized province reference for efficient queries
  // Automatically set based on parent hierarchy
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    required: false,
    
  },
  
  // Official administrative code (optional)
  administrativeCode: {
    type: String,
    required: false,
    trim: true
  },
  
  // Metadata for special cases
  metadata: {
    // Flag for cities acting as districts (e.g., Naga City, Iriga City)
    isCity: {
      type: Boolean,
      default: false
    },
    
    // Flag for combined districts (e.g., "All LGUs (District I & II)")
    isCombined: {
      type: Boolean,
      default: false
    },
    
    // Operational grouping identifier (e.g., "Camarines Norte All LGUs")
    operationalGroup: {
      type: String,
      required: false,
      trim: true
    },
    
    // Additional flexible metadata
    custom: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  
  // Active status
  isActive: {
    type: Boolean,
    default: true,
    
  }
}, {
  timestamps: true
});

// Indexes for common queries
locationSchema.index({ code: 1 }, { unique: true, sparse: true });
locationSchema.index({ name: 1, type: 1 });
locationSchema.index({ parent: 1, type: 1 });
locationSchema.index({ province: 1, type: 1 });
locationSchema.index({ level: 1, isActive: 1 });
locationSchema.index({ 'metadata.isCity': 1 });
locationSchema.index({ 'metadata.isCombined': 1 });

// PERFORMANCE OPTIMIZED INDEXES for tree queries
// These compound indexes significantly speed up hierarchical queries
locationSchema.index({ parent: 1, isActive: 1, type: 1 }); // For finding active children of a parent
locationSchema.index({ type: 1, isActive: 1, name: 1 }); // For finding all provinces/districts/municipalities
locationSchema.index({ province: 1, type: 1, isActive: 1 }); // For finding locations within a province

// Virtual for full path (e.g., "Camarines Sur > District I > Naga City")
locationSchema.virtual('path').get(function() {
  // This would need to be populated or computed via a method
  return this.name;
});

// Method to check if location is a province
locationSchema.methods.isProvince = function() {
  return this.type === 'province' || (this.type === 'city' && this.level === 0);
};

// Method to check if location is a district (or city acting as district)
locationSchema.methods.isDistrict = function() {
  return this.type === 'district' || (this.type === 'city' && this.metadata?.isCity === true);
};

// Method to check if location is a municipality
locationSchema.methods.isMunicipality = function() {
  return this.type === 'municipality';
};

// Static method to find by code
locationSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toLowerCase() });
};

// Static method to find all children of a location
locationSchema.statics.findChildren = function(parentId) {
  return this.find({ parent: parentId, isActive: true });
};

// DEPRECATED: Use findDescendantsOptimized() instead
// This recursive approach causes N+1 query problem and is extremely slow
locationSchema.statics.findDescendants = async function(locationId) {
  const descendants = [];
  const children = await this.find({ parent: locationId, isActive: true });
  
  for (const child of children) {
    descendants.push(child);
    const childDescendants = await this.findDescendants(child._id);
    descendants.push(...childDescendants);
  }
  
  return descendants;
};

// OPTIMIZED: Single-pass MongoDB aggregation using $graphLookup
// Eliminates N+1 query problem. ~100x faster than recursive approach.
// Traverses entire location tree in MongoDB (single query) instead of application code
locationSchema.statics.findDescendantsOptimized = async function(locationId, options = {}) {
  const { 
    includeSelf = false,
    includeInactive = false,
    maxDepth = 10
  } = options;

  try {
    const locationIdObj = mongoose.Types.ObjectId.isValid(locationId) 
      ? new mongoose.Types.ObjectId(locationId)
      : locationId;

    const matchCondition = includeInactive 
      ? {} 
      : { isActive: true };

    const results = await this.aggregate([
      {
        // Start with the specified location
        $match: { _id: locationIdObj }
      },
      {
        // Recursive tree lookup: find all descendants
        $graphLookup: {
          from: 'locations',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent',
          as: 'descendants',
          maxDepth,
          restrictSearchWithMatch: matchCondition
        }
      },
      {
        // Unwind descendants array to get individual documents
        $unwind: {
          path: '$descendants',
          preserveNullAndEmptyArrays: false
        }
      },
      {
        // Return only the descendant documents (not the parent)
        $replaceRoot: {
          newRoot: '$descendants'
        }
      }
    ]);

    // If includeSelf is true, prepend the root location
    if (includeSelf) {
      const rootLocation = await this.findById(locationIdObj);
      if (rootLocation && (includeInactive || rootLocation.isActive)) {
        return [rootLocation, ...results];
      }
    }

    return results;
  } catch (error) {
    console.error('[Location.findDescendantsOptimized] Error:', error);
    throw error;
  }
};

// Static method to find all ancestors (recursive)
locationSchema.statics.findAncestors = async function(locationId) {
  const ancestors = [];
  const location = await this.findById(locationId);
  
  if (!location || !location.parent) {
    return ancestors;
  }
  
  const parent = await this.findById(location.parent);
  if (parent) {
    ancestors.push(parent);
    const parentAncestors = await this.findAncestors(parent._id);
    ancestors.push(...parentAncestors);
  }
  
  return ancestors;
};

// Pre-save hook to update province reference and level based on parent
locationSchema.pre('save', async function(next) {
  // If this is a province, set level to 0
  if (this.type === 'province' || (!this.parent && this.level === 0)) {
    this.level = 0;
    // Province reference will be set in post-save hook to ensure _id is available
  } else if (this.parent) {
    // Get parent location
    const parent = await this.constructor.findById(this.parent);
    if (parent) {
      // Set level based on parent's level
      this.level = (parent.level || 0) + 1;
      
      // Set province reference (denormalized)
      if (parent.type === 'province') {
        this.province = parent._id;
      } else if (parent.province) {
        // Inherit parent's province reference
        this.province = parent.province;
      }
    }
  }
  
  // Generate code from name if not provided
  if (!this.code && this.name) {
    this.code = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  
  next();
});

// Post-save hook to set province reference for provinces and update children
locationSchema.post('save', async function() {
  // If this is a province, ensure province reference points to self
  if (this.type === 'province' && (!this.province || !this.province.equals(this._id))) {
    this.province = this._id;
    await this.constructor.updateOne({ _id: this._id }, { province: this._id });
  }
  
  // Update children's province references if this location's province or level changed
  if (this.isModified('province') || this.isModified('level')) {
    const children = await this.constructor.find({ parent: this._id });
    const provinceRef = this.type === 'province' ? this._id : this.province;
    
    for (const child of children) {
      child.level = (this.level || 0) + 1;
      if (provinceRef) {
        child.province = provinceRef;
      }
      await child.save();
    }
  }
});

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
