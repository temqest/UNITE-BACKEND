/**
 * Validate Request Access Middleware
 * 
 * Validates that user has access to view request
 */

const permissionService = require('../services/users_services/permission.service');
const EventRequest = require('../models/eventRequests_models/eventRequest.model');

/**
 * Middleware to validate request access
 */
const validateRequestAccess = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id || req.user.id;

    // Get request - try Request_ID first, then _id
    let request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request && requestId.match(/^[0-9a-fA-F]{24}$/)) {
      // If requestId looks like an ObjectId, try _id
      request = await EventRequest.findById(requestId);
    }
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check permission
    const locationId = request.district || request.municipalityId;
    const canView = await permissionService.checkPermission(
      userId,
      'request',
      'read',
      { locationId }
    );

    if (!canView) {
      // Check if user is requester or reviewer
      const isRequester = request.requester?.userId?.toString() === userId.toString();
      const isReviewer = request.reviewer?.userId?.toString() === userId.toString();
      
      if (!isRequester && !isReviewer) {
        return res.status(403).json({
          success: false,
          message: 'User does not have permission to access this request'
        });
      }
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

