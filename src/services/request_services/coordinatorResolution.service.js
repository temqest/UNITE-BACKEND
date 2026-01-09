/**
 * Coordinator Resolution Service
 * 
 * Resolves valid coordinators for stakeholders based on:
 * - Organization membership overlap
 * - Coverage area (municipality) matching
 * - Authority hierarchy (coordinator authority >= stakeholder authority)
 * 
 * Supports multiple coordinators in the same coverage area.
 */

const { User } = require('../../models/index');
const authorityService = require('../users_services/authority.service');
const permissionService = require('../users_services/permission.service');
const { AUTHORITY_TIERS } = require('../users_services/authority.service');

class CoordinatorResolutionService {
  /**
   * Resolve valid coordinators for a stakeholder/user based on organization + coverage area
   * @param {string|ObjectId} stakeholderId - Stakeholder/user ID
   * @param {Object} context - Additional context (locationId, organizationId, etc.)
   * @returns {Promise<Array>} Array of matching coordinator user objects
   */
  async resolveCoordinatorForStakeholder(stakeholderId, context = {}) {
    try {
      const { locationId, organizationId, municipalityId } = context;
      
      // Get stakeholder/user information
      const stakeholder = await User.findById(stakeholderId) || await User.findByLegacyId(stakeholderId);
      if (!stakeholder) {
        console.warn(`[CoordinatorResolution] Stakeholder not found: ${stakeholderId}`);
        return [];
      }

      const stakeholderAuthority = stakeholder.authority || await authorityService.calculateUserAuthority(stakeholderId);
      
      // Get stakeholder's organization IDs
      const stakeholderOrgIds = new Set();
      if (stakeholder.organizations && stakeholder.organizations.length > 0) {
        stakeholder.organizations.forEach(org => {
          if (org.isActive !== false && org.organizationId) {
            stakeholderOrgIds.add(org.organizationId.toString());
          }
        });
      }
      
      // If organizationId is provided in context, add it
      if (organizationId) {
        stakeholderOrgIds.add(organizationId.toString());
      }

      // Get stakeholder's municipality ID
      let stakeholderMunicipalityId = null;
      if (municipalityId) {
        stakeholderMunicipalityId = municipalityId.toString();
      } else if (stakeholder.locations && stakeholder.locations.municipalityId) {
        stakeholderMunicipalityId = stakeholder.locations.municipalityId.toString();
      } else if (stakeholder.coverageAreas && stakeholder.coverageAreas.length > 0) {
        // Get first municipality from coverage areas
        const firstCoverage = stakeholder.coverageAreas.find(ca => ca.municipalityIds && ca.municipalityIds.length > 0);
        if (firstCoverage && firstCoverage.municipalityIds.length > 0) {
          stakeholderMunicipalityId = firstCoverage.municipalityIds[0].toString();
        }
      }

      // Find coordinators with matching organization + coverage
      // Coordinators must have:
      // 1. Authority >= COORDINATOR (60)
      // 2. Authority >= stakeholder authority (hierarchy validation)
      // 3. Matching organization (if stakeholder has organizations)
      // 4. Matching municipality/coverage area (if stakeholder has municipality)
      
      const coordinators = await User.find({
        authority: { 
          $gte: Math.max(AUTHORITY_TIERS.COORDINATOR, stakeholderAuthority) // Coordinator authority and >= stakeholder
        },
        isActive: true
      }).select('_id firstName lastName email authority organizations coverageAreas');

      const matchingCoordinators = [];

      for (const coordinator of coordinators) {
        // Check organization match
        let orgMatch = false;
        if (stakeholderOrgIds.size > 0) {
          const coordinatorOrgIds = new Set();
          if (coordinator.organizations && coordinator.organizations.length > 0) {
            coordinator.organizations.forEach(org => {
              if (org.isActive !== false && org.organizationId) {
                coordinatorOrgIds.add(org.organizationId.toString());
              }
            });
          }
          
          // Check if there's any overlap
          for (const stakeholderOrgId of stakeholderOrgIds) {
            if (coordinatorOrgIds.has(stakeholderOrgId)) {
              orgMatch = true;
              break;
            }
          }
          
          // If stakeholder has organizations but no match, skip this coordinator
          if (!orgMatch) {
            continue;
          }
        } else {
          // If stakeholder has no organizations, allow any coordinator (no org filter)
          orgMatch = true;
        }

        // Check municipality/coverage area match
        let coverageMatch = false;
        if (stakeholderMunicipalityId) {
          const coordinatorMunicipalityIds = new Set();
          if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
            coordinator.coverageAreas.forEach(ca => {
              if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
                ca.municipalityIds.forEach(muniId => {
                  if (muniId) {
                    coordinatorMunicipalityIds.add(muniId.toString());
                  }
                });
              }
            });
          }
          
          if (coordinatorMunicipalityIds.has(stakeholderMunicipalityId)) {
            coverageMatch = true;
          }
        } else {
          // If stakeholder has no municipality, allow any coordinator (no coverage filter)
          coverageMatch = true;
        }

        // If both organization and coverage match (or no filter needed), add coordinator
        if (orgMatch && coverageMatch) {
          matchingCoordinators.push({
            userId: coordinator._id,
            id: coordinator._id.toString(), // Legacy ID fallback
            name: `${coordinator.firstName || ''} ${coordinator.lastName || ''}`.trim(),
            email: coordinator.email,
            authority: coordinator.authority,
            organizations: coordinator.organizations,
            coverageAreas: coordinator.coverageAreas
          });
        }
      }

      console.log(`[CoordinatorResolution] Resolved ${matchingCoordinators.length} coordinators for stakeholder ${stakeholderId}`, {
        stakeholderId,
        stakeholderOrgIds: Array.from(stakeholderOrgIds),
        stakeholderMunicipalityId,
        matchingCount: matchingCoordinators.length
      });

      return matchingCoordinators;
    } catch (error) {
      console.error('[CoordinatorResolution] Error resolving coordinator:', error);
      return [];
    }
  }

  /**
   * Auto-assign a coordinator if exactly one match is found
   * @param {string|ObjectId} stakeholderId - Stakeholder/user ID
   * @param {Object} context - Additional context
   * @returns {Promise<Object|null>} Coordinator object if single match, null otherwise
   */
  async autoAssignCoordinator(stakeholderId, context = {}) {
    const coordinators = await this.resolveCoordinatorForStakeholder(stakeholderId, context);
    
    if (coordinators.length === 1) {
      console.log(`[CoordinatorResolution] Auto-assigning single matching coordinator: ${coordinators[0].userId}`);
      return coordinators[0];
    } else if (coordinators.length > 1) {
      console.log(`[CoordinatorResolution] Multiple coordinators found (${coordinators.length}), manual selection required`);
      return null; // Require manual selection
    } else {
      console.log(`[CoordinatorResolution] No matching coordinators found`);
      return null;
    }
  }

  /**
   * Check if a coordinator can be assigned to a stakeholder based on organization + coverage
   * @param {string|ObjectId} coordinatorId - Coordinator user ID
   * @param {string|ObjectId} stakeholderId - Stakeholder user ID
   * @returns {Promise<boolean>} True if coordinator can be assigned
   */
  async canAssignCoordinator(coordinatorId, stakeholderId) {
    try {
      const coordinators = await this.resolveCoordinatorForStakeholder(stakeholderId);
      return coordinators.some(c => c.userId.toString() === coordinatorId.toString());
    } catch (error) {
      console.error('[CoordinatorResolution] Error checking coordinator assignment:', error);
      return false;
    }
  }
}

module.exports = new CoordinatorResolutionService();

