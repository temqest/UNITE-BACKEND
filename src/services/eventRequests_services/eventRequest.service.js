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

      // Check permission to view - first check for wildcard permissions
      const userPermissions = await permissionService.getUserPermissions(userId);
      const hasWildcard = userPermissions.some(p => 
        (p.resource === '*' || p.resource === 'request') && 
        (p.actions?.includes('*') || p.actions?.includes('read'))
      );

      let canView = hasWildcard;

      if (!canView) {
        // Check location-scoped permission
        const locationId = request.district || request.municipalityId;
        canView = await permissionService.checkPermission(
          userId,
          'request',
          'read',
          { locationId }
        );
      }

      if (!canView) {
        // Check if user is requester or reviewer
        const isRequester = request.requester?.userId?._id?.toString() === userId.toString() ||
                           request.requester?.userId?.toString() === userId.toString();
        const isReviewer = request.reviewer?.userId?._id?.toString() === userId.toString() ||
                           request.reviewer?.userId?.toString() === userId.toString();
        
        if (!isRequester && !isReviewer) {
          throw new Error('User does not have permission to view this request');
        }
      }

      // Fetch staff assignments for this event
      const EventStaff = require('../../models/events_models/eventStaff.model');
      const staff = await EventStaff.find({ EventID: request.Event_ID });

      // Attach staff to request object for response
      request.staff = staff.map(s => ({
        FullName: s.Staff_FullName,
        Role: s.Role
      }));

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

      const normalizedStatus = RequestStateService.normalizeState(request.status);
      const isApproved = normalizedStatus === REQUEST_STATES.APPROVED;
      
      // Check if request can be edited
      // Allow editing if pending OR if approved (in which case we'll update the event too)
      if (!RequestStateService.canEdit(request.status) && !isApproved) {
        throw new Error('Request cannot be edited in current state');
      }

      // Check permission based on request status
      // For approved requests (published events), check event.update permission
      // For pending requests, check request.update permission
      const locationId = request.district || request.municipalityId;
      const resource = isApproved ? 'event' : 'request';
      const action = 'update';
      
      // First, check if user has wildcard permission (*.*) which bypasses all restrictions
      // This is important for system admins who should have access regardless of location
      const userPermissions = await permissionService.getUserPermissions(userId, null);
      const hasWildcard = userPermissions.some(p => p.resource === '*' && p.actions.includes('*'));
      
      let canUpdate = false;
      
      if (hasWildcard) {
        // System admin with *.* - grant permission immediately
        canUpdate = true;
        console.log(`[EVENT REQUEST SERVICE] User ${userId} has wildcard permission (*.*), granting ${resource}.${action}`);
      } else {
        // Check permission with location context
        canUpdate = await permissionService.checkPermission(
          userId,
          resource,
          action,
          locationId ? { locationId } : {}
        );
      }

      if (!canUpdate) {
        // Check if user is requester (only for pending requests)
        if (!isApproved) {
          const isRequester = request.requester?.userId?.toString() === userId.toString();
          if (!isRequester) {
            // For pending requests, also check if user is the assigned coordinator/reviewer
            const isReviewer = request.reviewer?.userId?.toString() === userId.toString() ||
                              request.assignedCoordinator?.userId?.toString() === userId.toString();
            if (!isReviewer) {
              throw new Error('User does not have permission to update this request');
            }
          }
        } else {
          // For approved events, check if user is the assigned coordinator
          // Coordinators should be able to edit events they manage
          const isAssignedCoordinator = request.assignedCoordinator?.userId?.toString() === userId.toString() ||
                                       request.reviewer?.userId?.toString() === userId.toString();
          
          if (!isAssignedCoordinator) {
            // Log diagnostic info for debugging
            const userPermissions = await permissionService.getUserPermissions(userId, null);
            console.error(`[EVENT REQUEST SERVICE] Permission denied for ${resource}.${action}`, {
              userId: userId.toString(),
              resource,
              action,
              isApproved,
              locationId: locationId?.toString(),
              isAssignedCoordinator,
              userPermissionsCount: userPermissions.length,
              hasWildcard: userPermissions.some(p => p.resource === '*' && p.actions.includes('*')),
              permissions: userPermissions.map(p => `${p.resource}.${p.actions.join(',')}`)
            });
            throw new Error(`User does not have permission to update this ${resource}`);
          }
        }
      }

      // Update allowed fields - event fields and request metadata
      const allowedFields = [
        // Event fields
        'Event_Title', 'Location', 'Date', 'Start_Date', 'End_Date',
        'Email', 'Phone_Number', 'Event_Description', 'Category',
        // Category-specific fields
        'Target_Donation', 'VenueType', 'TrainingType', 'MaxParticipants',
        'Topic', 'TargetAudience', 'ExpectedAudienceSize', 'PartnerOrganization',
        'StaffAssignmentID',
        // Location and organization references
        'municipalityId', 'district', 'province', 'organizationId', 'coverageAreaId',
        // Request-specific fields
        'notes'
      ];
      
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          request[field] = updateData[field];
        }
      }
      
      // Normalize Date field if Start_Date is provided
      if (updateData.Start_Date && !updateData.Date) {
        request.Date = updateData.Start_Date;
      }

      await request.save();

      // If request is approved (event is published), also update the event
      if (isApproved && request.Event_ID) {
        try {
          const event = await Event.findOne({ Event_ID: request.Event_ID });
          if (event) {
            // Update event fields that were changed
            if (updateData.Event_Title !== undefined) event.Event_Title = updateData.Event_Title;
            if (updateData.Location !== undefined) event.Location = updateData.Location;
            if (updateData.Start_Date !== undefined) event.Start_Date = new Date(updateData.Start_Date);
            if (updateData.End_Date !== undefined) event.End_Date = new Date(updateData.End_Date);
            if (updateData.Email !== undefined) event.Email = updateData.Email;
            if (updateData.Phone_Number !== undefined) event.Phone_Number = updateData.Phone_Number;
            if (updateData.Event_Description !== undefined) event.Event_Description = updateData.Event_Description;
            if (updateData.Category !== undefined) event.Category = updateData.Category;
            
            await event.save();
            console.log(`[EVENT REQUEST SERVICE] Updated event ${request.Event_ID} along with approved request ${requestId}`);
          } else {
            console.warn(`[EVENT REQUEST SERVICE] Event ${request.Event_ID} not found for approved request ${requestId}`);
          }
        } catch (eventError) {
          console.error(`[EVENT REQUEST SERVICE] Error updating event for approved request: ${eventError.message}`);
          // Don't fail the request update if event update fails, but log it
        }
      }

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

  /**
   * Assign staff to event
   * @param {string|ObjectId} userId - User assigning staff
   * @param {string} requestId - Request ID
   * @param {string} eventId - Event ID
   * @param {Array} staffMembers - Array of { FullName, Role }
   * @returns {Promise<Object>} Result with event and staff
   */
  async assignStaffToEvent(userId, requestId, eventId, staffMembers) {
    try {
      console.log(`[EVENT REQUEST SERVICE] assignStaffToEvent called:`, {
        userId: userId?.toString(),
        requestId,
        eventId,
        staffCount: staffMembers?.length || 0
      });

      const EventStaff = require('../../models/events_models/eventStaff.model');
      
      // Verify event exists
      const event = await Event.findOne({ Event_ID: eventId });
      if (!event) {
        throw new Error('Event not found');
      }
      console.log(`[EVENT REQUEST SERVICE] Event found: ${event.Event_ID}`);

      // Get existing staff assignments
      const existingStaff = await EventStaff.find({ EventID: eventId });
      console.log(`[EVENT REQUEST SERVICE] Found ${existingStaff.length} existing staff assignments`);
      
      // Create a map of existing staff by FullName+Role for quick lookup
      const existingStaffMap = new Map();
      existingStaff.forEach(s => {
        const key = `${s.Staff_FullName}|${s.Role}`;
        existingStaffMap.set(key, s);
      });

      // Process new staff list - add new ones, keep existing ones that are still in the list
      const newStaffMap = new Map();
      const staffList = [];
      let newStaffCount = 0;
      let keptStaffCount = 0;
      
      for (const staff of staffMembers) {
        // Validate staff data format
        if (!staff.FullName || !staff.Role) {
          console.warn(`[EVENT REQUEST SERVICE] Invalid staff data:`, staff);
          continue;
        }

        const key = `${staff.FullName}|${staff.Role}`;
        newStaffMap.set(key, staff);
        
        if (existingStaffMap.has(key)) {
          // Staff already exists, keep it
          staffList.push(existingStaffMap.get(key));
          keptStaffCount++;
          console.log(`[EVENT REQUEST SERVICE] Keeping existing staff: ${staff.FullName} - ${staff.Role}`);
        } else {
          // New staff, create it
          const eventStaff = new EventStaff({
            EventID: eventId,
            Staff_FullName: staff.FullName,
            Role: staff.Role
          });
          const savedStaff = await eventStaff.save();
          console.log(`[EVENT REQUEST SERVICE] Created new staff: ${savedStaff._id} - ${savedStaff.Staff_FullName} - ${savedStaff.Role}`);
          staffList.push(savedStaff);
          newStaffCount++;
        }
      }

      // Remove staff that are no longer in the list
      let removedStaffCount = 0;
      for (const [key, existingStaffMember] of existingStaffMap) {
        if (!newStaffMap.has(key)) {
          const deleteResult = await EventStaff.deleteOne({ _id: existingStaffMember._id });
          console.log(`[EVENT REQUEST SERVICE] Removed staff: ${existingStaffMember.Staff_FullName} - ${existingStaffMember.Role} (deleted: ${deleteResult.deletedCount})`);
          removedStaffCount++;
        }
      }

      console.log(`[EVENT REQUEST SERVICE] Staff processing summary:`, {
        newStaff: newStaffCount,
        keptStaff: keptStaffCount,
        removedStaff: removedStaffCount,
        totalStaff: staffList.length
      });

      // Generate staff assignment ID
      const staffAssignmentId = `STAFF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      event.StaffAssignmentID = staffAssignmentId;
      const eventSaveResult = await event.save();
      console.log(`[EVENT REQUEST SERVICE] Updated event StaffAssignmentID: ${staffAssignmentId}`);

      // Update request if it exists
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (request) {
        request.StaffAssignmentID = staffAssignmentId;
        const requestSaveResult = await request.save();
        console.log(`[EVENT REQUEST SERVICE] Updated request StaffAssignmentID: ${staffAssignmentId}`);
      } else {
        console.warn(`[EVENT REQUEST SERVICE] Request ${requestId} not found, skipping request update`);
      }

      const result = {
        event: event,
        staff: staffList.map(s => ({
          FullName: s.Staff_FullName || s.FullName,
          Role: s.Role
        }))
      };

      console.log(`[EVENT REQUEST SERVICE] assignStaffToEvent completed successfully:`, {
        eventId,
        staffCount: result.staff.length,
        staffList: result.staff.map(s => `${s.FullName} - ${s.Role}`)
      });

      return result;
    } catch (error) {
      console.error(`[EVENT REQUEST SERVICE] Error assigning staff:`, {
        message: error.message,
        stack: error.stack,
        userId: userId?.toString(),
        requestId,
        eventId,
        staffCount: staffMembers?.length || 0
      });
      throw new Error(`Failed to assign staff: ${error.message}`);
    }
  }
}

module.exports = new EventRequestService();

