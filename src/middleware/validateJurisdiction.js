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
    const { coverageAreaId, organizationId, municipalityId, barangayId } = req.body;
    const pageContext = req.headers['x-page-context'] || req.body.pageContext;
    
    if (!creatorId) {
      // Let auth middleware handle authentication
      return next();
    }
    
    const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
    
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
        municipalityId: municipalityId || 'none',
        organizationId: organizationId || 'none',
        pageContext: pageContext || 'none',
        result: 'bypassed (system admin)'
      });
      return next();
    }
    
    // For stakeholder creation, validate municipality instead of coverage area
    if (pageContext === 'stakeholder-management') {
      // Municipality is required for stakeholder creation
      if (!municipalityId) {
        console.log('[DIAG] validateJurisdiction:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          isSystemAdmin: false,
          municipalityId: 'none',
          organizationId: organizationId || 'none',
          pageContext,
          result: 'REJECTED: municipality required for stakeholder-management'
        });
        return res.status(400).json({
          success: false,
          message: 'Municipality is required for stakeholder creation',
          code: 'MUNICIPALITY_REQUIRED'
        });
      }
      
      // Validate municipality is within creator's jurisdiction
      const municipalities = await jurisdictionService.getMunicipalitiesForStakeholderCreation(creatorId);
      const municipalityIds = municipalities.map(m => m._id.toString());
      
      if (!municipalityIds.includes(municipalityId.toString())) {
        console.log('[DIAG] validateJurisdiction:', {
          creatorId: creatorId.toString(),
          creatorAuthority,
          isSystemAdmin: false,
          municipalityId,
          organizationId: organizationId || 'none',
          pageContext,
          result: 'REJECTED: municipality outside jurisdiction'
        });
        return res.status(403).json({
          success: false,
          message: 'Cannot create stakeholder in municipality outside your jurisdiction',
          code: 'MUNICIPALITY_OUTSIDE_JURISDICTION'
        });
      }
      
      // If barangay is provided, validate it belongs to the municipality
      if (barangayId) {
        const { Location } = require('../models');
        const barangay = await Location.findById(barangayId);
        if (!barangay || barangay.type !== 'barangay' || barangay.parent?.toString() !== municipalityId.toString()) {
          return res.status(400).json({
            success: false,
            message: 'Barangay does not belong to the selected municipality',
            code: 'INVALID_BARANGAY'
          });
        }
      }
    } else {
      // For staff creation, validate coverage area
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
      municipalityId: municipalityId || 'none',
      barangayId: barangayId || 'none',
      organizationId: organizationId || 'none',
      pageContext: pageContext || 'none',
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

