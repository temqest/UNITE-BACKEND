/**
 * Stakeholder Filtering Service
 * 
 * Provides methods to filter stakeholders based on coordinator's coverage area,
 * organization type, and other constraints. Ensures admin and non-admin users
 * see consistent filtering results.
 */

const mongoose = require('mongoose');
const User = require('../../models/users_models/user.model');
const CoverageArea = require('../../models/utility_models/coverageArea.model');
const Location = require('../../models/utility_models/location.model');

class StakeholderFilteringService {
  /**
   * Filter stakeholders by coordinator's coverage area
   * 
   * Ensures that only stakeholders within the coordinator's coverage are returned,
   * matching the same logic used for coordinator resolution.
   * 
   * @param {ObjectId|string} coordinatorId - Coordinator user ID
   * @param {Array<ObjectId|string>} stakeholderIds - List of stakeholder user IDs to filter
   * @returns {Promise<Array>} Filtered stakeholder IDs that match coordinator's coverage
   */
  async filterStakeholdersByCoverageArea(coordinatorId, stakeholderIds) {
    if (!coordinatorId || !stakeholderIds || stakeholderIds.length === 0) {
      return [];
    }

    try {
      const coordinatorIdObj = this.normalizeId(coordinatorId);
      
      // Step 1: Get coordinator's coverage areas
      const coordinator = await User.findById(coordinatorIdObj)
        .select('coverageAreas organizationTypes organizations')
        .lean();

      if (!coordinator) {
        console.log('[filterStakeholdersByCoverageArea] Coordinator not found:', coordinatorId);
        return [];
      }

      console.log('[filterStakeholdersByCoverageArea] Coordinator found:', {
        coordinatorId: coordinatorIdObj.toString(),
        coverageAreasCount: coordinator.coverageAreas?.length || 0,
        organizationTypesCount: coordinator.organizationTypes?.length || 0
      });

      if (!coordinator.coverageAreas || coordinator.coverageAreas.length === 0) {
        console.log('[filterStakeholdersByCoverageArea] Coordinator has no coverage areas');
        return [];
      }

      // Step 2: Extract all municipality IDs from coordinator's coverage areas
      const coordinatorMunicipalityIds = new Set();
      const coordinatorDistrictIds = new Set();

      for (const coverage of coordinator.coverageAreas) {
        // Get the actual CoverageArea document to see all geographicUnits
        const coverageAreaId = this.normalizeId(coverage.coverageAreaId || coverage._id);
        const coverageArea = await CoverageArea.findById(coverageAreaId)
          .populate('geographicUnits')
          .lean();

        if (coverageArea && coverageArea.geographicUnits && coverageArea.geographicUnits.length > 0) {
          for (const unit of coverageArea.geographicUnits) {
            const unitId = unit._id || unit;
            const unitIdStr = this.normalizeId(unitId).toString();
            coordinatorMunicipalityIds.add(unitIdStr);
            coordinatorDistrictIds.add(unitIdStr);
          }
        }

        // Also check for direct municipality/district IDs stored in coverage object
        if (coverage.municipalityIds && Array.isArray(coverage.municipalityIds)) {
          coverage.municipalityIds.forEach(mid => {
            const midStr = this.normalizeId(mid).toString();
            coordinatorMunicipalityIds.add(midStr);
          });
        }
        
        if (coverage.districtIds && Array.isArray(coverage.districtIds)) {
          coverage.districtIds.forEach(did => {
            const didStr = this.normalizeId(did).toString();
            coordinatorDistrictIds.add(didStr);
          });
        }
      }

      console.log('[filterStakeholdersByCoverageArea] Coordinator coverage extracted:', {
        municipalityIdsCount: coordinatorMunicipalityIds.size,
        districtIdsCount: coordinatorDistrictIds.size,
        totalLocations: coordinatorMunicipalityIds.size + coordinatorDistrictIds.size
      });

      // Step 3: Get stakeholders and filter by coverage + organization type
      const stakeholderIdObjs = stakeholderIds.map(id => this.normalizeId(id));
      const stakeholders = await User.find({
        _id: { $in: stakeholderIdObjs }
      }).select('_id locations organizationTypes organizations authority').lean();

      console.log('[filterStakeholdersByCoverageArea] Stakeholders to filter:', {
        totalStakeholders: stakeholders.length,
        coordinatorCoverageSize: coordinatorMunicipalityIds.size
      });

      // Step 4: Filter stakeholders based on coverage area and organization type match
      const validStakeholderIds = [];

      for (const stakeholder of stakeholders) {
        // Check 1: Stakeholder must be within coordinator's coverage area
        let isInCoverage = false;

        if (stakeholder.locations) {
          // Check municipality
          if (stakeholder.locations.municipalityId) {
            const stakeholderMunicipalityIdStr = this.normalizeId(stakeholder.locations.municipalityId).toString();
            if (coordinatorMunicipalityIds.has(stakeholderMunicipalityIdStr)) {
              isInCoverage = true;
            }
          }

          // Check district if municipality didn't match
          if (!isInCoverage && stakeholder.locations.districtId) {
            const stakeholderDistrictIdStr = this.normalizeId(stakeholder.locations.districtId).toString();
            if (coordinatorDistrictIds.has(stakeholderDistrictIdStr)) {
              isInCoverage = true;
            }
          }
        }

        if (!isInCoverage) {
          console.log('[filterStakeholdersByCoverageArea] Stakeholder outside coverage:', {
            stakeholderId: stakeholder._id.toString(),
            stakeholderMunicipality: stakeholder.locations?.municipalityId?.toString() || 'none',
            inCoverage: false
          });
          continue;
        }

        // Check 2: Organization type must match (if both have org types)
        let isOrgTypeMatch = true;
        const stakeholderOrgTypes = stakeholder.organizationTypes || [];
        const coordinatorOrgTypes = coordinator.organizationTypes || [];

        if (stakeholderOrgTypes.length > 0 && coordinatorOrgTypes.length > 0) {
          // Both have organization types - must have overlap
          const stakeholderOrgSet = new Set(stakeholderOrgTypes.map(o => o.toString().toLowerCase()));
          const coordinatorOrgSet = new Set(coordinatorOrgTypes.map(o => o.toString().toLowerCase()));
          
          isOrgTypeMatch = Array.from(stakeholderOrgSet).some(orgType => coordinatorOrgSet.has(orgType));
        }

        if (!isOrgTypeMatch) {
          console.log('[filterStakeholdersByCoverageArea] Stakeholder org type mismatch:', {
            stakeholderId: stakeholder._id.toString(),
            stakeholderOrgTypes,
            coordinatorOrgTypes,
            match: false
          });
          continue;
        }

        // Stakeholder passes all filters
        validStakeholderIds.push(stakeholder._id.toString());
      }

      console.log('[filterStakeholdersByCoverageArea] Filtering complete:', {
        inputStakeholders: stakeholderIds.length,
        outputStakeholders: validStakeholderIds.length,
        filtered: stakeholderIds.length - validStakeholderIds.length
      });

      return validStakeholderIds;
    } catch (error) {
      console.error('[filterStakeholdersByCoverageArea] Error during filtering:', error);
      throw new Error(`Failed to filter stakeholders by coverage area: ${error.message}`);
    }
  }

  /**
   * Helper: Normalize ID to ObjectId
   */
  normalizeId(value) {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    if (typeof value === 'string') {
      try {
        return new mongoose.Types.ObjectId(value);
      } catch (e) {
        return null;
      }
    }
    if (value._id) {
      return this.normalizeId(value._id);
    }
    return null;
  }
}

module.exports = new StakeholderFilteringService();
