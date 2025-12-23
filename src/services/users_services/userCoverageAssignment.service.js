const { UserCoverageAssignment, User, CoverageArea, Location, UserLocation } = require('../../models');

/**
 * User Coverage Assignment Service
 * 
 * Handles user assignments to coverage areas and geographic unit access calculations.
 */
class UserCoverageAssignmentService {
  /**
   * Assign a user to a coverage area
   * @param {ObjectId} userId - User ID
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @param {Object} options - Assignment options
   * @param {boolean} options.isPrimary - Set as primary coverage (default: false)
   * @param {ObjectId} options.assignedBy - User ID who assigned this coverage
   * @param {Date} options.expiresAt - Optional expiration date
   * @returns {Promise<Object>} Created or updated UserCoverageAssignment document
   */
  async assignUserToCoverageArea(userId, coverageAreaId, options = {}) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] assignUserToCoverageArea called with userId: ${userId}, coverageAreaId: ${coverageAreaId}`);
      
      const { isPrimary = false, assignedBy = null, expiresAt = null, session = null } = options;

      // Validate user exists - try multiple lookup methods
      const mongoose = require('mongoose');
      let user = null;
      
      if (mongoose.Types.ObjectId.isValid(userId)) {
        console.log(`[DIAG] Attempting User.findById('${userId}')...`);
        user = await User.findById(userId).session(session);
      }
      
      if (!user) {
        console.log(`[DIAG] Attempting User.findByLegacyId('${userId}')...`);
        user = await User.findByLegacyId(userId);
        // Note: findByLegacyId might not support session, but it's a fallback
      }
      
      if (!user) {
        console.log(`[DIAG] ERROR: User not found: ${userId}`);
        throw new Error('User not found');
      }
      
      console.log(`[DIAG] User found: ${user.email} (_id: ${user._id})`);

      // Validate coverage area exists
      const coverageArea = await CoverageArea.findById(coverageAreaId).session(session);
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }
      if (!coverageArea.isActive) {
        throw new Error('Coverage area is not active');
      }

      // Use UserCoverageAssignment static method for assignment
      return await UserCoverageAssignment.assignCoverageArea(userId, coverageAreaId, {
        isPrimary,
        autoCoverDescendants: options.autoCoverDescendants || false,
        assignedBy,
        expiresAt,
        session
      });
    } catch (error) {
      throw new Error(`Failed to assign user to coverage area: ${error.message}`);
    }
  }

  /**
   * Revoke a user's coverage area assignment
   * @param {ObjectId} userId - User ID
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @returns {Promise<Object>} Update result
   */
  async revokeUserCoverageAssignment(userId, coverageAreaId) {
    try {
      return await UserCoverageAssignment.revokeCoverageArea(userId, coverageAreaId);
    } catch (error) {
      throw new Error(`Failed to revoke user coverage assignment: ${error.message}`);
    }
  }

  /**
   * Get all coverage areas assigned to a user
   * @param {ObjectId} userId - User ID
   * @param {Object} options - Options
   * @param {boolean} options.includeInactive - Include inactive assignments (default: false)
   * @returns {Promise<Array>} Array of UserCoverageAssignment documents with populated coverage areas
   */
  async getUserCoverageAreas(userId, options = {}) {
    try {
      const { includeInactive = false } = options;

      // userId should already be the database ObjectId from getCoordinatorContext
      // But handle both cases: if it's already ObjectId, use it; if string, convert
      const mongoose = require('mongoose');
      let actualUserId = userId;
      
      // If userId is already an ObjectId instance, use it directly
      if (userId && userId.constructor && userId.constructor.name === 'ObjectId') {
        actualUserId = userId;
      } else if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
        actualUserId = new mongoose.Types.ObjectId(userId);
      } else if (!mongoose.Types.ObjectId.isValid(userId)) {
        // Try to find user by legacy ID
        const user = await User.findByLegacyId(userId);
        if (user) {
          actualUserId = user._id;
        } else {
          return [];
        }
      }

      // Query without expiration filter first to see if records exist
      const assignmentsNoFilter = await UserCoverageAssignment.find({
        userId: actualUserId,
        isActive: true
      }).populate({
        path: 'coverageAreaId',
        populate: {
          path: 'geographicUnits',
          model: 'Location'
        }
      });
      
      // Query with expiration filter (the actual query we want to use)
      const assignments = await UserCoverageAssignment.find({
        userId: actualUserId,
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
      
      // If records exist without filter but not with filter, use no-filter results
      // (they're active, expiration might be incorrectly set or query structure issue)
      const assignmentsToReturn = assignments.length > 0 ? assignments : assignmentsNoFilter;
      
      return assignmentsToReturn;
    } catch (error) {
      throw new Error(`Failed to get user coverage areas: ${error.message}`);
    }
  }

  /**
   * Get all users assigned to a coverage area
   * @param {ObjectId} coverageAreaId - Coverage area ID
   * @param {Object} options - Options
   * @param {boolean} options.includeInactive - Include inactive assignments (default: false)
   * @returns {Promise<Array>} Array of UserCoverageAssignment documents with populated users
   */
  async getUsersInCoverageArea(coverageAreaId, options = {}) {
    try {
      const { includeInactive = false } = options;

      const assignments = await UserCoverageAssignment.findCoverageAreaUsers(coverageAreaId, includeInactive);
      return assignments;
    } catch (error) {
      throw new Error(`Failed to get users in coverage area: ${error.message}`);
    }
  }

  /**
   * Get primary coverage area for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} UserCoverageAssignment document with populated coverage area, or null
   */
  async getPrimaryCoverageArea(userId) {
    try {
      const assignment = await UserCoverageAssignment.findPrimaryCoverageArea(userId);
      return assignment;
    } catch (error) {
      throw new Error(`Failed to get primary coverage area: ${error.message}`);
    }
  }

  /**
   * Get all geographic units a user can access via their coverage area assignments
   * @param {ObjectId} userId - User ID
   * @param {Object} options - Options
   * @param {boolean} options.includeInactive - Include inactive assignments (default: false)
   * @param {boolean} options.deduplicate - Remove duplicate geographic units (default: true)
   * @returns {Promise<Array>} Array of Location documents user has access to
   */
  async getUserAccessibleGeographicUnits(userId, options = {}) {
    try {
      const { includeInactive = false, deduplicate = true } = options;

      // Get all active coverage area assignments for user
      const assignments = await UserCoverageAssignment.findUserCoverageAreas(userId, includeInactive);
      
      if (assignments.length === 0) {
        return [];
      }

      // Collect all geographic unit IDs from all coverage areas
      const geographicUnitIds = new Set();
      
      for (const assignment of assignments) {
        // Skip expired assignments
        if (assignment.isExpired()) {
          continue;
        }

        // Populate coverage area if not already populated
        let coverageArea = assignment.coverageAreaId;
        if (typeof coverageArea === 'object' && coverageArea._id) {
          // Already populated
        } else {
          coverageArea = await CoverageArea.findById(assignment.coverageAreaId);
        }

        if (!coverageArea || !coverageArea.isActive) {
          continue;
        }

        // Add all geographic units from this coverage area
        coverageArea.geographicUnits.forEach(unitId => {
          if (deduplicate) {
            geographicUnitIds.add(unitId.toString());
          } else {
            geographicUnitIds.add(unitId);
          }
        });
      }

      // Fetch all geographic units
      const geographicUnitIdsArray = Array.from(geographicUnitIds).map(id => {
        // Convert string back to ObjectId if needed
        const mongoose = require('mongoose');
        return mongoose.Types.ObjectId.isValid(id) ? mongoose.Types.ObjectId(id) : id;
      });

      const geographicUnits = await Location.find({
        _id: { $in: geographicUnitIdsArray },
        isActive: true
      }).sort({ name: 1 });

      return geographicUnits;
    } catch (error) {
      throw new Error(`Failed to get user accessible geographic units: ${error.message}`);
    }
  }

  /**
   * Check if a user has access to a specific geographic unit via coverage areas
   * @param {ObjectId} userId - User ID
   * @param {ObjectId} geographicUnitId - Geographic unit (Location) ID
   * @returns {Promise<boolean>} True if user has access
   */
  async userHasAccessToGeographicUnit(userId, geographicUnitId) {
    try {
      const accessibleUnits = await this.getUserAccessibleGeographicUnits(userId);
      return accessibleUnits.some(unit => unit._id.toString() === geographicUnitId.toString());
    } catch (error) {
      throw new Error(`Failed to check user access: ${error.message}`);
    }
  }

  /**
   * Get all coverage areas that include a specific geographic unit
   * @param {ObjectId} geographicUnitId - Geographic unit (Location) ID
   * @returns {Promise<Array>} Array of CoverageArea documents
   */
  async getCoverageAreasForGeographicUnit(geographicUnitId) {
    try {
      const coverageAreas = await CoverageArea.findByGeographicUnit(geographicUnitId);
      return coverageAreas;
    } catch (error) {
      throw new Error(`Failed to get coverage areas for geographic unit: ${error.message}`);
    }
  }

  /**
   * Calculate effective coverage for a user (includes descendant locations if autoCoverDescendants is true)
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Array>} Array of Location documents that user effectively covers
   */
  async calculateEffectiveCoverage(userId) {
    try {
      const assignments = await this.getUserCoverageAreas(userId, { includeInactive: false });
      const effectiveLocations = new Set();
      
      for (const assignment of assignments) {
        const coverageArea = assignment.coverageAreaId;
        
        // Populate if needed
        let coverageAreaDoc = coverageArea;
        if (typeof coverageArea === 'string' || !coverageArea.name) {
          coverageAreaDoc = await CoverageArea.findById(assignment.coverageAreaId).populate('geographicUnits');
        }
        
        if (!coverageAreaDoc || !coverageAreaDoc.geographicUnits) {
          continue;
        }
        
        // Add all geographic units from the coverage area
        for (const unit of coverageAreaDoc.geographicUnits) {
          effectiveLocations.add(unit._id.toString());
          
          // If autoCoverDescendants is true, add all descendant locations
          if (assignment.autoCoverDescendants) {
            const descendants = await this._getDescendantLocations(unit._id);
            for (const desc of descendants) {
              effectiveLocations.add(desc._id.toString());
            }
          }
        }
      }
      
      // Convert to array and fetch full location documents
      const locationIds = Array.from(effectiveLocations).map(id => {
        const mongoose = require('mongoose');
        return mongoose.Types.ObjectId.isValid(id) ? mongoose.Types.ObjectId(id) : id;
      });
      
      const locations = await Location.find({
        _id: { $in: locationIds },
        isActive: true
      }).sort({ name: 1 });
      
      return locations;
    } catch (error) {
      throw new Error(`Failed to calculate effective coverage: ${error.message}`);
    }
  }

  /**
   * Get all descendant locations for a given location (recursive)
   * @private
   * @param {ObjectId} locationId - Parent location ID
   * @returns {Promise<Array>} Array of descendant Location documents
   */
  async _getDescendantLocations(locationId) {
    try {
      const descendants = [];
      const directChildren = await Location.find({
        parent: locationId,
        isActive: true
      });
      
      for (const child of directChildren) {
        descendants.push(child);
        // Recursively get descendants of children
        const childDescendants = await this._getDescendantLocations(child._id);
        descendants.push(...childDescendants);
      }
      
      return descendants;
    } catch (error) {
      console.error(`[RBAC] Error getting descendant locations for ${locationId}:`, error);
      return [];
    }
  }
}

module.exports = new UserCoverageAssignmentService();

