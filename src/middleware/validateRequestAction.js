/**
 * Validate Request Action Middleware
 * 
 * Validates that user can perform action on request
 */

const actionValidatorService = require('../services/eventRequests_services/actionValidator.service');
const EventRequest = require('../models/eventRequests_models/eventRequest.model');

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

    // Get request
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Validate action
    const locationId = request.district || request.municipalityId;
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

