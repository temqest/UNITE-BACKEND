/**
 * v2.0 Event Request Controller
 * 
 * HTTP request handlers for v2.0 event request endpoints.
 * All responses use standardized format: { success, message, data }
 */

const v2EventRequestService = require('../../services/v2.0_eventServices/v2.0_eventRequest.service');
const actionValidatorService = require('../../services/eventRequests_services/actionValidator.service');
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');

class V2EventRequestController {
  /**
   * Create new event request
   * @route POST /api/v2/event-requests
   */
  async createEventRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const requestData = req.validatedData || req.body;

      const request = await v2EventRequestService.createRequest(userId, requestData);

      res.status(201).json({
        success: true,
        message: 'Event request created successfully',
        data: {
          request: await this._formatRequest(request, userId)
        }
      });
    } catch (error) {
      console.error('[V2_EVENT_REQUEST_CONTROLLER] Create error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create event request',
        code: 'VALIDATION_ERROR'
      });
    }
  }

  /**
   * Get event requests (filtered by jurisdiction)
   * @route GET /api/v2/event-requests
   */
  async getEventRequests(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const filters = {
        status: req.query.status,
        organizationId: req.query.organizationId,
        coverageAreaId: req.query.coverageAreaId,
        municipalityId: req.query.municipalityId,
        district: req.query.district,
        province: req.query.province,
        category: req.query.category,
        page: req.query.page,
        limit: req.query.limit
      };

      const result = await v2EventRequestService.getRequests(userId, filters);

      // Format requests
      const formattedRequests = await Promise.all(
        result.requests.map(request => this._formatRequest(request, userId))
      );

      res.status(200).json({
        success: true,
        message: 'Event requests retrieved successfully',
        data: {
          requests: formattedRequests,
          pagination: {
            page: result.page,
            limit: result.limit,
            totalCount: result.totalCount,
            totalPages: result.totalPages
          }
        }
      });
    } catch (error) {
      console.error('[V2_EVENT_REQUEST_CONTROLLER] Get requests error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve event requests',
        code: 'SERVER_ERROR'
      });
    }
  }

  /**
   * Get event request by ID
   * @route GET /api/v2/event-requests/:requestId
   */
  async getEventRequestById(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const requestId = req.params.requestId;

      const request = await v2EventRequestService.getRequestById(requestId, userId);

      res.status(200).json({
        success: true,
        message: 'Event request retrieved successfully',
        data: {
          request: await this._formatRequest(request, userId)
        }
      });
    } catch (error) {
      console.error('[V2_EVENT_REQUEST_CONTROLLER] Get request by ID error:', error);
      const statusCode = error.message === 'Request not found' ? 404 : 
                        error.message.includes('permission') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to retrieve event request',
        code: statusCode === 404 ? 'NOT_FOUND' : 
              statusCode === 403 ? 'PERMISSION_DENIED' : 'SERVER_ERROR'
      });
    }
  }

  /**
   * Update event request
   * @route PUT /api/v2/event-requests/:requestId
   */
  async updateEventRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const requestId = req.params.requestId;
      const updateData = req.validatedData || req.body;

      const request = await v2EventRequestService.updateRequest(requestId, userId, updateData);

      res.status(200).json({
        success: true,
        message: 'Event request updated successfully',
        data: {
          request: await this._formatRequest(request, userId)
        }
      });
    } catch (error) {
      console.error('[V2_EVENT_REQUEST_CONTROLLER] Update error:', error);
      const statusCode = error.message === 'Request not found' ? 404 : 
                        error.message.includes('permission') || error.message.includes('Only requester') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update event request',
        code: statusCode === 404 ? 'NOT_FOUND' : 
              statusCode === 403 ? 'PERMISSION_DENIED' : 'VALIDATION_ERROR'
      });
    }
  }

  /**
   * Execute action on request
   * @route POST /api/v2/event-requests/:requestId/actions
   */
  async executeAction(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const requestId = req.params.requestId;
      const { action, ...actionData } = req.validatedData || req.body;

      const result = await v2EventRequestService.executeAction(requestId, userId, action, actionData);

      res.status(200).json({
        success: true,
        message: `Action '${action}' executed successfully`,
        data: {
          request: await this._formatRequest(result.request, userId),
          event: result.event ? {
            Event_ID: result.event.Event_ID,
            Event_Title: result.event.Event_Title,
            Status: result.event.Status
          } : null
        }
      });
    } catch (error) {
      console.error('[V2_EVENT_REQUEST_CONTROLLER] Execute action error:', error);
      const statusCode = error.message === 'Request not found' ? 404 : 
                        error.message.includes('permission') || error.message.includes('not allowed') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to execute action',
        code: statusCode === 404 ? 'NOT_FOUND' : 
              statusCode === 403 ? 'PERMISSION_DENIED' : 'VALIDATION_ERROR'
      });
    }
  }

  /**
   * Get available reviewers for request
   * @route GET /api/v2/event-requests/:requestId/reviewers
   */
  async getReviewers(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const requestId = req.params.requestId;

      // Get request to check access
      const request = await v2EventRequestService.getRequestById(requestId, userId);

      // Find reviewers
      const reviewers = await v2EventRequestService.findReviewersForRequest(request);

      res.status(200).json({
        success: true,
        message: 'Reviewers retrieved successfully',
        data: {
          reviewers: reviewers.map(r => ({
            userId: r.userId,
            name: r.name,
            roleSnapshot: r.roleSnapshot,
            authority: r.authority,
            organizationType: r.organizationType
          })),
          count: reviewers.length
        }
      });
    } catch (error) {
      console.error('[V2_EVENT_REQUEST_CONTROLLER] Get reviewers error:', error);
      const statusCode = error.message === 'Request not found' ? 404 : 
                        error.message.includes('permission') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to retrieve reviewers',
        code: statusCode === 404 ? 'NOT_FOUND' : 
              statusCode === 403 ? 'PERMISSION_DENIED' : 'SERVER_ERROR'
      });
    }
  }

  /**
   * Format request for response
   * @private
   * @param {Object} request - Request document
   * @param {string|ObjectId} userId - Current user ID
   * @returns {Promise<Object>} Formatted request
   */
  async _formatRequest(request, userId) {
    // Convert to plain object if needed
    const requestObj = request.toObject ? request.toObject() : request;

    const formatted = {
      Request_ID: requestObj.Request_ID,
      Event_ID: requestObj.Event_ID,
      status: requestObj.status || requestObj.Status,
      requester: {
        userId: requestObj.requester?.userId,
        name: requestObj.requester?.name,
        roleSnapshot: requestObj.requester?.roleSnapshot,
        authoritySnapshot: requestObj.requester?.authoritySnapshot
      },
      reviewer: requestObj.reviewer ? {
        userId: requestObj.reviewer.userId,
        name: requestObj.reviewer.name,
        roleSnapshot: requestObj.reviewer.roleSnapshot,
        assignedAt: requestObj.reviewer.assignedAt
      } : null,
      validCoordinators: requestObj.validCoordinators || [],
      activeResponder: requestObj.activeResponder,
      // Event details
      Event_Title: requestObj.Event_Title,
      Location: requestObj.Location,
      Start_Date: requestObj.Start_Date || requestObj.Date,
      End_Date: requestObj.End_Date,
      Email: requestObj.Email,
      Phone_Number: requestObj.Phone_Number,
      Event_Description: requestObj.Event_Description,
      Category: requestObj.Category,
      // Location references
      municipalityId: requestObj.municipalityId,
      district: requestObj.district,
      province: requestObj.province,
      organizationId: requestObj.organizationId,
      coverageAreaId: requestObj.coverageAreaId,
      organizationType: requestObj.organizationType,
      // Category-specific fields
      Target_Donation: requestObj.Target_Donation,
      VenueType: requestObj.VenueType,
      TrainingType: requestObj.TrainingType,
      MaxParticipants: requestObj.MaxParticipants,
      Topic: requestObj.Topic,
      TargetAudience: requestObj.TargetAudience,
      ExpectedAudienceSize: requestObj.ExpectedAudienceSize,
      PartnerOrganization: requestObj.PartnerOrganization,
      StaffAssignmentID: requestObj.StaffAssignmentID,
      // Reschedule proposal
      rescheduleProposal: requestObj.rescheduleProposal,
      // Metadata
      notes: requestObj.notes,
      createdAt: requestObj.createdAt,
      updatedAt: requestObj.updatedAt
    };

    // Compute allowedActions - always include, default to ['view'] if computation fails or userId missing
    // This ensures frontend always has allowedActions array to work with
    if (userId) {
      try {
        const locationId = requestObj.municipalityId || requestObj.district;
        const context = { locationId };
        
        // Pass the request object (may be Mongoose document or plain object)
        // actionValidatorService.getAvailableActions handles both cases
        const allowedActions = await actionValidatorService.getAvailableActions(
          userId,
          request, // Pass original request object, not requestObj
          context
        );
        
        // Validate that allowedActions is an array
        if (Array.isArray(allowedActions) && allowedActions.length > 0) {
          formatted.allowedActions = allowedActions;
        } else {
          // If computation returned invalid result, default to view
          formatted.allowedActions = ['view'];
        }
      } catch (error) {
        // Don't fail the request if allowedActions computation fails
        console.error('[V2_EVENT_REQUEST_CONTROLLER] Error computing allowedActions:', error);
        formatted.allowedActions = ['view']; // At minimum, allow view
      }
    } else {
      // No userId provided - default to view only
      formatted.allowedActions = ['view'];
    }

    // Final safety check: ensure allowedActions is always an array
    if (!Array.isArray(formatted.allowedActions)) {
      console.error(`[V2_EVENT_REQUEST_CONTROLLER] ❌ allowedActions is not an array, fixing:`, {
        requestId: requestObj.Request_ID || requestObj._id,
        allowedActions: formatted.allowedActions
      });
      formatted.allowedActions = ['view'];
    }

    return formatted;
  }
}

module.exports = new V2EventRequestController();
