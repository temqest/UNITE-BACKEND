const authorityService = require('./authority.service');
const userCoverageAssignmentService = require('./userCoverageAssignment.service');
const { User, Organization } = require('../../models/index');
const { CoverageArea } = require('../../models/index');

/**
 * Jurisdiction Service
 * 
 * Handles validation of coverage area and organization assignments based on user authority.
 * Ensures users can only create/manage other users within their jurisdiction.
 */
class JurisdictionService {
  /**
   * Check if a creator can create users in a specific coverage area
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @param {string|ObjectId} coverageAreaId - Coverage area ID to check
   * @returns {Promise<boolean>} True if creator can create users in this coverage area
   */
  async canCreateUserInCoverageArea(creatorId, coverageAreaId) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] canCreateUserInCoverageArea called with creatorId: ${creatorId}, coverageAreaId: ${coverageAreaId}`);
      
      if (!creatorId || !coverageAreaId) {
        console.log(`[DIAG] Missing creatorId or coverageAreaId, returning false`);
        return false;
      }

      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      console.log(`[DIAG] Creator authority: ${creatorAuthority}`);
      
      // System admins can create in any coverage area
      const { AUTHORITY_TIERS } = require('./authority.service');
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        console.log(`[DIAG] Creator is system admin, allowing creation in any coverage area`);
        return true;
      }
      
      // Get creator's coverage areas
      const creatorCoverageAreas = await this.getCreatorJurisdiction(creatorId);
      const creatorCoverageAreaIds = creatorCoverageAreas.map(ca => {
        const id = ca.coverageAreaId?._id || ca.coverageAreaId;
        return id ? id.toString() : null;
      }).filter(Boolean);
      
      console.log(`[DIAG] Creator has ${creatorCoverageAreaIds.length} coverage areas: [${creatorCoverageAreaIds.join(', ')}]`);
      console.log(`[DIAG] Requested coverage area: ${coverageAreaId.toString()}`);
      
      // Check if requested coverage area is within creator's jurisdiction
      const canCreate = creatorCoverageAreaIds.includes(coverageAreaId.toString());
      console.log(`[DIAG] Can create in coverage area: ${canCreate ? 'YES' : 'NO'}`);
      
      return canCreate;
    } catch (error) {
      console.error('[DIAG] Error checking coverage area jurisdiction:', error);
      return false;
    }
  }

  /**
   * Get all coverage areas a creator can manage (their jurisdiction)
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of UserCoverageAssignment documents with populated coverage areas
   */
  async getCreatorJurisdiction(creatorId) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] getCreatorJurisdiction called with creatorId: ${creatorId}, type: ${typeof creatorId}`);
      
      if (!creatorId) {
        console.log(`[DIAG] No creatorId provided, returning empty array`);
        return [];
      }

      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      console.log(`[DIAG] Creator authority: ${creatorAuthority}`);
      
      // System admins have access to all coverage areas (handled separately)
      const { AUTHORITY_TIERS } = require('./authority.service');
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        console.log(`[DIAG] Creator is system admin, returning empty array (bypasses jurisdiction checks)`);
        return []; // Return empty array - system admins bypass jurisdiction checks
      }

      // Get creator's coverage area assignments
      console.log(`[DIAG] Querying userCoverageAssignmentService.getUserCoverageAreas(${creatorId})...`);
      const assignments = await userCoverageAssignmentService.getUserCoverageAreas(creatorId, {
        includeInactive: false
      });
      
      console.log(`[DIAG] Found ${assignments.length} coverage area assignments for creator ${creatorId}`);

      return assignments;
    } catch (error) {
      console.error('[DIAG] Error getting creator jurisdiction:', error);
      return [];
    }
  }

  /**
   * Check if a coverage area is within creator's jurisdiction
   * @param {string|ObjectId} coverageAreaId - Coverage area ID to check
   * @param {Array} creatorCoverageAreas - Array of creator's coverage area assignments
   * @returns {boolean} True if coverage area is within jurisdiction
   */
  isCoverageAreaWithinJurisdiction(coverageAreaId, creatorCoverageAreas) {
    if (!coverageAreaId || !creatorCoverageAreas || creatorCoverageAreas.length === 0) {
      return false;
    }

    const coverageAreaIdStr = coverageAreaId.toString();
    return creatorCoverageAreas.some(assignment => {
      const id = assignment.coverageAreaId?._id || assignment.coverageAreaId;
      return id && id.toString() === coverageAreaIdStr;
    });
  }

  /**
   * Get organizations a creator can assign to users
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Organization documents
   */
  async getAllowedOrganizations(creatorId) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] getAllowedOrganizations called with creatorId: ${creatorId}, type: ${typeof creatorId}`);
      
      if (!creatorId) {
        console.log(`[DIAG] No creatorId provided, returning empty array`);
        return [];
      }

      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      console.log(`[DIAG] Creator authority: ${creatorAuthority}`);
      
      // System admins can assign any organization
      const { AUTHORITY_TIERS } = require('./authority.service');
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        console.log(`[DIAG] Creator is system admin, returning all active organizations`);
        const allOrganizations = await Organization.find({ isActive: true }).sort({ name: 1 });
        console.log(`[DIAG] Found ${allOrganizations.length} active organizations`);
        return allOrganizations;
      }

      // Non-system-admins can only assign their own organization
      // Try multiple lookup methods
      const mongoose = require('mongoose');
      let creator = null;
      
      if (mongoose.Types.ObjectId.isValid(creatorId)) {
        console.log(`[DIAG] Attempting User.findById('${creatorId}')...`);
        creator = await User.findById(creatorId);
      }
      
      if (!creator) {
        console.log(`[DIAG] Attempting User.findByLegacyId('${creatorId}')...`);
        creator = await User.findByLegacyId(creatorId);
      }
      
      if (!creator) {
        console.log(`[DIAG] WARNING: Creator not found: ${creatorId}`);
        return [];
      }
      
      console.log(`[DIAG] Creator found: ${creator.email} (organizationId: ${creator.organizationId || 'NONE'})`);
      
      if (!creator.organizationId) {
        console.log(`[DIAG] Creator has no organizationId, returning empty array`);
        return [];
      }

      const organization = await Organization.findById(creator.organizationId);
      if (!organization) {
        console.log(`[DIAG] WARNING: Organization ${creator.organizationId} not found`);
        return [];
      }
      
      if (!organization.isActive) {
        console.log(`[DIAG] WARNING: Organization ${creator.organizationId} is not active`);
        return [];
      }
      
      console.log(`[DIAG] Returning creator's organization: ${organization.name}`);
      return [organization];
    } catch (error) {
      console.error('[DIAG] Error getting allowed organizations:', error);
      return [];
    }
  }

  /**
   * Get creator's organization
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Object|null>} Organization document or null
   */
  async getUserOrganization(creatorId) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] getUserOrganization called with creatorId: ${creatorId}, type: ${typeof creatorId}`);
      
      if (!creatorId) {
        console.log(`[DIAG] No creatorId provided, returning null`);
        return null;
      }

      // Try multiple lookup methods
      const mongoose = require('mongoose');
      let user = null;
      
      if (mongoose.Types.ObjectId.isValid(creatorId)) {
        console.log(`[DIAG] Attempting User.findById('${creatorId}')...`);
        user = await User.findById(creatorId);
      }
      
      if (!user) {
        console.log(`[DIAG] Attempting User.findByLegacyId('${creatorId}')...`);
        user = await User.findByLegacyId(creatorId);
      }
      
      if (!user) {
        console.log(`[DIAG] WARNING: User not found: ${creatorId}`);
        return null;
      }
      
      console.log(`[DIAG] User found: ${user.email} (organizationId: ${user.organizationId || 'NONE'})`);
      
      if (!user.organizationId) {
        console.log(`[DIAG] User has no organizationId, returning null`);
        return null;
      }

      const organization = await Organization.findById(user.organizationId);
      if (organization) {
        console.log(`[DIAG] Organization found: ${organization.name}`);
      } else {
        console.log(`[DIAG] WARNING: Organization ${user.organizationId} not found`);
      }
      
      return organization;
    } catch (error) {
      console.error('[DIAG] Error getting user organization:', error);
      return null;
    }
  }

  /**
   * Validate that a creator can assign a specific organization to a user
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @param {string|ObjectId} organizationId - Organization ID to assign
   * @returns {Promise<boolean>} True if creator can assign this organization
   */
  async canAssignOrganization(creatorId, organizationId) {
    try {
      if (!creatorId || !organizationId) {
        return false;
      }

      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      
      // System admins can assign any organization
      const { AUTHORITY_TIERS } = require('./authority.service');
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return true;
      }

      // Non-system-admins can only assign their own organization
      const creatorOrg = await this.getUserOrganization(creatorId);
      if (!creatorOrg) {
        return false;
      }

      return creatorOrg._id.toString() === organizationId.toString();
    } catch (error) {
      console.error('Error checking organization assignment:', error);
      return false;
    }
  }

  /**
   * Get coverage areas for stakeholder creation
   * System admin: Returns all active coverage areas
   * Coordinator: Returns assigned coverage areas
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of CoverageArea documents
   */
  async getCreatorJurisdictionForStakeholderCreation(creatorId) {
    try {
      console.log(`[DIAG] getCreatorJurisdictionForStakeholderCreation called with creatorId: ${creatorId}`);
      
      if (!creatorId) {
        console.log(`[DIAG] No creatorId provided, returning empty array`);
        return [];
      }

      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      console.log(`[DIAG] Creator authority: ${creatorAuthority}`);
      
      const { AUTHORITY_TIERS } = require('./authority.service');
      
      // System admins get all active coverage areas
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        console.log(`[DIAG] Creator is system admin, returning all active coverage areas`);
        const allCoverageAreas = await CoverageArea.find({ isActive: true })
          .populate('geographicUnits')
          .populate('organizationId')
          .sort({ name: 1 });
        console.log(`[DIAG] Found ${allCoverageAreas.length} active coverage areas`);
        return allCoverageAreas;
      }

      // Non-system-admins get their assigned coverage areas
      console.log(`[DIAG] Querying userCoverageAssignmentService.getUserCoverageAreas(${creatorId})...`);
      const assignments = await userCoverageAssignmentService.getUserCoverageAreas(creatorId, {
        includeInactive: false
      });
      
      console.log(`[DIAG] Found ${assignments.length} coverage area assignments for creator ${creatorId}`);
      
      // Extract coverage area objects from assignments
      const coverageAreas = assignments
        .map(assignment => {
          // If coverageAreaId is populated (object), use it directly
          if (assignment.coverageAreaId && typeof assignment.coverageAreaId === 'object') {
            return assignment.coverageAreaId;
          }
          // If it's just an ID, we need to fetch it (shouldn't happen if populated correctly)
          return null;
        })
        .filter(Boolean);
      
      console.log(`[DIAG] Returning ${coverageAreas.length} coverage areas`);
      return coverageAreas;
    } catch (error) {
      console.error('[DIAG] Error getting creator jurisdiction for stakeholder creation:', error);
      return [];
    }
  }

  /**
   * Get organizations for stakeholder creation
   * System admin: Returns all active organizations
   * Coordinator: Returns their own organization
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Organization documents
   */
  async getAllowedOrganizationsForStakeholderCreation(creatorId) {
    try {
      console.log(`[DIAG] getAllowedOrganizationsForStakeholderCreation called with creatorId: ${creatorId}`);
      
      if (!creatorId) {
        console.log(`[DIAG] No creatorId provided, returning empty array`);
        return [];
      }

      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      console.log(`[DIAG] Creator authority: ${creatorAuthority}`);
      
      const { AUTHORITY_TIERS } = require('./authority.service');
      
      // System admins get all active organizations
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        console.log(`[DIAG] Creator is system admin, returning all active organizations`);
        const allOrganizations = await Organization.find({ isActive: true }).sort({ name: 1 });
        console.log(`[DIAG] Found ${allOrganizations.length} active organizations`);
        return allOrganizations;
      }

      // Non-system-admins get their own organization
      const creatorOrg = await this.getUserOrganization(creatorId);
      if (creatorOrg && creatorOrg.isActive) {
        console.log(`[DIAG] Returning creator's organization: ${creatorOrg.name}`);
        return [creatorOrg];
      }
      
      console.log(`[DIAG] Creator has no active organization, returning empty array`);
      return [];
    } catch (error) {
      console.error('[DIAG] Error getting allowed organizations for stakeholder creation:', error);
      return [];
    }
  }
}

module.exports = new JurisdictionService();

