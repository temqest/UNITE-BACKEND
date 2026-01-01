/**
 * Event Request Controller
 * 
 * Handles HTTP requests for event requests
 */

const eventRequestService = require('../../services/eventRequests_services/eventRequest.service');
const actionValidatorService = require('../../services/eventRequests_services/actionValidator.service');
const permissionService = require('../../services/users_services/permission.service');
const RequestStateService = require('../../services/eventRequests_services/requestState.service');
const EventRequest = require('../../models/eventRequests_models/eventRequest.model');
const { STATUS_LABELS, REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');

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

      const result = await eventRequestService.getRequests(userId, filters);
      const { requests, totalCount, statusCounts } = result;

      // Format requests - always compute allowedActions for UI functionality
      // Performance impact is minimal since computation is fast (ObjectId comparison)
      const formattedRequests = await Promise.all(
        requests.map(r => this._formatRequest(r, userId))
      );

      // Verify allowedActions are present in all formatted requests
      const requestsWithActions = formattedRequests.filter(r => r?.allowedActions && Array.isArray(r.allowedActions));
      const requestsWithoutActions = formattedRequests.filter(r => !r?.allowedActions || !Array.isArray(r.allowedActions));
      
      console.log(`[EVENT REQUEST CONTROLLER] 📊 GET /api/event-requests response summary:`, {
        totalRequests: formattedRequests.length,
        requestsWithAllowedActions: requestsWithActions.length,
        requestsWithoutAllowedActions: requestsWithoutActions.length,
        userId: userId?.toString(),
        sampleRequestIds: formattedRequests.slice(0, 3).map(r => ({
          requestId: r?.requestId,
          hasAllowedActions: !!r?.allowedActions,
          allowedActionsCount: r?.allowedActions?.length || 0,
          allowedActions: r?.allowedActions
        }))
      });

      if (requestsWithoutActions.length > 0) {
        console.warn(`[EVENT REQUEST CONTROLLER] ⚠️ Some requests missing allowedActions:`, {
          count: requestsWithoutActions.length,
          requestIds: requestsWithoutActions.map(r => r?.requestId)
        });
      }

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

      const formattedRequest = await this._formatRequest(request, userId);
      
      // Verify allowedActions are present
      console.log(`[EVENT REQUEST CONTROLLER] 📊 GET /api/event-requests/:requestId response:`, {
        requestId,
        userId: userId?.toString(),
        hasAllowedActions: !!formattedRequest?.allowedActions,
        allowedActionsCount: formattedRequest?.allowedActions?.length || 0,
        allowedActions: formattedRequest?.allowedActions,
        status: formattedRequest?.status
      });

      if (!formattedRequest?.allowedActions || !Array.isArray(formattedRequest.allowedActions)) {
        console.warn(`[EVENT REQUEST CONTROLLER] ⚠️ Request ${requestId} missing allowedActions in response`);
      }

      res.status(200).json({
        success: true,
        data: {
          request: formattedRequest,
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
      
      // Use validatedData if available (from validator), otherwise fallback to body
      const validatedData = req.validatedData || req.body;
      const { action, ...actionData } = validatedData;

      if (!action) {
        return res.status(400).json({
          success: false,
          message: 'Action is required'
        });
      }

      // Ensure notes field is normalized (validator normalizes note -> notes, but ensure it's set)
      if (actionData.note && !actionData.notes) {
        actionData.notes = actionData.note;
        delete actionData.note;
      }

      const request = await eventRequestService.executeAction(requestId, userId, action, actionData);
      
      // Generate user-friendly success message based on action and new state
      let successMessage = `Action '${action}' executed successfully`;
      const previousState = request.statusHistory && request.statusHistory.length > 1 
        ? request.statusHistory[request.statusHistory.length - 2]?.status 
        : null;
      const newState = request.status || request.Status;
      const normalizedState = RequestStateService.normalizeState(newState);
      const normalizedPreviousState = previousState ? RequestStateService.normalizeState(previousState) : null;
      
      // Determine if state changed and if UI should refresh/close
      const stateChanged = normalizedPreviousState !== normalizedState;
      const isFinalState = RequestStateService.isFinalState(normalizedState);
      const shouldRefresh = stateChanged || isFinalState;
      const shouldCloseModal = isFinalState || normalizedState === REQUEST_STATES.APPROVED || 
                               normalizedState === REQUEST_STATES.REJECTED || 
                               normalizedState === REQUEST_STATES.CANCELLED;
      
      if (action === 'confirm') {
        if (normalizedState === REQUEST_STATES.APPROVED) {
          successMessage = 'Request confirmed and approved. The event is now published.';
        } else if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
          // This shouldn't happen (confirm should transition to approved), but handle it
          successMessage = 'Request confirmed successfully.';
        } else {
          successMessage = 'Request confirmed successfully.';
        }
      } else if (action === 'accept') {
        successMessage = 'Request accepted and approved. The event is now published.';
      } else if (action === 'reject' || action === 'decline') {
        successMessage = 'Request has been rejected.';
      } else if (action === 'reschedule') {
        successMessage = 'Reschedule proposal submitted. Waiting for response.';
      } else if (action === 'cancel') {
        successMessage = 'Request has been cancelled.';
      }

      const formattedRequest = await this._formatRequest(request, userId);

      // Set cache-busting headers to ensure frontend refreshes
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Request-Updated-At': new Date().toISOString(),
        'X-Should-Refresh': shouldRefresh ? 'true' : 'false',
        'X-Should-Close-Modal': shouldCloseModal ? 'true' : 'false'
      });

      res.status(200).json({
        success: true,
        message: successMessage,
        timestamp: new Date().toISOString(), // Add timestamp for cache busting
        data: {
          request: formattedRequest,
          // UI control flags for frontend
          ui: {
            shouldRefresh: shouldRefresh,
            shouldCloseModal: shouldCloseModal,
            stateChanged: stateChanged,
            previousState: normalizedPreviousState,
            newState: normalizedState,
            isFinalState: isFinalState,
            refreshType: isFinalState ? 'full' : 'partial', // Indicate refresh scope
            cacheKeysToInvalidate: [ // Cache keys for frontend to invalidate
              `/api/event-requests`,
              `/api/event-requests/${requestId}`,
              `/api/event-requests/${requestId}/actions`
            ],
            // Add explicit action taken
            actionExecuted: action,
            actionResult: normalizedState === REQUEST_STATES.APPROVED ? 'approved' : 
                          normalizedState === REQUEST_STATES.REJECTED ? 'rejected' : 
                          normalizedState === REQUEST_STATES.CANCELLED ? 'cancelled' : 'updated'
          }
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
      activeResponder: request.activeResponder ? {
        userId: (() => {
          const uid = request.activeResponder.userId;
          if (!uid) return null;
          // Handle populated ObjectId
          if (uid._id) return uid._id.toString();
          // Handle direct ObjectId
          if (uid.toString && typeof uid.toString === 'function') {
            return uid.toString();
          }
          return String(uid);
        })(),
        relationship: request.activeResponder.relationship,
        authority: request.activeResponder.authority
      } : null,
      lastAction: request.lastAction ? {
        action: request.lastAction.action,
        actorId: request.lastAction.actorId?._id || request.lastAction.actorId,
        timestamp: request.lastAction.timestamp
      } : null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    };

    // Compute allowedActions - always include, default to ['view'] if computation fails or userId missing
    // This ensures frontend always has allowedActions array to work with
    if (userId) {
      try {
        const locationId = request.district || request.municipalityId;
        const allowedActions = await actionValidatorService.getAvailableActions(
          userId,
          request,
          { locationId }
        );
        
        // Validate that allowedActions is an array
        if (Array.isArray(allowedActions) && allowedActions.length > 0) {
          formatted.allowedActions = allowedActions;
          console.log(`[EVENT REQUEST CONTROLLER] ✅ allowedActions computed for request ${request.Request_ID || request._id}:`, {
            requestId: request.Request_ID || request._id,
            userId: userId?.toString(),
            allowedActions,
            actionCount: allowedActions.length,
            status: request.status || request.Status
          });
        } else {
          // If computation returned invalid result, default to view
          console.warn(`[EVENT REQUEST CONTROLLER] ⚠️ Invalid allowedActions result, defaulting to ['view']:`, {
            requestId: request.Request_ID || request._id,
            userId: userId?.toString(),
            result: allowedActions
          });
          formatted.allowedActions = ['view'];
        }
      } catch (error) {
        console.error(`[EVENT REQUEST CONTROLLER] ❌ Error computing allowedActions: ${error.message}`, {
          requestId: request.Request_ID || request._id,
          userId: userId?.toString(),
          error: error.stack
        });
        // Don't fail the request if allowedActions computation fails
        formatted.allowedActions = ['view']; // At minimum, allow view
      }
    } else {
      // No userId provided - default to view only
      console.warn(`[EVENT REQUEST CONTROLLER] ⚠️ No userId provided, defaulting allowedActions to ['view']`, {
        requestId: request.Request_ID || request._id
      });
      formatted.allowedActions = ['view'];
    }

    // Final safety check: ensure allowedActions is always an array
    if (!Array.isArray(formatted.allowedActions)) {
      console.error(`[EVENT REQUEST CONTROLLER] ❌ allowedActions is not an array, fixing:`, {
        requestId: request.Request_ID || request._id,
        allowedActions: formatted.allowedActions
      });
      formatted.allowedActions = ['view'];
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

