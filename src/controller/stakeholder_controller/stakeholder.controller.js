const authorityService = require('../../services/users_services/authority.service');
const jurisdictionService = require('../../services/users_services/jurisdiction.service');
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

      // Calculate creator authority
      const creatorAuthority = await authorityService.calculateUserAuthority(userId);
      const isSystemAdmin = creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN;

      // Get coverage areas and organizations based on creator authority
      const coverageAreas = await jurisdictionService.getCreatorJurisdictionForStakeholderCreation(userId);
      const organizations = await jurisdictionService.getAllowedOrganizationsForStakeholderCreation(userId);

      // Determine permissions
      const canChooseCoverage = isSystemAdmin;
      const canChooseOrganization = isSystemAdmin;

      // Diagnostic logging
      console.log('[DIAG] getCreationContext:', {
        userId: userId.toString(),
        creatorAuthority,
        isSystemAdmin,
        coverageAreasCount: coverageAreas.length,
        organizationsCount: organizations.length,
        canChooseCoverage,
        canChooseOrganization
      });

      return res.status(200).json({
        success: true,
        data: {
          allowedRole: 'stakeholder', // Always stakeholder for this page
          canChooseCoverage,
          canChooseOrganization,
          coverageOptions: coverageAreas.map(ca => ({
            _id: ca._id,
            id: ca._id,
            name: ca.name,
            code: ca.code,
            description: ca.description,
            organizationId: ca.organizationId?._id || ca.organizationId,
            geographicUnits: ca.geographicUnits || []
          })),
          organizationOptions: organizations.map(org => ({
            _id: org._id,
            id: org._id,
            name: org.name,
            type: org.type,
            code: org.code
          })),
          isSystemAdmin
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
}

module.exports = new StakeholderController();

