const { User, UserRole, UserOrganization, UserCoverageAssignment, CoverageArea, Location, Organization } = require('../../models/index');
const authorityService = require('./authority.service');
const permissionService = require('./permission.service');
const userCoverageAssignmentService = require('./userCoverageAssignment.service');
const locationService = require('../utility_services/location.service');

/**
 * Coordinator Context Service
 * 
 * Provides a single source of truth for coordinator context resolution.
 * All coordinator data (roles, organizations, coverage, authority) should be
 * resolved through this service to ensure consistency.
 */
class CoordinatorContextService {
  /**
   * Get complete coordinator context
   * Uses embedded User data (single query, no joins)
   * 
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<Object>} Coordinator context object
   */
  async getCoordinatorContext(userId) {
    try {
      // Single query to get user with all embedded data
      const user = await User.findById(userId) || await User.findByLegacyId(userId);
      
      if (!user) {
        return {
          user: null,
          roles: [],
          authority: null,
          organizations: [],
          coverageAreas: [],
          municipalities: [],
          isValid: false,
          issues: ['USER_NOT_FOUND']
        };
      }
      
      // Get authority (use persisted field)
      const authority = user.authority || await authorityService.calculateUserAuthority(user._id);
      
      // Get roles from embedded array
      const roles = (user.roles || [])
        .filter(r => r.isActive)
        .map(r => ({
          _id: r.roleId,
          code: r.roleCode,
          name: r.roleCode, // Would need to fetch Role for name, but code is sufficient
          authority: r.roleAuthority
        }));
      
      // Get organizations from embedded array
      const organizationIds = (user.organizations || []).map(o => o.organizationId);
      const organizations = organizationIds.length > 0
        ? await Organization.find({ _id: { $in: organizationIds }, isActive: true })
        : [];
      
      // Get coverage areas from embedded array
      const coverageAreaIds = (user.coverageAreas || []).map(ca => ca.coverageAreaId);
      const coverageAreas = coverageAreaIds.length > 0
        ? await CoverageArea.find({ _id: { $in: coverageAreaIds }, isActive: true })
        : [];
      
      // Get municipalities from embedded municipalityIds
      const municipalityIds = (user.coverageAreas || [])
        .flatMap(ca => ca.municipalityIds || [])
        .filter(Boolean);
      
      const municipalities = municipalityIds.length > 0
        ? await Location.find({ 
            _id: { $in: municipalityIds },
            type: 'municipality',
            isActive: true 
          })
          .populate('parent')
          .populate('province')
          .sort({ name: 1 })
        : [];
      
      // Validate completeness
      const validation = await this.validateCoordinatorCompleteness(user._id);
      
      return {
        user: {
          _id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
          isSystemAdmin: user.isSystemAdmin
        },
        roles: roles,
        authority: authority,
        organizations: organizations.map(org => ({
          _id: org._id,
          name: org.name,
          type: org.type,
          code: org.code,
          isActive: org.isActive
        })),
        coverageAreas: coverageAreas.map(ca => ({
          _id: ca._id,
          name: ca.name,
          geographicUnits: ca.geographicUnits || []
        })),
        municipalities: municipalities.map(m => ({
          _id: m._id,
          name: m.name,
          code: m.code,
          type: m.type,
          parent: m.parent?._id || m.parent,
          province: m.province?._id || m.province
        })),
        isValid: validation.isValid,
        issues: validation.issues
      };
    } catch (error) {
      console.error('[CTX] Error in getCoordinatorContext:', error);
      return {
        user: null,
        roles: [],
        authority: null,
        organizations: [],
        coverageAreas: [],
        municipalities: [],
        isValid: false,
        issues: ['CONTEXT_RESOLUTION_ERROR', error.message]
      };
    }
  }
  
  /**
   * Resolve organizations for a user
   * Uses embedded User.organizations[] array
   * 
   * @private
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Array>} Array of Organization documents
   */
  async _resolveOrganizations(userId) {
    const user = await User.findById(userId) || await User.findByLegacyId(userId);
    if (!user || !user.organizations || user.organizations.length === 0) {
      console.log('[CTX] _resolveOrganizations - No user or organizations found:', {
        userId: userId?.toString(),
        hasUser: !!user,
        organizationsCount: user?.organizations?.length || 0
      });
      return [];
    }
    
    // Handle both ObjectId and string formats
    const mongoose = require('mongoose');
    const organizationIds = user.organizations
      .map(o => {
        const orgId = o.organizationId;
        if (typeof orgId === 'string' && mongoose.Types.ObjectId.isValid(orgId)) {
          return new mongoose.Types.ObjectId(orgId);
        }
        return orgId;
      })
      .filter(Boolean);
    
    const organizations = await Organization.find({ 
      _id: { $in: organizationIds },
      isActive: true 
    }).sort({ name: 1 });
    
    return organizations;
  }
  
  /**
   * Resolve municipalities for a user
   * Uses embedded User.coverageAreas[].municipalityIds array
   * 
   * @private
   * @param {ObjectId} userId - User ID
   * @param {Array} coverageAreas - Coverage areas (unused, kept for compatibility)
   * @returns {Promise<Array>} Array of Location documents (type: 'municipality')
   */
  async _resolveMunicipalities(userId, coverageAreas) {
    const user = await User.findById(userId) || await User.findByLegacyId(userId);
    if (!user || !user.coverageAreas || user.coverageAreas.length === 0) {
      console.log('[CTX] _resolveMunicipalities - No user or coverage areas found:', {
        userId: userId?.toString(),
        hasUser: !!user,
        coverageAreasCount: user?.coverageAreas?.length || 0
      });
      return [];
    }
    
    // Get municipalityIds from embedded coverage areas
    // Handle both ObjectId and string formats
    const municipalityIds = user.coverageAreas
      .flatMap(ca => {
        const ids = ca.municipalityIds || [];
        // Convert to ObjectIds if they're strings
        return ids.map(id => {
          if (typeof id === 'string') {
            const mongoose = require('mongoose');
            return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
          }
          return id;
        }).filter(Boolean);
      })
      .filter(Boolean);
    
    console.log('[CTX] _resolveMunicipalities - Extracted municipality IDs:', {
      userId: userId?.toString(),
      coverageAreasCount: user.coverageAreas.length,
      municipalityIdsCount: municipalityIds.length,
      municipalityIds: municipalityIds.map(id => id.toString())
    });
    
    if (municipalityIds.length === 0) {
      console.log('[CTX] _resolveMunicipalities - No municipality IDs found in coverage areas');
      return [];
    }
    
    const municipalities = await Location.find({
      _id: { $in: municipalityIds },
      type: 'municipality',
      isActive: true
    })
      .populate('parent')
      .populate('province')
      .sort({ name: 1 });
    
    console.log('[CTX] _resolveMunicipalities - Found municipalities:', {
      requested: municipalityIds.length,
      found: municipalities.length,
      municipalityNames: municipalities.map(m => m.name)
    });
    
    return municipalities;
  }
  
  /**
   * Validate coordinator has required data
   * Ensures: role, organization, coverage all exist for coordinators
   * 
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<Object>} Validation result with detailed issues
   */
  async validateCoordinatorCompleteness(userId) {
    try {
      const issues = [];
      const details = {};
      
      // Check user exists
      const mongoose = require('mongoose');
      let user = null;
      
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      
      if (!user) {
        user = await User.findByLegacyId(userId);
      }
      
      if (!user) {
        return {
          isValid: false,
          issues: ['USER_NOT_FOUND'],
          details: { userId: userId.toString() }
        };
      }
      
      // Check roles
      const userRoles = await UserRole.find({
        userId: user._id,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');
      
      const activeRoles = userRoles.filter(ur => {
        const role = ur.roleId;
        return role && role.isActive;
      });
      
      details.roles = {
        totalAssignments: userRoles.length,
        activeRoles: activeRoles.length,
        roleCodes: activeRoles.map(ur => ur.roleId?.code).filter(Boolean)
      };
      
      if (activeRoles.length === 0) {
        issues.push('NO_ACTIVE_ROLES');
        details.roles.message = 'User has no active role assignments. Please assign at least one role.';
      }
      
      // Check authority (should be >= 60 for coordinators)
      const authority = await authorityService.calculateUserAuthority(user._id);
      details.authority = {
        calculated: authority,
        required: 60,
        isSystemAdmin: user.isSystemAdmin
      };
      
      if (authority < 60 && !user.isSystemAdmin) {
        issues.push('INSUFFICIENT_AUTHORITY');
        details.authority.message = `User authority (${authority}) is below coordinator level (60). User may need coordinator role assignment.`;
      }
      
      // Check organizations (use embedded array)
      const organizations = await this._resolveOrganizations(user._id);
      
      details.organizations = {
        embeddedOrganizations: user.organizations?.length || 0,
        resolvedOrganizations: organizations.length,
        organizationNames: organizations.map(o => o.name)
      };
      
      if (organizations.length === 0) {
        issues.push('NO_ORGANIZATIONS');
        details.organizations.message = 'User has no organization assignments. Please assign at least one organization.';
        details.organizations.suggestions = [
          'Check if User.organizations[] array is populated',
          'Run migration script: migrateUserOrganizations.js'
        ];
      }
      
      // Check coverage areas (use embedded array)
      details.coverageAreas = {
        embeddedCoverageAreas: user.coverageAreas?.length || 0,
        coverageAreaNames: user.coverageAreas?.map(ca => ca.coverageAreaName || 'Unknown') || []
      };
      
      if (!user.coverageAreas || user.coverageAreas.length === 0) {
        issues.push('NO_COVERAGE_AREAS');
        details.coverageAreas.message = 'User has no coverage area assignments. Coordinators must have at least one coverage area.';
        details.coverageAreas.suggestions = [
          'Check if User.coverageAreas[] array is populated',
          'Run migration script: migrateUserCoverage.js'
        ];
      } else {
        // Check if municipalities are available from embedded municipalityIds
        const municipalityIds = user.coverageAreas
          .flatMap(ca => ca.municipalityIds || [])
          .filter(Boolean);
        
        details.municipalities = {
          embeddedMunicipalityIds: municipalityIds.length,
          canCreateStakeholders: municipalityIds.length > 0
        };
        
        if (municipalityIds.length === 0 && user.coverageAreas.length > 0) {
          issues.push('NO_MUNICIPALITIES');
          details.municipalities.message = 'Coverage areas found but no municipalities are embedded. This may indicate data inconsistency.';
          details.municipalities.suggestions = [
            'Verify coverage area geographic units contain districts or provinces',
            'Check if districts have municipalities assigned',
            'Run migration script: migrateUserCoverage.js'
          ];
        }
      }
      
      // Enhanced logging
      // console.log('[CTX] Coordinator validation complete:', {
      //   userId: userId.toString(),
      //   isValid: issues.length === 0,
      //   issues,
      //   details
      // });
      
      return {
        isValid: issues.length === 0,
        issues,
        details
      };
    } catch (error) {
      console.error('[CTX] Error validating coordinator completeness:', error);
      return {
        isValid: false,
        issues: ['VALIDATION_ERROR', error.message],
        details: { error: error.message, stack: error.stack }
      };
    }
  }
}

module.exports = new CoordinatorContextService();

