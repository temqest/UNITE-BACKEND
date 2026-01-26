/**
 * v2.0 Event Request Service
 * 
 * Unified request lifecycle management with permission-based access control.
 * Simplified, role-agnostic implementation.
 */

const mongoose = require('mongoose');
const EventRequest = require('../../models/eventRequests_models/eventRequest.model');
const { User } = require('../../models/index');
const V2RequestStateMachine = require('./v2.0_requestStateMachine');
const v2ReviewerResolver = require('./v2.0_reviewerResolver.service');
const v2EventService = require('./v2.0_event.service');
const permissionService = require('../users_services/permission.service');
const authorityService = require('../users_services/authority.service');
const notificationEngine = require('../utility_services/notificationEngine.service');
const { REQUEST_STATES, REQUEST_ACTIONS, AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');

class V2EventRequestService {
  /**
   * Generate unique Request_ID
   * @returns {string} Generated Request_ID
   */
  generateRequestId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `REQ-${timestamp}-${random}`;
  }

  /**
   * Create new event request
   * 
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
      const canInitiate = await permissionService.checkPermission(
        requesterId,
        'request',
        'initiate',
        { locationId }
      );
      const canCreate = await permissionService.checkPermission(
        requesterId,
        'request',
        'create',
        { locationId }
      );

      if (!canInitiate && !canCreate) {
        throw new Error('User does not have permission to create requests');
      }

      // 3. Auto-populate location fields if not provided
      let finalDistrict = requestData.district;
      let finalProvince = requestData.province;
      let finalMunicipalityId = requestData.municipalityId;

      // Try requester's coverage areas or locations
      if (!finalDistrict || !finalProvince) {
        if (requester.coverageAreas && requester.coverageAreas.length > 0) {
          const primaryCoverage = requester.coverageAreas.find(ca => ca.isPrimary) || 
                                  requester.coverageAreas[0];
          if (primaryCoverage) {
            if (!finalDistrict && primaryCoverage.districtIds && primaryCoverage.districtIds.length > 0) {
              finalDistrict = primaryCoverage.districtIds[0];
            }
            if (!finalProvince && finalDistrict) {
              const { Location } = require('../../models/index');
              const districtLocation = await Location.findById(finalDistrict);
              if (districtLocation && districtLocation.parent) {
                finalProvince = districtLocation.parent;
              }
            }
          }
        }
      }

      // 4. Find reviewers for this request (broadcast model)
      const organizationType = requestData.organizationType || requester.organizationType;
      const reviewers = await v2ReviewerResolver.findReviewersForLocation(
        finalMunicipalityId || finalDistrict,
        organizationType,
        {
          requesterId,
          requesterAuthority: requester.authority || AUTHORITY_TIERS.BASIC_USER
        }
      );

      // 5. Create request document
      const request = new EventRequest({
        Request_ID: this.generateRequestId(),
        Event_ID: requestData.Event_ID,
        requester: {
          userId: requester._id,
          name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email,
          roleSnapshot: requester.roles?.[0]?.roleCode || null,
          authoritySnapshot: requester.authority || AUTHORITY_TIERS.BASIC_USER
        },
        // In broadcast model, we don't assign a single reviewer
        // Instead, we populate validCoordinators
        reviewer: reviewers.length > 0 ? {
          userId: reviewers[0].userId, // First reviewer as primary (for backward compatibility)
          name: reviewers[0].name,
          roleSnapshot: reviewers[0].roleSnapshot,
          assignedAt: new Date(),
          autoAssigned: true,
          assignmentRule: 'auto-assigned'
        } : null,
        validCoordinators: reviewers,
        organizationId: requestData.organizationId,
        coverageAreaId: requestData.coverageAreaId,
        municipalityId: finalMunicipalityId,
        district: finalDistrict,
        province: finalProvince,
        organizationType: organizationType,
        // Event details
        Event_Title: requestData.Event_Title,
        Location: requestData.Location,
        Date: requestData.Date || requestData.Start_Date,
        Start_Date: requestData.Start_Date || requestData.Date,
        End_Date: requestData.End_Date,
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

      // 6. Add initial status history
      request.addStatusHistory(REQUEST_STATES.PENDING_REVIEW, {
        userId: requester._id,
        name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email,
        roleSnapshot: requester.roles?.[0]?.roleCode || null,
        authoritySnapshot: requester.authority || AUTHORITY_TIERS.BASIC_USER
      }, 'Request created');

      // 7. Set initial active responder (any reviewer can respond in broadcast model)
      request.activeResponder = {
        relationship: 'reviewer'
        // No userId - indicates any reviewer with jurisdiction can act
      };

      // 8. Save request
      await request.save();

      // 9. Send notifications
      try {
        await notificationEngine.notifyRequestCreated(request);
      } catch (notificationError) {
        console.error(`[V2_EVENT_REQUEST_SERVICE] Error sending notification: ${notificationError.message}`);
      }

      return request;
    } catch (error) {
      console.error(`[V2_EVENT_REQUEST_SERVICE] Error creating request: ${error.message}`);
      throw new Error(`Failed to create request: ${error.message}`);
    }
  }

  /**
   * Execute action on request (accept/reject/reschedule/confirm/cancel)
   * 
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User performing the action
   * @param {string} action - Action to perform
   * @param {Object} actionData - Action-specific data
   * @returns {Promise<Object>} Updated request
   */
  async executeAction(requestId, userId, action, actionData = {}) {
    try {
      // 1. Get request
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        throw new Error('Request not found');
      }

      // 2. Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 3. Get current state
      const currentState = V2RequestStateMachine.normalizeState(request.status || request.Status);

      // 4. Check if transition is allowed
      const locationId = request.municipalityId || request.district;
      const canTransition = await V2RequestStateMachine.canTransition(
        currentState,
        action,
        userId,
        request,
        { locationId }
      );

      if (!canTransition) {
        throw new Error(`Action '${action}' is not allowed in state '${currentState}' or user lacks permission`);
      }

      // 5. Get next state
      const nextState = V2RequestStateMachine.getNextState(currentState, action);
      if (!nextState) {
        throw new Error(`Invalid transition: ${currentState} + ${action}`);
      }

      // 6. Create actor snapshot
      const actorSnapshot = {
        userId: user._id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        roleSnapshot: user.roles?.[0]?.roleCode || null,
        authoritySnapshot: user.authority || AUTHORITY_TIERS.BASIC_USER
      };

      // 7. Update request based on action
      const note = actionData.notes || actionData.note || '';

      if (action === REQUEST_ACTIONS.ACCEPT || action === REQUEST_ACTIONS.REJECT) {
        request.status = nextState;
        request.addDecisionHistory(
          action === REQUEST_ACTIONS.ACCEPT ? 'accept' : 'reject',
          actorSnapshot,
          note
        );
      } else if (action === REQUEST_ACTIONS.RESCHEDULE) {
        if (!actionData.proposedDate) {
          throw new Error('proposedDate is required for reschedule action');
        }

        request.status = nextState;
        request.rescheduleProposal = {
          proposedDate: actionData.proposedDate,
          proposedStartTime: actionData.proposedStartTime,
          proposedEndTime: actionData.proposedEndTime,
          reviewerNotes: note,
          proposedAt: new Date(),
          proposedBy: actorSnapshot
        };
        request.addDecisionHistory('reschedule', actorSnapshot, note, {
          proposedDate: actionData.proposedDate,
          proposedStartTime: actionData.proposedStartTime,
          proposedEndTime: actionData.proposedEndTime
        });

        // Update active responder for reschedule loop
        const activeResponder = await V2RequestStateMachine.determineActiveResponder(request, userId);
        if (activeResponder) {
          if (activeResponder.userId) {
            request.activeResponder = {
              userId: activeResponder.userId,
              relationship: activeResponder.relationship,
              authority: activeResponder.authority
            };
          } else if (activeResponder.type === 'reviewer') {
            // For broadcast model: any reviewer can respond
            // Set relationship but no specific userId
            request.activeResponder = {
              relationship: 'reviewer'
              // No userId - indicates any reviewer with jurisdiction can act
            };
          }
        }
      } else if (action === REQUEST_ACTIONS.CONFIRM || action === REQUEST_ACTIONS.DECLINE) {
        // Only requester can confirm/decline
        if (!V2RequestStateMachine.isRequester(userId, request)) {
          throw new Error('Only requester can confirm or decline');
        }

        request.status = nextState;
        if (action === REQUEST_ACTIONS.DECLINE) {
          request.addDecisionHistory('reject', actorSnapshot, note);
        }
      } else if (action === REQUEST_ACTIONS.CANCEL) {
        request.status = nextState;
      }

      // 8. Update last action
      request.lastAction = {
        action: action,
        actorId: user._id,
        timestamp: new Date()
      };

      // 9. Add status history
      request.addStatusHistory(nextState, actorSnapshot, note);

      // 10. Save request
      await request.save();

      // 11. Create event if approved
      let event = null;
      if (nextState === REQUEST_STATES.APPROVED && v2EventService.shouldPublishEvent(nextState)) {
        try {
          event = await v2EventService.createEventFromRequest(request, actorSnapshot);
        } catch (eventError) {
          console.error(`[V2_EVENT_REQUEST_SERVICE] Error creating event: ${eventError.message}`);
          throw new Error(`Failed to create event: ${eventError.message}`);
        }
      }

      return { request, event };
    } catch (error) {
      console.error(`[V2_EVENT_REQUEST_SERVICE] Error executing action: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get request by ID
   * 
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User requesting (for permission check)
   * @returns {Promise<Object>} Request document
   */
  async getRequestById(requestId, userId) {
    try {
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        throw new Error('Request not found');
      }

      // Check access permission
      const locationId = request.municipalityId || request.district;
      const canRead = await permissionService.checkPermission(
        userId,
        'request',
        'read',
        { locationId }
      );

      // Allow if user is requester or reviewer
      const isRequester = V2RequestStateMachine.isRequester(userId, request);
      const isReviewer = await V2RequestStateMachine.isReviewer(userId, request, locationId);

      // Check if user is in validCoordinators (broadcast model - valid coordinators should have access)
      const isInValidCoordinators = request.validCoordinators?.some(
        coord => {
          const coordUserId = coord.userId?._id || coord.userId;
          return coordUserId?.toString() === userId.toString();
        }
      );

      if (!canRead && !isRequester && !isReviewer && !isInValidCoordinators) {
        throw new Error('User does not have permission to view this request');
      }

      return request;
    } catch (error) {
      console.error(`[V2_EVENT_REQUEST_SERVICE] Error getting request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get requests user can access (filtered by jurisdiction)
   * 
   * @param {string|ObjectId} userId - User ID
   * @param {Object} filters - Filter options
   * @returns {Promise<{requests: Object[], totalCount: number}>} Object with requests array and total count
   */
  async getRequests(userId, filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Build query
      const query = {};

      // Status filter
      if (filters.status) {
        query.status = filters.status;
      }

      // Check if user is system admin
      const isSystemAdmin = user.authority >= AUTHORITY_TIERS.SYSTEM_ADMIN || user.isSystemAdmin;

      if (!isSystemAdmin) {
        // Non-admin users can see:
        // 1. Requests they created
        // 2. Requests in their jurisdiction (if they have review permission)
        const userIdObjectId = mongoose.Types.ObjectId.isValid(userId) 
          ? new mongoose.Types.ObjectId(userId) 
          : userId;

        query.$or = [
          { 'requester.userId': userIdObjectId },
          { 'validCoordinators.userId': userIdObjectId }
        ];

        // Add jurisdiction-based visibility for reviewers
        const hasReviewPermission = await permissionService.checkPermission(
          userId,
          'request',
          'review',
          {}
        );

        if (hasReviewPermission && user.coverageAreas && user.coverageAreas.length > 0) {
          // Get municipality IDs from coverage areas
          const municipalityIds = [];
          user.coverageAreas.forEach(ca => {
            if (ca.municipalityIds) {
              municipalityIds.push(...ca.municipalityIds.map(id => 
                mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
              ));
            }
          });

          if (municipalityIds.length > 0) {
            query.$or.push({
              municipalityId: { $in: municipalityIds },
              organizationType: user.organizationType || { $exists: false }
            });
          }
        }
      }

      // Additional filters
      if (filters.organizationId) query.organizationId = filters.organizationId;
      if (filters.coverageAreaId) query.coverageAreaId = filters.coverageAreaId;
      if (filters.municipalityId) query.municipalityId = filters.municipalityId;
      if (filters.district) query.district = filters.district;
      if (filters.province) query.province = filters.province;
      if (filters.category) {
        query.Category = new RegExp(filters.category, 'i');
      }

      // Pagination
      const page = parseInt(filters.page) || 1;
      const limit = parseInt(filters.limit) || 20;
      const skip = (page - 1) * limit;

      // Execute query
      const [requests, totalCount] = await Promise.all([
        EventRequest.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        EventRequest.countDocuments(query)
      ]);

      return {
        requests,
        totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      };
    } catch (error) {
      console.error(`[V2_EVENT_REQUEST_SERVICE] Error getting requests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update request (only in pending-review state)
   * 
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User updating
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated request
   */
  async updateRequest(requestId, userId, updateData) {
    try {
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        throw new Error('Request not found');
      }

      // Check if editing is allowed
      const currentState = V2RequestStateMachine.normalizeState(request.status || request.Status);
      if (!V2RequestStateMachine.canEdit(currentState)) {
        throw new Error(`Request cannot be edited in state '${currentState}'`);
      }

      // Check permission
      const isRequester = V2RequestStateMachine.isRequester(userId, request);
      if (!isRequester) {
        throw new Error('Only requester can update request');
      }

      // Update allowed fields
      const allowedFields = [
        'Event_Title', 'Location', 'Date', 'Start_Date', 'End_Date',
        'Email', 'Phone_Number', 'Event_Description', 'Category',
        'Target_Donation', 'VenueType', 'TrainingType', 'MaxParticipants',
        'Topic', 'TargetAudience', 'ExpectedAudienceSize', 'PartnerOrganization',
        'notes'
      ];

      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          request[field] = updateData[field];
        }
      });

      // Update location fields
      if (updateData.municipalityId) request.municipalityId = updateData.municipalityId;
      if (updateData.district) request.district = updateData.district;
      if (updateData.province) request.province = updateData.province;

      await request.save();

      return request;
    } catch (error) {
      console.error(`[V2_EVENT_REQUEST_SERVICE] Error updating request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find reviewers for a request (convenience method)
   * 
   * @param {Object} request - Request document
   * @returns {Promise<Array>} Array of reviewer objects
   */
  async findReviewersForRequest(request) {
    return await v2ReviewerResolver.findReviewersForRequest(request);
  }
}

module.exports = new V2EventRequestService();
