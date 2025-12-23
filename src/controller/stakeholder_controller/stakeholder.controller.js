const authorityService = require('../../services/users_services/authority.service');
const jurisdictionService = require('../../services/users_services/jurisdiction.service');
const coordinatorContextService = require('../../services/users_services/coordinatorContext.service');
const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');

/**
 * Stakeholder Controller
 * Handles stakeholder-specific operations, separate from generic user/staff management
 */
class StakeholderController {
  /**
   * Get creation context for stakeholder management page
   * Returns what roles, coverage areas, and organizations the creator can use
   * GET /api/stakeholders/creation-context
   */
  async getCreationContext(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Get coordinator context using unified resolver (single User query)
      const context = await coordinatorContextService.getCoordinatorContext(userId);
      
      // Get creator authority and system admin status from context
      const creatorAuthority = context.authority;
      const isSystemAdmin = context.user?.isSystemAdmin || creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN;
      
      // Check for missing coordinator data and return structured errors
      if (!isSystemAdmin) {
        const errors = [];
        const errorCodes = [];
        
        if (context.organizations.length === 0) {
          errors.push('No organization assignments found. Coordinators must have at least one organization.');
          errorCodes.push('NO_ORGANIZATIONS');
        }
        
        if (context.coverageAreas.length === 0) {
          errors.push('No coverage area assignments found. Coordinators must have at least one coverage area.');
          errorCodes.push('NO_COVERAGE_AREAS');
        }
        
        if (context.municipalities.length === 0 && context.coverageAreas.length > 0) {
          errors.push('No municipalities found in your coverage areas. This may indicate a data inconsistency.');
          errorCodes.push('NO_MUNICIPALITIES');
        }
        
        if (errors.length > 0) {
          return res.status(400).json({
            success: false,
            message: errors.join(' '),
            code: errorCodes[0],
            codes: errorCodes,
            diagnostic: {
              organizationsFound: context.organizations.length,
              coverageAreasFound: context.coverageAreas.length,
              municipalitiesFound: context.municipalities.length,
              contextIssues: context.issues || []
            }
          });
        }
      }

      // Use context as single source of truth - all data already resolved
      let municipalities = context.municipalities || [];
      let organizations = context.organizations || [];
      
      // Fallback: If context doesn't have organizations, try to get them directly
      if (!isSystemAdmin && organizations.length === 0) {
        console.log('[DIAG] getCreationContext - No organizations in context, trying fallback');
        organizations = await jurisdictionService.getAllowedOrganizationsForStakeholderCreation(userId);
      }
      
      // Fallback: If context doesn't have municipalities, try to get them directly
      if (!isSystemAdmin && municipalities.length === 0 && context.coverageAreas.length > 0) {
        console.log('[DIAG] getCreationContext - No municipalities in context, trying fallback');
        municipalities = await jurisdictionService.getMunicipalitiesForStakeholderCreation(userId);
      }
      
      // Get stakeholder roles that creator can assign (authority-based)
      const creatableRoles = await jurisdictionService.getCreatableRolesForStakeholders(userId);

      // Determine permissions based on data availability
      // System admin can always choose, coordinators can choose if they have multiple options
      const canChooseMunicipality = isSystemAdmin || municipalities.length > 1;
      const canChooseOrganization = isSystemAdmin || organizations.length > 1;
      
      console.log('[DIAG] getCreationContext - Final data:', {
        userId: userId.toString(),
        isSystemAdmin,
        organizationsCount: organizations.length,
        municipalitiesCount: municipalities.length,
        canChooseMunicipality,
        canChooseOrganization,
        creatableRolesCount: creatableRoles.length
      });

      return res.status(200).json({
        success: true,
        data: {
          allowedRole: 'stakeholder', // Always stakeholder for this page
          roleOptions: creatableRoles.map(role => ({
            _id: role._id,
            id: role._id,
            code: role.code,
            name: role.name,
            authority: role.authority,
            description: role.description
          })),
          canChooseMunicipality,
          canChooseOrganization,
          municipalityOptions: municipalities.map(muni => ({
            _id: muni._id,
            id: muni._id,
            name: muni.name,
            code: muni.code,
            type: muni.type,
            parent: muni.parent?._id || muni.parent,
            province: muni.province?._id || muni.province,
            level: muni.level
          })),
          barangayOptions: [], // Initially empty, loaded dynamically after municipality selection
          organizationOptions: organizations.map(org => ({
            _id: org._id,
            id: org._id,
            name: org.name,
            type: org.type,
            code: org.code
          })),
          isSystemAdmin,
          // Add counts for frontend validation
          municipalitiesCount: municipalities.length,
          organizationsCount: organizations.length
        }
      });
    } catch (error) {
      console.error('[DIAG] Error in getCreationContext:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get creation context'
      });
    }
  }

  /**
   * Get diagnostic information for a user
   * Returns complete breakdown of user's authority, organizations, coverage areas, and municipalities
   * GET /api/stakeholders/diagnostics/:userId
   */
  async getDiagnostics(req, res) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.id || req.user?._id;
      
      // Only allow users to view their own diagnostics, or system admins to view any
      const requesterAuthority = await authorityService.calculateUserAuthority(requesterId);
      const isSystemAdmin = requesterAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN;
      
      if (!isSystemAdmin && requesterId?.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only view your own diagnostics'
        });
      }
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      // Get complete coordinator context
      const context = await coordinatorContextService.getCoordinatorContext(userId);
      
      // Get detailed organization assignments
      const { UserOrganization } = require('../../models/index');
      const userOrgAssignments = await UserOrganization.find({
        userId: userId
      }).populate('organizationId').sort({ isActive: -1, isPrimary: -1 });
      
      // Get detailed coverage area assignments
      const userCoverageAssignmentService = require('../../services/users_services/userCoverageAssignment.service');
      const coverageAssignments = await userCoverageAssignmentService.getUserCoverageAreas(userId, {
        includeInactive: true
      });
      
      // Calculate authority breakdown
      const authorityBreakdown = {
        calculated: context.authority,
        tierName: require('../../services/users_services/authority.service').getAuthorityTierName(context.authority),
        roles: context.roles.map(r => ({
          code: r.code,
          name: r.name,
          authority: r.authority
        }))
      };
      
      // Organization breakdown
      const organizationBreakdown = {
        fromUserOrganization: userOrgAssignments.map(ua => ({
          _id: ua._id,
          organizationId: ua.organizationId?._id?.toString() || ua.organizationId?.toString() || 'unknown',
          organizationName: ua.organizationId?.name || 'Not populated',
          isActive: ua.isActive,
          isPrimary: ua.isPrimary,
          expiresAt: ua.expiresAt || null,
          isExpired: ua.expiresAt ? new Date() > ua.expiresAt : false
        })),
        resolvedOrganizations: context.organizations.map(org => ({
          _id: org._id.toString(),
          name: org.name,
          type: org.type,
          code: org.code,
          isActive: org.isActive
        })),
        legacyOrganizationId: context.user?.organizationId || null
      };
      
      // Coverage area breakdown
      const coverageBreakdown = {
        assignments: coverageAssignments.map(ca => ({
          _id: ca._id.toString(),
          coverageAreaId: ca.coverageAreaId?._id?.toString() || ca.coverageAreaId?.toString() || 'unknown',
          coverageAreaName: ca.coverageAreaId?.name || 'Not populated',
          isActive: ca.isActive,
          isPrimary: ca.isPrimary,
          autoCoverDescendants: ca.autoCoverDescendants,
          expiresAt: ca.expiresAt || null,
          isExpired: ca.expiresAt ? new Date() > ca.expiresAt : false,
          geographicUnitsCount: ca.coverageAreaId?.geographicUnits?.length || 0,
          geographicUnitsPopulated: ca.coverageAreaId?.geographicUnits?.[0]?.type ? true : false
        })),
        resolvedCoverageAreas: context.coverageAreas.map(ca => ({
          _id: ca._id.toString(),
          name: ca.name,
          geographicUnitsCount: ca.geographicUnits?.length || 0
        }))
      };
      
      // Municipality breakdown
      const municipalityBreakdown = {
        total: context.municipalities.length,
        municipalities: context.municipalities.map(m => ({
          _id: m._id.toString(),
          name: m.name,
          code: m.code,
          type: m.type,
          parent: m.parent?._id?.toString() || m.parent?.toString() || null,
          province: m.province?._id?.toString() || m.province?.toString() || null
        }))
      };
      
      // Validation summary
      const validation = await coordinatorContextService.validateCoordinatorCompleteness(userId);
      
      return res.status(200).json({
        success: true,
        data: {
          user: {
            _id: context.user?._id?.toString() || userId,
            email: context.user?.email || 'unknown',
            firstName: context.user?.firstName || 'unknown',
            lastName: context.user?.lastName || 'unknown',
            isSystemAdmin: context.user?.isSystemAdmin || false
          },
          authority: authorityBreakdown,
          organizations: organizationBreakdown,
          coverageAreas: coverageBreakdown,
          municipalities: municipalityBreakdown,
          validation: {
            isValid: validation.isValid,
            issues: validation.issues,
            details: validation.details
          },
          contextIssues: context.issues || [],
          summary: {
            canCreateStakeholders: validation.isValid && context.municipalities.length > 0 && context.organizations.length > 0,
            missingData: {
              organizations: context.organizations.length === 0,
              coverageAreas: context.coverageAreas.length === 0,
              municipalities: context.municipalities.length === 0
            }
          }
        }
      });
    } catch (error) {
      console.error('[DIAG] Error in getDiagnostics:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get diagnostics'
      });
    }
  }

  /**
   * Get barangays for a municipality
   * GET /api/stakeholders/barangays/:municipalityId
   */
  async getBarangays(req, res) {
    try {
      const { municipalityId } = req.params;
      
      if (!municipalityId) {
        return res.status(400).json({
          success: false,
          message: 'Municipality ID is required'
        });
      }

      const barangays = await jurisdictionService.getBarangaysForMunicipality(municipalityId);

      return res.status(200).json({
        success: true,
        data: barangays.map(barangay => ({
          _id: barangay._id,
          id: barangay._id,
          name: barangay.name,
          code: barangay.code,
          type: barangay.type,
          parent: barangay.parent?._id || barangay.parent,
          province: barangay.province?._id || barangay.province,
          level: barangay.level
        }))
      });
    } catch (error) {
      console.error('[DIAG] Error in getBarangays:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get barangays'
      });
    }
  }
}

module.exports = new StakeholderController();

