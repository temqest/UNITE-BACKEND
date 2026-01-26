/**
 * Validate Request Access Middleware
 * 
 * Validates that user has access to view request using broadcast model logic:
 * 1. Admin users can access all requests
 * 2. Requester can always access their own request
 * 3. User who claimed the request can access it
 * 4. Valid coordinators (matching location + org type) can access
 */

const permissionService = require('../services/users_services/permission.service');
const broadcastAccessService = require('../services/eventRequests_services/broadcastAccess.service');
const EventRequest = require('../models/eventRequests_models/eventRequest.model');
const { AUTHORITY_TIERS } = require('../utils/eventRequests/requestConstants');

/**
 * Middleware to validate request access
 */
const validateRequestAccess = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id || req.user.id;

    // Get request - try Request_ID first, then _id
    let request = await EventRequest.findOne({ Request_ID: requestId })
      .populate('validCoordinators.userId', '_id firstName lastName authority organizationType');
    if (!request && requestId.match(/^[0-9a-fA-F]{24}$/)) {
      // If requestId looks like an ObjectId, try _id
      request = await EventRequest.findById(requestId)
        .populate('validCoordinators.userId', '_id firstName lastName authority organizationType');
    }
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Get user
    const { User } = require('../models');
    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Tier 1: Check wildcard permissions (admin users)
    const userPermissions = await permissionService.getUserPermissions(userId);
    const hasWildcard = userPermissions.some(p => 
      (p.resource === '*' || p.resource === 'request') && 
      (p.actions?.includes('*') || p.actions?.includes('read'))
    );

    if (hasWildcard) {
      req.request = request;
      return next();
    }

    // Tier 2: Admin authority check (authority >= 80)
    if ((user.authority || 0) >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
      req.request = request;
      return next();
    }

    // Tier 3: Check if requester
    const isRequester = request.requester?.userId?.toString() === userId.toString();
    if (isRequester) {
      req.request = request;
      return next();
    }

    // Tier 4: Check if claimed by this user
    const isClaimedBy = request.claimedBy?.userId?.toString() === userId.toString();
    if (isClaimedBy) {
      req.request = request;
      return next();
    }

    // Tier 5: Check location-scoped permission
    const locationId = request.district || request.municipalityId;
    const hasLocationPermission = await permissionService.checkPermission(
      userId,
      'request',
      'read',
      { locationId }
    );

    if (hasLocationPermission) {
      req.request = request;
      return next();
    }

    // Tier 6: Broadcast coordinator check
    const canAccessBroadcast = await broadcastAccessService.canAccessRequest(userId, request);

    if (!canAccessBroadcast) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[VALIDATE REQUEST ACCESS] Access denied for user:', {
          userId,
          requestId: request._id,
          isRequester,
          isClaimedBy,
          hasWildcard,
          hasLocationPermission
        });
      }
      return res.status(403).json({
        success: false,
        message: 'User does not have permission to access this request (not a valid coordinator for this location/organization)'
      });
    }

    // Attach request to req for use in controller
    req.request = request;
    next();
  } catch (error) {
    console.error('[VALIDATE REQUEST ACCESS] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating request access'
    });
  }
};

module.exports = validateRequestAccess;

