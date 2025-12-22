const { UserCoverageAssignment, User, CoverageArea, Location } = require('../../models');

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
      
      const { isPrimary = false, assignedBy = null, expiresAt = null } = options;

      // Validate user exists - try multiple lookup methods
      const mongoose = require('mongoose');
      let user = null;
      
      if (mongoose.Types.ObjectId.isValid(userId)) {
        console.log(`[DIAG] Attempting User.findById('${userId}')...`);
        user = await User.findById(userId);
      }
      
      if (!user) {
        console.log(`[DIAG] Attempting User.findByLegacyId('${userId}')...`);
        user = await User.findByLegacyId(userId);
      }
      
      if (!user) {
        console.log(`[DIAG] ERROR: User not found: ${userId}`);
        throw new Error('User not found');
      }
      
      console.log(`[DIAG] User found: ${user.email} (_id: ${user._id})`);

      // Validate coverage area exists
      const coverageArea = await CoverageArea.findById(coverageAreaId);
      if (!coverageArea) {
        throw new Error('Coverage area not found');
      }
      if (!coverageArea.isActive) {
        throw new Error('Coverage area is not active');
      }

      // Use UserCoverageAssignment static method for assignment
      return await UserCoverageAssignment.assignCoverageArea(userId, coverageAreaId, {
        isPrimary,
        assignedBy,
        expiresAt
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
      // Diagnostic logging
      console.log(`[DIAG] getUserCoverageAreas called with userId: ${userId}, type: ${typeof userId}`);
      
      const { includeInactive = false } = options;
      console.log(`[DIAG] Options: includeInactive=${includeInactive}`);

      // Convert userId to ObjectId if needed
      const mongoose = require('mongoose');
      let actualUserId = userId;
      if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
        actualUserId = new mongoose.Types.ObjectId(userId);
        console.log(`[DIAG] Converted userId string to ObjectId: ${actualUserId}`);
      }

      console.log(`[DIAG] Calling UserCoverageAssignment.findUserCoverageAreas(${actualUserId}, ${includeInactive})...`);
      const assignments = await UserCoverageAssignment.findUserCoverageAreas(actualUserId, includeInactive);
      
      console.log(`[DIAG] Found ${assignments.length} coverage area assignments for user ${userId}`);
      if (assignments.length > 0) {
        assignments.forEach((assignment, index) => {
          const ca = assignment.coverageAreaId;
          const caId = ca?._id || assignment.coverageAreaId;
          const caName = ca?.name || 'N/A';
          console.log(`[DIAG] Assignment ${index + 1}: Coverage Area ${caName} (${caId}), Primary: ${assignment.isPrimary || false}`);
        });
      }
      
      return assignments;
    } catch (error) {
      console.error(`[DIAG] Error in getUserCoverageAreas: ${error.message}`);
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
}

module.exports = new UserCoverageAssignmentService();

