const { Organization, CoverageArea } = require('../../models');

/**
 * Organization Service
 * 
 * Handles CRUD operations for organizations and related coverage areas.
 */
class OrganizationService {
  /**
   * Create a new organization
   * @param {Object} data - Organization data
   * @param {string} data.name - Organization name (required)
   * @param {string} data.type - Organization type (required)
   * @param {string} data.code - Optional unique code (auto-generated if not provided)
   * @param {string} data.description - Optional description
   * @param {Object} data.contactInfo - Optional contact information
   * @param {Object} data.metadata - Optional metadata
   * @returns {Promise<Object>} Created Organization document
   */
  async createOrganization(data) {
    try {
      const { name, type, code, description, contactInfo, metadata } = data;

      if (!name || !type) {
        throw new Error('Name and type are required');
      }

      // Validate type
      const validTypes = ['LGU', 'NGO', 'Hospital', 'BloodBank', 'RedCross', 'Non-LGU', 'Other'];
      if (!validTypes.includes(type)) {
        throw new Error(`Invalid organization type. Must be one of: ${validTypes.join(', ')}`);
      }

      // Check for duplicate code if provided
      if (code) {
        const existing = await Organization.findOne({ code: code.toLowerCase() });
        if (existing) {
          throw new Error('Organization with this code already exists');
        }
      }

      // Create organization
      const organization = new Organization({
        name,
        type,
        code: code || null,
        description: description || null,
        contactInfo: contactInfo || {},
        metadata: metadata || {},
        isActive: true
      });

      await organization.save();
      return organization;
    } catch (error) {
      throw new Error(`Failed to create organization: ${error.message}`);
    }
  }

  /**
   * Update an organization
   * @param {ObjectId} organizationId - Organization ID
   * @param {Object} data - Update data
   * @returns {Promise<Object>} Updated Organization document
   */
  async updateOrganization(organizationId, data) {
    try {
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // Validate type if provided
      if (data.type) {
        const validTypes = ['LGU', 'NGO', 'Hospital', 'BloodBank', 'RedCross', 'Non-LGU', 'Other'];
        if (!validTypes.includes(data.type)) {
          throw new Error(`Invalid organization type. Must be one of: ${validTypes.join(', ')}`);
        }
      }

      // Check for duplicate code if provided
      if (data.code) {
        const existing = await Organization.findOne({ 
          code: data.code.toLowerCase(), 
          _id: { $ne: organizationId } 
        });
        if (existing) {
          throw new Error('Organization with this code already exists');
        }
      }

      // Update fields
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined && key !== '_id' && key !== '__v') {
          organization[key] = data[key];
        }
      });

      await organization.save();
      return organization;
    } catch (error) {
      throw new Error(`Failed to update organization: ${error.message}`);
    }
  }

  /**
   * Get an organization by ID
   * @param {ObjectId} organizationId - Organization ID
   * @returns {Promise<Object>} Organization document
   */
  async getOrganization(organizationId) {
    try {
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }
      return organization;
    } catch (error) {
      throw new Error(`Failed to get organization: ${error.message}`);
    }
  }

  /**
   * List organizations with optional filters
   * @param {Object} filters - Filter options
   * @param {string} filters.type - Filter by organization type
   * @param {boolean} filters.isActive - Filter by active status
   * @param {string} filters.search - Search by name or code
   * @param {number} filters.limit - Limit results
   * @param {number} filters.skip - Skip results (pagination)
   * @returns {Promise<Object>} Object with organizations array and total count
   */
  async listOrganizations(filters = {}) {
    try {
      const { type, isActive, search, limit = 100, skip = 0 } = filters;

      const query = {};

      if (type) {
        query.type = type;
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

      const organizations = await Organization.find(query)
        .sort({ name: 1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip));

      const total = await Organization.countDocuments(query);

      return {
        organizations,
        total,
        limit: parseInt(limit),
        skip: parseInt(skip)
      };
    } catch (error) {
      throw new Error(`Failed to list organizations: ${error.message}`);
    }
  }

  /**
   * Delete an organization (soft delete)
   * @param {ObjectId} organizationId - Organization ID
   * @returns {Promise<Object>} Updated Organization document
   */
  async deleteOrganization(organizationId) {
    try {
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      organization.isActive = false;
      await organization.save();

      return organization;
    } catch (error) {
      throw new Error(`Failed to delete organization: ${error.message}`);
    }
  }

  /**
   * Get all coverage areas for an organization
   * @param {ObjectId} organizationId - Organization ID
   * @returns {Promise<Array>} Array of CoverageArea documents
   */
  async getOrganizationCoverageAreas(organizationId) {
    try {
      // Verify organization exists
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // Get coverage areas for this organization
      const coverageAreas = await CoverageArea.findByOrganization(organizationId);
      return coverageAreas;
    } catch (error) {
      throw new Error(`Failed to get organization coverage areas: ${error.message}`);
    }
  }

  /**
   * Get organization by code
   * @param {string} code - Organization code
   * @returns {Promise<Object>} Organization document
   */
  async getOrganizationByCode(code) {
    try {
      const organization = await Organization.findByCode(code);
      if (!organization) {
        throw new Error('Organization not found');
      }
      return organization;
    } catch (error) {
      throw new Error(`Failed to get organization: ${error.message}`);
    }
  }
}

module.exports = new OrganizationService();

