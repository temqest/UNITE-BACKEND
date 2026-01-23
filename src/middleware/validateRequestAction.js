
const actionValidatorService = require('../services/eventRequests_services/actionValidator.service');
const EventRequest = require('../models/eventRequests_models/eventRequest.model');

/**
 * Utility: Check if user is Admin or System Admin by role or StaffType
 */
function isAdminUser(user) {
  return (
    user.role === 'Admin' ||
    user.role === 'System Admin' ||
    user.StaffType === 80 ||
    user.StaffType === 100
  );
}

/**
 * Middleware to validate request action
 */
const validateRequestAction = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    const { action } = req.body;
    const userId = req.user._id || req.user.id;

    if (!action) {
      return res.status(400).json({
        success: false,
        message: 'Action is required'
      });
    }

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

    // Validate action
    const locationId = request.district || request.municipalityId;
    
    // Allow Admins as secondary reviewers for Stakeholder -> Coordinator requests
    // This bypasses the standard validation for admin secondary review actions
    const isSecondaryReviewer = 
      request.initiatorRole === 'Stakeholder' &&
      request.reviewerRole === 'Coordinator' &&
      isAdminUser(req.user);
    
    if (!isSecondaryReviewer) {
      // Standard validation for all other cases
      const validation = await actionValidatorService.validateAction(
        userId,
        action,
        request,
        { locationId }
      );

      if (!validation.valid) {
        return res.status(403).json({
          success: false,
          message: validation.reason
        });
      }
    } else {
      // Log admin secondary review action
      console.log(`[VALIDATE REQUEST ACTION] Admin secondary reviewer (${userId}) attempting action '${action}' on Stakeholder->Coordinator request ${requestId}`);
    }

    // Attach request to req for use in controller
    req.request = request;
    next();
  } catch (error) {
    console.error('[VALIDATE REQUEST ACTION] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating request action'
    });
  }
};

module.exports = validateRequestAction;

