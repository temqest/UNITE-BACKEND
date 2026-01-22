/**
 * Coordinator Resolver Service
 * 
 * Enhanced service for resolving valid coordinators for stakeholders.
 * Enforces coverage area and organization type matching.
 * Returns ALL matching coordinators, not just one.
 * 
 * Matching Rules:
 * 1. Coordinator must be active
 * 2. Coordinator must have coordinator role OR authority >= 60
 * 3. Stakeholder's organization type must match coordinator's organization type
 * 4. Stakeholder's municipality must be within coordinator's coverage area
 */

const mongoose = require('mongoose');
const User = require('../../models/users_models/user.model');
const Location = require('../../models/utility_models/location.model');
const Organization = require('../../models/utility_models/organization.model');

class CoordinatorResolverService {
  /**
   * Get stakeholder's district ID(s) from municipality
   * 
   * @param {ObjectId} municipalityId - Municipality ID
   * @returns {Promise<ObjectId[]>} Array of district IDs
   */
  async getDistrictForMunicipality(municipalityId) {
    if (!municipalityId) return [];

    try {
      // Find the municipality
      const municipality = await Location.findById(municipalityId).lean();
      if (!municipality) return [];

      // Get parent (should be district)
      if (municipality.parent) {
        return [municipality.parent];
      }

      // Fallback: if municipality has no parent, check province
      if (municipality.province) {
        return [municipality.province];
      }

      return [];
    } catch (error) {
      console.error('[getDistrictForMunicipality] Error:', error);
      return [];
    }
  }

  /**
   * Helper: Extract ID from either ObjectId or populated object
   */
  extractId(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value._id) return value._id;
    if (value.toString && typeof value.toString === 'function') return value.toString();
    return value;
  }

  /**
   * Check if a municipality belongs to a coordinator's coverage
   * 
   * Validates by querying the actual CoverageArea document to get geographicUnits
   * 
   * @param {ObjectId|Object} municipalityId - Stakeholder's municipality (can be ID or populated object)
   * @param {Object} coordinatorCoverage - Coordinator's coverage area object from User document
   * @returns {Promise<boolean>}
   */
  async isMunicipalityInCoverage(municipalityId, coordinatorCoverage) {
    if (!municipalityId || !coordinatorCoverage) return false;

    try {
      const mongoose = require('mongoose');
      const CoverageArea = require('../../models/utility_models/coverageArea.model');

      // Extract actual ID from populated object or ObjectId
      const actualMunicipalityId = this.extractId(municipalityId);
      if (!actualMunicipalityId) return false;

      const actualMunicipalityIdStr = actualMunicipalityId.toString();

      // Get the actual CoverageArea document to see all geographicUnits
      const coverageAreaId = this.extractId(coordinatorCoverage.coverageAreaId);
      if (!coverageAreaId) {
        console.log('[isMunicipalityInCoverage] No coverageAreaId found in coordinator coverage');
        return false;
      }

      const actualCoverageArea = await CoverageArea.findById(coverageAreaId)
        .populate('geographicUnits')
        .lean();

      if (!actualCoverageArea) {
        console.log('[isMunicipalityInCoverage] CoverageArea not found:', coverageAreaId.toString());
        return false;
      }

      // Check if municipality is directly in geographicUnits
      if (actualCoverageArea.geographicUnits && actualCoverageArea.geographicUnits.length > 0) {
        const geographicUnitIds = actualCoverageArea.geographicUnits
          .map(gu => this.extractId(gu)?.toString())
          .filter(Boolean);

        const foundDirectMatch = actualCoverageArea.geographicUnits.some(gu => {
          const guId = this.extractId(gu);
          return guId && guId.toString() === actualMunicipalityIdStr;
        });

        if (process.env.NODE_ENV === 'development') {
          console.log('[isMunicipalityInCoverage] Checking against CoverageArea geographicUnits:', {
            coverageAreaName: actualCoverageArea.name,
            coverageAreaId: coverageAreaId.toString(),
            stakeholderMunicipality: actualMunicipalityIdStr,
            geographicUnitIds,
            foundDirectMatch
          });
        }

        if (foundDirectMatch) return true;
      }

      // Indirect check via district: get municipality's district, check if ANY geographicUnit is that district
      const stakeholderDistricts = await this.getDistrictForMunicipality(actualMunicipalityId);
      if (stakeholderDistricts.length > 0 && actualCoverageArea.geographicUnits) {
        const stakeholderDistrictsStrings = stakeholderDistricts
          .map(d => this.extractId(d)?.toString())
          .filter(Boolean);

        const hasMatchingDistrict = stakeholderDistricts.some(sDistrict =>
          actualCoverageArea.geographicUnits.some(gu => {
            const guId = this.extractId(gu);
            return guId && guId.toString() === this.extractId(sDistrict)?.toString();
          })
        );

        if (process.env.NODE_ENV === 'development') {
          console.log('[isMunicipalityInCoverage] Indirect (district) check:', {
            coverageAreaName: actualCoverageArea.name,
            stakeholderDistricts: stakeholderDistrictsStrings,
            hasMatchingDistrict
          });
        }

        if (hasMatchingDistrict) return true;
      }

      return false;
    } catch (error) {
      console.error('[isMunicipalityInCoverage] Error:', error);
      return false;
    }
  }

  /**
   * Check if organization types match
   * 
   * @param {string} stakeholderOrgType - Stakeholder's organization type
   * @param {string} coordinatorOrgType - Coordinator's organization type
   * @returns {boolean}
   */
  isOrganizationTypeMatch(stakeholderOrgType, coordinatorOrgType) {
    if (!stakeholderOrgType || !coordinatorOrgType) return false;
    
    // Normalize types (case-insensitive)
    const sType = String(stakeholderOrgType).toLowerCase().trim();
    const cType = String(coordinatorOrgType).toLowerCase().trim();
    
    return sType === cType;
  }

  /**
   * Check if coordinator is valid for a stakeholder
   * 
   * Comprehensive validation:
   * 1. Coordinator must be active and have authority 60-80
   * 2. Coverage area must contain stakeholder's municipality/district
   * 3. Organization type must match
   * 
   * @param {Object} stakeholder - Stakeholder user object
   * @param {Object} coordinator - Coordinator user object
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async isValidCoordinatorForStakeholder(stakeholder, coordinator) {
    const validationResult = {
      valid: false,
      reason: null,
      details: {}
    };

    // Validation 1: Coordinator must be active
    if (!coordinator.isActive) {
      validationResult.reason = 'Coordinator is inactive';
      return validationResult;
    }

    // Validation 2: Coordinator must have a coordinator role OR authority >= 60
    // (Some systems may use roles, others use authority - accept both)
    const hasCoordinatorRole = (coordinator.roles || []).some(r => 
      r.roleCode && r.roleCode.toLowerCase().includes('coord')
    );
    const hasCoordinatorAuthority = (coordinator.authority || 20) >= 60;
    
    if (!hasCoordinatorRole && !hasCoordinatorAuthority) {
      validationResult.reason = `User is not a coordinator (role: ${hasCoordinatorRole}, authority: ${coordinator.authority})`;
      return validationResult;
    }

    // Validation 3: Get stakeholder's organization type(s)
    const stakeholderOrgTypes = (stakeholder.organizations || [])
      .map(org => org.organizationType)
      .filter(Boolean);

    if (stakeholderOrgTypes.length === 0) {
      validationResult.reason = 'Stakeholder has no organization type';
      return validationResult;
    }

    // Validation 4: Coordinator must have at least one matching organization type
    const coordinatorOrgTypes = (coordinator.organizations || [])
      .map(org => org.organizationType)
      .filter(Boolean);

    const hasOrgTypeMatch = stakeholderOrgTypes.some(sType =>
      coordinatorOrgTypes.some(cType => this.isOrganizationTypeMatch(sType, cType))
    );

    if (!hasOrgTypeMatch) {
      validationResult.reason = `Organization type mismatch: Stakeholder [${stakeholderOrgTypes.join(', ')}], Coordinator [${coordinatorOrgTypes.join(', ')}]`;
      validationResult.details.stakeholderOrgTypes = stakeholderOrgTypes;
      validationResult.details.coordinatorOrgTypes = coordinatorOrgTypes;
      return validationResult;
    }

    // Validation 5: Stakeholder's location must be in coordinator's coverage
    const stakeholderMunicipality = stakeholder.locations?.municipalityId;
    if (!stakeholderMunicipality) {
      validationResult.reason = 'Stakeholder has no municipality assigned';
      return validationResult;
    }

    // Check each coordinator coverage area
    const coordinatorCoverageAreas = coordinator.coverageAreas || [];
    if (coordinatorCoverageAreas.length === 0) {
      validationResult.reason = 'Coordinator has no coverage areas assigned';
      return validationResult;
    }

    console.log('[isValidCoordinatorForStakeholder] Checking coverage for coordinator:', {
      coordinatorId: coordinator._id?.toString(),
      stakeholderMunicipalityId: this.extractId(stakeholderMunicipality)?.toString(),
      coverageAreasCount: coordinatorCoverageAreas.length,
      coverageAreas: coordinatorCoverageAreas.map(c => ({
        name: c.coverageAreaName,
        municipalityIds: c.municipalityIds?.map(m => this.extractId(m)?.toString()),
        districtIds: c.districtIds?.map(d => this.extractId(d)?.toString())
      }))
    });

    let hasCoverageMatch = false;
    for (const coverage of coordinatorCoverageAreas) {
      const isCovered = await this.isMunicipalityInCoverage(stakeholderMunicipality, coverage);
      console.log('[isValidCoordinatorForStakeholder] Coverage check result:', {
        coverageAreaName: coverage.coverageAreaName,
        isCovered
      });
      if (isCovered) {
        hasCoverageMatch = true;
        validationResult.details.matchedCoverageArea = coverage.coverageAreaName;
        break;
      }
    }

    if (!hasCoverageMatch) {
      validationResult.reason = 'Stakeholder\'s municipality is not within coordinator\'s coverage areas';
      validationResult.details.stakeholderMunicipality = this.extractId(stakeholderMunicipality)?.toString();
      validationResult.details.coordinatorCoverageAreas = coordinatorCoverageAreas.map(c => ({
        name: c.coverageAreaName,
        districts: c.districtIds ? c.districtIds.map(d => this.extractId(d)?.toString()) : [],
        municipalities: c.municipalityIds ? c.municipalityIds.map(m => this.extractId(m)?.toString()) : []
      }));
      return validationResult;
    }

    // All validations passed
    validationResult.valid = true;
    return validationResult;
  }

  /**
   * Resolve valid coordinators for a stakeholder
   * 
   * Returns ONLY coordinators that:
   * 1. Have matching organization type
   * 2. Have coverage area containing stakeholder's municipality/district
   * 
   * @param {ObjectId} stakeholderId - Stakeholder user ID
   * @returns {Promise<{coordinators: Array, primaryCoordinator: Object}>}
   */
  async resolveValidCoordinators(stakeholderId) {
    const result = {
      coordinators: [],
      primaryCoordinator: null,
      validationDetails: []
    };

    try {
      // Fetch stakeholder with all necessary fields
      const stakeholder = await User.findById(stakeholderId)
        .populate('organizations.organizationId')
        .populate('locations.municipalityId')
        .lean();

      if (!stakeholder) {
        throw new Error('Stakeholder not found');
      }

      // Get all active coordinators
      // Filter by: Has coordinator role OR authority >= 60
      // This ensures we catch coordinators regardless of whether authority was set correctly
      const potentialCoordinators = await User.find({
        $or: [
          { 'roles.roleCode': 'coordinator', isActive: true },
          { authority: { $gte: 60 }, isActive: true }
        ],
        isActive: true
      })
        .populate('organizations.organizationId')
        .populate('coverageAreas.districtIds')
        .populate('coverageAreas.municipalityIds')
        .lean();

      console.log('[resolveValidCoordinators] Found potential coordinators:', {
        stakeholderId: stakeholderId.toString(),
        potentialCount: potentialCoordinators.length,
        stakeholderOrgs: stakeholder.organizations?.map(o => o.organizationType) || [],
        coordinators: potentialCoordinators.map(c => ({
          id: c._id.toString(),
          name: `${c.firstName} ${c.lastName}`,
          orgTypes: (c.organizations || []).map(o => o.organizationType),
          orgTypesCount: (c.organizations || []).length,
          coverageAreas: (c.coverageAreas || []).map(ca => ca.coverageAreaName),
          authority: c.authority,
          isActive: c.isActive
        }))
      });

      // Validate each potential coordinator
      const validatedCoordinators = [];
      const stakeholderOrgTypes = (stakeholder.organizations || []).map(o => o.organizationType);
      
      for (const coordinator of potentialCoordinators) {
        const coordinatorOrgTypes = (coordinator.organizations || []).map(o => o.organizationType);
        const validation = await this.isValidCoordinatorForStakeholder(stakeholder, coordinator);

        const stakeholderMunicipalityId = this.extractId(stakeholder.locations?.municipalityId);
        
        // Check org type matching for logging
        const orgTypeMatches = stakeholderOrgTypes.filter(sType => 
          coordinatorOrgTypes.some(cType => this.isOrganizationTypeMatch(sType, cType))
        );

        console.log('[resolveValidCoordinators] Validating coordinator:', {
          coordinatorId: coordinator._id.toString(),
          coordinatorName: `${coordinator.firstName} ${coordinator.lastName}`,
          coordinatorAllOrgTypes: coordinatorOrgTypes,
          coordinatorOrgCount: coordinatorOrgTypes.length,
          stakeholderOrgTypes,
          orgTypeMatches: orgTypeMatches.length > 0 ? orgTypeMatches : 'NONE',
          coordinatorCoverageCount: (coordinator.coverageAreas || []).length,
          coordinatorAuthority: coordinator.authority,
          valid: validation.valid,
          reason: validation.reason,
          stakeholderMunicipalityId: stakeholderMunicipalityId?.toString()
        });

        if (validation.valid) {
          validatedCoordinators.push({
            _id: coordinator._id,
            firstName: coordinator.firstName,
            lastName: coordinator.lastName,
            email: coordinator.email,
            fullName: `${coordinator.firstName} ${coordinator.lastName}`,
            organizationType: (coordinator.organizations || [])[0]?.organizationType,
            coverageAreas: coordinator.coverageAreas || [],
            source: 'validated_match'
          });
        }

        result.validationDetails.push({
          coordinatorId: coordinator._id.toString(),
          coordinatorName: `${coordinator.firstName} ${coordinator.lastName}`,
          valid: validation.valid,
          reason: validation.reason,
          details: validation.details
        });
      }

      result.coordinators = validatedCoordinators;
      result.primaryCoordinator = validatedCoordinators.length > 0 ? validatedCoordinators[0] : null;

      console.log('[resolveValidCoordinators] Resolution complete:', {
        stakeholderId: stakeholderId.toString(),
        validCount: validatedCoordinators.length,
        primaryCoordinator: result.primaryCoordinator ? result.primaryCoordinator.fullName : 'none'
      });

      return result;
    } catch (error) {
      console.error('[resolveValidCoordinators] Error:', error);
      throw error;
    }
  }

  /**
   * Validate coordinator assignment for event creation
   * 
   * @param {ObjectId} stakeholderId - Stakeholder ID
   * @param {ObjectId} coordinatorId - Selected coordinator ID
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateCoordinatorAssignment(stakeholderId, coordinatorId) {
    try {
      const stakeholder = await User.findById(stakeholderId)
        .populate('organizations.organizationId')
        .populate('locations.municipalityId')
        .lean();

      if (!stakeholder) {
        return { valid: false, reason: 'Stakeholder not found' };
      }

      const coordinator = await User.findById(coordinatorId)
        .populate('organizations.organizationId')
        .populate('coverageAreas.districtIds')
        .populate('coverageAreas.municipalityIds')
        .lean();

      if (!coordinator) {
        return { valid: false, reason: 'Coordinator not found' };
      }

      return this.isValidCoordinatorForStakeholder(stakeholder, coordinator);
    } catch (error) {
      console.error('[validateCoordinatorAssignment] Error:', error);
      return { valid: false, reason: error.message };
    }
  }
}

module.exports = new CoordinatorResolverService();
