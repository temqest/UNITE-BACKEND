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

      // Get all roles with authority lower than creator's authority
      // Stakeholder roles typically have authority < 60 (COORDINATOR authority)
      // Use Math.min to get the stricter constraint (must be below both creator authority AND coordinator level)
      const maxAuthority = Math.min(creatorAuthority, AUTHORITY_TIERS.COORDINATOR);
      const roles = await Role.find({
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
      const authorityService = require('./authority.service');
      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      
      // Operational admins (authority ≥ 80) and system admins bypass jurisdiction checks
      if (creatorAuthority >= 80) {
        console.log('[DIAG] isUserInCreatorJurisdiction - Admin bypass:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          targetUserId: targetUserId.toString()
        });
        return true;
      }

      // Get creator user to access embedded coverage areas
      const { User } = require('../../models/index');
      const creator = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      if (!creator) {
        console.log('[DIAG] isUserInCreatorJurisdiction - Creator not found:', { creatorId: creatorId.toString() });
        return false;
      }

      // STEP 1: Flatten creator's organizations into a Set (once, for efficient lookups)
      // Access embedded array: creator.organizations[].organizationId
      const creatorOrgIds = new Set();
      if (creator.organizations && creator.organizations.length > 0) {
        creator.organizations.forEach(org => {
          if (org.isActive !== false && org.organizationId) {
            // Ensure consistent ObjectId to string conversion for comparison
            const orgId = org.organizationId.toString();
            creatorOrgIds.add(orgId);
          }
        });
      }
      
      // Fallback: If no organizations in embedded data, get from UserOrganization
      if (creatorOrgIds.size === 0) {
        const { UserOrganization } = require('../../models/index');
        const userOrgAssignments = await UserOrganization.find({
          userId: creatorId,
          isActive: true,
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }).populate('organizationId');
        
        userOrgAssignments.forEach(assignment => {
          if (assignment.organizationId && assignment.organizationId.isActive !== false) {
            creatorOrgIds.add(assignment.organizationId._id.toString());
          }
        });
      }

      // STEP 2: Flatten creator's municipalities from coverageAreas into a Set (once, for efficient lookups)
      const creatorMunicipalityIds = new Set();
      const creatorLocationIds = new Set();
      
      // First, try embedded municipalityIds
      if (creator.coverageAreas && creator.coverageAreas.length > 0) {
        creator.coverageAreas.forEach(ca => {
          // Add municipality IDs directly from embedded data
          if (ca.municipalityIds && Array.isArray(ca.municipalityIds) && ca.municipalityIds.length > 0) {
            ca.municipalityIds.forEach(muniId => {
              if (muniId) {
                const muniIdStr = muniId.toString();
                creatorMunicipalityIds.add(muniIdStr);
                creatorLocationIds.add(muniIdStr);
              }
            });
          }
          // Also add district IDs if available
          if (ca.districtIds && Array.isArray(ca.districtIds)) {
            ca.districtIds.forEach(distId => {
              if (distId) creatorLocationIds.add(distId.toString());
            });
          }
        });
      }
      
      // Fallback: If no municipalities found in embedded data, derive them from coverage areas
      if (creatorMunicipalityIds.size === 0 && creator.coverageAreas && creator.coverageAreas.length > 0) {
        const { Location } = require('../../models/index');
        const { CoverageArea } = require('../../models/index');
        const mongoose = require('mongoose');
        
        // Get all coverage area IDs from embedded data
        const coverageAreaIds = creator.coverageAreas
          .map(ca => ca.coverageAreaId)
          .filter(Boolean);
        
        if (coverageAreaIds.length > 0) {
          // Fetch coverage areas to get their geographic units
          const coverageAreas = await CoverageArea.find({
            _id: { $in: coverageAreaIds },
            isActive: true
          }).populate('geographicUnits');
          
          // Collect all district/province IDs from geographic units
          const districtIds = new Set();
          coverageAreas.forEach(ca => {
            if (ca.geographicUnits && Array.isArray(ca.geographicUnits)) {
              ca.geographicUnits.forEach(unit => {
                if (unit && (unit.type === 'district' || unit.type === 'province')) {
                  districtIds.add(unit._id.toString());
                  creatorLocationIds.add(unit._id.toString());
                }
              });
            }
          });
          
          // Find municipalities under these districts/provinces
          if (districtIds.size > 0) {
            const municipalities = await Location.find({
              parent: { $in: Array.from(districtIds).map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) },
              type: 'municipality',
              isActive: true
            });
            
            municipalities.forEach(muni => {
              const muniIdStr = muni._id.toString();
              creatorMunicipalityIds.add(muniIdStr);
              creatorLocationIds.add(muniIdStr);
            });
          }
        }
      }

      // Fallback: If no embedded coverage areas, use UserCoverageAssignment
      if (creatorMunicipalityIds.size === 0) {
        const creatorLocations = await userCoverageAssignmentService.getUserCoverageAreas(creatorId, { includeInactive: false });
        for (const a of creatorLocations) {
          const ca = a.coverageAreaId;
          if (!ca) continue;
          const units = Array.isArray(ca.geographicUnits) ? ca.geographicUnits : (ca.geographicUnits ? [ca.geographicUnits] : []);
          for (const u of units) {
            creatorLocationIds.add(u.toString());
            // If it's a district/province, find municipalities under it
            if (u.type === 'district' || u.type === 'province') {
              const { Location } = require('../../models/index');
              const municipalities = await Location.find({
                parent: u._id,
                type: 'municipality',
                isActive: true
              });
              municipalities.forEach(m => {
                const mId = m._id.toString();
                creatorMunicipalityIds.add(mId);
                creatorLocationIds.add(mId);
              });
            }
          }
        }
      }

      // If still no locations, fall back to user locations
      if (creatorMunicipalityIds.size === 0) {
        const locationService = require('../utility_services/location.service');
        const locs = await locationService.getUserLocations(creatorId);
        locs.forEach(l => {
          creatorLocationIds.add(l._id.toString());
          if (l.type === 'municipality') {
            creatorMunicipalityIds.add(l._id.toString());
          }
        });
      }

      // Get target user to check embedded data
      const targetUser = await User.findById(targetUserId) || await User.findByLegacyId(targetUserId);
      if (!targetUser) {
        console.log('[DIAG] isUserInCreatorJurisdiction - Target user not found:', { targetUserId: targetUserId.toString() });
        return false;
      }

      // Calculate target authority dynamically
      const targetAuthority = targetUser.authority || await authorityService.calculateUserAuthority(targetUserId);
      
      // For stakeholders: Check authority, organization, AND municipality
      const isStakeholder = targetAuthority < AUTHORITY_TIERS.COORDINATOR;

      if (isStakeholder) {
        // Initialize diagnostic object for this stakeholder
        const diagnostic = {
          creatorId: creatorId.toString(),
          creatorAuthority,
          targetUserId: targetUserId.toString(),
          targetAuthority,
          checks: {}
        };

        // CHECK 1: Authority check - target must have lower authority than creator
        const authorityCheck = targetAuthority < creatorAuthority;
        diagnostic.checks.authority = {
          pass: authorityCheck,
          reason: authorityCheck 
            ? `Target authority (${targetAuthority}) < creator authority (${creatorAuthority})`
            : `Target authority (${targetAuthority}) >= creator authority (${creatorAuthority})`
        };

        if (!authorityCheck) {
          console.log('[DIAG] isUserInCreatorJurisdiction - Stakeholder EXCLUDED:', diagnostic);
          return false;
        }

        // CHECK 2: Organization match - target's organization must be in creator's organizations
        // Since coordinators can only create stakeholders with their own orgs, stakeholders MUST have matching org
        const targetOrgIds = new Set();
        if (targetUser.organizations && targetUser.organizations.length > 0) {
          targetUser.organizations.forEach(org => {
            if (org.isActive !== false && org.organizationId) {
              // Ensure consistent ObjectId to string conversion
              const orgId = org.organizationId.toString();
              targetOrgIds.add(orgId);
            }
          });
        }

        // Stakeholders created by coordinators should always have organizations
        // If no organizations found, this might indicate a data issue, but we'll be lenient for now
        let orgMatch = false;
        if (targetOrgIds.size > 0) {
          for (const targetOrgId of targetOrgIds) {
            // Ensure both sides are strings for comparison
            if (creatorOrgIds.has(targetOrgId)) {
              orgMatch = true;
              break;
            }
          }
        }

        diagnostic.checks.organization = {
          pass: orgMatch || targetOrgIds.size === 0,
          reason: targetOrgIds.size === 0
            ? 'Target has no organizations (data issue - stakeholders should have orgs)'
            : orgMatch
              ? `Target organization (${Array.from(targetOrgIds).join(', ')}) matches creator organizations (${Array.from(creatorOrgIds).join(', ')})`
              : `Target organization (${Array.from(targetOrgIds).join(', ')}) NOT in creator organizations (${Array.from(creatorOrgIds).join(', ')})`,
          targetOrgIds: Array.from(targetOrgIds),
          creatorOrgIds: Array.from(creatorOrgIds),
          comparisonMethod: 'string_comparison_after_toString'
        };

        // If target has organizations but none match, exclude
        // Since stakeholders are created with coordinator's orgs, this should never happen unless data is corrupted
        if (targetOrgIds.size > 0 && !orgMatch) {
          diagnostic.result = 'EXCLUDED';
          diagnostic.reason = 'Organization mismatch - stakeholder org not in coordinator orgs';
          console.log('[DIAG] isUserInCreatorJurisdiction - Stakeholder EXCLUDED:', diagnostic);
          return false;
        }

        // CHECK 3: Municipality match - target's municipality must be in creator's municipalities
        // Since coordinators can only create stakeholders with municipalities from their coverage areas,
        // stakeholders MUST have a municipality that matches coordinator's coverage
        if (!targetUser.locations || !targetUser.locations.municipalityId) {
          diagnostic.checks.municipality = {
            pass: false,
            reason: 'Target has no municipality assigned (required for stakeholders)'
          };
          diagnostic.result = 'EXCLUDED';
          diagnostic.reason = 'Missing municipality';
          console.log('[DIAG] isUserInCreatorJurisdiction - Stakeholder EXCLUDED:', diagnostic);
          return false;
        }

        // Ensure consistent ObjectId to string conversion
        const targetMunicipalityId = targetUser.locations.municipalityId.toString();
        const municipalityMatch = creatorMunicipalityIds.has(targetMunicipalityId);

        diagnostic.checks.municipality = {
          pass: municipalityMatch,
          reason: municipalityMatch
            ? `Target municipality (${targetMunicipalityId}) in creator municipalities (${creatorMunicipalityIds.size} total)`
            : `Target municipality (${targetMunicipalityId}) NOT in creator municipalities (${Array.from(creatorMunicipalityIds).slice(0, 5).join(', ')}...)`,
          targetMunicipalityId,
          creatorMunicipalityCount: creatorMunicipalityIds.size,
          creatorMunicipalityIds: Array.from(creatorMunicipalityIds).slice(0, 10), // Log first 10 for debugging
          comparisonMethod: 'string_comparison_after_toString'
        };

        // Since stakeholders are created with coordinator's municipality, this should always match
        // If it doesn't, there's a data integrity issue
        if (!municipalityMatch) {
          diagnostic.result = 'EXCLUDED';
          diagnostic.reason = 'Municipality mismatch - stakeholder municipality not in coordinator coverage areas';
          console.log('[DIAG] isUserInCreatorJurisdiction - Stakeholder EXCLUDED:', diagnostic);
          return false;
        }

        // All checks passed - include this stakeholder
        diagnostic.result = 'INCLUDED';
        diagnostic.reason = 'All checks passed (authority, organization, municipality)';
        console.log('[DIAG] isUserInCreatorJurisdiction - Stakeholder INCLUDED:', diagnostic);
        return true;
      }

      // For non-stakeholders (coordinators, etc.), use location-based matching
      // Collect target user's location ids
      const targetLocationIds = new Set();
      
      // For non-stakeholders, use UserLocation assignments
      const locationService = require('../utility_services/location.service');
      const targetLocs = await locationService.getUserLocations(targetUserId);
      targetLocs.forEach(l => targetLocationIds.add(l._id.toString()));

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
        if (creatorLocationIds.has(id)) {
          console.log('[DIAG] isUserInCreatorJurisdiction - Non-stakeholder location match:', {
            creatorId: creatorId.toString(),
            targetUserId: targetUserId.toString(),
            matchedLocationId: id
          });
          return true;
        }
      }

      // No intersection found
      console.log('[DIAG] isUserInCreatorJurisdiction - No match found:', {
        creatorId: creatorId.toString(),
        targetUserId: targetUserId.toString(),
        isStakeholder: false
      });
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
      const authorityService = require('./authority.service');
      const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
      
      // Operational admins (authority ≥ 80) and system admins bypass jurisdiction checks
      if (creatorAuthority >= 80) {
        console.log('[DIAG] filterUsersByJurisdiction - Admin bypass:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          userIdsCount: userIds.length
        });
        return userIds;
      }

      // Validate creator has jurisdiction data before filtering
      const { User } = require('../../models/index');
      const creator = await User.findById(creatorId) || await User.findByLegacyId(creatorId);
      
      if (!creator) {
        console.log('[DIAG] filterUsersByJurisdiction - Creator not found:', { creatorId: creatorId.toString() });
        return [];
      }

      // Check if creator has organizations (for stakeholder filtering)
      const hasOrganizations = creator.organizations && creator.organizations.length > 0;
      
      // Check if creator has municipalities (for stakeholder filtering)
      const hasMunicipalities = creator.coverageAreas && creator.coverageAreas.length > 0 && 
        creator.coverageAreas.some(ca => ca.municipalityIds && ca.municipalityIds.length > 0);

      // If creator has no jurisdiction data, return empty array (fail safe)
      // Note: This check is only for non-admins (authority < 80)
      if (!hasOrganizations && !hasMunicipalities && creatorAuthority < 80) {
        console.log('[DIAG] filterUsersByJurisdiction - Creator has no jurisdiction data:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          hasOrganizations,
          hasMunicipalities,
          coverageAreasCount: creator.coverageAreas?.length || 0,
          organizationsCount: creator.organizations?.length || 0,
          warning: 'Returning empty array - creator cannot see any users without jurisdiction data'
        });
        return [];
      }

      const results = [];
      for (const uid of userIds) {
        const ok = await this.isUserInCreatorJurisdiction(creatorId, uid);
        if (ok) results.push(uid);
      }

      console.log('[DIAG] filterUsersByJurisdiction:', {
        creatorId: creatorId.toString(),
        requested: userIds.length,
        returned: results.length,
        hasOrganizations,
        hasMunicipalities
      });

      return results;
    } catch (error) {
      console.error('[DIAG] filterUsersByJurisdiction - ERROR:', error);
      // Fail safe: return empty array on error
      return [];
    }
  }
}

module.exports = new JurisdictionService();

