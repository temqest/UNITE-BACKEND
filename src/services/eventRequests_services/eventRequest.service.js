/**
 * Event Request Service
 * 
 * Core business logic for event requests
 */

const EventRequest = require('../../models/eventRequests_models/eventRequest.model');
const { Event } = require('../../models/index');
const { User } = require('../../models/index');
const RequestStateService = require('./requestState.service');
const reviewerAssignmentService = require('./reviewerAssignment.service');
const actionValidatorService = require('./actionValidator.service');
const eventPublisherService = require('./eventPublisher.service');
const permissionService = require('../users_services/permission.service');
const { REQUEST_STATES, REQUEST_ACTIONS } = require('../../utils/eventRequests/requestConstants');

class EventRequestService {
  /**
   * Generate unique Request_ID
   */
  generateRequestId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `REQ-${timestamp}-${random}`;
  }

  /**
   * Create new event request
   * @param {string|ObjectId} requesterId - Requester user ID
   * @param {Object} requestData - Request data
   * @returns {Promise<Object>} Created request
   */
  async createRequest(requesterId, requestData) {
    try {
      // 1. Get requester details
      const requester = await User.findById(requesterId);
      if (!requester) {
        throw new Error('Requester not found');
      }

      // 2. Check permission
      const locationId = requestData.district || requestData.municipalityId;
      const canCreate = await permissionService.checkPermission(
        requesterId,
        'request',
        'create',
        { locationId }
      );

      if (!canCreate) {
        throw new Error('User does not have permission to create requests');
      }

      // 3. Assign reviewer based on requester authority
      const reviewer = await reviewerAssignmentService.assignReviewer(requesterId, {
        locationId: requestData.district || requestData.municipalityId,
        organizationId: requestData.organizationId,
        coverageAreaId: requestData.coverageAreaId
      });

      // 4. Create request document with all event details
      const request = new EventRequest({
        Request_ID: this.generateRequestId(),
        Event_ID: requestData.Event_ID,
        requester: {
          userId: requester._id,
          name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email,
          roleSnapshot: requester.roles?.[0]?.roleCode || null,
          authoritySnapshot: requester.authority || 20
        },
        reviewer: reviewer,
        organizationId: requestData.organizationId,
        coverageAreaId: requestData.coverageAreaId,
        municipalityId: requestData.municipalityId,
        district: requestData.district,
        province: requestData.province,
        // Event details - all fields from Event model
        Event_Title: requestData.Event_Title,
        Location: requestData.Location,
        Date: requestData.Date || requestData.Start_Date, // Support both for backward compatibility
        Email: requestData.Email,
        Phone_Number: requestData.Phone_Number,
        Event_Description: requestData.Event_Description,
        Category: requestData.Category,
        // Category-specific fields
        Target_Donation: requestData.Target_Donation,
        VenueType: requestData.VenueType,
        TrainingType: requestData.TrainingType,
        MaxParticipants: requestData.MaxParticipants,
        Topic: requestData.Topic,
        TargetAudience: requestData.TargetAudience,
        ExpectedAudienceSize: requestData.ExpectedAudienceSize,
        PartnerOrganization: requestData.PartnerOrganization,
        StaffAssignmentID: requestData.StaffAssignmentID,
        status: REQUEST_STATES.PENDING_REVIEW,
        notes: requestData.notes
      });

      // 5. Add initial status history
      request.addStatusHistory(REQUEST_STATES.PENDING_REVIEW, {
        userId: requester._id,
        name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email,
        roleSnapshot: requester.roles?.[0]?.roleCode || null,
        authoritySnapshot: requester.authority || 20
      }, 'Request created');

      // 6. Save request
      await request.save();

      return request;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error creating request: ${error.message}`);
      throw new Error(`Failed to create request: ${error.message}`);
    }
  }

  /**
   * Get requests user can access
   * @param {string|ObjectId} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<Object[]>} Array of requests
   */
  async getRequests(userId, filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Build query based on permissions and authority
      const query = {};

      // Filter by status if provided
      if (filters.status) {
        query.status = filters.status;
      }

      // Check if user is system admin (can see all)
      const isSystemAdmin = user.authority >= 100 || user.isSystemAdmin;
      
      if (!isSystemAdmin) {
        // Non-admin users can only see:
        // 1. Requests they created
        // 2. Requests assigned to them as reviewer
        // 3. Requests in their jurisdiction (if they have review permission)
        
        const canReview = await permissionService.checkPermission(
          userId,
          'request',
          'review',
          {}
        );

        if (canReview) {
          // Reviewer can see requests in their jurisdiction
          // This will be filtered by location/coverage in the query
          // For now, include requests where user is reviewer
          query.$or = [
            { 'requester.userId': userId },
            { 'reviewer.userId': userId }
          ];
        } else {
          // Non-reviewer can only see their own requests
          query['requester.userId'] = userId;
        }
      }

      // Apply additional filters
      if (filters.organizationId) {
        query.organizationId = filters.organizationId;
      }
      if (filters.coverageAreaId) {
        query.coverageAreaId = filters.coverageAreaId;
      }
      if (filters.municipalityId) {
        query.municipalityId = filters.municipalityId;
      }

      const requests = await EventRequest.find(query)
        .populate('requester.userId', 'firstName lastName email')
        .populate('reviewer.userId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(filters.limit || 100)
        .skip(filters.skip || 0);

      return requests;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error getting requests: ${error.message}`);
      throw new Error(`Failed to get requests: ${error.message}`);
    }
  }

  /**
   * Get request by ID with permission check
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<Object>} Request document
   */
  async getRequestById(requestId, userId) {
    try {
      const request = await EventRequest.findOne({ Request_ID: requestId })
        .populate('requester.userId', 'firstName lastName email authority')
        .populate('reviewer.userId', 'firstName lastName email authority');

      if (!request) {
        throw new Error('Request not found');
      }

      // Check permission to view
      const locationId = request.district || request.municipalityId;
      const canView = await permissionService.checkPermission(
        userId,
        'request',
        'read',
        { locationId }
      );

      if (!canView) {
        // Check if user is requester or reviewer
        const isRequester = request.requester.userId._id.toString() === userId.toString();
        const isReviewer = request.reviewer?.userId?._id.toString() === userId.toString();
        
        if (!isRequester && !isReviewer) {
          throw new Error('User does not have permission to view this request');
        }
      }

      return request;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error getting request: ${error.message}`);
      throw new Error(`Failed to get request: ${error.message}`);
    }
  }

  /**
   * Update pending request
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated request
   */
  async updateRequest(requestId, userId, updateData) {
    try {
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        throw new Error('Request not found');
      }

      // Check if request can be edited
      if (!RequestStateService.canEdit(request.status)) {
        throw new Error('Request cannot be edited in current state');
      }

      // Check permission
      const locationId = request.district || request.municipalityId;
      const canUpdate = await permissionService.checkPermission(
        userId,
        'request',
        'update',
        { locationId }
      );

      if (!canUpdate) {
        // Check if user is requester
        const isRequester = request.requester.userId.toString() === userId.toString();
        if (!isRequester) {
          throw new Error('User does not have permission to update this request');
        }
      }

      // Update allowed fields
      const allowedFields = ['Category', 'notes', 'municipalityId', 'district', 'province'];
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          request[field] = updateData[field];
        }
      }

      await request.save();

      return request;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error updating request: ${error.message}`);
      throw new Error(`Failed to update request: ${error.message}`);
    }
  }

  /**
   * Execute action on request
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User ID
   * @param {string} action - Action to perform
   * @param {Object} actionData - Action data
   * @returns {Promise<Object>} Updated request
   */
  async executeAction(requestId, userId, action, actionData = {}) {
    try {
      // 1. Get request
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        throw new Error('Request not found');
      }

      // 2. Validate action
      const locationId = request.district || request.municipalityId;
      const validation = await actionValidatorService.validateAction(
        userId,
        action,
        request,
        { locationId }
      );

      if (!validation.valid) {
        throw new Error(validation.reason);
      }

      // 3. Get actor details
      const actor = await User.findById(userId);
      if (!actor) {
        throw new Error('Actor not found');
      }

      const actorSnapshot = {
        userId: actor._id,
        name: `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email,
        roleSnapshot: actor.roles?.[0]?.roleCode || null,
        authoritySnapshot: actor.authority || 20
      };

      // 4. Get next state
      const currentState = request.status;
      const nextState = RequestStateService.getNextState(currentState, action);

      if (!nextState) {
        throw new Error(`Invalid transition from ${currentState} with action ${action}`);
      }

      // 5. Update request based on action
      if (action === REQUEST_ACTIONS.ACCEPT) {
        request.status = nextState;
        request.addDecisionHistory('accept', actorSnapshot, actionData.notes || '');
        
        // If accepted and goes directly to approved (e.g., from review-rescheduled), publish event
        if (nextState === REQUEST_STATES.APPROVED) {
          await eventPublisherService.publishEvent(request);
        }
        // If goes to review-accepted, wait for confirmation (no auto-transition)
      } else if (action === REQUEST_ACTIONS.REJECT) {
        request.status = nextState;
        request.addDecisionHistory('reject', actorSnapshot, actionData.notes || '');
      } else if (action === REQUEST_ACTIONS.RESCHEDULE) {
        request.status = nextState;
        request.rescheduleProposal = {
          proposedDate: actionData.proposedDate,
          proposedStartTime: actionData.proposedStartTime,
          proposedEndTime: actionData.proposedEndTime,
          reviewerNotes: actionData.notes || '',
          proposedAt: new Date(),
          proposedBy: actorSnapshot
        };
        request.addDecisionHistory('reschedule', actorSnapshot, actionData.notes || '', {
          proposedDate: actionData.proposedDate,
          proposedStartTime: actionData.proposedStartTime,
          proposedEndTime: actionData.proposedEndTime
        });
      } else if (action === REQUEST_ACTIONS.CONFIRM) {
        request.status = nextState;
        
        // Auto-publish event if approved (from review-accepted or review-rescheduled)
        if (nextState === REQUEST_STATES.APPROVED) {
          await eventPublisherService.publishEvent(request);
        }
      } else if (action === REQUEST_ACTIONS.CANCEL) {
        request.status = nextState;
      }

      // 6. Add status history
      request.addStatusHistory(nextState, actorSnapshot, actionData.notes || '');

      // 7. Save request
      await request.save();

      return request;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error executing action: ${error.message}`);
      throw new Error(`Failed to execute action: ${error.message}`);
    }
  }

  /**
   * Get available actions for user on request
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<string[]>} Array of available actions
   */
  async getAvailableActions(requestId, userId) {
    try {
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        throw new Error('Request not found');
      }

      const locationId = request.district || request.municipalityId;
      return await actionValidatorService.getAvailableActions(userId, request, { locationId });
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error getting available actions: ${error.message}`);
      throw new Error(`Failed to get available actions: ${error.message}`);
    }
  }

  /**
   * Cancel request
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<Object>} Updated request
   */
  async cancelRequest(requestId, userId) {
    return await this.executeAction(requestId, userId, REQUEST_ACTIONS.CANCEL, {});
  }

  /**
   * Delete request
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteRequest(requestId, userId) {
    try {
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        throw new Error('Request not found');
      }

      // Check permission
      const locationId = request.district || request.municipalityId;
      const canDelete = await permissionService.checkPermission(
        userId,
        'request',
        'delete',
        { locationId }
      );

      if (!canDelete) {
        throw new Error('User does not have permission to delete this request');
      }

      // Only allow deletion of cancelled or rejected requests
      if (![REQUEST_STATES.CANCELLED, REQUEST_STATES.REJECTED].includes(request.status)) {
        throw new Error('Only cancelled or rejected requests can be deleted');
      }

      await EventRequest.deleteOne({ Request_ID: requestId });

      return true;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error deleting request: ${error.message}`);
      throw new Error(`Failed to delete request: ${error.message}`);
    }
  }
}

module.exports = new EventRequestService();

