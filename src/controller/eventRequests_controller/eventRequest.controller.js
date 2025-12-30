/**
 * Event Request Controller
 * 
 * Handles HTTP requests for event requests
 */

const eventRequestService = require('../../services/eventRequests_services/eventRequest.service');
const actionValidatorService = require('../../services/eventRequests_services/actionValidator.service');
const permissionService = require('../../services/users_services/permission.service');
const EventRequest = require('../../models/eventRequests_models/eventRequest.model');
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
          request: await this._formatRequest(request, userId)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Create error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create event request',
        code: 'VALIDATION_ERROR'
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
        search: req.query.search,
        requesterName: req.query.requesterName,
        requesterEmail: req.query.requesterEmail,
        organizationId: req.query.organizationId,
        coverageAreaId: req.query.coverageAreaId,
        province: req.query.province,
        district: req.query.district,
        municipalityId: req.query.municipalityId,
        category: req.query.category,
        title: req.query.title,
        coordinator: req.query.coordinator,
        stakeholder: req.query.stakeholder,
        limit: parseInt(req.query.limit) || 100,
        skip: parseInt(req.query.skip) || 0
      };

      // Check if actions should be included (default: false for list views for performance)
      const includeActions = req.query.includeActions === 'true' || req.query.includeActions === true;

      const result = await eventRequestService.getRequests(userId, filters);
      const { requests, totalCount, statusCounts } = result;

      // Format requests - skip allowedActions computation for list views unless explicitly requested
      const formattedRequests = await Promise.all(
        requests.map(r => this._formatRequest(r, includeActions ? userId : null))
      );

      res.status(200).json({
        success: true,
        data: {
          requests: formattedRequests,
          count: totalCount,
          statusCounts: statusCounts || {
            all: totalCount,
            approved: 0,
            pending: 0,
            rejected: 0
          }
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Get requests error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get event requests',
        code: 'INTERNAL_ERROR'
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

      // Get staff separately if not already attached
      const EventStaff = require('../../models/events_models/eventStaff.model');
      const staff = request.staff || await EventStaff.find({ EventID: request.Event_ID });

      res.status(200).json({
        success: true,
        data: {
          request: await this._formatRequest(request, userId),
          staff: staff.map(s => ({
            FullName: s.FullName || s.Staff_FullName,
            Role: s.Role
          }))
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Get by ID error:', error);
      const statusCode = error.message?.includes('not found') ? 404 : 
                        error.message?.includes('permission') ? 403 : 500;
      const errorCode = statusCode === 404 ? 'NOT_FOUND' : 
                       statusCode === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR';
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get event request',
        code: errorCode
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
          request: await this._formatRequest(request, userId)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Update error:', error);
      const statusCode = error.message?.includes('not found') ? 404 : 
                        error.message?.includes('permission') ? 403 : 400;
      const errorCode = statusCode === 404 ? 'NOT_FOUND' : 
                       statusCode === 403 ? 'FORBIDDEN' : 'VALIDATION_ERROR';
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to update event request',
        code: errorCode
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
          request: await this._formatRequest(request, userId)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Execute action error:', error);
      const statusCode = error.message?.includes('not found') ? 404 : 
                        error.message?.includes('permission') || error.message?.includes('not valid') ? 403 : 400;
      const errorCode = statusCode === 404 ? 'NOT_FOUND' : 
                       statusCode === 403 ? 'FORBIDDEN' : 'ACTION_ERROR';
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to execute action',
        code: errorCode
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
          request: await this._formatRequest(request, userId)
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Cancel error:', error);
      const statusCode = error.message?.includes('not found') ? 404 : 
                        error.message?.includes('permission') ? 403 : 400;
      const errorCode = statusCode === 404 ? 'NOT_FOUND' : 
                       statusCode === 403 ? 'FORBIDDEN' : 'CANCEL_ERROR';
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to cancel request',
        code: errorCode
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
      const statusCode = error.message?.includes('not found') ? 404 : 
                        error.message?.includes('permission') ? 403 : 400;
      const errorCode = statusCode === 404 ? 'NOT_FOUND' : 
                       statusCode === 403 ? 'FORBIDDEN' : 'DELETE_ERROR';
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to delete request',
        code: errorCode
      });
    }
  }

  /**
   * Format request for response
   * @private
   * @param {Object} request - Request document
   * @param {string|ObjectId} userId - User ID for computing allowedActions (optional)
   * @returns {Promise<Object>} Formatted request object
   */
  async _formatRequest(request, userId = null) {
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
      municipalityId: request.municipalityId?._id || request.municipalityId,
      municipalityName: request.municipalityId?.name || null,
      district: request.district?._id || request.district,
      districtName: request.district?.name || null,
      province: request.province?._id || request.province,
      provinceName: request.province?.name || null,
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

    // Compute allowedActions if userId provided
    if (userId) {
      try {
        const locationId = request.district || request.municipalityId;
        const allowedActions = await actionValidatorService.getAvailableActions(
          userId,
          request,
          { locationId }
        );
        formatted.allowedActions = allowedActions;
      } catch (error) {
        console.error(`[EVENT REQUEST CONTROLLER] Error computing allowedActions: ${error.message}`);
        // Don't fail the request if allowedActions computation fails
        formatted.allowedActions = ['view']; // At minimum, allow view
      }
    }

    return formatted;
  }

  /**
   * Assign staff to event
   * @route POST /api/event-requests/:requestId/staff
   */
  async assignStaff(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user._id || req.user.id;
      const { eventId, staffMembers } = req.body;

      if (!eventId) {
        return res.status(400).json({
          success: false,
          message: 'Event ID is required'
        });
      }

      if (!staffMembers || !Array.isArray(staffMembers)) {
        return res.status(400).json({
          success: false,
          message: 'Staff members array is required'
        });
      }

      // Get request to check permissions - try Request_ID first, then _id
      let request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request && requestId.match(/^[0-9a-fA-F]{24}$/)) {
        request = await EventRequest.findById(requestId);
      }
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Request not found'
        });
      }

      // Check permission - use event.manage-staff permission
      const locationId = request.district || request.municipalityId;
      const canManageStaff = await permissionService.checkPermission(
        userId,
        'event',
        'manage-staff',
        { locationId }
      );

      if (!canManageStaff) {
        // Check for wildcard permissions
        const userPermissions = await permissionService.getUserPermissions(userId);
        const hasWildcard = userPermissions.some(p => 
          (p.resource === '*' || p.resource === 'event') && 
          (p.actions?.includes('*') || p.actions?.includes('manage-staff'))
        );

        if (!hasWildcard) {
          return res.status(403).json({
            success: false,
            message: 'User does not have permission to manage staff for this event'
          });
        }
      }

      // Assign staff via service
      const result = await eventRequestService.assignStaffToEvent(
        userId,
        requestId,
        eventId,
        staffMembers
      );

      console.log('[EVENT REQUEST CONTROLLER] Staff assignment result:', {
        eventId: result.event?.Event_ID,
        staffCount: result.staff?.length || 0,
        staff: result.staff
      });

      res.status(200).json({
        success: true,
        message: 'Staff assigned successfully',
        data: {
          event: result.event,
          staff: result.staff || []
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Assign staff error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to assign staff'
      });
    }
  }
}

module.exports = new EventRequestController();

