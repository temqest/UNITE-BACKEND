const { CoverageArea, Location, Organization } = require('../../models');

/**
 * Coverage Area Service
 * 
 * Handles CRUD operations for coverage areas and geographic unit lookups.
 */
class CoverageAreaService {
  /**
   * Create a new coverage area
   * @param {Object} data - Coverage area data
   * @param {string} data.name - Coverage area name (required)
   * @param {Array<ObjectId>} data.geographicUnits - Array of Location IDs (required)
   * @param {ObjectId} data.organizationId - Optional organization ID
   * @param {string} data.code - Optional unique code (auto-generated if not provided)
   * @param {string} data.description - Optional description
   * @param {Object} data.metadata - Optional metadata
   * @returns {Promise<Object>} Created CoverageArea document
   */
  async createCoverageArea(data) {
    try {
      const { name, geographicUnits, organizationId, code, description, metadata } = data;

      if (!name) {
        throw new Error('Name is required');
      }

      if (!geographicUnits || !Array.isArray(geographicUnits) || geographicUnits.length === 0) {
        throw new Error('At least one geographic unit is required');
      }

      // Validate all geographic units exist
      const locations = await Location.find({ _id: { $in: geographicUnits }, isActive: true });
      if (locations.length !== geographicUnits.length) {
        throw new Error('One or more geographic units not found or inactive');
      }

      // Validate organization if provided
      if (organizationId) {
        const organization = await Organization.findById(organizationId);
        if (!organization) {
          throw new Error('Organization not found');
        }
        if (!organization.isActive) {
          throw new Error('Organization is not active');
        }
      }

      // Check for duplicate code if provided
      if (code) {
        const existing = await CoverageArea.findOne({ code: code.toLowerCase() });
        if (existing) {
          throw new Error('Coverage area with this code already exists');
        }
      }

      // Create coverage area
      const coverageArea = new CoverageArea({
        name,
        code: code || null,
        description: description || null,
        geographicUnits,
        organizationId: organizationId || null,
        metadata: metadata || { isDefault: false, tags: [], custom: {} },
        isActive: true
      });

      await coverageArea.save();
      return coverageArea;
    } catch (error) {
      throw new Error(`Failed to create coverage area: ${error.message}`);
    }
  }

  /**
   * Update a coverage area
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated CoverageArea document
   */
  async updateCoverageArea(coverageAreaId, data) {
    try {
      const coverageArea = await CoverageArea.findById(coverageAreaId);
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }

      // Validate geographic units if provided
      if (data.geographicUnits) {
        if (!Array.isArray(data.geographicUnits) || data.geographicUnits.length === 0) {
          throw new Error('At least one geographic unit is required');
        }

        const locations = await Location.find({ _id: { $in: data.geographicUnits }, isActive: true });
        if (locations.length !== data.geographicUnits.length) {
          throw new Error('One or more geographic units not found or inactive');
        }
      }

      // Validate organization if provided
      if (data.organizationId) {
        const organization = await Organization.findById(data.organizationId);
        if (!organization) {
          throw new Error('Organization not found');
        }
        if (!organization.isActive) {
          throw new Error('Organization is not active');
        }
      }

      // Check for duplicate code if provided
      if (data.code) {
        const existing = await CoverageArea.findOne({ 
          code: data.code.toLowerCase(), 
          _id: { $ne: coverageAreaId } 
        });
        if (existing) {
          throw new Error('Coverage area with this code already exists');
        }
      }

      // Update fields
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== '_id' && key !== '__v') {
          if (key === 'metadata' && typeof data[key] === 'object') {
            // Merge metadata instead of replacing
            coverageArea.metadata = { ...coverageArea.metadata, ...data[key] };
          } else {
            coverageArea[key] = data[key];
          }
        }
      });

      await coverageArea.save();
      return coverageArea;
    } catch (error) {
      throw new Error(`Failed to update coverage area: ${error.message}`);
    }
  }

  /**
   * Get a coverage area by ID
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @returns {Promise<Object>} CoverageArea document
   */
  async getCoverageArea(coverageAreaId) {
    try {
      const coverageArea = await CoverageArea.findById(coverageAreaId)
        .populate('geographicUnits')
        .populate('organizationId');
      
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }
      return coverageArea;
    } catch (error) {
      throw new Error(`Failed to get coverage area: ${error.message}`);
    }
  }

  /**
   * List coverage areas with optional filters
   * @param {Object} filters - Filter options
   * @param {ObjectId} filters.organizationId - Filter by organization
   * @param {ObjectId} filters.geographicUnitId - Filter by geographic unit
   * @param {boolean} filters.isActive - Filter by active status
   * @param {string} filters.search - Search by name or code
   * @param {Array<string>} filters.tags - Filter by tags
   * @param {number} filters.limit - Limit results
   * @param {number} filters.skip - Skip results (pagination)
   * @returns {Promise<Object>} Object with coverageAreas array and total count
   */
  async listCoverageAreas(filters = {}) {
    try {
      const { 
        organizationId, 
        geographicUnitId, 
        isActive, 
        search, 
        tags,
        limit = 100, 
        skip = 0 
      } = filters;

      const query = {};

      if (organizationId) {
        query.organizationId = organizationId;
      }

      if (geographicUnitId) {
        query.geographicUnits = geographicUnitId;
      }

      if (isActive !== undefined) {
        query.isActive = isActive;
      } else {
        query.isActive = true; // Default to active only
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } }
        ];
      }

      if (tags && Array.isArray(tags) && tags.length > 0) {
        query['metadata.tags'] = { $in: tags };
      }

      const coverageAreas = await CoverageArea.find(query)
        .populate('geographicUnits')
        .populate('organizationId')
        .sort({ name: 1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip));

      const total = await CoverageArea.countDocuments(query);

      return {
        coverageAreas,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      };
    } catch (error) {
      throw new Error(`Failed to list coverage areas: ${error.message}`);
    }
  }

  /**
   * Delete a coverage area (soft delete)
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @returns {Promise<Object>} Updated CoverageArea document
   */
  async deleteCoverageArea(coverageAreaId) {
    try {
      const coverageArea = await CoverageArea.findById(coverageAreaId);
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }

      coverageArea.isActive = false;
      await coverageArea.save();

      return coverageArea;
    } catch (error) {
      throw new Error(`Failed to delete coverage area: ${error.message}`);
    }
  }

  /**
   * Get all geographic units in a coverage area
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @returns {Promise<Array>} Array of Location documents
   */
  async getCoverageAreaGeographicUnits(coverageAreaId) {
    try {
      const coverageArea = await CoverageArea.findById(coverageAreaId)
        .populate('geographicUnits');
      
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }

      return coverageArea.geographicUnits;
    } catch (error) {
      throw new Error(`Failed to get coverage area geographic units: ${error.message}`);
    }
  }

  /**
   * Get geographic units for a coverage area (helper for permission checks)
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @returns {Promise<Array<ObjectId>>} Array of Location IDs
   */
  async getGeographicUnitsForCoverage(coverageAreaId) {
    try {
      const coverageArea = await CoverageArea.findById(coverageAreaId);
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }

      return coverageArea.geographicUnits;
    } catch (error) {
      throw new Error(`Failed to get geographic units for coverage: ${error.message}`);
    }
  }

  /**
   * Find all coverage areas containing a specific geographic unit
   * @param {ObjectId} geographicUnitId - Geographic unit (Location) ID
   * @returns {Promise<Array>} Array of CoverageArea documents
   */
  async findCoverageAreasByGeographicUnit(geographicUnitId) {
    try {
      // Verify geographic unit exists
      const location = await Location.findById(geographicUnitId);
      if (!location) {
        throw new Error('Geographic unit not found');
      }

      // Find coverage areas containing this geographic unit
      const coverageAreas = await CoverageArea.findByGeographicUnit(geographicUnitId);
      return coverageAreas;
    } catch (error) {
      throw new Error(`Failed to find coverage areas by geographic unit: ${error.message}`);
    }
  }

  /**
   * Add a geographic unit to a coverage area
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @param {ObjectId} geographicUnitId - Geographic unit (Location) ID
   * @returns {Promise<Object>} Updated CoverageArea document
   */
  async addGeographicUnit(coverageAreaId, geographicUnitId) {
    try {
      const coverageArea = await CoverageArea.findById(coverageAreaId);
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }

      // Verify geographic unit exists
      const location = await Location.findById(geographicUnitId);
      if (!location) {
        throw new Error('Geographic unit not found');
      }
      if (!location.isActive) {
        throw new Error('Geographic unit is not active');
      }

      // Add if not already present
      if (!coverageArea.containsGeographicUnit(geographicUnitId)) {
        coverageArea.addGeographicUnit(geographicUnitId);
        await coverageArea.save();
      }

      return coverageArea;
    } catch (error) {
      throw new Error(`Failed to add geographic unit: ${error.message}`);
    }
  }

  /**
   * Remove a geographic unit from a coverage area
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @param {ObjectId} geographicUnitId - Geographic unit (Location) ID
   * @returns {Promise<Object>} Updated CoverageArea document
   */
  async removeGeographicUnit(coverageAreaId, geographicUnitId) {
    try {
      const coverageArea = await CoverageArea.findById(coverageAreaId);
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }

      // Ensure at least one geographic unit remains
      if (coverageArea.geographicUnits.length <= 1) {
        throw new Error('Coverage area must contain at least one geographic unit');
      }

      coverageArea.removeGeographicUnit(geographicUnitId);
      await coverageArea.save();

      return coverageArea;
    } catch (error) {
      throw new Error(`Failed to remove geographic unit: ${error.message}`);
    }
  }
}

module.exports = new CoverageAreaService();

