/**
 * Event Request Controller
 * 
 * Handles HTTP requests for event requests
 */

const eventRequestService = require('../../services/eventRequests_services/eventRequest.service');
const { STATUS_LABELS } = require('../../utils/eventRequests/requestConstants');

class EventRequestController {
  /**
   * Create new event request
   * @route POST /api/event-requests
   */
  async createEventRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const requestData = req.body;

      const request = await eventRequestService.createRequest(userId, requestData);

      res.status(201).json({
        success: true,
        message: 'Event request created successfully',
        data: {
          request: this._formatRequest(request)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Create error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create event request'
      });
    }
  }

  /**
   * Get event requests
   * @route GET /api/event-requests
   */
  async getEventRequests(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const filters = {
        status: req.query.status,
        organizationId: req.query.organizationId,
        coverageAreaId: req.query.coverageAreaId,
        municipalityId: req.query.municipalityId,
        limit: parseInt(req.query.limit) || 100,
        skip: parseInt(req.query.skip) || 0
      };

      const requests = await eventRequestService.getRequests(userId, filters);

      res.status(200).json({
        success: true,
        data: {
          requests: requests.map(r => this._formatRequest(r)),
          count: requests.length
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Get requests error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get event requests'
      });
    }
  }

  /**
   * Get event request by ID
   * @route GET /api/event-requests/:requestId
   */
  async getEventRequestById(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const { requestId } = req.params;

      const request = await eventRequestService.getRequestById(requestId, userId);

      res.status(200).json({
        success: true,
        data: {
          request: this._formatRequest(request)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Get by ID error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 
                        error.message.includes('permission') ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get event request'
      });
    }
  }

  /**
   * Update event request
   * @route PUT /api/event-requests/:requestId
   */
  async updateEventRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const { requestId } = req.params;
      const updateData = req.body;

      const request = await eventRequestService.updateRequest(requestId, userId, updateData);

      res.status(200).json({
        success: true,
        message: 'Event request updated successfully',
        data: {
          request: this._formatRequest(request)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Update error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 
                        error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update event request'
      });
    }
  }

  /**
   * Execute action on request
   * @route POST /api/event-requests/:requestId/actions
   */
  async executeAction(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const { requestId } = req.params;
      const { action, ...actionData } = req.body;

      if (!action) {
        return res.status(400).json({
          success: false,
          message: 'Action is required'
        });
      }

      const request = await eventRequestService.executeAction(requestId, userId, action, actionData);

      res.status(200).json({
        success: true,
        message: `Action '${action}' executed successfully`,
        data: {
          request: this._formatRequest(request)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Execute action error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 
                        error.message.includes('permission') || error.message.includes('not valid') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to execute action'
      });
    }
  }

  /**
   * Get available actions for request
   * @route GET /api/event-requests/:requestId/actions
   */
  async getAvailableActions(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const { requestId } = req.params;

      const actions = await eventRequestService.getAvailableActions(requestId, userId);

      res.status(200).json({
        success: true,
        data: {
          actions,
          requestId
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Get actions error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get available actions'
      });
    }
  }

  /**
   * Cancel request
   * @route DELETE /api/event-requests/:requestId
   */
  async cancelRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const { requestId } = req.params;

      const request = await eventRequestService.cancelRequest(requestId, userId);

      res.status(200).json({
        success: true,
        message: 'Request cancelled successfully',
        data: {
          request: this._formatRequest(request)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Cancel error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 
                        error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to cancel request'
      });
    }
  }

  /**
   * Delete request
   * @route DELETE /api/event-requests/:requestId/delete
   */
  async deleteRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const { requestId } = req.params;

      await eventRequestService.deleteRequest(requestId, userId);

      res.status(200).json({
        success: true,
        message: 'Request deleted successfully'
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Delete error:', error);
      const statusCode = error.message.includes('not found') ? 404 : 
                        error.message.includes('permission') ? 403 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to delete request'
      });
    }
  }

  /**
   * Format request for response
   * @private
   */
  _formatRequest(request) {
    if (!request) return null;

    const formatted = {
      requestId: request.Request_ID,
      eventId: request.Event_ID,
      requester: {
        userId: request.requester?.userId?._id || request.requester?.userId,
        name: request.requester?.name,
        roleSnapshot: request.requester?.roleSnapshot,
        authoritySnapshot: request.requester?.authoritySnapshot
      },
      reviewer: request.reviewer ? {
        userId: request.reviewer.userId?._id || request.reviewer.userId,
        name: request.reviewer.name,
        roleSnapshot: request.reviewer.roleSnapshot,
        assignedAt: request.reviewer.assignedAt,
        assignmentRule: request.reviewer.assignmentRule
      } : null,
      organizationId: request.organizationId,
      coverageAreaId: request.coverageAreaId,
      municipalityId: request.municipalityId,
      district: request.district,
      province: request.province,
      // Event details - all fields from Event model
      Event_Title: request.Event_Title,
      Location: request.Location,
      Date: request.Date || request.Start_Date, // Support both for backward compatibility
      Email: request.Email,
      Phone_Number: request.Phone_Number,
      Event_Description: request.Event_Description,
      category: request.Category,
      // Category-specific fields
      Target_Donation: request.Target_Donation,
      VenueType: request.VenueType,
      TrainingType: request.TrainingType,
      MaxParticipants: request.MaxParticipants,
      Topic: request.Topic,
      TargetAudience: request.TargetAudience,
      ExpectedAudienceSize: request.ExpectedAudienceSize,
      PartnerOrganization: request.PartnerOrganization,
      StaffAssignmentID: request.StaffAssignmentID,
      status: request.status,
      statusLabel: STATUS_LABELS[request.status] || request.status,
      notes: request.notes,
      rescheduleProposal: request.rescheduleProposal,
      statusHistory: request.statusHistory || [],
      decisionHistory: request.decisionHistory || [],
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };

    return formatted;
  }
}

module.exports = new EventRequestController();

