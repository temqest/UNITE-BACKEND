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

      // Get municipalities and organizations based on creator authority
      const municipalities = await jurisdictionService.getMunicipalitiesForStakeholderCreation(userId);
      const organizations = await jurisdictionService.getAllowedOrganizationsForStakeholderCreation(userId);

      // Determine permissions
      const canChooseMunicipality = isSystemAdmin;
      const canChooseOrganization = isSystemAdmin || organizations.length > 0; // Allow choice if organizations exist

      // Diagnostic logging
      console.log('[DIAG] getCreationContext:', {
        userId: userId.toString(),
        creatorAuthority,
        isSystemAdmin,
        municipalitiesCount: municipalities.length,
        organizationsCount: organizations.length,
        canChooseMunicipality,
        canChooseOrganization
      });

      return res.status(200).json({
        success: true,
        data: {
          allowedRole: 'stakeholder', // Always stakeholder for this page
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

