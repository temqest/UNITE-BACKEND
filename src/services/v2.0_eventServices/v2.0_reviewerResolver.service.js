/**
 * v2.0 Reviewer Resolver Service
 * 
 * Simplified service to find all users with request.review permission
 * for a specific location (jurisdiction-based).
 * 
 * Jurisdiction = Coverage Area + Organization Type
 */

const { User } = require('../../models/index');
const permissionService = require('../users_services/permission.service');
const coordinatorResolver = require('../users_services/coordinatorResolver.service');
const { AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');

class V2ReviewerResolverService {
  /**
   * Find all reviewers for a location with matching jurisdiction
   * 
   * A reviewer must have:
   * 1. request.review permission for the location
   * 2. Coverage area that includes the location
   * 3. Organization type matching the request (if specified)
   * 
   * @param {string|ObjectId} locationId - Municipality or district ID
   * @param {string} organizationType - Organization type (LGU, NGO, Hospital, etc.)
   * @param {Object} context - Additional context { requesterId, requesterAuthority }
   * @returns {Promise<Array>} Array of reviewer objects
   */
  async findReviewersForLocation(locationId, organizationType, context = {}) {
    try {
      if (!locationId) {
        console.warn('[V2_REVIEWER_RESOLVER] locationId is required');
        return [];
      }

      // Get location hierarchy (province → district → municipality)
      const locationHierarchy = await this.getLocationHierarchy(locationId);
      if (!locationHierarchy) {
        console.warn('[V2_REVIEWER_RESOLVER] Location not found:', locationId);
        return [];
      }

      // Find all active users with coordinator-level authority or higher
      // We'll filter by permissions after
      const authorityMin = context.requesterAuthority 
        ? Math.max(AUTHORITY_TIERS.COORDINATOR, context.requesterAuthority)
        : AUTHORITY_TIERS.COORDINATOR;

      const potentialReviewers = await User.find({
        authority: { $gte: authorityMin },
        isActive: true
      })
        .select('_id firstName lastName email authority organizationType coverageAreas')
        .lean();

      if (process.env.NODE_ENV === 'development') {
        console.log(`[V2_REVIEWER_RESOLVER] Found ${potentialReviewers.length} potential reviewers with authority >= ${authorityMin}`);
      }

      const validReviewers = [];

      // Check each potential reviewer
      for (const user of potentialReviewers) {
        // 1. Check permission
        const hasReviewPermission = await permissionService.checkPermission(
          user._id,
          'request',
          'review',
          { locationId }
        );

        if (!hasReviewPermission) {
          continue;
        }

        // 2. Check jurisdiction match (coverage area + org type)
        const jurisdictionMatch = await this.checkJurisdictionMatch(
          user,
          locationId,
          organizationType,
          locationHierarchy
        );

        if (!jurisdictionMatch) {
          continue;
        }

        // 3. Authority check: reviewer must have authority >= requester
        if (context.requesterAuthority) {
          const reviewerAuthority = user.authority || AUTHORITY_TIERS.BASIC_USER;
          if (reviewerAuthority < context.requesterAuthority) {
            // System admins can bypass
            if (reviewerAuthority < AUTHORITY_TIERS.SYSTEM_ADMIN) {
              continue;
            }
          }
        }

        // All checks passed - add to valid reviewers
        validReviewers.push({
          userId: user._id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          roleSnapshot: user.roleSnapshot || 'Reviewer',
          authority: user.authority || AUTHORITY_TIERS.BASIC_USER,
          organizationType: user.organizationType,
          discoveredAt: new Date()
        });
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[V2_REVIEWER_RESOLVER] Found ${validReviewers.length} valid reviewers for location ${locationId}`);
      }

      return validReviewers;
    } catch (error) {
      console.error('[V2_REVIEWER_RESOLVER] Error finding reviewers:', error);
      return [];
    }
  }

  /**
   * Check if user's jurisdiction matches the request
   * 
   * Jurisdiction = Coverage Area + Organization Type
   * 
   * @param {Object} user - User document
   * @param {string|ObjectId} locationId - Request location (municipality or district)
   * @param {string} organizationType - Request organization type
   * @param {Object} locationHierarchy - Location hierarchy object
   * @returns {Promise<boolean>} True if jurisdiction matches
   */
  async checkJurisdictionMatch(user, locationId, organizationType, locationHierarchy = null) {
    try {
      // 1. Check organization type match
      if (organizationType) {
        const userOrgType = user.organizationType || user.Organization_Type;
        if (userOrgType && userOrgType !== organizationType) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[V2_REVIEWER_RESOLVER] Organization type mismatch:', {
              userId: user._id,
              userOrgType,
              requestOrgType: organizationType
            });
          }
          return false;
        }
      }

      // 2. Check coverage area match
      const coverageMatch = await this._checkLocationInCoverage(locationId, user, locationHierarchy);
      if (!coverageMatch) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[V2_REVIEWER_RESOLVER] Location not in coverage:', {
            userId: user._id,
            locationId
          });
        }
        return false;
      }

      return true;
    } catch (error) {
      console.error('[V2_REVIEWER_RESOLVER] Error checking jurisdiction match:', error);
      return false;
    }
  }

  /**
   * Check if location is in user's coverage area
   * @private
   * @param {string|ObjectId} locationId - Location to check
   * @param {Object} user - User document
   * @param {Object} locationHierarchy - Optional pre-fetched location hierarchy
   * @returns {Promise<boolean>} True if location is in coverage
   */
  async _checkLocationInCoverage(locationId, user, locationHierarchy = null) {
    if (!locationId || !user) {
      return false;
    }

    try {
      // Get user's coverage areas
      const coverageAreas = user.coverageAreas || [];
      if (coverageAreas.length === 0) {
        return false;
      }

      // Check each coverage area
      for (const coverageArea of coverageAreas) {
        const isInCoverage = await coordinatorResolver.isMunicipalityInCoverage(
          locationId,
          coverageArea
        );

        if (isInCoverage) {
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('[V2_REVIEWER_RESOLVER] Error checking location in coverage:', error);
      return false;
    }
  }

  /**
   * Get location hierarchy (province → district → municipality)
   * 
   * @param {string|ObjectId} locationId - Location ID
   * @returns {Promise<Object|null>} Location hierarchy object
   */
  async getLocationHierarchy(locationId) {
    try {
      const { Location } = require('../../models/index');
      const location = await Location.findById(locationId).lean();

      if (!location) {
        return null;
      }

      const hierarchy = {
        location: location,
        municipality: null,
        district: null,
        province: null
      };

      // Determine location type and build hierarchy
      if (location.type === 'municipality') {
        hierarchy.municipality = location;
        if (location.parent) {
          const district = await Location.findById(location.parent).lean();
          if (district) {
            hierarchy.district = district;
            if (district.parent) {
              const province = await Location.findById(district.parent).lean();
              if (province) {
                hierarchy.province = province;
              }
            }
          }
        }
      } else if (location.type === 'district' || location.type === 'city') {
        hierarchy.district = location;
        if (location.parent) {
          const province = await Location.findById(location.parent).lean();
          if (province) {
            hierarchy.province = province;
          }
        }
      } else if (location.type === 'province') {
        hierarchy.province = location;
      }

      return hierarchy;
    } catch (error) {
      console.error('[V2_REVIEWER_RESOLVER] Error getting location hierarchy:', error);
      return null;
    }
  }

  /**
   * Find reviewers for a request (convenience method)
   * 
   * @param {Object} request - Request document
   * @returns {Promise<Array>} Array of reviewer objects
   */
  async findReviewersForRequest(request) {
    if (!request) {
      return [];
    }

    const locationId = request.municipalityId || request.district;
    const organizationType = request.organizationType || request.Organization_Type;
    const requesterAuthority = request.requester?.authoritySnapshot;

    return await this.findReviewersForLocation(locationId, organizationType, {
      requesterId: request.requester?.userId,
      requesterAuthority
    });
  }
}

module.exports = new V2ReviewerResolverService();
