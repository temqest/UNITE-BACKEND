/**
 * Event Request Controller
 * 
 * Handles HTTP requests for event requests
 */

const eventRequestService = require('../../services/eventRequests_services/eventRequest.service');
const batchEventService = require('../../services/eventRequests_services/batchEvent.service');
const actionValidatorService = require('../../services/eventRequests_services/actionValidator.service');
const permissionService = require('../../services/users_services/permission.service');
const RequestStateService = require('../../services/eventRequests_services/requestState.service');
const EventRequest = require('../../models/eventRequests_models/eventRequest.model');
const { Event, User } = require('../../models');
const { STATUS_LABELS, REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');

class EventRequestController {
  /**
   * Create new event request
   * @route POST /api/event-requests
   */
  async createEventRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      // Use validated data instead of raw body, and normalize frontend field names
      const requestData = req.validatedData || req.body;
      
      // Normalize frontend field name 'coordinator' to backend field name 'coordinatorId'
      if (requestData.coordinator && !requestData.coordinatorId) {
        requestData.coordinatorId = requestData.coordinator;
      }
      
      // Normalize frontend field name 'stakeholder' to backend field name 'stakeholderId'
      if (requestData.stakeholder && !requestData.stakeholderId) {
        requestData.stakeholderId = requestData.stakeholder;
      }

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
   * Create batch of events (admin only)
   * @route POST /api/event-requests/batch
   */
  async createBatchEvents(req, res) {
    try {
      const userId = req.user._id || req.user.id;
      const validatedData = req.validatedData || req.body;
      const eventsData = validatedData.events || [];

      if (!eventsData || eventsData.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No events provided in batch',
          code: 'VALIDATION_ERROR'
        });
      }

      const result = await batchEventService.createBatchEvents(userId, eventsData);

      // Determine response status based on results
      const statusCode = result.failed === 0 ? 201 : 
                        result.created > 0 ? 207 : // Multi-Status
                        400;

      res.status(statusCode).json({
        success: result.failed === 0,
        message: result.failed === 0 
          ? `Successfully created ${result.created} event(s)`
          : `Created ${result.created} event(s), ${result.failed} failed`,
        data: {
          created: result.created,
          failed: result.failed,
          total: eventsData.length,
          events: result.events,
          errors: result.errors
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Batch create error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create batch events',
        code: 'BATCH_CREATE_ERROR'
      });
    }
  }

  /**
   * Get event requests
   * @route GET /api/event-requests
   */
  async getEventRequests(req, res) {
    const startTime = Date.now();
    const timings = {
      total: 0,
      query: 0,
      formatting: 0,
      permissionChecks: 0
    };

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

      const queryStart = Date.now();
      const result = await eventRequestService.getRequests(userId, filters);
      timings.query = Date.now() - queryStart;
      const { requests, totalCount, statusCounts } = result;

      // Check if minimal fields are requested (for list view)
      const fieldsParam = req.query.fields;
      const isMinimal = fieldsParam === 'minimal' || fieldsParam === 'list';

      // Format requests in batch - optimized for performance
      const formatStart = Date.now();
      const formattedRequests = await this._formatRequestsBatch(requests, userId, isMinimal);
      timings.formatting = Date.now() - formatStart;

      // Verify allowedActions are present (only log if there's an issue)
      const requestsWithoutActions = formattedRequests.filter(r => !r?.allowedActions || !Array.isArray(r.allowedActions));
      if (requestsWithoutActions.length > 0) {
        console.warn(`⚠️ ${requestsWithoutActions.length} requests missing allowedActions`);
      }

      timings.total = Date.now() - startTime;

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
   * Format multiple requests in batch (optimized for performance)
   * @private
   * @param {Array} requests - Array of request documents
   * @param {string|ObjectId} userId - User ID for computing allowedActions
   * @param {boolean} isMinimal - If true, exclude large fields (statusHistory, decisionHistory)
   * @returns {Promise<Array>} Array of formatted request objects
   */
  async _formatRequestsBatch(requests, userId, isMinimal = false) {
    if (!requests || requests.length === 0) {
      return [];
    }

    const batchStart = Date.now();
    let userFetchTime = 0;
    let permissionTime = 0;

    // Pre-fetch requesting user's authority and permissions once
    const userFetchStart = Date.now();
    const { User } = require('../../models/index');
    const requestingUser = await User.findById(userId).select('authority').lean();
    const requestingUserAuthority = requestingUser?.authority || 20;
    userFetchTime = Date.now() - userFetchStart;

    // Collect all unique user IDs from requests (requester and reviewer)
    const userIdsSet = new Set();
    requests.forEach(req => {
      const requesterId = req.requester?.userId?._id || req.requester?.userId;
      const reviewerId = req.reviewer?.userId?._id || req.reviewer?.userId;
      if (requesterId) userIdsSet.add(requesterId.toString());
      if (reviewerId) userIdsSet.add(reviewerId.toString());
    });

    // Batch load all user authorities in a single query
    const userIdsArray = Array.from(userIdsSet);
    const usersMap = new Map();
    if (userIdsArray.length > 0) {
      const batchUserStart = Date.now();
      const users = await User.find({ _id: { $in: userIdsArray } })
        .select('_id authority')
        .lean();
      users.forEach(user => {
        usersMap.set(user._id.toString(), user.authority || 20);
      });
      userFetchTime += Date.now() - batchUserStart;
    }

    // Format all requests in parallel (permission checks are now cached)
    const permissionStart = Date.now();
    const formattedRequests = await Promise.all(
      requests.map(r => this._formatRequest(r, userId, {
        requestingUserAuthority,
        usersMap,
        isMinimal
      }))
    );
    permissionTime = Date.now() - permissionStart;

    const batchTime = Date.now() - batchStart;

    return formattedRequests;
  }

  /**
   * Format request for response
   * @private
   * @param {Object} request - Request document
   * @param {string|ObjectId} userId - User ID for computing allowedActions (optional)
   * @param {Object} batchContext - Optional batch context with pre-fetched data and isMinimal flag
   * @returns {Promise<Object>} Formatted request object
   */
  async _formatRequest(request, userId = null, batchContext = null) {
    if (!request) return null;

    const isMinimal = batchContext?.isMinimal || false;

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
      // Exclude large fields in minimal mode (list view)
      ...(isMinimal ? {} : {
        statusHistory: request.statusHistory || [],
        decisionHistory: request.decisionHistory || []
      }),
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
    // Note: Permission checks are now cached, so repeated calls are fast
    if (userId) {
      try {
        const locationId = request.district || request.municipalityId;
        // Use batch context if available to avoid redundant user queries
        const context = { locationId };
        if (batchContext?.requestingUserAuthority !== undefined) {
          context._batchContext = batchContext;
        }
        const allowedActions = await actionValidatorService.getAvailableActions(
          userId,
          request,
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
        formatted.allowedActions = ['view']; // At minimum, allow view
      }
    } else {
      // No userId provided - default to view only
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
   * Get staff assigned to event (works for both request-based and batch events)
   * @route GET /api/event-requests/:requestId/staff
   */
  async getStaff(req, res) {
    try {
      const { requestId } = req.params;
      const EventStaff = require('../../models/events_models/eventStaff.model');
      const Event = require('../../models/events_models/event.model');
      const EventRequest = require('../../models/eventRequests_models/eventRequest.model');

      // Try to find event first (works for both batch and request-based)
      let eventId = null;
      
      // Try to find by Request_ID first (for request-based events)
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (request) {
        // Prefer event linked via Request_ID
        let event = await Event.findOne({ Request_ID: requestId });

        // If not found, try using the Event_ID stored on the request document
        if (!event && request.Event_ID) {
          event = await Event.findOne({ Event_ID: request.Event_ID });
        }

        // As a last resort, try matching the incoming id directly to Event_ID
        if (!event) {
          event = await Event.findOne({ Event_ID: requestId });
        }

        if (event) {
          eventId = event.Event_ID;
        } else if (request.Event_ID) {
          // Even if the Event document is missing, allow using Event_ID from request
          eventId = request.Event_ID;
        }
      } else {
        // No request found, try to find event by Event_ID or MongoDB _id (batch event)
        let event = await Event.findOne({ Event_ID: requestId });
        if (!event) {
          // Try MongoDB _id
          if (requestId && requestId.match(/^[0-9a-fA-F]{24}$/)) {
            event = await Event.findById(requestId);
          }
        }
        
        if (event) {
          eventId = event.Event_ID;
        }
      }

      if (!eventId) {
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      // Fetch staff assigned to this event
      const staff = await EventStaff.find({ EventID: eventId }).lean();

      res.status(200).json({
        success: true,
        data: {
          staff: staff.map(s => ({
            _id: s._id,
            FullName: s.Staff_FullName,
            Staff_FullName: s.Staff_FullName,
            Role: s.Role
          }))
        }
      });
    } catch (error) {
      console.error('[EVENT REQUEST CONTROLLER] Get staff error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get staff'
      });
    }
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

      let isBatchEvent = false;
      let targetEvent = null;

      if (!request) {
        // Fallback: allow admin-only staff management for batch-created events without a request
        console.log('[ASSIGN STAFF] Looking for batch event:', { eventId, requestId });
        
        targetEvent = await Event.findOne({ Event_ID: eventId || requestId });
        console.log('[ASSIGN STAFF] Event lookup by Event_ID:', { found: !!targetEvent, eventId, requestId });
        
        // If not found by Event_ID, try by MongoDB _id
        if (!targetEvent && eventId?.match(/^[0-9a-fA-F]{24}$/)) {
          targetEvent = await Event.findById(eventId);
          console.log('[ASSIGN STAFF] Event lookup by MongoDB _id (eventId):', { found: !!targetEvent });
        }
        
        // Also try requestId as MongoDB _id if it looks like one
        if (!targetEvent && requestId?.match(/^[0-9a-fA-F]{24}$/)) {
          targetEvent = await Event.findById(requestId);
          console.log('[ASSIGN STAFF] Event lookup by MongoDB _id (requestId):', { found: !!targetEvent });
        }
        
        if (!targetEvent) {
          console.error('[ASSIGN STAFF] Event not found:', {
            eventId,
            requestId,
            eventIdType: typeof eventId,
            requestIdType: typeof requestId
          });
          return res.status(404).json({
            success: false,
            message: 'Request not found'
          });
        }

        const user = await User.findById(userId).select('authority');
        const authority = user?.authority || 0;
        if (authority < 80) {
          return res.status(403).json({
            success: false,
            message: 'User does not have permission to manage staff for this event'
          });
        }

        isBatchEvent = true;
      }

      if (request) {
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
      }

      // Assign staff via service
      const result = await eventRequestService.assignStaffToEvent(
        userId,
        request ? request.Request_ID : null,
        eventId,
        staffMembers
      );


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

  /**
   * Override Coordinator Assignment (BROADCAST MODEL FIX)
   * Fixes the coordinator selection bug - ensures manual override persists with complete audit trail
   * 
   * @route PUT /api/event-requests/:requestId/override-coordinator
   * @access Admin only (authority >= 80)
   * @param {string} requestId - Request ID or ObjectId
   * @param {string} coordinatorId - New coordinator ID (must be in validCoordinators)
   */
  async overrideCoordinator(req, res) {
    try {
      const { requestId } = req.params;
      const { coordinatorId } = req.body;
      const adminId = req.user._id || req.user.id;
      const AUTHORITY_TIERS = require('../../utils/eventRequests/requestConstants').AUTHORITY_TIERS;

      // Validation: Only admin can override
      if ((req.user.authority || 0) < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Only administrators can override coordinator assignments',
          requiredAuthority: AUTHORITY_TIERS.OPERATIONAL_ADMIN
        });
      }

      // Validation: coordinatorId is required
      if (!coordinatorId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID is required',
          code: 'MISSING_COORDINATOR_ID'
        });
      }

      // Get request with populated fields
      const request = await EventRequest.findOne({ Request_ID: requestId })
        .populate('validCoordinators.userId', '_id firstName lastName authority organizationType')
        .populate('requester.userId')
        .lean(false);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Request not found',
          code: 'REQUEST_NOT_FOUND'
        });
      }

      // Get new coordinator
      const coordinator = await User.findById(coordinatorId);
      if (!coordinator) {
        return res.status(404).json({
          success: false,
          message: 'Coordinator not found',
          code: 'COORDINATOR_NOT_FOUND'
        });
      }

      // Get admin
      const admin = await User.findById(adminId);
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin user not found',
          code: 'ADMIN_NOT_FOUND'
        });
      }

      // Broadcast validation: New coordinator must be in validCoordinators list
      const isValidCoordinator = request.validCoordinators?.some(vc => {
        const vcUserId = vc.userId?._id || vc.userId;
        return vcUserId.toString() === coordinatorId.toString();
      });
      
      if (!isValidCoordinator) {
        return res.status(400).json({
          success: false,
          message: 'Selected coordinator is not in the valid coordinators list for this request',
          code: 'INVALID_COORDINATOR',
          validCoordinators: request.validCoordinators
        });
      }

      // Capture previous reviewer for audit trail
      const previousReviewerId = request.reviewer?.userId;
      const previousReviewerName = request.reviewer?.name || 'Unassigned';

      // CRITICAL FIX: Complete replacement of reviewer object
      request.reviewer = {
        userId: coordinator._id,
        name: `${coordinator.firstName} ${coordinator.lastName}`,
        roleSnapshot: coordinator.role || 'Coordinator',
        assignedAt: new Date(),
        autoAssigned: false,
        assignmentRule: 'manual',
        overriddenAt: new Date(),
        overriddenBy: {
          userId: admin._id,
          name: `${admin.firstName} ${admin.lastName}`,
          roleSnapshot: admin.role,
          authoritySnapshot: admin.authority
        }
      };

      // Add to status history
      request.addStatusHistory(
        request.status,
        {
          userId: admin._id,
          name: `${admin.firstName} ${admin.lastName}`,
          roleSnapshot: admin.role,
          authoritySnapshot: admin.authority
        },
        `Coordinator manually overridden: ${previousReviewerName} → ${coordinator.firstName} ${coordinator.lastName}`
      );

      // Update latest action tracking
      request.latestAction = {
        action: 'COORDINATOR_OVERRIDE',
        actor: {
          userId: admin._id,
          name: `${admin.firstName} ${admin.lastName}`
        },
        timestamp: new Date()
      };

      // Save changes to database
      const savedRequest = await request.save();

      if (!savedRequest) {
        return res.status(500).json({
          success: false,
          message: 'Failed to save updated request',
          code: 'SAVE_FAILED'
        });
      }

      // Socket.IO notification (real-time)
      try {
        const io = req.app?.get?.('io');
        if (io) {
          io.to(`request-${requestId}`).emit('coordinator_assigned', {
            requestId: savedRequest._id,
            Request_ID: savedRequest.Request_ID,
            reviewer: savedRequest.reviewer,
            overriddenBy: admin.firstName + ' ' + admin.lastName
          });
        }
      } catch (socketError) {
        console.warn('[OVERRIDE COORDINATOR] Socket notification failed:', socketError.message);
      }

      res.status(200).json({
        success: true,
        message: 'Coordinator assignment updated successfully',
        data: {
          requestId: savedRequest._id,
          Request_ID: savedRequest.Request_ID,
          previousReviewer: {
            userId: previousReviewerId,
            name: previousReviewerName
          },
          reviewer: {
            userId: savedRequest.reviewer.userId,
            name: savedRequest.reviewer.name,
            assignmentRule: savedRequest.reviewer.assignmentRule,
            overriddenAt: savedRequest.reviewer.overriddenAt,
            overriddenBy: savedRequest.reviewer.overriddenBy
          }
        }
      });

    } catch (error) {
      console.error('[OVERRIDE COORDINATOR] Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to override coordinator assignment',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Claim Request for Review (BROADCAST MODEL)
   * Enables claim mechanism for broadcast - prevents duplicate actions
   * 
   * @route POST /api/event-requests/:requestId/claim
   * @access Authenticated coordinator
   */
  async claimRequest(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user._id || req.user.id;
      const claimDurationMinutes = parseInt(process.env.CLAIM_TIMEOUT_MINUTES || '30');

      // Get request with populated fields
      const request = await EventRequest.findOne({ Request_ID: requestId })
        .populate('claimedBy.userId', '_id firstName lastName')
        .populate('validCoordinators.userId', '_id firstName lastName')
        .lean(false);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Request not found',
          code: 'REQUEST_NOT_FOUND'
        });
      }

      // Check if already claimed by someone else
      if (request.claimedBy?.userId) {
        const claimedByUserId = request.claimedBy.userId._id || request.claimedBy.userId;
        const isClaimedByMe = claimedByUserId.toString() === userId.toString();
        
        if (!isClaimedByMe) {
          const timeRemaining = request.claimedBy.claimTimeoutAt 
            ? Math.ceil((request.claimedBy.claimTimeoutAt - Date.now()) / 1000)
            : 0;
          
          return res.status(409).json({
            success: false,
            message: `Request is currently claimed by ${request.claimedBy.userId.firstName}. Please wait or contact them to release.`,
            claimedBy: {
              userId: request.claimedBy.userId._id,
              name: request.claimedBy.userId.firstName + ' ' + request.claimedBy.userId.lastName,
              claimedAt: request.claimedBy.claimedAt
            },
            timeRemainingSeconds: timeRemaining
          });
        }
        // Already claimed by me - just return success
        return res.status(200).json({
          success: true,
          message: 'Request already claimed by you',
          data: { claimedBy: request.claimedBy }
        });
      }

      // Broadcast validation: User must be a valid coordinator
      const isValidCoordinator = request.validCoordinators?.some(vc => {
        const vcUserId = vc.userId?._id || vc.userId;
        return vcUserId.toString() === userId.toString();
      });
      
      if (!isValidCoordinator) {
        return res.status(403).json({
          success: false,
          message: 'You are not in the valid coordinators list for this request',
          code: 'NOT_VALID_COORDINATOR'
        });
      }

      // Get current user
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Set claim with timeout
      const claimTimeoutAt = new Date(Date.now() + claimDurationMinutes * 60 * 1000);
      
      request.claimedBy = {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        claimedAt: new Date(),
        claimTimeoutAt: claimTimeoutAt
      };

      // Add to status history
      request.addStatusHistory(
        request.status,
        {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
          roleSnapshot: user.role,
          authoritySnapshot: user.authority
        },
        `Request claimed by ${user.firstName} ${user.lastName} (timeout: ${claimDurationMinutes}min)`
      );

      // Update latest action
      request.latestAction = {
        action: 'REQUEST_CLAIMED',
        actor: {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`
        },
        timestamp: new Date()
      };

      await request.save();

      // Socket.IO notification to other valid coordinators
      try {
        const io = req.app?.get?.('io');
        if (io) {
          io.to(`request-${requestId}`).emit('request_claimed', {
            requestId: request._id,
            Request_ID: request.Request_ID,
            claimedBy: request.claimedBy
          });
        }
      } catch (socketError) {
        console.warn('[CLAIM REQUEST] Socket notification failed:', socketError.message);
      }

      res.status(200).json({
        success: true,
        message: 'Request claimed successfully',
        data: {
          requestId: request._id,
          Request_ID: request.Request_ID,
          claimedBy: request.claimedBy,
          claimTimeoutAt: claimTimeoutAt,
          timeoutIn: claimDurationMinutes * 60
        }
      });

    } catch (error) {
      console.error('[CLAIM REQUEST] Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to claim request',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Release Claim on Request (BROADCAST MODEL)
   * Allows claiming coordinator to release for others
   * 
   * @route POST /api/event-requests/:requestId/release
   * @access Authenticated coordinator (must have claimed it)
   */
  async releaseRequest(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user._id || req.user.id;

      const request = await EventRequest.findOne({ Request_ID: requestId })
        .populate('claimedBy.userId', '_id firstName lastName')
        .lean(false);
      
      if (!request) {
        return res.status(404).json({
          success: false,
          message: 'Request not found',
          code: 'REQUEST_NOT_FOUND'
        });
      }

      // Check if claimed by someone else
      if (request.claimedBy?.userId) {
        const claimedByUserId = request.claimedBy.userId._id || request.claimedBy.userId;
        const isClaimedByMe = claimedByUserId.toString() === userId.toString();
        
        if (!isClaimedByMe) {
          return res.status(403).json({
            success: false,
            message: 'Only the coordinator who claimed this request can release it',
            claimedBy: {
              userId: request.claimedBy.userId._id,
              name: request.claimedBy.userId.firstName + ' ' + request.claimedBy.userId.lastName
            }
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: 'This request is not claimed',
          code: 'NOT_CLAIMED'
        });
      }

      // Get user info for audit trail
      const user = await User.findById(userId);

      // Capture release info
      const releasedBy = request.claimedBy;

      // Clear the claim
      request.claimedBy = null;

      // Add to status history
      request.addStatusHistory(
        request.status,
        {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`,
          roleSnapshot: user.role,
          authoritySnapshot: user.authority
        },
        `Request claim released by ${user.firstName} ${user.lastName}`
      );

      // Update latest action
      request.latestAction = {
        action: 'REQUEST_RELEASED',
        actor: {
          userId: user._id,
          name: `${user.firstName} ${user.lastName}`
        },
        timestamp: new Date()
      };

      await request.save();

      // Socket.IO notification
      try {
        const io = req.app?.get?.('io');
        if (io) {
          io.to(`request-${requestId}`).emit('request_released', {
            requestId: request._id,
            Request_ID: request.Request_ID,
            releasedBy: releasedBy
          });
        }
      } catch (socketError) {
        console.warn('[RELEASE REQUEST] Socket notification failed:', socketError.message);
      }

      res.status(200).json({
        success: true,
        message: 'Request claim released successfully',
        data: {
          requestId: request._id,
          Request_ID: request.Request_ID,
          releasedBy: releasedBy,
          releasedAt: new Date()
        }
      });

    } catch (error) {
      console.error('[RELEASE REQUEST] Error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to release request claim',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

module.exports = new EventRequestController();

