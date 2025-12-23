const authorityService = require('./authority.service');
const userCoverageAssignmentService = require('./userCoverageAssignment.service');
const { User, Organization, Location } = require('../../models/index');
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
   * Uses embedded User.organizations[] array
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Organization documents
   */
  async getAllowedOrganizations(creatorId) {
    try {
      if (!creatorId) {
        return [];
      }

      const creator = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      if (!creator) {
        return [];
      }

      const { AUTHORITY_TIERS } = require('./authority.service');
      const creatorAuthority = creator.authority || await authorityService.calculateUserAuthority(creatorId);
      
      // System admins can assign any organization
      if (creator.isSystemAdmin || creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return await Organization.find({ isActive: true }).sort({ name: 1 });
      }

      // Use embedded organizations array
      if (creator.organizations && creator.organizations.length > 0) {
        // Return organization documents for the embedded IDs
        const orgIds = creator.organizations.map(o => o.organizationId);
        return await Organization.find({ 
          _id: { $in: orgIds },
          isActive: true 
        }).sort({ name: 1 });
      }

      return [];
    } catch (error) {
      console.error('[JURIS] Error getting allowed organizations:', error);
      return [];
    }
  }

  /**
   * Get creator's organization
   * Uses embedded User.organizations[] array
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Object|null>} Organization document or null
   */
  async getUserOrganization(creatorId) {
    try {
      if (!creatorId) {
        return null;
      }

      const user = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      if (!user) {
        return null;
      }

      // Use embedded organizations array (primary first)
      if (user.organizations && user.organizations.length > 0) {
        const primaryOrg = user.organizations.find(o => o.isPrimary) || user.organizations[0];
        return await Organization.findById(primaryOrg.organizationId);
      }

      return null;
    } catch (error) {
      console.error('[JURIS] Error getting user organization:', error);
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
   * Uses embedded User.organizations[] array
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Organization documents
   */
  async getAllowedOrganizationsForStakeholderCreation(creatorId) {
    try {
      if (!creatorId) {
        return [];
      }

      const creator = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      if (!creator) {
        return [];
      }

      const { AUTHORITY_TIERS } = require('./authority.service');
      const creatorAuthority = creator.authority || await authorityService.calculateUserAuthority(creatorId);
      
      // System admins get all active organizations
      if (creator.isSystemAdmin || creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return await Organization.find({ isActive: true }).sort({ name: 1 });
      }

      // Use embedded organizations array
      if (creator.organizations && creator.organizations.length > 0) {
        const orgIds = creator.organizations.map(o => o.organizationId);
        return await Organization.find({ 
          _id: { $in: orgIds },
          isActive: true 
        }).sort({ name: 1 });
      }

      return [];
    } catch (error) {
      console.error('[JURIS] Error getting organizations for stakeholder creation:', error);
      return [];
    }
  }

  /**
   * Get organizations for coordinator creation
   * Uses embedded User.organizations[] array
   * Coordinators can have multiple organizations
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Organization documents
   */
  async getAllowedOrganizationsForCoordinatorCreation(creatorId) {
    try {
      if (!creatorId) {
        return [];
      }

      const creator = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      if (!creator) {
        return [];
      }

      const { AUTHORITY_TIERS } = require('./authority.service');
      const creatorAuthority = creator.authority || await authorityService.calculateUserAuthority(creatorId);
      
      // System admins get all active organizations
      if (creator.isSystemAdmin || creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return await Organization.find({ isActive: true }).sort({ name: 1 });
      }

      // Use embedded organizations array (coordinators can have multiple)
      if (creator.organizations && creator.organizations.length > 0) {
        const orgIds = creator.organizations.map(o => o.organizationId);
        return await Organization.find({ 
          _id: { $in: orgIds },
          isActive: true 
        }).sort({ name: 1 });
      }

      return [];
    } catch (error) {
      console.error('[JURIS] Error getting organizations for coordinator creation:', error);
      return [];
    }
  }

  /**
   * Get municipalities for stakeholder creation
   * Uses embedded User.coverageAreas[].municipalityIds array
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Location documents (type: 'municipality')
   */
  async getMunicipalitiesForStakeholderCreation(creatorId) {
    try {
      if (!creatorId) {
        return [];
      }

      const creator = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      if (!creator) {
        return [];
      }

      const { AUTHORITY_TIERS } = require('./authority.service');
      const creatorAuthority = creator.authority || await authorityService.calculateUserAuthority(creatorId);
      
      // System admins get all municipalities
      if (creator.isSystemAdmin || creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return await Location.find({ 
          type: 'municipality', 
          isActive: true 
        })
          .populate('parent')
          .populate('province')
          .sort({ name: 1 });
      }

      // Use embedded municipalityIds from coverage areas
      if (creator.coverageAreas && creator.coverageAreas.length > 0) {
        const municipalityIds = creator.coverageAreas
          .flatMap(ca => ca.municipalityIds || [])
          .filter(Boolean);
        
        if (municipalityIds.length === 0) {
          return [];
        }

        return await Location.find({
          _id: { $in: municipalityIds },
          type: 'municipality',
          isActive: true
        })
          .populate('parent')
          .populate('province')
          .sort({ name: 1 });
      }

      return [];
    } catch (error) {
      console.error('[JURIS] Error getting municipalities for stakeholder creation:', error);
      return [];
    }
  }

  /**
   * Get municipalities for coordinator creation
   * Uses embedded User.coverageAreas[].municipalityIds array
   * Returns municipalities under creator's coverage areas
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Location documents (type: 'municipality')
   */
  async getMunicipalitiesForCoordinatorCreation(creatorId) {
    try {
      if (!creatorId) {
        return [];
      }

      const creator = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      if (!creator) {
        return [];
      }

      const { AUTHORITY_TIERS } = require('./authority.service');
      const creatorAuthority = creator.authority || await authorityService.calculateUserAuthority(creatorId);
      
      // System admins get all municipalities
      if (creator.isSystemAdmin || creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
        return await Location.find({ 
          type: 'municipality', 
          isActive: true 
        })
          .populate('parent')
          .populate('province')
          .sort({ name: 1 });
      }

      // Use embedded municipalityIds from coverage areas
      if (creator.coverageAreas && creator.coverageAreas.length > 0) {
        const municipalityIds = creator.coverageAreas
          .flatMap(ca => ca.municipalityIds || [])
          .filter(Boolean);
        
        if (municipalityIds.length === 0) {
          return [];
        }

        return await Location.find({
          _id: { $in: municipalityIds },
          type: 'municipality',
          isActive: true
        })
          .populate('parent')
          .populate('province')
          .sort({ name: 1 });
      }

      return [];
    } catch (error) {
      console.error('[JURIS] Error getting municipalities for coordinator creation:', error);
      return [];
    }
  }

  /**
   * Get barangays for a municipality
   * @param {string|ObjectId} municipalityId - Municipality Location ID
   * @returns {Promise<Array>} Array of Location documents (type: 'barangay')
   */
  async getBarangaysForMunicipality(municipalityId) {
    try {
      console.log(`[DIAG] getBarangaysForMunicipality called with municipalityId: ${municipalityId}`);
      
      if (!municipalityId) {
        console.log(`[DIAG] No municipalityId provided, returning empty array`);
        return [];
      }

      const barangays = await Location.find({
        type: 'barangay',
        parent: municipalityId,
        isActive: true
      })
        .populate('parent')
        .populate('province')
        .sort({ name: 1 });

      console.log(`[DIAG] Found ${barangays.length} barangays for municipality ${municipalityId}`);
      return barangays;
    } catch (error) {
      console.error('[DIAG] Error getting barangays for municipality:', error);
      return [];
    }
  }

  /**
   * Get stakeholder roles that the creator can assign (authority-based filtering)
   * @param {string|ObjectId} creatorId - Creator's user ID
   * @returns {Promise<Array>} Array of Role documents with authority < creator's authority
   */
  async getCreatableRolesForStakeholders(creatorId) {
    try {
      console.log(`[DIAG] getCreatableRolesForStakeholders called with creatorId: ${creatorId}`);
      
      if (!creatorId) {
        console.log(`[DIAG] No creatorId provided, returning empty array`);
        return [];
      }

      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      console.log(`[DIAG] Creator authority: ${creatorAuthority}`);

      const { Role } = require('../../models/index');
      const { AUTHORITY_TIERS } = require('./authority.service');

      // Get all active roles with authority lower than creator's authority
      // Stakeholder roles typically have authority < 60 (COORDINATOR authority)
      // Use Math.min to get the stricter constraint (must be below both creator authority AND coordinator level)
      const maxAuthority = Math.min(creatorAuthority, AUTHORITY_TIERS.COORDINATOR);
      const roles = await Role.find({
        isActive: true,
        authority: { $lt: maxAuthority } // Must be below both creator authority and coordinator level
      }).sort({ authority: -1, name: 1 });

      console.log(`[DIAG] Found ${roles.length} stakeholder roles with authority < ${maxAuthority} (creator: ${creatorAuthority}, coordinator: ${AUTHORITY_TIERS.COORDINATOR}):`, 
        roles.map(r => `${r.code} (${r.authority})`).join(', '));

      return roles;
    } catch (error) {
      console.error('[DIAG] Error getting creatable roles for stakeholders:', error);
      return [];
    }
  }

  /**
   * Check if a target user is within the creator's jurisdiction
   * @param {string|ObjectId} creatorId
   * @param {string|ObjectId} targetUserId
   * @returns {Promise<boolean>} True if target user is within creator's jurisdiction
   */
  async isUserInCreatorJurisdiction(creatorId, targetUserId) {
    try {
      if (!creatorId || !targetUserId) return false;

      const { AUTHORITY_TIERS } = require('./authority.service');
      const creatorAuthority = await require('./authority.service').calculateUserAuthority(creatorId);
      // System admins bypass jurisdiction checks
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) return true;

      // Get creator effective coverage (locations)
      const creatorLocations = await userCoverageAssignmentService.getUserCoverageAreas(creatorId, { includeInactive: false });
      // Transform to set of location ids (geographicUnits)
      const creatorLocationIds = new Set();
      for (const a of creatorLocations) {
        const ca = a.coverageAreaId;
        if (!ca) continue;
        const units = Array.isArray(ca.geographicUnits) ? ca.geographicUnits : (ca.geographicUnits ? [ca.geographicUnits] : []);
        for (const u of units) creatorLocationIds.add(u.toString());
      }

      // If creator has no explicit coverage areas, fall back to user locations
      if (creatorLocationIds.size === 0) {
        const locationService = require('../utility_services/location.service');
        const locs = await locationService.getUserLocations(creatorId);
        locs.forEach(l => creatorLocationIds.add(l._id.toString()));
      }

      if (creatorLocationIds.size === 0) {
        // No jurisdiction defined - deny by default
        console.log('[DIAG] isUserInCreatorJurisdiction - Creator has no jurisdiction:', { creatorId: creatorId.toString() });
        return false;
      }

      // Collect target user's location ids (from UserLocation assignments)
      const locationService = require('../utility_services/location.service');
      const targetLocs = await locationService.getUserLocations(targetUserId);
      const targetLocationIds = new Set(targetLocs.map(l => l._id.toString()));

      // Also consider target's coverage areas (for non-stakeholders)
      const targetCoverageAssignments = await userCoverageAssignmentService.getUserCoverageAreas(targetUserId, { includeInactive: false });
      for (const ta of targetCoverageAssignments) {
        const ca = ta.coverageAreaId;
        if (!ca) continue;
        const units = Array.isArray(ca.geographicUnits) ? ca.geographicUnits : (ca.geographicUnits ? [ca.geographicUnits] : []);
        for (const u of units) targetLocationIds.add(u.toString());
      }

      // Check intersection between creatorLocationIds and targetLocationIds
      for (const id of targetLocationIds) {
        if (creatorLocationIds.has(id)) return true;
      }

      // No intersection found
      return false;
    } catch (error) {
      console.error('[DIAG] isUserInCreatorJurisdiction - ERROR:', error);
      return false;
    }
  }

  /**
   * Filter an array of userIds to only those within creator's jurisdiction
   * @param {string|ObjectId} creatorId
   * @param {Array<string|ObjectId>} userIds
   * @returns {Promise<Array<string|ObjectId>>} Filtered array
   */
  async filterUsersByJurisdiction(creatorId, userIds) {
    try {
      if (!creatorId || !userIds || userIds.length === 0) return [];

      const { AUTHORITY_TIERS } = require('./authority.service');
      const creatorAuthority = await require('./authority.service').calculateUserAuthority(creatorId);
      if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) return userIds;

      const results = [];
      for (const uid of userIds) {
        const ok = await this.isUserInCreatorJurisdiction(creatorId, uid);
        if (ok) results.push(uid);
      }

      console.log('[DIAG] filterUsersByJurisdiction:', {
        creatorId: creatorId.toString(),
        requested: userIds.length,
        returned: results.length
      });

      return results;
    } catch (error) {
      console.error('[DIAG] filterUsersByJurisdiction - ERROR:', error);
      return [];
    }
  }
}

module.exports = new JurisdictionService();

