/**
 * Broadcast Access Service
 * 
 * Validates coordinator access to event requests based on:
 * 1. Geographic coverage area
 * 2. Organization type matching
 * 3. Active status
 * 
 * This service implements the broadcast model where multiple coordinators
 * can see and act on requests, not just a single assigned reviewer.
 */

const User = require('../../models/users_models/user.model');
const coordinatorResolver = require('../users_services/coordinatorResolver.service');
const { AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');

class BroadcastAccessService {
  /**
   * Check if a user can access a request using broadcast logic
   * 
   * A coordinator can access a request if:
   * 1. They are an admin (authority >= 80) - can see all requests
   * 2. They are the requester - can always see their own request
   * 3. They are the one who claimed it - can see claimed request
   * 4. They are a valid coordinator matching location + org type
   * 
   * @param {ObjectId} userId - User attempting access
   * @param {Object} request - Event request document
   * @returns {Promise<boolean>} Can user access this request?
   */
  async canAccessRequest(userId, request) {
    if (!userId || !request) return false;

    try {
      // Get user details
      const user = await User.findById(userId).lean();
      if (!user) return false;

      // Admin can access all requests
      if ((user.authority || 0) >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        return true;
      }

      // Requester can always access their own request
      const isRequester = request.requester?.userId?.toString() === userId.toString();
      if (isRequester) return true;

      // User who claimed it can access it
      const isClaimedBy = request.claimedBy?.userId?.toString() === userId.toString();
      if (isClaimedBy) return true;

      // Check broadcast coordinator access
      return await this.isBroadcastCoordinator(user, request);
    } catch (error) {
      console.error('[BROADCAST ACCESS] canAccessRequest error:', error);
      return false;
    }
  }

  /**
   * Check if user is a valid broadcast coordinator for this request
   * 
   * @param {Object} user - User document
   * @param {Object} request - Event request document
   * @returns {Promise<boolean>} Is user a valid broadcast coordinator?
   */
  async isBroadcastCoordinator(user, request) {
    try {
      // Check: Must be coordinator (authority >= 60)
      if ((user.authority || 0) < AUTHORITY_TIERS.COORDINATOR) {
        return false;
      }

      // Check: Organization type must match
      const userOrgType = user.organizationType || user.Organization_Type;
      const requestOrgType = request.organizationType || request.Organization_Type;

      if (userOrgType && requestOrgType && userOrgType !== requestOrgType) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BROADCAST ACCESS] Organization type mismatch:', {
            userId: user._id,
            userOrgType,
            requestOrgType
          });
        }
        return false;
      }

      // Check: Location must be in coordinator's coverage
      const locationMatch = await this._checkLocationInCoverage(
        request.municipalityId || request.district,
        user
      );

      if (!locationMatch) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BROADCAST ACCESS] Location not in coverage:', {
            userId: user._id,
            requestLocation: request.municipalityId || request.district
          });
        }
        return false;
      }

      // All checks passed
      return true;
    } catch (error) {
      console.error('[BROADCAST ACCESS] isBroadcastCoordinator error:', error);
      return false;
    }
  }

  /**
   * Check if a location is in user's coverage area
   * @private
   */
  async _checkLocationInCoverage(locationId, user) {
    if (!locationId || !user) return false;

    try {
      // Get user's coverage areas
      const coverageAreas = user.coverageAreas || [];
      if (coverageAreas.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[BROADCAST ACCESS] User has no coverage areas:', user._id);
        }
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
      console.error('[BROADCAST ACCESS] _checkLocationInCoverage error:', error);
      return false;
    }
  }

  /**
   * Get all valid coordinators for a request
   * 
   * Used when creating a request or finding all matching coordinators
   * 
   * @param {ObjectId} locationId - Request's municipality or district
   * @param {string} organizationType - Request's organization type (LGU, NGO, Hospital, etc)
   * @param {Object} options - Additional filtering options
   * @returns {Promise<Array>} Array of valid coordinators
   */
  async findValidCoordinators(locationId, organizationType, options = {}) {
    try {
      if (!locationId) {
        console.warn('[BROADCAST ACCESS] locationId is required');
        return [];
      }

      // Find all active coordinators with request.review permission
      const coordinators = await User.find({
        authority: { $gte: AUTHORITY_TIERS.COORDINATOR, $lt: AUTHORITY_TIERS.OPERATIONAL_ADMIN },
        isActive: true,
        organizationType: organizationType || { $exists: false }
      })
        .select('_id firstName lastName roleSnapshot authority organizationType coverageAreas')
        .lean();

      if (process.env.NODE_ENV === 'development') {
        console.log('[BROADCAST ACCESS] Found', coordinators.length, 'active coordinators');
      }

      // Filter by coverage area
      const validCoordinators = [];

      for (const coordinator of coordinators) {
        const isInCoverage = await this._checkLocationInCoverage(locationId, coordinator);

        if (isInCoverage) {
          validCoordinators.push({
            userId: coordinator._id,
            name: `${coordinator.firstName || ''} ${coordinator.lastName || ''}`.trim(),
            roleSnapshot: coordinator.roleSnapshot || 'Coordinator',
            authority: coordinator.authority,
            organizationType: coordinator.organizationType,
            discoveredAt: new Date()
          });
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('[BROADCAST ACCESS] Found', validCoordinators.length, 'valid coordinators');
      }

      return validCoordinators;
    } catch (error) {
      console.error('[BROADCAST ACCESS] findValidCoordinators error:', error);
      return [];
    }
  }

  /**
   * Check if a coordinator can claim a request
   * 
   * @param {ObjectId} coordinatorId - Coordinator attempting to claim
   * @param {Object} request - Event request document
   * @returns {Promise<Object>} { canClaim: boolean, reason?: string }
   */
  async canClaimRequest(coordinatorId, request) {
    try {
      // Check: Not already claimed by someone else
      if (request.claimedBy && request.claimedBy.userId.toString() !== coordinatorId.toString()) {
        return {
          canClaim: false,
          reason: `Already claimed by ${request.claimedBy.name} at ${request.claimedBy.claimedAt}`
        };
      }

      // Check: Coordinator is in valid coordinators list
      const isValid = request.validCoordinators.some(
        vc => vc.userId.toString() === coordinatorId.toString()
      );

      if (!isValid) {
        return {
          canClaim: false,
          reason: 'You are not a valid coordinator for this request'
        };
      }

      return { canClaim: true };
    } catch (error) {
      console.error('[BROADCAST ACCESS] canClaimRequest error:', error);
      return {
        canClaim: false,
        reason: 'Error checking claim eligibility'
      };
    }
  }

  /**
   * Check if a coordinator can perform an action on a request
   * 
   * Rules:
   * - If request is NOT claimed: Any valid coordinator can act
   * - If request IS claimed: Only that coordinator can act
   * 
   * @param {ObjectId} coordinatorId - Coordinator attempting action
   * @param {Object} request - Event request document
   * @returns {Promise<Object>} { canAct: boolean, reason?: string }
   */
  async canActOnRequest(coordinatorId, request) {
    try {
      // If not claimed, any valid coordinator can act (will auto-claim)
      if (!request.claimedBy) {
        const isValid = request.validCoordinators.some(
          vc => vc.userId.toString() === coordinatorId.toString()
        );

        if (!isValid) {
          return {
            canAct: false,
            reason: 'You are not a valid coordinator for this request'
          };
        }

        return { canAct: true };
      }

      // If claimed, only claimed coordinator can act
      if (request.claimedBy.userId.toString() !== coordinatorId.toString()) {
        return {
          canAct: false,
          reason: `This request is claimed by ${request.claimedBy.name}`
        };
      }

      return { canAct: true };
    } catch (error) {
      console.error('[BROADCAST ACCESS] canActOnRequest error:', error);
      return {
        canAct: false,
        reason: 'Error checking action eligibility'
      };
    }
  }

  /**
   * Get all visible requests for a coordinator
   * 
   * Returns requests where coordinator:
   * 1. Is in validCoordinators array, OR
   * 2. Is the requester, OR
   * 3. Is an admin
   * 
   * @param {ObjectId} coordinatorId - Coordinator user ID
   * @param {Object} filters - Additional filters (status, etc)
   * @returns {Promise<Array>} Array of visible requests
   */
  async getVisibleRequests(coordinatorId, filters = {}) {
    try {
      const user = await User.findById(coordinatorId).lean();
      if (!user) return [];

      // Build query
      let query = {};

      if ((user.authority || 0) >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Admins see all
        query = filters;
      } else {
        // Coordinators see:
        // 1. Requests they are in validCoordinators for
        // 2. Requests they submitted
        // 3. Requests they claimed
        query = {
          $or: [
            { 'validCoordinators.userId': coordinatorId },
            { 'requester.userId': coordinatorId },
            { 'claimedBy.userId': coordinatorId }
          ],
          ...filters
        };
      }

      return await require('../../models/eventRequests_models/eventRequest.model')
        .find(query)
        .lean();
    } catch (error) {
      console.error('[BROADCAST ACCESS] getVisibleRequests error:', error);
      return [];
    }
  }
}

module.exports = new BroadcastAccessService();
