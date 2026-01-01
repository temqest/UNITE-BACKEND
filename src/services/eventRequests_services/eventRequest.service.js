/**
 * Event Request Service
 * 
 * Core business logic for event requests
 */

const mongoose = require('mongoose');
const EventRequest = require('../../models/eventRequests_models/eventRequest.model');
const { Event } = require('../../models/index');
const { User } = require('../../models/index');
const RequestStateService = require('./requestState.service');
const reviewerAssignmentService = require('./reviewerAssignment.service');
const actionValidatorService = require('./actionValidator.service');
const eventPublisherService = require('./eventPublisher.service');
const permissionService = require('../users_services/permission.service');
const notificationEngine = require('../utility_services/notificationEngine.service');
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
      // Import AUTHORITY_TIERS for authority checks
      const { AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');
      
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
      // Priority: explicit > coordinator (if assigned) > requester
      let finalDistrict = requestData.district;
      let finalProvince = requestData.province;
      let finalMunicipalityId = requestData.municipalityId;

      // If admin is assigning a coordinator, use coordinator's location
      if (requester.authority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN && requestData.coordinatorId) {
        const selectedCoordinator = await User.findById(requestData.coordinatorId);
        if (selectedCoordinator) {
          // Try coordinator's coverage areas first
          if (selectedCoordinator.coverageAreas && selectedCoordinator.coverageAreas.length > 0) {
            const primaryCoverage = selectedCoordinator.coverageAreas.find(ca => ca.isPrimary) || 
                                    selectedCoordinator.coverageAreas[0];
            if (primaryCoverage) {
              if (!finalDistrict && primaryCoverage.districtIds && primaryCoverage.districtIds.length > 0) {
                finalDistrict = primaryCoverage.districtIds[0];
              }
              if (!finalProvince && finalDistrict) {
                const { Location } = require('../../models/index');
                const districtLocation = await Location.findById(finalDistrict);
                if (districtLocation && districtLocation.province) {
                  finalProvince = districtLocation.province;
                }
              }
            }
          }
          
          // Fallback to coordinator's locations
          if ((!finalDistrict || !finalProvince) && selectedCoordinator.locations) {
            if (!finalMunicipalityId && selectedCoordinator.locations.municipalityId) {
              finalMunicipalityId = selectedCoordinator.locations.municipalityId;
            }
            if (!finalDistrict && selectedCoordinator.locations.districtId) {
              finalDistrict = selectedCoordinator.locations.districtId;
            }
            if (!finalProvince && selectedCoordinator.locations.provinceId) {
              finalProvince = selectedCoordinator.locations.provinceId;
            }
          }
        }
      }

      // If location still not set, try requester's location (for coordinators/stakeholders creating their own requests)
      if (!finalDistrict || !finalProvince) {
        // Try requester's coverage areas (for coordinators)
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

        // Try requester's locations (for stakeholders)
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

      // 4. Extract stakeholderId from requestData (check multiple possible field names)
      const stakeholderId = requestData.stakeholderId || 
                            requestData.stakeholderReference?.userId || 
                            requestData.stakeholder_id || 
                            requestData.Stakeholder_ID || 
                            requestData.MadeByStakeholderID || 
                            null;
      const stakeholderPresent = !!stakeholderId;

      // 5. Assign reviewer based on requester authority
      // If admin (authority >= 80) provides coordinatorId, use it instead of auto-assignment
      let reviewer;
      
      if (requester.authority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN && requestData.coordinatorId) {
        // Admin is manually selecting a coordinator
        const selectedCoordinatorId = requestData.coordinatorId;
        const selectedCoordinator = await User.findById(selectedCoordinatorId);
        
        if (!selectedCoordinator) {
          throw new Error('Selected coordinator not found');
        }
        
        // Validate coordinator has appropriate authority (60-79)
        const coordinatorAuthority = selectedCoordinator.authority || 20;
        if (coordinatorAuthority < AUTHORITY_TIERS.COORDINATOR || coordinatorAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
          throw new Error(`Selected coordinator must have authority between ${AUTHORITY_TIERS.COORDINATOR} and ${AUTHORITY_TIERS.OPERATIONAL_ADMIN - 1}`);
        }
        
        // Validate coordinator has request.review permission
        const coordinatorLocationId = finalDistrict || finalMunicipalityId;
        const hasReviewPermission = await permissionService.checkPermission(
          selectedCoordinatorId,
          'request',
          'review',
          coordinatorLocationId ? { locationId: coordinatorLocationId } : {}
        );
        
        if (!hasReviewPermission) {
          // Try global permission check as fallback
          const hasGlobalPermission = await permissionService.checkPermission(
            selectedCoordinatorId,
            'request',
            'review',
            {}
          );
          
          if (!hasGlobalPermission) {
            throw new Error('Selected coordinator does not have request.review permission');
          }
        }
        
        // Get coordinator's roles for snapshot
        const coordinatorRoles = await permissionService.getUserRoles(selectedCoordinatorId);
        const primaryRole = coordinatorRoles[0];
        
        // Create reviewer object with selected coordinator
        reviewer = {
          userId: selectedCoordinator._id,
          name: `${selectedCoordinator.firstName || ''} ${selectedCoordinator.lastName || ''}`.trim() || selectedCoordinator.email,
          roleSnapshot: primaryRole?.code || null,
          assignedAt: new Date(),
          autoAssigned: false,
          assignmentRule: 'manual'
        };
        
        // Admin manually selected coordinator for request
      } else {
        // Use existing auto-assignment logic (will handle Coordinator→Stakeholder case if stakeholderId provided)
        reviewer = await reviewerAssignmentService.assignReviewer(requesterId, {
          locationId: finalDistrict || finalMunicipalityId,
          organizationId: requestData.organizationId,
          coverageAreaId: requestData.coverageAreaId,
          stakeholderId: stakeholderId
        });
      }

      // 6. Prepare stakeholder reference if stakeholderId is provided
      let stakeholderReference = null;
      if (stakeholderId) {
        try {
          const stakeholder = await User.findById(stakeholderId) || await User.findByLegacyId(stakeholderId);
          if (stakeholder) {
            stakeholderReference = {
              userId: stakeholder._id,
              id: stakeholderId.toString(), // Legacy ID fallback
              relationshipType: 'participant' // Default relationship type
            };
          }
        } catch (error) {
          console.warn(`[EVENT REQUEST SERVICE] Could not resolve stakeholder ${stakeholderId}: ${error.message}`);
        }
      }

      // 7. Create request document with all event details
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
        stakeholderReference: stakeholderReference,
        stakeholderPresent: stakeholderPresent,
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

      // 8. Add initial status history
      request.addStatusHistory(REQUEST_STATES.PENDING_REVIEW, {
        userId: requester._id,
        name: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email,
        roleSnapshot: requester.roles?.[0]?.roleCode || null,
        authoritySnapshot: requester.authority || 20
      }, 'Request created');

      // 9. Set initial active responder (reviewer is active responder in pending-review state)
      if (reviewer && reviewer.userId) {
        const reviewerUser = await User.findById(reviewer.userId);
        if (reviewerUser) {
          // Ensure we store the ObjectId, not a reference
          const reviewerUserId = reviewer.userId._id || reviewer.userId;
          request.activeResponder = {
            userId: reviewerUserId,
            relationship: 'reviewer',
            authority: reviewerUser.authority || 20
          };
          // Set activeResponder for reviewer
        } else {
          // Reviewer user not found
        }
      } else {
        // No reviewer assigned for request
      }
      request.lastAction = null; // No action yet

      // 10. Save request
      await request.save();

      // 11. Trigger notification for reviewer
      try {
        await notificationEngine.notifyRequestCreated(request);
      } catch (notificationError) {
        console.error(`[EVENT REQUEST SERVICE] Error sending notification: ${notificationError.message}`);
        // Don't fail request creation if notification fails
      }

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
    const queryStart = Date.now();
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
        // 2. Requests assigned to them as reviewer (regardless of permissions - if assigned, they should see it)
        // 3. Requests in their jurisdiction (if they have review permission)
        
        const canReview = await permissionService.checkPermission(
          userId,
          'request',
          'review',
          {}
        );

        // Convert userId to ObjectId for proper comparison in aggregation
        const userIdObjectId = mongoose.Types.ObjectId.isValid(userId) 
          ? new mongoose.Types.ObjectId(userId) 
          : userId;

        // Always include requests where user is reviewer, even if they don't have review permission
        // This handles cases where stakeholders are assigned as reviewers
        query.$or = [
          { 'requester.userId': userIdObjectId },
          { 'reviewer.userId': userIdObjectId }
        ];

        // If user has review permission, they can also see requests in their jurisdiction
        // (This is handled by location filters below, but we keep the $or structure)
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

      // Optimized: Use single aggregation pipeline with $facet to get counts and results in one query
      const limit = filters.limit || 100;
      const skip = filters.skip || 0;
      
      const aggregationPipeline = [
        { $match: query },
        // Early projection to reduce data size before lookups
        {
          $project: {
            Request_ID: 1,
            Event_ID: 1,
            requester: 1,
            reviewer: 1,
            organizationId: 1,
            coverageAreaId: 1,
            municipalityId: 1,
            district: 1,
            province: 1,
            Event_Title: 1,
            Location: 1,
            Date: 1,
            Start_Date: 1,
            End_Date: 1,
            Email: 1,
            Phone_Number: 1,
            Event_Description: 1,
            Category: 1,
            Target_Donation: 1,
            VenueType: 1,
            TrainingType: 1,
            MaxParticipants: 1,
            Topic: 1,
            TargetAudience: 1,
            ExpectedAudienceSize: 1,
            PartnerOrganization: 1,
            StaffAssignmentID: 1,
            status: 1,
            notes: 1,
            rescheduleProposal: 1,
            statusHistory: 1,
            decisionHistory: 1,
            activeResponder: 1,
            lastAction: 1,
            createdAt: 1,
            updatedAt: 1
          }
        },
        {
          $facet: {
            // Get status counts
            statusCounts: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 }
                }
              }
            ],
            // Get total count
            totalCount: [
              { $count: 'count' }
            ],
            // Get paginated results with populated references
            requests: [
              { $sort: { createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
              // Populate requester.userId
              {
                $lookup: {
                  from: 'users',
                  localField: 'requester.userId',
                  foreignField: '_id',
                  as: 'requesterUser',
                  pipeline: [
                    { $project: { firstName: 1, lastName: 1, email: 1 } }
                  ]
                }
              },
              {
                $addFields: {
                  'requester.userId': {
                    $cond: {
                      if: { $gt: [{ $size: '$requesterUser' }, 0] },
                      then: { $arrayElemAt: ['$requesterUser', 0] },
                      else: '$requester.userId'
                    }
                  }
                }
              },
              { $unset: 'requesterUser' },
              // Populate reviewer.userId
              {
                $lookup: {
                  from: 'users',
                  localField: 'reviewer.userId',
                  foreignField: '_id',
                  as: 'reviewerUser',
                  pipeline: [
                    { $project: { firstName: 1, lastName: 1, email: 1 } }
                  ]
                }
              },
              {
                $addFields: {
                  'reviewer.userId': {
                    $cond: {
                      if: { $gt: [{ $size: '$reviewerUser' }, 0] },
                      then: { $arrayElemAt: ['$reviewerUser', 0] },
                      else: '$reviewer.userId'
                    }
                  }
                }
              },
              { $unset: 'reviewerUser' },
              // Populate province
              {
                $lookup: {
                  from: 'locations',
                  localField: 'province',
                  foreignField: '_id',
                  as: 'provinceData',
                  pipeline: [
                    { $project: { name: 1, code: 1, type: 1 } }
                  ]
                }
              },
              {
                $addFields: {
                  province: {
                    $cond: {
                      if: { $gt: [{ $size: '$provinceData' }, 0] },
                      then: { $arrayElemAt: ['$provinceData', 0] },
                      else: '$province'
                    }
                  }
                }
              },
              { $unset: 'provinceData' },
              // Populate district
              {
                $lookup: {
                  from: 'locations',
                  localField: 'district',
                  foreignField: '_id',
                  as: 'districtData',
                  pipeline: [
                    { $project: { name: 1, code: 1, type: 1, province: 1 } }
                  ]
                }
              },
              {
                $addFields: {
                  district: {
                    $cond: {
                      if: { $gt: [{ $size: '$districtData' }, 0] },
                      then: { $arrayElemAt: ['$districtData', 0] },
                      else: '$district'
                    }
                  }
                }
              },
              { $unset: 'districtData' },
              // Populate municipalityId
              {
                $lookup: {
                  from: 'locations',
                  localField: 'municipalityId',
                  foreignField: '_id',
                  as: 'municipalityData',
                  pipeline: [
                    { $project: { name: 1, code: 1, type: 1, district: 1, province: 1 } }
                  ]
                }
              },
              {
                $addFields: {
                  municipalityId: {
                    $cond: {
                      if: { $gt: [{ $size: '$municipalityData' }, 0] },
                      then: { $arrayElemAt: ['$municipalityData', 0] },
                      else: '$municipalityId'
                    }
                  }
                }
              },
              { $unset: 'municipalityData' }
            ]
          }
        }
      ];
      
      // Execute aggregation with allowDiskUse for large datasets
      const aggStart = Date.now();
      const aggregationResult = await EventRequest.aggregate(aggregationPipeline).allowDiskUse(true);
      const aggTime = Date.now() - aggStart;
      const result = aggregationResult[0] || {};
      
      // Process status counts
      const statusCountsResult = result.statusCounts || [];
      const statusCounts = {
        all: 0,
        approved: 0,
        pending: 0,
        rejected: 0
      };
      
      // Map status counts to tab categories
      // IMPORTANT: Check rejected FIRST (including review-rejected) before checking review/pending
      // This ensures review-rejected is counted as rejected, not pending
      statusCountsResult.forEach(item => {
        const status = String(item._id || '').toLowerCase();
        statusCounts.all += item.count;
        
        // Check rejected first (including review-rejected, review_rejected, rejected)
        if (status.includes('reject') || status === 'review-rejected' || status === 'review_rejected') {
          statusCounts.rejected += item.count;
        } 
        // Check approved (including review-accepted, completed, approved)
        else if (status.includes('approv') || status.includes('complete') || status.includes('review-accepted') || status === 'review_accepted') {
          statusCounts.approved += item.count;
        } 
        // Check pending (pending-review, review-rescheduled, but NOT review-rejected or review-accepted)
        else if (status.includes('pending') || (status.includes('review') && !status.includes('reject') && !status.includes('accept')) || status.includes('rescheduled')) {
          statusCounts.pending += item.count;
        }
      });
      
      // Get total count from aggregation result
      const totalCount = result.totalCount?.[0]?.count || 0;
      statusCounts.all = totalCount || statusCounts.all;
      
      // Get requests from aggregation result
      // Aggregation returns plain objects, which is fine for our use case
      // The controller will format them appropriately
      const requests = result.requests || [];

      const queryTime = Date.now() - queryStart;

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
        .populate([
          { path: 'requester.userId', select: 'firstName lastName email authority' },
          { path: 'reviewer.userId', select: 'firstName lastName email authority' },
          { path: 'province', select: 'name code type' },
          { path: 'district', select: 'name code type province' },
          { path: 'municipalityId', select: 'name code type district province' }
        ]);

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
          // For approved events, check if user is the assigned coordinator OR the requester with permission
          // This allows coordinators to edit their own approved events even if they're not assigned
          const isAssignedCoordinator = request.assignedCoordinator?.userId?.toString() === userId.toString() ||
                                       request.reviewer?.userId?.toString() === userId.toString();
          const isRequester = request.requester?.userId?.toString() === userId.toString();
          
          // If user is requester, re-check permission without location context (system-level permission)
          // This handles cases where location-scoped permission check failed but user has system-level permission
          let hasSystemLevelPermission = false;
          if (isRequester) {
            hasSystemLevelPermission = await permissionService.checkPermission(
              userId,
              resource,
              action,
              {} // Check system-level permission (no location context)
            );
          }
          
          if (!isAssignedCoordinator && !(isRequester && hasSystemLevelPermission)) {
            // Log diagnostic info for debugging
            const userPermissions = await permissionService.getUserPermissions(userId, null);
            console.error(`[EVENT REQUEST SERVICE] Permission denied for ${resource}.${action}`, {
              userId: userId.toString(),
              resource,
              action,
              isApproved,
              locationId: locationId?.toString(),
              isAssignedCoordinator,
              isRequester,
              hasSystemLevelPermission,
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
            
            // Trigger event edited notification
            try {
              await notificationEngine.notifyEventEdited(event, request, userId);
            } catch (notificationError) {
              console.error(`[EVENT REQUEST SERVICE] Error sending event edited notification: ${notificationError.message}`);
              // Don't fail the update if notification fails
            }
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
      // Helper function to get note from actionData (handles both 'note' and 'notes' for backward compatibility)
      const getNote = () => {
        // Prefer 'notes' (normalized by validator), fallback to 'note' (from frontend), then empty string
        return actionData.notes || actionData.note || '';
      };

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

      // Capture original event date for reschedule notifications
      let originalEventDate = null;
      if (action === REQUEST_ACTIONS.RESCHEDULE && request.Event_ID) {
        try {
          const event = await Event.findOne({ Event_ID: request.Event_ID });
          if (event && event.Start_Date) {
            originalEventDate = new Date(event.Start_Date);
          }
        } catch (e) {
          // Ignore errors
        }
      }

      // 4. Get next state
      const currentState = request.status;
      const normalizedCurrentState = RequestStateService.normalizeState(currentState);
      const nextState = RequestStateService.getNextState(currentState, action);

      if (!nextState) {
        throw new Error(`Invalid transition from ${currentState} (normalized: ${normalizedCurrentState}) with action ${action}`);
      }
      
      // Execute state transition

      // 5. Update request based on action
      // Note: getNote() helper is defined at the start of this method
      const note = getNote();
      
      if (action === REQUEST_ACTIONS.ACCEPT) {
        request.status = nextState;
        request.addDecisionHistory('accept', actorSnapshot, note);
        
        // Accept action always goes directly to approved and publishes event
        // Note: publishEvent is made non-blocking to avoid timeout issues
        if (nextState === REQUEST_STATES.APPROVED) {
          // Fire-and-forget: publish event asynchronously after response is sent
          setImmediate(async () => {
            try {
              await eventPublisherService.publishEvent(request, actorSnapshot);
            } catch (publishError) {
              console.error(`[EVENT REQUEST SERVICE] Error publishing event (non-blocking): ${publishError.message}`);
              // Don't fail action execution if event publishing fails
            }
          });
        }
      } else if (action === REQUEST_ACTIONS.REJECT) {
        request.status = nextState;
        request.addDecisionHistory('reject', actorSnapshot, note);
      } else if (action === REQUEST_ACTIONS.CONFIRM) {
        request.status = nextState;
        // CONFIRM from pending-review or review-rescheduled is equivalent to ACCEPT - add decision history as accept
        if (currentState === REQUEST_STATES.PENDING_REVIEW || currentState === REQUEST_STATES.REVIEW_RESCHEDULED) {
          request.addDecisionHistory('accept', actorSnapshot, note);
        } else if (currentState === REQUEST_STATES.APPROVED) {
          // CONFIRM on approved state is stakeholder acknowledgment - add decision history as confirm
          request.addDecisionHistory('confirm', actorSnapshot, note);
        }
        
        // Auto-publish event if approved (from pending-review, review-accepted, or review-rescheduled)
        // Note: publishEvent is made non-blocking to avoid timeout issues
        if (nextState === REQUEST_STATES.APPROVED) {
          // Fire-and-forget: publish event asynchronously after response is sent
          setImmediate(async () => {
            try {
              await eventPublisherService.publishEvent(request, actorSnapshot);
            } catch (publishError) {
              console.error(`[EVENT REQUEST SERVICE] Error publishing event (non-blocking): ${publishError.message}`);
              // Don't fail action execution if event publishing fails
            }
          });
        }
      } else if (action === REQUEST_ACTIONS.DECLINE) {
        request.status = nextState;
        // DECLINE from pending-review or review-rescheduled is equivalent to REJECT - add decision history as reject
        if (currentState === REQUEST_STATES.PENDING_REVIEW || currentState === REQUEST_STATES.REVIEW_RESCHEDULED) {
          request.addDecisionHistory('reject', actorSnapshot, note);
        }
      } else if (action === REQUEST_ACTIONS.RESCHEDULE) {
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
      } else if (action === REQUEST_ACTIONS.CANCEL) {
        request.status = nextState;
        
        // If request is approved (has published event), also cancel the event and notify
        if (currentState === REQUEST_STATES.APPROVED && request.Event_ID) {
          try {
            const event = await Event.findOne({ Event_ID: request.Event_ID });
            if (event) {
              event.Status = 'Cancelled';
              await event.save();
              
              // Trigger event cancelled notification
              await notificationEngine.notifyEventCancelled(
                event,
                request,
                actorSnapshot,
                note || null
              );
            }
          } catch (eventError) {
            console.error(`[EVENT REQUEST SERVICE] Error cancelling event: ${eventError.message}`);
            // Don't fail request cancellation if event cancellation fails
          }
        }
      }

      // 6. Add status history
      request.addStatusHistory(nextState, actorSnapshot, note);

      // 7. Update active responder and lastAction
      const requesterId = request.requester?.userId?.toString();
      const reviewerId = request.reviewer?.userId?.toString();
      RequestStateService.updateActiveResponder(
        request,
        action,
        userId,
        { requesterId, reviewerId, actorAuthority: actorSnapshot.authoritySnapshot }
      );
      
      // 7.5. Validate activeResponder was set correctly for reschedule
      if (action === REQUEST_ACTIONS.RESCHEDULE && request.status === REQUEST_STATES.REVIEW_RESCHEDULED) {
        if (!request.activeResponder || !request.activeResponder.userId) {
          console.warn(`[EVENT REQUEST SERVICE] activeResponder not set after reschedule, recalculating`, {
            requestId: request.Request_ID,
            actorId: userId.toString(),
            requesterId,
            reviewerId,
            assignmentRule: request.reviewer?.assignmentRule
          });
          // Recalculate using getActiveResponder as safety net
          const recalculated = RequestStateService.getActiveResponder(request);
          if (recalculated) {
            request.activeResponder = {
              userId: recalculated.userId,
              relationship: recalculated.relationship,
              authority: recalculated.authority
            };
          }
        }
      }

      // 8. Save request and verify save completed
      await request.save();
      
      // Verify status was updated correctly (use already-updated request object)
      if (request.status !== nextState) {
        console.warn(`[EVENT REQUEST SERVICE] Status mismatch. Expected: ${nextState}, Got: ${request.status}`);
        // Only re-fetch if mismatch (shouldn't happen, but handle gracefully)
        const savedRequest = await EventRequest.findOne({ Request_ID: requestId })
          .populate([
            { path: 'province', select: 'name code type' },
            { path: 'district', select: 'name code type province' },
            { path: 'municipalityId', select: 'name code type district province' }
          ]);
        if (!savedRequest) {
          throw new Error('Request save verification failed - request not found after save');
        }
        return savedRequest;
      }

      // 9. Trigger notifications for state changes (non-blocking)
      // Use setImmediate to ensure response is sent before notifications complete
      setImmediate(async () => {
        try {
          // Prepare action data for notification
          // Note: getNote() is defined in outer scope
          const notificationActionData = {
            notes: note || null,
            proposedDate: actionData.proposedDate || null,
            originalDate: originalEventDate
          };

          await notificationEngine.notifyRequestStateChange(
            request,
            action,
            actorSnapshot,
            notificationActionData
          );

          // Note: Event published notification is already triggered in eventPublisherService.publishEvent()
          // No need to trigger it again here to avoid duplicates
        } catch (notificationError) {
          console.error(`[EVENT REQUEST SERVICE] Error sending notification: ${notificationError.message}`);
          // Don't fail action execution if notification fails
        }
      });

      // Re-populate location references before returning (optimize: combine into single populate)
      await request.populate([
        { path: 'province', select: 'name code type' },
        { path: 'district', select: 'name code type province' },
        { path: 'municipalityId', select: 'name code type district province' }
      ]);
      
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

      // Get actor details for notification
      const actor = await User.findById(userId);
      const actorSnapshot = actor ? {
        userId: actor._id,
        name: `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.email,
        roleSnapshot: actor.roles?.[0]?.roleCode || null,
        authoritySnapshot: actor.authority || 20
      } : null;

      // If request has an associated event, delete it and notify
      if (request.Event_ID) {
        try {
          const event = await Event.findOne({ Event_ID: request.Event_ID });
          if (event) {
            // Trigger event deleted notification before deleting
            await notificationEngine.notifyEventDeleted(event, request, actorSnapshot);
            
            // Delete the event
            await Event.deleteOne({ Event_ID: request.Event_ID });
          }
        } catch (eventError) {
          console.error(`[EVENT REQUEST SERVICE] Error deleting event: ${eventError.message}`);
          // Continue with request deletion even if event deletion fails
        }
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
    const session = await mongoose.startSession();
    session.startTransaction();
    
    const timeoutMs = 30000; // 30 second timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Staff assignment timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const EventStaff = require('../../models/events_models/eventStaff.model');
      
      // Validate input
      if (!staffMembers || !Array.isArray(staffMembers)) {
        throw new Error('Staff members must be an array');
      }

      if (staffMembers.length === 0) {
        throw new Error('At least one staff member is required');
      }

      // Validate each staff member
      for (const staff of staffMembers) {
        if (!staff.FullName || !staff.Role) {
          throw new Error(`Invalid staff data: FullName and Role are required. Received: ${JSON.stringify(staff)}`);
        }
        if (typeof staff.FullName !== 'string' || typeof staff.Role !== 'string') {
          throw new Error(`Invalid staff data: FullName and Role must be strings. Received: ${JSON.stringify(staff)}`);
        }
      }
      
      // Verify event exists
      const event = await Event.findOne({ Event_ID: eventId }).session(session);
      if (!event) {
        throw new Error('Event not found');
      }

      // Get existing staff assignments
      const existingStaff = await EventStaff.find({ EventID: eventId }).session(session).lean();
      
      // Create a map of existing staff by FullName+Role for quick lookup
      const existingStaffMap = new Map();
      existingStaff.forEach(s => {
        const key = `${s.Staff_FullName}|${s.Role}`;
        existingStaffMap.set(key, s);
      });

      // Process new staff list - identify what to add, keep, and remove
      const newStaffMap = new Map();
      const staffToAdd = [];
      const staffToKeep = [];
      
      for (const staff of staffMembers) {
        const key = `${staff.FullName.trim()}|${staff.Role.trim()}`;
        newStaffMap.set(key, staff);
        
        if (existingStaffMap.has(key)) {
          // Staff already exists, keep it
          staffToKeep.push(existingStaffMap.get(key));
        } else {
          // New staff, prepare for bulk insert
          staffToAdd.push({
            EventID: eventId,
            Staff_FullName: staff.FullName.trim(),
            Role: staff.Role.trim()
          });
        }
      }

      // Identify staff to remove
      const staffToRemove = [];
      for (const [key, existingStaffMember] of existingStaffMap) {
        if (!newStaffMap.has(key)) {
          staffToRemove.push(existingStaffMember._id);
        }
      }

      // Execute operations efficiently
      // Use insertMany directly for better performance when only adding
      if (staffToAdd.length > 0 && staffToRemove.length === 0) {
        // Only adding - use insertMany (faster than bulkWrite with insertOne)
        await EventStaff.insertMany(staffToAdd, { session });
      } else if (staffToRemove.length > 0 || staffToAdd.length > 0) {
        // Mixed operations - use bulkWrite
        const bulkOps = [];
        
        // Add new staff members
        if (staffToAdd.length > 0) {
          for (const staffDoc of staffToAdd) {
            bulkOps.push({
              insertOne: {
                document: staffDoc
              }
            });
          }
        }

        // Remove staff that are no longer in the list
        if (staffToRemove.length > 0) {
          bulkOps.push({
            deleteMany: {
              filter: { _id: { $in: staffToRemove } }
            }
          });
        }

        if (bulkOps.length > 0) {
          await EventStaff.bulkWrite(bulkOps, { session });
        }
      }

      // Construct staff list from kept + newly added (avoid unnecessary fetch)
      // We know what staff should exist, so construct the response directly
      // The frontend only needs FullName and Role anyway
      const staffList = [
        ...staffToKeep.map(s => ({
          _id: s._id,
          Staff_FullName: s.Staff_FullName,
          FullName: s.Staff_FullName,
          Role: s.Role
        })),
        ...staffToAdd.map(s => ({
          Staff_FullName: s.Staff_FullName,
          FullName: s.Staff_FullName,
          Role: s.Role
        }))
      ];

      // Generate staff assignment ID
      const staffAssignmentId = `STAFF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      event.StaffAssignmentID = staffAssignmentId;
      await event.save({ session });

      // Update request if it exists
      let request = null;
      if (requestId) {
        request = await EventRequest.findOne({ Request_ID: requestId }).session(session);
        if (request) {
          request.StaffAssignmentID = staffAssignmentId;
          await request.save({ session });
        } else {
          console.warn(`[EVENT REQUEST SERVICE] Request ${requestId} not found, skipping request update`);
        }
      }

      // Commit transaction
      await Promise.race([
        session.commitTransaction(),
        timeoutPromise
      ]);

      // Trigger notification if new staff was added (outside transaction)
      if (staffToAdd.length > 0) {
        try {
          await notificationEngine.notifyStaffAdded(event, request, userId, staffToAdd.length);
        } catch (notificationError) {
          console.error(`[EVENT REQUEST SERVICE] Error sending staff added notification: ${notificationError.message}`);
          // Don't fail staff assignment if notification fails
        }
      }

      const result = {
        event: event,
        staff: staffList.map(s => ({
          FullName: s.Staff_FullName || s.FullName,
          Role: s.Role
        }))
      };

      return result;
    } catch (error) {
      // Abort transaction on error
      await session.abortTransaction().catch(() => {
        // Ignore abort errors
      });
      
      console.error(`[EVENT REQUEST SERVICE] Error assigning staff:`, {
        message: error.message,
        stack: error.stack,
        userId: userId?.toString(),
        requestId,
        eventId,
        staffCount: staffMembers?.length || 0
      });
      
      // Provide more detailed error messages
      if (error.message.includes('timeout')) {
        throw new Error(`Staff assignment timed out. Please try again.`);
      } else if (error.message.includes('validation')) {
        throw new Error(`Invalid staff data: ${error.message}`);
      } else {
        throw new Error(`Failed to assign staff: ${error.message}`);
      }
    } finally {
      session.endSession();
    }
  }
}

module.exports = new EventRequestService();

