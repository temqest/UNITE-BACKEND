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

      // 3. Auto-populate location fields if not provided
      // Derive from requester's location/coverage area
      let finalDistrict = requestData.district;
      let finalProvince = requestData.province;
      let finalMunicipalityId = requestData.municipalityId;

      if (!finalDistrict || !finalProvince) {
        // Try to get from requester's coverage areas (for coordinators)
        if (requester.coverageAreas && requester.coverageAreas.length > 0) {
          const primaryCoverage = requester.coverageAreas.find(ca => ca.isPrimary) || requester.coverageAreas[0];
          if (primaryCoverage) {
            if (!finalDistrict && primaryCoverage.districtIds && primaryCoverage.districtIds.length > 0) {
              finalDistrict = primaryCoverage.districtIds[0];
            }
            // Get province from district's parent or from coverage area
            if (!finalProvince && finalDistrict) {
              const { Location } = require('../../models/index');
              const districtLocation = await Location.findById(finalDistrict);
              if (districtLocation && districtLocation.province) {
                finalProvince = districtLocation.province;
              }
            }
          }
        }

        // Try to get from requester's locations (for stakeholders)
        if (!finalDistrict && requester.locations && requester.locations.municipalityId) {
          finalMunicipalityId = requester.locations.municipalityId;
          const { Location } = require('../../models/index');
          const municipalityLocation = await Location.findById(finalMunicipalityId);
          if (municipalityLocation) {
            // Get district from municipality's parent
            if (municipalityLocation.parent) {
              const parentLocation = await Location.findById(municipalityLocation.parent);
              if (parentLocation && parentLocation.type === 'district') {
                finalDistrict = parentLocation._id;
                // Get province from district's province field or parent
                if (parentLocation.province) {
                  finalProvince = parentLocation.province;
                } else if (parentLocation.parent) {
                  const provinceLocation = await Location.findById(parentLocation.parent);
                  if (provinceLocation && provinceLocation.type === 'province') {
                    finalProvince = provinceLocation._id;
                  }
                }
              }
            }
            // If municipality has direct province reference
            if (!finalProvince && municipalityLocation.province) {
              finalProvince = municipalityLocation.province;
            }
          }
        }
      }

      // 4. Assign reviewer based on requester authority
      const reviewer = await reviewerAssignmentService.assignReviewer(requesterId, {
        locationId: finalDistrict || finalMunicipalityId,
        organizationId: requestData.organizationId,
        coverageAreaId: requestData.coverageAreaId
      });

      // 5. Create request document with all event details
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
        municipalityId: finalMunicipalityId,
        district: finalDistrict,
        province: finalProvince,
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

      // 6. Add initial status history
      request.addStatusHistory(REQUEST_STATES.PENDING_REVIEW, {
        userId: requester._id,
        name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email,
        roleSnapshot: requester.roles?.[0]?.roleCode || null,
        authoritySnapshot: requester.authority || 20
      }, 'Request created');

      // 7. Save request
      await request.save();

      return request;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error creating request: ${error.message}`);
      throw new Error(`Failed to create request: ${error.message}`);
    }
  }

  /**
   * Map tab filter to status groups
   * @private
   * @param {string} statusFilter - Status filter from frontend (e.g., "approved", "pending", "rejected")
   * @returns {string[]} Array of status values to match
   */
  _mapStatusFilterToStatusGroup(statusFilter) {
    if (!statusFilter) return null;
    
    const normalized = String(statusFilter).toLowerCase().trim();
    
    // Map tab filters to status groups
    const statusGroups = {
      'approved': [
        REQUEST_STATES.APPROVED,
        REQUEST_STATES.COMPLETED,
        REQUEST_STATES.REVIEW_ACCEPTED
      ],
      'pending': [
        REQUEST_STATES.PENDING_REVIEW,
        REQUEST_STATES.REVIEW_RESCHEDULED
      ],
      'rejected': [
        REQUEST_STATES.REJECTED,
        REQUEST_STATES.REVIEW_REJECTED
      ]
    };
    
    // If it's a known tab filter, return the status group
    if (statusGroups[normalized]) {
      return statusGroups[normalized];
    }
    
    // Otherwise, normalize the status and return as single-item array
    const normalizedState = RequestStateService.normalizeState(statusFilter);
    return [normalizedState];
  }

  /**
   * Get requests user can access
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

      // Build query based on permissions and authority
      const query = {};

      // Filter by status if provided - map to status groups
      if (filters.status) {
        const statusGroup = this._mapStatusFilterToStatusGroup(filters.status);
        if (statusGroup && statusGroup.length > 0) {
          if (statusGroup.length === 1) {
            query.status = statusGroup[0];
          } else {
            query.status = { $in: statusGroup };
          }
        }
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
      if (filters.province) {
        query.province = filters.province;
      }
      if (filters.district) {
        query.district = filters.district;
      }
      if (filters.municipalityId) {
        query.municipalityId = filters.municipalityId;
      }
      
      // Handle category filter - map frontend values to backend values
      if (filters.category && filters.category.trim()) {
        const categoryValue = filters.category.trim();
        // Map frontend category values to backend values
        let backendCategory = categoryValue;
        if (categoryValue.toLowerCase() === 'blood drive') {
          backendCategory = 'BloodDrive';
        } else if (categoryValue.toLowerCase() === 'training') {
          backendCategory = 'Training';
        } else if (categoryValue.toLowerCase() === 'advocacy') {
          backendCategory = 'Advocacy';
        }
        // Apply case-insensitive regex match
        const categoryRegex = new RegExp(backendCategory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (query.$and) {
          query.$and.push({ Category: categoryRegex });
        } else {
          query.Category = categoryRegex;
        }
      }

      // Handle search filter - search by requester name, email, or event title
      // Note: requester.name is stored as snapshot when request is created, so we can search it directly
      // For more accurate results, we could use aggregation with $lookup, but this is more performant
      if (filters.search && filters.search.trim()) {
        const searchTerm = filters.search.trim();
        const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        
        // Build search conditions for requester name, email, and event title
        const searchConditions = [
          { 'requester.name': searchRegex },
          { Event_Title: searchRegex },
          { Email: searchRegex }
        ];
        
        // If we already have $and, add search to it; otherwise create $and with permission + search
        if (query.$and) {
          query.$and.push({ $or: searchConditions });
        } else if (query.$or || query['requester.userId']) {
          // We have permission restrictions, combine with search using $and
          const permissionQuery = query.$or ? { $or: query.$or } : { 'requester.userId': query['requester.userId'] };
          query.$and = [
            permissionQuery,
            { $or: searchConditions }
          ];
          // Remove the original permission conditions since they're now in $and
          if (query.$or) delete query.$or;
          if (query['requester.userId']) delete query['requester.userId'];
        } else {
          // No permission restrictions, just search
          query.$or = searchConditions;
        }
      }

      // Handle separate requester name and email filters if provided
      if (filters.requesterName && filters.requesterName.trim()) {
        const nameRegex = new RegExp(filters.requesterName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (query.$and) {
          query.$and.push({ 'requester.name': nameRegex });
        } else {
          query['requester.name'] = nameRegex;
        }
      }
      
      if (filters.requesterEmail && filters.requesterEmail.trim()) {
        const emailRegex = new RegExp(filters.requesterEmail.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (query.$and) {
          query.$and.push({ Email: emailRegex });
        } else {
          query.Email = emailRegex;
        }
      }
      
      // Handle title filter (separate from search filter)
      if (filters.title && filters.title.trim()) {
        const titleRegex = new RegExp(filters.title.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (query.$and) {
          query.$and.push({ Event_Title: titleRegex });
        } else {
          query.Event_Title = titleRegex;
        }
      }
      
      // Handle coordinator filter - filter by reviewer.userId
      if (filters.coordinator) {
        const coordinatorId = filters.coordinator;
        // Handle both ObjectId and string formats
        const coordinatorCondition = { 'reviewer.userId': coordinatorId };
        if (query.$and) {
          query.$and.push(coordinatorCondition);
        } else {
          Object.assign(query, coordinatorCondition);
        }
      }
      
      // Handle stakeholder filter - filter by requester.userId
      if (filters.stakeholder) {
        const stakeholderId = filters.stakeholder;
        // Handle both ObjectId and string formats
        const stakeholderCondition = { 'requester.userId': stakeholderId };
        if (query.$and) {
          query.$and.push(stakeholderCondition);
        } else {
          Object.assign(query, stakeholderCondition);
        }
      }

      // Calculate status counts using aggregation before pagination
      const statusCountsPipeline = [
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ];
      
      const statusCountsResult = await EventRequest.aggregate(statusCountsPipeline);
      const statusCounts = {
        all: 0,
        approved: 0,
        pending: 0,
        rejected: 0
      };
      
      // Map status counts to tab categories
      statusCountsResult.forEach(item => {
        const status = String(item._id || '').toLowerCase();
        statusCounts.all += item.count;
        
        if (status.includes('approv') || status.includes('complete') || status.includes('review-accepted')) {
          statusCounts.approved += item.count;
        } else if (status.includes('pending') || status.includes('review') || status.includes('rescheduled')) {
          statusCounts.pending += item.count;
        } else if (status.includes('reject')) {
          statusCounts.rejected += item.count;
        }
      });
      
      // Set all count to total count
      statusCounts.all = statusCounts.all || 0;

      // Get total count before pagination
      const totalCount = await EventRequest.countDocuments(query);

      // Apply pagination
      const requests = await EventRequest.find(query)
        .populate('requester.userId', 'firstName lastName email')
        .populate('reviewer.userId', 'firstName lastName email')
        .populate('province', 'name code type')
        .populate('district', 'name code type province')
        .populate('municipalityId', 'name code type district province')
        .sort({ createdAt: -1 })
        .limit(filters.limit || 100)
        .skip(filters.skip || 0);

      return { requests, totalCount, statusCounts };
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
        .populate('reviewer.userId', 'firstName lastName email authority')
        .populate('province', 'name code type')
        .populate('district', 'name code type province')
        .populate('municipalityId', 'name code type district province');

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

      // Re-populate location references before returning
      await request.populate('province', 'name code type');
      await request.populate('district', 'name code type province');
      await request.populate('municipalityId', 'name code type district province');

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
        
        // Accept action always goes directly to approved and publishes event
        if (nextState === REQUEST_STATES.APPROVED) {
          await eventPublisherService.publishEvent(request);
        }
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

      // Re-populate location references before returning
      await request.populate('province', 'name code type');
      await request.populate('district', 'name code type province');
      await request.populate('municipalityId', 'name code type district province');

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

