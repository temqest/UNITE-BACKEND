const jurisdictionService = require('../services/users_services/jurisdiction.service');
const authorityService = require('../services/users_services/authority.service');

/**
 * Middleware to validate coverage area and organization assignments
 * Ensures users can only create/manage other users within their jurisdiction
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function validateJurisdiction(req, res, next) {
  try {
    const creatorId = req.user?.id || req.user?._id;
    const { coverageAreaId, organizationId } = req.body;
    
    if (!creatorId) {
      // Let auth middleware handle authentication
      return next();
    }
    
    const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
    const pageContext = req.headers['x-page-context'] || req.body.pageContext;
    
    // System admins bypass all jurisdiction checks
    const isSystemAdmin = creatorAuthority === authorityService.AUTHORITY_TIERS.SYSTEM_ADMIN || 
                          creatorAuthority >= 100; // Also check numeric value for safety
    
    if (isSystemAdmin) {
      // Diagnostic logging
      console.log('[DIAG] validateJurisdiction:', {
        creatorId: creatorId.toString(),
        creatorAuthority,
        authorityTier: authorityService.AuthorityService?.getAuthorityTierName?.(creatorAuthority) || 'UNKNOWN',
        isSystemAdmin: true,
        coverageAreaId: coverageAreaId || 'none',
        organizationId: organizationId || 'none',
        pageContext: pageContext || 'none',
        result: 'bypassed (system admin)'
      });
      return next();
    }
    
    // For non-system-admins, coverage area is required for stakeholder creation
    // But only validate if provided (don't fail on missing)
    let canCreateCoverage = null;
    if (coverageAreaId) {
      canCreateCoverage = await jurisdictionService.canCreateUserInCoverageArea(
        creatorId, 
        coverageAreaId
      );
      if (!canCreateCoverage) {
        // Diagnostic logging
        console.log('[DIAG] validateJurisdiction:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          isSystemAdmin: false,
          coverageAreaId,
          organizationId: organizationId || 'none',
          pageContext: pageContext || 'none',
          canCreateCoverage: false,
          result: 'REJECTED: coverage area outside jurisdiction'
        });
        return res.status(403).json({
          success: false,
          message: 'Cannot create user in coverage area outside your jurisdiction',
          code: 'COVERAGE_AREA_OUTSIDE_JURISDICTION'
        });
      }
    } else {
      // For coordinators, coverage area should be required
      // But check page context - stakeholder-management requires coverage area
      if (pageContext === 'stakeholder-management') {
        // Diagnostic logging
        console.log('[DIAG] validateJurisdiction:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          isSystemAdmin: false,
          coverageAreaId: 'none',
          organizationId: organizationId || 'none',
          pageContext,
          result: 'REJECTED: coverage area required for stakeholder-management'
        });
        return res.status(400).json({
          success: false,
          message: 'Coverage area is required for stakeholder creation',
          code: 'COVERAGE_AREA_REQUIRED'
        });
      }
    }
    
    // Validate organization if provided
    let canAssignOrg = null;
    if (organizationId) {
      canAssignOrg = await jurisdictionService.canAssignOrganization(
        creatorId,
        organizationId
      );
      if (!canAssignOrg) {
        // Diagnostic logging
        console.log('[DIAG] validateJurisdiction:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          isSystemAdmin: false,
          coverageAreaId: coverageAreaId || 'none',
          organizationId,
          pageContext: pageContext || 'none',
          canAssignOrg: false,
          result: 'REJECTED: organization outside jurisdiction'
        });
        return res.status(403).json({
          success: false,
          message: 'Cannot assign user to organization outside your jurisdiction',
          code: 'ORGANIZATION_OUTSIDE_JURISDICTION'
        });
      }
    }
    
    // Diagnostic logging for successful validation
    console.log('[DIAG] validateJurisdiction:', {
      creatorId: creatorId.toString(),
      creatorAuthority,
      isSystemAdmin: false,
      coverageAreaId: coverageAreaId || 'none',
      organizationId: organizationId || 'none',
      pageContext: pageContext || 'none',
      canCreateCoverage: canCreateCoverage !== null ? canCreateCoverage : 'N/A',
      canAssignOrg: canAssignOrg !== null ? canAssignOrg : 'N/A',
      result: 'PASSED'
    });
    
    next();
  } catch (error) {
    console.error('Jurisdiction validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating jurisdiction',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = validateJurisdiction;

