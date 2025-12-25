const eventRequestService = require('../../services/request_services/eventRequest.service');
const { User } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');

// Helper to safely convert a mongoose document to plain object when possible
const toPlain = (doc) => {
  try {
    if (doc && typeof doc.toObject === 'function') return doc.toObject();
    return doc;
  } catch (e) {
    return doc;
  }
};

/**
 * Event Request Controller
 * Handles all HTTP requests related to event request operations
 */
class EventRequestController {
  /**
   * Coordinator submits event request
   * POST /api/requests
   * 
   * PERMISSION-BASED: Now validates REQUEST_CREATE permission before allowing request creation
   */
  async createEventRequest(req, res) {
    try {
      // Prefer deriving actor identity from authenticated token when available
      const user = req.user || null;
      const body = req.body || {};

      // Accept coordinatorId from body (common frontend key), or fallback to other possible names
      let coordinatorId = body.coordinatorId || body.Coordinator_ID || body.coordinator || null;
      const eventData = { ...body };

      // Tag actor info on eventData for service-level validation logic
      if (user) {
        const actorId = user.id || null;
        const role = user.role || null;
        if (role) eventData._actorRole = role;
        if (actorId) eventData._actorId = actorId;

        // Check if requester is a stakeholder (authority < 60)
        const authorityService = require('../../services/users_services/authority.service');
        const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
        const requesterAuthority = await authorityService.calculateUserAuthority(actorId);
        const isStakeholder = requesterAuthority < AUTHORITY_TIERS.COORDINATOR;

        if (isStakeholder) {
          // Stakeholder creating request: auto-resolve coordinator and set stakeholder to self
          console.log('[createEventRequest] Stakeholder creating request - auto-resolving coordinator');
          
          // Auto-set stakeholder to requester
          eventData.stakeholder_id = actorId;
          eventData.Stakeholder_ID = actorId;
          eventData.MadeByStakeholderID = actorId;

          // Auto-resolve coordinator if not provided
          if (!coordinatorId) {
            try {
              const { User } = require('../../models/index');
              const stakeholder = await User.findById(actorId) || await User.findByLegacyId(actorId);
              
              if (stakeholder && stakeholder.locations && stakeholder.locations.municipalityId) {
                // Get stakeholder's organization and municipality
                const stakeholderOrgIds = new Set();
                if (stakeholder.organizations && stakeholder.organizations.length > 0) {
                  stakeholder.organizations.forEach(org => {
                    if (org.isActive !== false && org.organizationId) {
                      stakeholderOrgIds.add(org.organizationId.toString());
                    }
                  });
                }
                
                const stakeholderMunicipalityId = stakeholder.locations.municipalityId.toString();
                
                // Find matching coordinator
                const coordinators = await User.find({
                  authority: { $gte: AUTHORITY_TIERS.COORDINATOR },
                  isActive: true
                }).select('_id organizations coverageAreas');
                
                for (const coordinator of coordinators) {
                  // Check organization match
                  const coordinatorOrgIds = new Set();
                  if (coordinator.organizations && coordinator.organizations.length > 0) {
                    coordinator.organizations.forEach(org => {
                      if (org.isActive !== false && org.organizationId) {
                        coordinatorOrgIds.add(org.organizationId.toString());
                      }
                    });
                  }
                  
                  let orgMatch = false;
                  if (stakeholderOrgIds.size > 0 && coordinatorOrgIds.size > 0) {
                    for (const stakeholderOrgId of stakeholderOrgIds) {
                      if (coordinatorOrgIds.has(stakeholderOrgId)) {
                        orgMatch = true;
                        break;
                      }
                    }
                  }
                  
                  if (!orgMatch && stakeholderOrgIds.size > 0) {
                    continue;
                  }
                  
                  // Check municipality match
                  const coordinatorMunicipalityIds = new Set();
                  if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
                    coordinator.coverageAreas.forEach(ca => {
                      if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
                        ca.municipalityIds.forEach(muniId => {
                          if (muniId) {
                            coordinatorMunicipalityIds.add(muniId.toString());
                          }
                        });
                      }
                    });
                  }
                  
                  if (coordinatorMunicipalityIds.has(stakeholderMunicipalityId)) {
                    coordinatorId = coordinator._id.toString();
                    console.log('[createEventRequest] Auto-resolved coordinator:', coordinatorId);
                    break;
                  }
                }
              }
            } catch (error) {
              console.error('[createEventRequest] Error auto-resolving coordinator:', error);
              // Continue without coordinator - will fail validation later
            }
          }
        } else {
          // Coordinator or SysAdmin: use existing logic
          // If coordinatorId is missing, use authenticated user's id
          if (!coordinatorId && actorId) {
            coordinatorId = actorId;
          }

          // If stakeholder_id is provided in eventData, use it; otherwise check if user is associated with a stakeholder
          // This is for data population, not permission logic
          if (eventData.stakeholder_id || eventData.Stakeholder_ID || eventData.MadeByStakeholderID) {
            eventData.stakeholder_id = eventData.stakeholder_id || eventData.Stakeholder_ID || eventData.MadeByStakeholderID;
          }
        }
      }

      if (!coordinatorId) {
        return res.status(400).json({ success: false, message: 'Coordinator ID is required' });
      }

      // ========== NEW: Permission-Based Validation ==========
      // Validate REQUEST_CREATE permission before allowing request creation
      const { RequestStateMachine } = require('../../services/request_services/requestStateMachine');
      const stateMachine = new RequestStateMachine();
      
      const createValidation = await stateMachine.validateRequestCreation(coordinatorId, {
        locationId: eventData.locationId || eventData.district,
        coordinatorId,
        stakeholderId: eventData.stakeholder_id,
        eventDetails: eventData
      });

      if (!createValidation.allowed) {
        return res.status(403).json({
          success: false,
          message: createValidation.reason || 'Not authorized to create requests'
        });
      }

      const result = await eventRequestService.createEventRequest(coordinatorId, eventData);

      return res.status(201).json({
        success: result.success,
        message: result.message,
        data: {
          request: result.request,
          event: result.event,
          category: result.category
        },
        warnings: result.warnings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create event request'
      });
    }
  }

  /**
   * Event creation through approval workflow (no auto-publishing)
   * POST /api/events/direct
   */
  /**
   * Create immediate event (direct event creation)
   * POST /api/events/direct
   * 
   * REFACTORED: Uses authority-based validation instead of role string checks
   * - System Admin (authority ≥80): Can select any coordinator
   * - Coordinator (authority ≥60): Locked to self, stakeholder selection restricted
   * - Others: Denied
   */
  async createImmediateEvent(req, res) {
    try {
      const user = req.user || null;
      const body = req.body || {};
      let creatorId = body.creatorId || null;
      let creatorRole = body.creatorRole || null;
      const eventData = { ...body };

      // Map old field names to new ones for backward compatibility
      if (body.MadeByCoordinatorID && !body.coordinator_id) {
        eventData.coordinator_id = body.MadeByCoordinatorID;
      }
      if (body.MadeByStakeholderID && !body.stakeholder_id) {
        eventData.stakeholder_id = body.MadeByStakeholderID;
      }
      if (body.stakeholder && !body.stakeholder_id) {
        eventData.stakeholder_id = body.stakeholder;
      }

      // Prefer authenticated user
      if (user) {
        creatorId = creatorId || user.id;
        creatorRole = creatorRole || user.role;
      }

      if (!creatorId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Get user document with authority field
      const { User } = require('../../models');
      const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
      
      const userDoc = await User.findById(creatorId);
      if (!userDoc) {
        console.log(`[createImmediateEvent] User not found: ${creatorId}`);
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const userAuthority = userDoc.authority || 20;
      const isSystemAdmin = userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN; // ≥80
      const isCoordinator = userAuthority >= AUTHORITY_TIERS.COORDINATOR; // ≥60

      // Log authority validation decision
      console.log(`[createImmediateEvent] Authority validation for creator ${creatorId}`, {
        email: userDoc.email,
        authority: userAuthority,
        isSystemAdmin,
        isCoordinator,
        coordinatorThreshold: AUTHORITY_TIERS.COORDINATOR,
        adminThreshold: AUTHORITY_TIERS.OPERATIONAL_ADMIN
      });

      // Check authorization
      if (!isSystemAdmin && !isCoordinator) {
        console.log(`[createImmediateEvent] DENIED - Insufficient authority (${userAuthority} < ${AUTHORITY_TIERS.COORDINATOR})`, {
          creatorId: userDoc._id,
          requestedCoordinator: body.coordinator_id
        });
        return res.status(403).json({
          success: false,
          message: `Insufficient authority (${userAuthority} < ${AUTHORITY_TIERS.COORDINATOR}) to create events`
        });
      }

      // LOCK: Non-admin coordinators cannot change coordinator field
      if (!isSystemAdmin && isCoordinator) {
        console.log(`[createImmediateEvent] LOCK applied - Coordinator (authority ${userAuthority}) restricted to self`, {
          creatorId: userDoc._id,
          requestedCoordinator: body.coordinator_id,
          actualCoordinator: creatorId
        });
        eventData.coordinator_id = creatorId; // Lock to self
      } else if (isSystemAdmin) {
        console.log(`[createImmediateEvent] UNLOCK - System Admin (authority ${userAuthority}) can select any coordinator`, {
          creatorId: userDoc._id,
          selectedCoordinator: body.coordinator_id
        });
      }

      // RESTRICT: Coordinators can only select stakeholders within their jurisdiction
      if (!isSystemAdmin && isCoordinator && body.stakeholder_id) {
        // OPTIMIZATION: Flatten denormalized fields ONCE (avoid repeated .flatMap() calls)
        // Get coordinator's coverage areas and organizations
        const municipalityIds = userDoc.coverageAreas
          .flatMap(ca => ca.municipalityIds || [])
          .filter(Boolean);
        const organizationIds = userDoc.organizations
          .map(org => org.organizationId)
          .filter(Boolean);

        // Convert to Set for O(1) membership checking (but keep arrays for MongoDB $in queries)
        const municipalityIdSet = new Set(municipalityIds);
        const organizationIdSet = new Set(organizationIds);

        console.log(`[createImmediateEvent] RESTRICTION applied - Stakeholder selection scoped to coordinator jurisdiction`, {
          coordinatorId: creatorId,
          requestedStakeholder: body.stakeholder_id,
          coverageAreas: userDoc.coverageAreas.length,
          municipalities: municipalityIds.length,
          municipalities_unique: municipalityIdSet.size,
          organizations: organizationIds.length,
          organizations_unique: organizationIdSet.size,
          optimization: 'Flattened once, Sets created for validation lookups'
        });

        // Note: Stakeholder validation will happen in service layer
        // Store coverage context in eventData for service to use
        eventData._coordinatorMunicipalityIds = municipalityIds;
        eventData._coordinatorMunicipalityIdSet = municipalityIdSet;  // Set for O(1) lookups
        eventData._coordinatorOrganizationIds = organizationIds;
        eventData._coordinatorOrganizationIdSet = organizationIdSet;   // Set for O(1) lookups
      } else if (body.stakeholder_id && isSystemAdmin) {
        console.log(`[createImmediateEvent] NO RESTRICTION - System Admin can select any stakeholder`, {
          creatorId: userDoc._id,
          selectedStakeholder: body.stakeholder_id
        });
      }

      // Map creatorRole for service (normalize)
      creatorRole = creatorRole || (isSystemAdmin ? 'system-admin' : 'coordinator');
      if (creatorRole === 'Admin') {
        creatorRole = 'SystemAdmin';
      }

      console.log(`[createImmediateEvent] Calling service to create immediate event`, {
        creatorId,
        creatorRole,
        authority: userAuthority,
        eventFields: Object.keys(eventData).slice(0, 5)
      });

      const result = await eventRequestService.createImmediateEvent(creatorId, creatorRole, eventData);

      console.log(`[createImmediateEvent] Service returned result`, {
        success: result.success,
        hasRequest: !!result.request,
        hasEvent: !!result.event,
        warnings: result.warnings?.length || 0
      });

      return res.status(201).json({
        success: result.success,
        message: result.message,
        data: {
          request: result.request || null,
          event: result.event,
          category: result.category
        },
        warnings: result.warnings
      });
    } catch (error) {
      console.error(`[createImmediateEvent] Error:`, error.message);
      return res.status(400).json({ success: false, message: error.message || 'Failed to create event' });
    }
  }

  /**
   * Get event request by ID with full details
   * GET /api/requests/:requestId
   */
  async getEventRequestById(req, res) {
    try {
      const { requestId } = req.params;
      
      const result = await eventRequestService.getEventRequestById(requestId);

      // If authenticated, compute allowed actions for the caller
      try {
        const user = req.user || null;
        if (user) {
          const actorRole = user.role || null;
          const actorId = user.id || null;
          const allowed = await eventRequestService.computeAllowedActions(actorRole, actorId, result.request, result.request && result.request.event ? result.request.event : null);
          // Attach allowedActions and boolean flags into returned request for frontend convenience
          if (result && result.request) {
            result.request.allowedActions = allowed;
            try {
              const flags = await eventRequestService.computeActionFlags(actorRole, actorId, result.request, result.request && result.request.event ? result.request.event : null);
              Object.assign(result.request, flags);
            } catch (e) {}
          }
        }
      } catch (e) {
        // ignore - allowedActions is optional
      }

      return res.status(200).json({
        success: result.success,
        data: result.request
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Event request not found'
      });
    }
  }

  /**
   * Update pending event request
   * PUT /api/requests/:requestId
   */
  async updateEventRequest(req, res) {
    try {
      const { requestId } = req.params;
      // Derive actor exclusively from the authenticated token. Do NOT accept
      // body-provided actor ids for security. The route is protected by the
      // `authenticate` middleware so req.user should be populated.
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Prefer validated data set by the validator middleware when present
      const updateData = req.validatedData || req.body;

      // Map legacy field names for backward compatibility
      if (updateData.MadeByStakeholderID && !updateData.stakeholder_id) {
        updateData.stakeholder_id = updateData.MadeByStakeholderID;
      }

      // Determine actor role and permissions from token
      const actorRole = user.role || null;
      const actorId = user.id || null;

      if (!actorRole || !actorId) {
        return res.status(403).json({ success: false, message: 'Unable to determine actor role from authentication token' });
      }

      // Check permissions instead of hard-coded role checks
      const canUpdate = await permissionService.checkPermission(actorId, 'request', 'update');
      if (!canUpdate) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions to update request' });
      }

      const result = await eventRequestService.updateEventRequest(requestId, actorId, updateData, user.isSystemAdmin || false);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: {
          request: result.request,
          event: result.event || null,
          category: result.category || null
        },
        updatedFields: result.updatedFields
      });
    } catch (error) {
      // Log error
      console.error('[API] PUT /api/requests/:requestId - updateEventRequest error', {
        message: error.message,
        stack: error.stack
      });
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update event request'
      });
    }
  }

  /**
   * Process request actions (Admin, Coordinator, or Stakeholder)
   * POST /api/requests/:requestId/admin-action
   */
  /**
   * Process request action (accept/reject/reschedule)
   * POST /api/requests/:requestId/action
   * 
   * PERMISSION-BASED: Now validates REQUEST_REVIEW/REQUEST_APPROVE permissions and authority hierarchy
   */
  async adminAcceptRequest(req, res) {
    try {
      const { requestId } = req.params;
      // Derive actor from authenticated token
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
      
      const actorRole = user.role;
      const actorId = user.id || null;

      if (!actorRole || !actorId) {
        return res.status(403).json({ success: false, message: 'Invalid actor role or id' });
      }

      const { action, note, rescheduledDate } = req.body;
      
      // ========== NEW: Permission-Based Validation ==========
      // Get the request to validate permissions
      const eventRequestService = require('../../services/request_services/eventRequest.service');
      const request = await eventRequestService.getEventRequestById(requestId);
      
      if (!request || !request.request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
      }

      // Validate REQUEST_REVIEW/APPROVE permission and authority hierarchy
      const { RequestStateMachine } = require('../../services/request_services/requestStateMachine');
      const stateMachine = new RequestStateMachine();
      
      // Map action names to state machine action constants
      const actionMap = {
        'accept': 'accept',
        'reject': 'reject',
        'reschedule': 'reschedule'
      };
      
      const smAction = actionMap[String(action).toLowerCase()];
      if (!smAction) {
        return res.status(400).json({ success: false, message: 'Invalid action' });
      }

      // Validate permission and authority
      const canPerform = await stateMachine.canPerformAction(
        request.request.Status,
        actorId,
        smAction,
        request.request
      );

      if (!canPerform) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to perform this action (permission or authority check failed)'
        });
      }

      const actionData = {
        action,
        note,
        rescheduledDate: rescheduledDate ? new Date(rescheduledDate) : null
      };

      const result = await eventRequestService.processRequestAction(actorId, actorRole, requestId, actionData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to process request action'
      });
    }
  }

  /**
   * Assign staff to event (Admin only)
   * POST /api/requests/:requestId/staff
   */
  async assignStaffToEvent(req, res) {
    try {
      const { requestId } = req.params;
      // Prefer deriving adminId from authenticated token when available.
      // For legacy clients (no token) we still accept adminId in the body.
      const user = req.user;
      let adminId = null;
      if (user) {
        adminId = user.id || null;
      }
      const { eventId, staffMembers } = req.body;

      // If adminId is still missing, accept adminId from body for backwards compatibility
      if (!adminId && req.body && req.body.adminId) adminId = req.body.adminId;

      if (!adminId) {
        return res.status(400).json({
          success: false,
          message: 'Admin ID is required'
        });
      }

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

      const result = await eventRequestService.assignStaffToEvent(adminId, eventId, staffMembers);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: {
          event: result.event,
          staff: result.staff
        }
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to assign staff'
      });
    }
  }

  /**
   * Coordinator confirms admin's decision
   * POST /api/requests/:requestId/coordinator-confirm
   */
  async coordinatorConfirmRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { coordinatorId, action } = req.body;

      if (!coordinatorId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID is required'
        });
      }

      if (!action) {
        return res.status(400).json({
          success: false,
          message: 'Action is required'
        });
      }

      // Use the unified state machine flow instead of legacy method
      // Map action to state machine format
      const actionData = {
        action: action === 'Accepted' ? 'confirm' : (action === 'Rejected' ? 'confirm' : action.toLowerCase()),
        note: req.body.note || null
      };

      // Get user to determine role
      let userRole = 'coordinator';
      if (require('mongoose').Types.ObjectId.isValid(coordinatorId)) {
        const user = await User.findById(coordinatorId).catch(() => null);
        if (user) {
          const roles = await permissionService.getUserRoles(user._id);
          if (roles.length > 0) {
            userRole = roles[0].code;
          }
        }
      }

      const result = await eventRequestService.processRequestAction(
        coordinatorId,
        userRole,
        requestId,
        actionData
      );

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to confirm request'
      });
    }
  }

  /**
   * Coordinator accepts/rejects the request
   * POST /api/requests/:requestId/coordinator-action
   */
  async coordinatorAcceptRequest(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
      
      // Check permission instead of hard-coded role check
      const canReview = await permissionService.checkPermission(user.id, 'request', 'review');
      if (!canReview) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions to perform this action' });
      }

      const actorId = user.id || null;
      const { action, note, rescheduledDate } = req.body;
      const actionData = {
        action,
        note,
        rescheduledDate: rescheduledDate ? new Date(rescheduledDate) : null
      };

      const result = await eventRequestService.processRequestAction(actorId, user.role || 'coordinator', requestId, actionData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to process coordinator action'
      });
    }
  }

  /**
   * Stakeholder accepts/rejects the request
   * POST /api/requests/:requestId/stakeholder-action
   */
  async stakeholderAcceptRequest(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
      
      // Check permission instead of hard-coded role check
      const canConfirm = await permissionService.checkPermission(user.id, 'request', 'confirm');
      if (!canConfirm) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions to perform this action' });
      }

      const actorId = user.id || null;
      const { action, note, rescheduledDate } = req.body;
      const actionData = {
        action,
        note,
        rescheduledDate: rescheduledDate ? new Date(rescheduledDate) : null
      };

      const result = await eventRequestService.processRequestAction(actorId, user.role || 'stakeholder', requestId, actionData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to process stakeholder action'
      });
    }
  }

  /**
   * Stakeholder confirms admin/coordinator decision
   * POST /api/requests/:requestId/stakeholder-confirm
   * Now allows all roles to confirm (not just stakeholders)
   */
  async stakeholderConfirmRequest(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
      
      // Allow all roles to confirm (check permission)
      const actorRole = user.role;
      const actorId = user.id || null;
      
      if (!actorRole || !actorId) {
        return res.status(400).json({ success: false, message: 'Unable to determine user role or id' });
      }

      const { action } = req.body;
      if (!action) {
        return res.status(400).json({ success: false, message: 'Action is required' });
      }

      // Use the unified processRequestAction method which supports all roles
      const result = await eventRequestService.processRequestAction(
        actorId,
        actorRole,
        requestId,
        { action: action === 'Accepted' || action === 'confirm' ? 'Accepted' : action }
      );

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to record confirmation'
      });
    }
  }

  /**
   * Cancel/Delete pending request or approved event
   * DELETE /api/requests/:requestId
   */
  async cancelEventRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { note } = req.body; // Accept note from request body
      const user = req.user || {};

      // Determine actor role and ID
      let actorRole = user.role;
      let actorId = user.id;

      if (!actorRole || !actorId) {
        return res.status(400).json({
          success: false,
          message: 'User authentication required'
        });
      }

      const result = await eventRequestService.cancelEventRequest(requestId, actorRole, actorId, note);

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to cancel request'
      });
    }
  }

  /**
   * Delete a cancelled or rejected event request
   * DELETE /api/requests/:requestId/delete
   */
  async deleteEventRequest(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user || {};

      // Determine actor role and ID
      let actorRole = user.role;
      let actorId = user.id;

      if (!actorRole || !actorId) {
        return res.status(400).json({
          success: false,
          message: 'User authentication required'
        });
      }

      const result = await eventRequestService.deleteEventRequest(requestId, actorRole, actorId);

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete request'
      });
    }
  }

  async getCoordinatorRequests(req, res) {
    try {
      const { coordinatorId } = req.params;
      const filters = {
        status: req.query.status,
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await eventRequestService.getCoordinatorRequests(coordinatorId, filters, page, limit);

      // Enrich each request with its event and user info for frontend convenience
      const enriched = await Promise.all(result.requests.map(async (r) => {
        const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);
        
        // Use User model instead of legacy models
        let coordinatorUser = null;
        if (r.coordinator_id) {
          if (require('mongoose').Types.ObjectId.isValid(r.coordinator_id)) {
            coordinatorUser = await User.findById(r.coordinator_id).catch(() => null);
          } else {
            coordinatorUser = await User.findByLegacyId(r.coordinator_id).catch(() => null);
          }
        }

        // Fetch stakeholder info if request was made by stakeholder
        let stakeholderUser = null;
        if (r.made_by_role === 'stakeholder' && r.stakeholder_id) {
          if (require('mongoose').Types.ObjectId.isValid(r.stakeholder_id)) {
            stakeholderUser = await User.findById(r.stakeholder_id).catch(() => null);
          } else {
            stakeholderUser = await User.findByLegacyId(r.stakeholder_id).catch(() => null);
          }
        }

        const plain = {
          ...toPlain(r),
          event: event ? toPlain(event) : null,
          coordinator: coordinatorUser ? {
            id: coordinatorUser._id,
            firstName: coordinatorUser.firstName,
            lastName: coordinatorUser.lastName,
            email: coordinatorUser.email,
            fullName: coordinatorUser.fullName || `${coordinatorUser.firstName} ${coordinatorUser.lastName}`
          } : null,
          stakeholder: stakeholderUser ? {
            id: stakeholderUser._id,
            firstName: stakeholderUser.firstName,
            lastName: stakeholderUser.lastName,
            email: stakeholderUser.email,
            phoneNumber: stakeholderUser.phoneNumber,
            fullName: stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`
          } : null
        };
        try {
          // Attach creator display name
          if (stakeholderUser) {
            plain.createdByName = stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`;
          } else if (coordinatorUser) {
            plain.createdByName = coordinatorUser.fullName || `${coordinatorUser.firstName} ${coordinatorUser.lastName}`;
          }
        } catch (e) {}
        try {
          const actorRole = 'coordinator';
          const actorId = coordinatorId;
          plain.allowedActions = await eventRequestService.computeAllowedActions(actorRole, actorId, plain, plain.event);
          Object.assign(plain, await eventRequestService.computeActionFlags(actorRole, actorId, plain, plain.event));
        } catch (e) {}
        return plain;
      }));

      return res.status(200).json({
        success: result.success,
        data: enriched,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve coordinator requests'
      });
    }
  }

  /**
   * Get requests for the authenticated user (authority-aware)
   * GET /api/requests/me
   * 
   * REFACTORED: Replaced role-based branching with authority-driven entry point
   * Routes to getRequestsForUser which handles all authority levels
   */
  async getMyRequests(req, res) {
    try {
      const user = req.user || {};
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const filters = {
        status: req.query.status,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        search: req.query.search
      };
      Object.keys(filters).forEach(k => filters[k] === undefined && delete filters[k]);

      if (!user.id) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Use single authority-driven entry point (replaces role-based branching)
      const result = await eventRequestService.getRequestsForUser(user.id, filters, page, limit);

      // Enrich requests with event details and allowed actions
      const enriched = await Promise.all(result.requests.map(async (r) => {
        const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);
        
        // Use User model instead of legacy models
        let coordinatorUser = null;
        if (r.coordinator_id) {
          if (require('mongoose').Types.ObjectId.isValid(r.coordinator_id)) {
            coordinatorUser = await User.findById(r.coordinator_id).catch(() => null);
          } else {
            coordinatorUser = await User.findByLegacyId(r.coordinator_id).catch(() => null);
          }
        }

        // Fetch stakeholder info if request was made by stakeholder
        let stakeholderUser = null;
        if (r.made_by_role === 'stakeholder' && r.stakeholder_id) {
          if (require('mongoose').Types.ObjectId.isValid(r.stakeholder_id)) {
            stakeholderUser = await User.findById(r.stakeholder_id).catch(() => null);
          } else {
            stakeholderUser = await User.findByLegacyId(r.stakeholder_id).catch(() => null);
          }
        }

        // Populate request district if it's an ObjectId
        if (r.district && typeof r.district === 'string') {
          const district = await require('../../models/index').District.findById(r.district).catch(() => null);
          if (district) r.district = district;
        }

        const plain = {
          ...toPlain(r),
          event: event ? toPlain(event) : null,
          coordinator: coordinatorUser ? {
            id: coordinatorUser._id,
            firstName: coordinatorUser.firstName,
            lastName: coordinatorUser.lastName,
            email: coordinatorUser.email,
            fullName: coordinatorUser.fullName || `${coordinatorUser.firstName} ${coordinatorUser.lastName}`
          } : null,
          stakeholder: stakeholderUser ? {
            id: stakeholderUser._id,
            firstName: stakeholderUser.firstName,
            lastName: stakeholderUser.lastName,
            email: stakeholderUser.email,
            phoneNumber: stakeholderUser.phoneNumber,
            fullName: stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`
          } : null
        };
        try {
          if (stakeholderUser) {
            plain.createdByName = stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`;
          } else if (coordinatorUser) {
            plain.createdByName = coordinatorUser.fullName || `${coordinatorUser.firstName} ${coordinatorUser.lastName}`;
          }
        } catch (e) {}
        try {
          const actorRole = user.role || null;
          const actorId = user.id || null;
          plain.allowedActions = await eventRequestService.computeAllowedActions(actorRole, actorId, plain, plain.event);
          Object.assign(plain, await eventRequestService.computeActionFlags(actorRole, actorId, plain, plain.event));
        } catch (e) {}
        return plain;
      }));

      return res.status(200).json({ success: true, data: enriched, pagination: result.pagination });
    } catch (error) {
      console.error('[getMyRequests] Error:', error.message);
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve user requests' });
    }
  }

  /**
   * Get requests made by a stakeholder
   * GET /api/requests/stakeholder/:stakeholderId
   */
  async getStakeholderRequests(req, res) {
    try {
      const { stakeholderId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await eventRequestService.getRequestsByStakeholder(stakeholderId, page, limit);
      // Attach allowedActions and boolean flags when possible (use caller if authenticated)
      const user = req.user || null;
      const actorRole = user ? user.role : null;
      const actorId = user ? user.id : null;

      const enriched = await Promise.all(result.requests.map(async (r) => {
        try {
          const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);

          // Populate request district if it's an ObjectId
          if (r.district && typeof r.district === 'string') {
            const district = await require('../../models/index').District.findById(r.district).catch(() => null);
            if (district) r.district = district;
          }

          const plain = { ...toPlain(r), event: event ? toPlain(event) : null };
          
          // For stakeholder requests, populate stakeholder data using User model
          if (r.made_by_role === 'stakeholder' && r.stakeholder_id) {
            let stakeholderUser = null;
            if (require('mongoose').Types.ObjectId.isValid(r.stakeholder_id)) {
              stakeholderUser = await User.findById(r.stakeholder_id).catch(() => null);
            } else {
              stakeholderUser = await User.findByLegacyId(r.stakeholder_id).catch(() => null);
            }
            plain.stakeholder = stakeholderUser ? {
              id: stakeholderUser._id,
              firstName: stakeholderUser.firstName,
              lastName: stakeholderUser.lastName,
              email: stakeholderUser.email,
              phoneNumber: stakeholderUser.phoneNumber,
              fullName: stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`
            } : null;
          }
          
          try {
            if (plain.stakeholder_id) {
              let stakeholderUser = null;
              if (require('mongoose').Types.ObjectId.isValid(plain.stakeholder_id)) {
                stakeholderUser = await User.findById(plain.stakeholder_id).catch(() => null);
              } else {
                stakeholderUser = await User.findByLegacyId(plain.stakeholder_id).catch(() => null);
              }
              if (stakeholderUser) {
                plain.createdByName = stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`;
              }
            }
          } catch (e) {}
          const allowed = await eventRequestService.computeAllowedActions(actorRole, actorId, plain, plain.event);
          const flags = await eventRequestService.computeActionFlags(actorRole, actorId, plain, plain.event);
          plain.allowedActions = allowed;
          Object.assign(plain, flags);
          return plain;
        } catch (e) {
          return r;
        }
      }));

      return res.status(200).json({
        success: result.success,
        data: enriched,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve stakeholder requests' });
    }
  }

  /**
   * Get all pending requests for admin
   * GET /api/requests/pending
   */
  async getPendingRequests(req, res) {
    try {
      const filters = {
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const result = await eventRequestService.getPendingRequests(filters, page, limit);
      // Enrich with allowedActions/flags when caller is authenticated (likely admin)
      const user = req.user || null;
      if (user) {
        const actorRole = user.role || null;
        const actorId = user.id || null;
        const enriched = await Promise.all(result.requests.map(async (r) => {
          try {
            const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);

            // Populate request district if it's an ObjectId
            if (r.district && typeof r.district === 'string') {
              const district = await require('../../models/index').District.findById(r.district).catch(() => null);
              if (district) r.district = district;
            }

            const plain = { ...toPlain(r), event: event ? toPlain(event) : null };
            plain.allowedActions = await eventRequestService.computeAllowedActions(actorRole, actorId, plain, plain.event);
            Object.assign(plain, await eventRequestService.computeActionFlags(actorRole, actorId, plain, plain.event));
            return plain;
          } catch (e) {
            return r;
          }
        }));
        return res.status(200).json({ success: result.success, data: enriched, pagination: result.pagination });
      }

      return res.status(200).json({ success: result.success, data: result.requests, pagination: result.pagination });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve pending requests'
      });
    }
  }

  /**
   * Get all requests (admin history)
   * GET /api/requests/all
   */
  async getAllRequests(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;

      const result = await eventRequestService.getAllRequests(page, limit);

      // Enrich requests with event and user info
      const enriched = await Promise.all(result.requests.map(async (r) => {
        const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);
        
        // Use User model instead of legacy models
        let coordinatorUser = null;
        if (r.coordinator_id) {
          if (require('mongoose').Types.ObjectId.isValid(r.coordinator_id)) {
            coordinatorUser = await User.findById(r.coordinator_id).catch(() => null);
          } else {
            coordinatorUser = await User.findByLegacyId(r.coordinator_id).catch(() => null);
          }
        }

        // Fetch stakeholder info if request was made by stakeholder
        let stakeholderUser = null;
        if (r.made_by_role === 'stakeholder' && r.stakeholder_id) {
          if (require('mongoose').Types.ObjectId.isValid(r.stakeholder_id)) {
            stakeholderUser = await User.findById(r.stakeholder_id).catch(() => null);
          } else {
            stakeholderUser = await User.findByLegacyId(r.stakeholder_id).catch(() => null);
          }
        }

        // Populate request district if it's an ObjectId
        if (r.district && typeof r.district === 'string') {
          const district = await require('../../models/index').District.findById(r.district).catch(() => null);
          if (district) r.district = district;
        }

          const plain = {
            ...toPlain(r),
          event: event ? toPlain(event) : null,
          coordinator: coordinatorUser ? {
            id: coordinatorUser._id,
            firstName: coordinatorUser.firstName,
            lastName: coordinatorUser.lastName,
            email: coordinatorUser.email,
            fullName: coordinatorUser.fullName || `${coordinatorUser.firstName} ${coordinatorUser.lastName}`
          } : null,
          stakeholder: stakeholderUser ? {
            id: stakeholderUser._id,
            firstName: stakeholderUser.firstName,
            lastName: stakeholderUser.lastName,
            email: stakeholderUser.email,
            phoneNumber: stakeholderUser.phoneNumber,
            fullName: stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`
          } : null
        };
        try {
          if (stakeholderUser) {
            plain.createdByName = stakeholderUser.fullName || `${stakeholderUser.firstName} ${stakeholderUser.lastName}`;
          } else if (coordinatorUser) {
            plain.createdByName = coordinatorUser.fullName || `${coordinatorUser.firstName} ${coordinatorUser.lastName}`;
          }
        } catch (e) {}
        try {
          const user = req.user || null;
          if (user) {
            const actorRole = user.role || 'system-admin';
            const actorId = user.id || null;
            plain.allowedActions = await eventRequestService.computeAllowedActions(actorRole, actorId, plain, plain.event);
            Object.assign(plain, await eventRequestService.computeActionFlags(actorRole, actorId, plain, plain.event));
          }
        } catch (e) {}
        return plain;
      }));

      return res.status(200).json({
        success: result.success,
        data: enriched,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to retrieve requests' });
    }
  }

  /**
   * Check if coordinator has overlapping requests
   * GET /api/requests/check-overlap
   */
  async checkCoordinatorOverlappingRequests(req, res) {
    try {
      const { coordinatorId, eventDate, excludeRequestId } = req.query;

      if (!coordinatorId || !eventDate) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID and event date are required'
        });
      }

      const hasOverlap = await eventRequestService.checkCoordinatorOverlappingRequests(
        coordinatorId,
        new Date(eventDate),
        excludeRequestId || null
      );

      return res.status(200).json({
        success: true,
        hasOverlap,
        coordinatorId,
        eventDate
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check overlapping requests'
      });
    }
  }

  /**
   * Check if date has double booking (location/venue)
   * GET /api/requests/check-double-booking
   */
  async checkDoubleBooking(req, res) {
    try {
      const { eventDate, location, excludeEventId } = req.query;

      if (!eventDate || !location) {
        return res.status(400).json({
          success: false,
          message: 'Event date and location are required'
        });
      }

      const isDoubleBooked = await eventRequestService.checkDoubleBooking(
        new Date(eventDate),
        location,
        excludeEventId || null
      );

      return res.status(200).json({
        success: true,
        isDoubleBooked,
        eventDate,
        location
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check double booking'
      });
    }
  }

  /**
   * Validate all scheduling rules
   * POST /api/requests/validate
   */
  async validateSchedulingRules(req, res) {
    try {
      const { coordinatorId, eventData, excludeRequestId } = req.body;

      if (!coordinatorId || !eventData) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID and event data are required'
        });
      }

      const validation = await eventRequestService.validateSchedulingRules(
        coordinatorId,
        eventData,
        excludeRequestId || null
      );

      return res.status(200).json({
        success: true,
        validation
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate scheduling rules'
      });
    }
  }

  /**
   * Get total blood bags for a specific date
   * GET /api/requests/blood-bags/:date
   */
  async getTotalBloodBagsForDate(req, res) {
    try {
      const { date } = req.params;
      
      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Date is required'
        });
      }

      const totalBags = await eventRequestService.getTotalBloodBagsForDate(new Date(date));

      return res.status(200).json({
        success: true,
        date,
        totalBags
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get total blood bags'
      });
    }
  }

  /**
   * Execute unified request action (role-agnostic)
   * POST /api/requests/:requestId/actions
   */
  async executeRequestAction(req, res) {
    try {
      const { requestId } = req.params;
      const { action, data = {} } = req.validatedData || req.body;
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!action) {
        return res.status(400).json({
          success: false,
          message: 'Action is required'
        });
      }

      const requestActionService = require('../../services/request_services/requestAction.service');
      const result = await requestActionService.executeAction(requestId, userId, action, data);

      return res.status(200).json({
        success: true,
        message: `Action ${action} executed successfully`,
        data: result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to execute action'
      });
    }
  }

  /**
   * Get available actions for a user on a request
   * GET /api/requests/:requestId/actions
   */
  async getAvailableActions(req, res) {
    try {
      const { requestId } = req.params;
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const requestActionService = require('../../services/request_services/requestAction.service');
      const availableActions = await requestActionService.getAvailableActions(userId, requestId);

      return res.status(200).json({
        success: true,
        data: { actions: availableActions }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get available actions'
      });
    }
  }

  /**
   * PHASE 2 - Unified Review Decision Endpoint
   * POST /api/requests/:requestId/review-decision
   * Consolidated endpoint for reviewers to accept/reject/reschedule requests
   * Validates authority hierarchy and permissions
   * 
   * @param action - 'accept' | 'reject' | 'reschedule'
   * @param notes - Optional decision notes
   * @param proposedDate - Required if action is 'reschedule'
   * @param proposedStartTime - Optional start time for rescheduled event
   */
  async reviewDecision(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { action, notes, proposedDate, proposedStartTime } = req.body;
      
      // Validate action
      if (!['accept', 'reject', 'reschedule'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Must be one of: accept, reject, reschedule'
        });
      }

      // Get request to check authority hierarchy
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
      }

      // Get requester and reviewer user documents for authority comparison
      const requester = request.made_by_id ? 
        await User.findById(request.made_by_id).select('authority') : null;
      const reviewer = await User.findById(user.id).select('authority');

      const reviewerAuthority = reviewer?.authority || 20;
      const requesterAuthority = requester?.authority || 20;
      const isSystemAdmin = reviewerAuthority >= 100;

      // Check permission based on action
      const permissionMap = {
        'accept': 'request.review',
        'reject': 'request.reject',
        'reschedule': 'request.reschedule'
      };
      
      const { PermissionService } = require('../../services/users_services');
      const permissionService = new PermissionService();
      const hasPermission = await permissionService.checkPermission(
        user.id,
        'request',
        action === 'accept' ? 'review' : action,
        { locationId: request.location?.district }
      );

      if (!hasPermission && !isSystemAdmin) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions for action: ${action}`,
          reason: 'INSUFFICIENT_PERMISSION',
          requiredPermission: `request.${action}`
        });
      }

      // Validate authority hierarchy
      if (!isSystemAdmin && reviewerAuthority < requesterAuthority) {
        return res.status(403).json({
          success: false,
          message: `Cannot ${action} request from higher-authority requester`,
          reason: 'AUTHORITY_INSUFFICIENT',
          reviewerAuthority,
          requesterAuthority
        });
      }

      // Validate reschedule parameters
      if (action === 'reschedule' && !proposedDate) {
        return res.status(400).json({
          success: false,
          message: 'proposedDate is required for reschedule action'
        });
      }

      // Call state machine to process action
      const result = await eventRequestService.processRequestActionWithStateMachine(
        requestId,
        user.id,
        action,
        {
          notes,
          proposedDate: proposedDate ? new Date(proposedDate) : null,
          proposedStartTime,
          permissionUsed: `request.${action}`,
          actorAuthority: reviewerAuthority
        }
      );

      return res.status(200).json({
        success: result.success,
        message: `Request ${action} completed successfully`,
        data: {
          request: result.request,
          event: result.event || null,
          action
        }
      });
    } catch (error) {
      console.error('[reviewDecision] Error:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || `Failed to ${req.body.action} request`
      });
    }
  }

  /**
   * PHASE 2 - Unified Confirmation Endpoint
   * POST /api/requests/:requestId/confirm
   * Requester confirms reviewer's decision (accept or reschedule proposal)
   * Requires CAN_CONFIRM_REQUESTS permission and requester identity
   */
  async confirmDecision(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { action, notes } = req.body;
      
      // Validate action
      if (!['confirm', 'decline', 'revise'].includes(action)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action. Must be one of: confirm, decline, revise'
        });
      }

      // Get request
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
      }

      // Verify requester is calling
      const isRequester = request.made_by_id && String(request.made_by_id) === String(user.id);
      if (!isRequester && user.authority < 100) {
        return res.status(403).json({
          success: false,
          message: 'Only the requester can confirm this decision',
          reason: 'NOT_REQUESTER'
        });
      }

      // Check permission
      const { PermissionService } = require('../../services/users_services');
      const permissionService = new PermissionService();
      const hasPermission = await permissionService.checkPermission(
        user.id,
        'request',
        'confirm',
        { locationId: request.location?.district }
      );

      if (!hasPermission && !isRequester) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to confirm this decision',
          reason: 'INSUFFICIENT_PERMISSION',
          requiredPermission: 'request.confirm'
        });
      }

      // Call state machine to process confirmation
      const result = await eventRequestService.processRequestActionWithStateMachine(
        requestId,
        user.id,
        action, // 'confirm', 'decline', or 'revise'
        {
          notes,
          permissionUsed: 'request.confirm'
        }
      );

      return res.status(200).json({
        success: result.success,
        message: `Request ${action}ed successfully`,
        data: {
          request: result.request,
          event: result.event || null,
          action
        }
      });
    } catch (error) {
      console.error('[confirmDecision] Error:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to confirm decision'
      });
    }
  }

  /**
   * PHASE 2 - Direct Event Creation (Decoupled from Request)
   * POST /api/events
   * Create event directly without request workflow
   * Authority-based restrictions apply
   */
  async createEvent(req, res) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const { title, location, startDate, endDate, category, coordinatorId, stakeholderId, email, phoneNumber, phone } = req.body;
      
      // Validate required fields
      if (!title || !location || !startDate || !category) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: title, location, startDate, category'
        });
      }

      // Check permission
      const { PermissionService } = require('../../services/users_services');
      const permissionService = new PermissionService();
      const hasPermission = await permissionService.checkPermission(
        user.id,
        'event',
        'create'
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to create events',
          reason: 'INSUFFICIENT_PERMISSION',
          requiredPermission: 'event.create'
        });
      }

      // Authority validation and field locking
      const userDoc = await User.findById(user.id).select('authority organizations coverageAreas email phoneNumber');
      const userAuthority = userDoc?.authority || 20;
      const isAdmin = userAuthority >= 80;
      const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');
      const isStakeholder = userAuthority < AUTHORITY_TIERS.COORDINATOR;

      let finalCoordinatorId = coordinatorId;
      let finalStakeholderId = stakeholderId;

      // Handle stakeholder case: auto-resolve coordinator and set stakeholder to self
      if (isStakeholder) {
        console.log('[createEvent] Stakeholder creating event - auto-resolving coordinator');
        
        // Auto-set stakeholder to requester
        finalStakeholderId = user.id;
        
        // Auto-resolve coordinator if not provided
        if (!finalCoordinatorId) {
          try {
            const stakeholder = await User.findById(user.id) || await User.findByLegacyId(user.id);
            
            if (stakeholder && stakeholder.locations && stakeholder.locations.municipalityId) {
              // Get stakeholder's organization and municipality
              const stakeholderOrgIds = new Set();
              if (stakeholder.organizations && stakeholder.organizations.length > 0) {
                stakeholder.organizations.forEach(org => {
                  if (org.isActive !== false && org.organizationId) {
                    stakeholderOrgIds.add(org.organizationId.toString());
                  }
                });
              }
              
              const stakeholderMunicipalityId = stakeholder.locations.municipalityId.toString();
              
              // Find matching coordinator
              const coordinators = await User.find({
                authority: { $gte: AUTHORITY_TIERS.COORDINATOR },
                isActive: true
              }).select('_id organizations coverageAreas');
              
              for (const coordinator of coordinators) {
                // Check organization match
                const coordinatorOrgIds = new Set();
                if (coordinator.organizations && coordinator.organizations.length > 0) {
                  coordinator.organizations.forEach(org => {
                    if (org.isActive !== false && org.organizationId) {
                      coordinatorOrgIds.add(org.organizationId.toString());
                    }
                  });
                }
                
                let orgMatch = false;
                if (stakeholderOrgIds.size > 0 && coordinatorOrgIds.size > 0) {
                  for (const stakeholderOrgId of stakeholderOrgIds) {
                    if (coordinatorOrgIds.has(stakeholderOrgId)) {
                      orgMatch = true;
                      break;
                    }
                  }
                }
                
                if (!orgMatch && stakeholderOrgIds.size > 0) {
                  continue;
                }
                
                // Check municipality match
                const coordinatorMunicipalityIds = new Set();
                if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
                  coordinator.coverageAreas.forEach(ca => {
                    if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
                      ca.municipalityIds.forEach(muniId => {
                        if (muniId) {
                          coordinatorMunicipalityIds.add(muniId.toString());
                        }
                      });
                    }
                  });
                }
                
                if (coordinatorMunicipalityIds.has(stakeholderMunicipalityId)) {
                  finalCoordinatorId = coordinator._id.toString();
                  console.log('[createEvent] Auto-resolved coordinator:', finalCoordinatorId);
                  break;
                }
              }
            }
          } catch (error) {
            console.error('[createEvent] Error auto-resolving coordinator:', error);
            // Continue without coordinator - will fail validation later
          }
        }
      } else {
        // Coordinator or SysAdmin: use existing logic
        // LOCK: Non-admins cannot change coordinator field
        if (!isAdmin) {
          finalCoordinatorId = user.id;
        }

        // RESTRICT: Non-admins cannot select stakeholders outside their jurisdiction
        if (!isAdmin && finalStakeholderId) {
          const organizationIds = userDoc.organizations.map(org => org.organizationId);
          const municipalityIds = userDoc.coverageAreas.flatMap(ca => ca.municipalityIds || []);
          
          const stakeholder = await User.findById(finalStakeholderId).select('locations.municipalityId organizations');
          if (stakeholder) {
            const stakeholderOrgs = stakeholder.organizations.map(org => org.organizationId);
            const stakeholderMunicipality = stakeholder.locations?.municipalityId;
            
            // Check if stakeholder is in coordinator's jurisdiction
            const inOrg = stakeholderOrgs.some(id => organizationIds.includes(id));
            const inMunicipality = stakeholderMunicipality && municipalityIds.includes(stakeholderMunicipality);
            
            if (!inOrg && !inMunicipality) {
              return res.status(400).json({
                success: false,
                message: 'Stakeholder not in authorized scope',
                reason: 'STAKEHOLDER_OUT_OF_SCOPE'
              });
            }
          }
        }
      }

      if (!finalCoordinatorId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID is required'
        });
      }

      // Create event data with Email and Phone_Number
      const eventData = {
        Event_Title: title,
        Location: location,
        Start_Date: new Date(startDate),
        End_Date: endDate ? new Date(endDate) : null,
        Category: category,
        coordinator_id: finalCoordinatorId,
        stakeholder_id: finalStakeholderId,
        made_by_id: user.id,
        Status: 'Pending',
        // Include Email and Phone_Number from request body or user data
        Email: email || userDoc?.email || '',
        Phone_Number: phoneNumber || phone || userDoc?.phoneNumber || ''
      };

      const result = await eventRequestService.createEventRequest(finalCoordinatorId, eventData);

      return res.status(201).json({
        success: result.success,
        message: 'Event created successfully',
        data: {
          Event_ID: result.Event_ID,
          Request_ID: result.Request_ID,
          event: result.event
        }
      });
    } catch (error) {
      console.error('[createEvent] Error:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create event'
      });
    }
  }

  /**
   * PHASE 2 - Publish Event
   * POST /api/events/:eventId/publish
   * Publish/complete an event that has been approved
   */
  async publishEvent(req, res) {
    try {
      const { eventId } = req.params;
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Check permission (requires event.publish OR request.approve)
      const { PermissionService } = require('../../services/users_services');
      const permissionService = new PermissionService();
      const canPublish = await permissionService.checkPermission(user.id, 'event', 'publish');
      const canApprove = await permissionService.checkPermission(user.id, 'request', 'approve');

      if (!canPublish && !canApprove && user.authority < 100) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to publish events',
          reason: 'INSUFFICIENT_PERMISSION',
          requiredPermission: 'event.publish OR request.approve'
        });
      }

      // Get event
      const { Event } = require('../../models/index');
      const event = await Event.findOne({ Event_ID: eventId });
      if (!event) {
        return res.status(404).json({ success: false, message: 'Event not found' });
      }

      // Find linked request if exists
      let request = null;
      if (event.Event_ID) {
        request = await EventRequest.findOne({ Event_ID: event.Event_ID });
      }

      // Verify event is eligible for publishing
      if (!event.Event_Title || !event.Location || !event.Start_Date) {
        return res.status(400).json({
          success: false,
          message: 'Event missing required fields for publishing',
          reason: 'EVENT_INCOMPLETE',
          missingFields: []
        });
      }

      // Update event status
      event.Status = 'Completed';
      await event.save();

      // Update linked request if exists
      if (request) {
        request.Status = 'APPROVED';
        await request.save();
      }

      // Log audit trail
      console.log(`[publishEvent] Event ${eventId} published by ${user.id}`, {
        eventId,
        publishedBy: user.id,
        eventTitle: event.Event_Title,
        linkedRequest: request?.Request_ID || null
      });

      return res.status(200).json({
        success: true,
        message: 'Event published successfully',
        data: {
          Event_ID: eventId,
          Status: 'Completed',
          linkedRequest: request ? { Request_ID: request.Request_ID, Status: 'APPROVED' } : null
        }
      });
    } catch (error) {
      console.error('[publishEvent] Error:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to publish event'
      });
    }
  }

  /**
   * PHASE 2 - Assign Coordinator
   * POST /api/requests/:requestId/assign-coordinator
   * Admin endpoint to list/assign coordinators in same jurisdiction
   * Handles multiple coordinators with isPrimary flag
   */
  async assignCoordinator(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user;
      
      if (!user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      // Admin-only endpoint
      if ((user.authority || 20) < 100) {
        return res.status(403).json({
          success: false,
          message: 'Only system admins can assign coordinators',
          reason: 'ADMIN_ONLY'
        });
      }

      // Get request
      const request = await EventRequest.findOne({ Request_ID: requestId });
      if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
      }

      // Get requester's authority
      const requester = request.made_by_id ? 
        await User.findById(request.made_by_id).select('authority') : null;
      const requesterAuthority = requester?.authority || 20;

      // Find coordinators in same organization and municipality
      const organizationId = request.organizationId; // Assumes request has organizationId field
      const municipalityId = request.location?.municipality || request.municipality;

      let query = { authority: { $gte: 60 } }; // Coordinators are >= 60 authority
      
      if (organizationId) {
        query['organizations.organizationId'] = organizationId;
      }
      
      if (municipalityId) {
        query['coverageAreas.municipalityIds'] = municipalityId;
      }

      const coordinators = await User.find(query).select('_id firstName lastName email authority organizations');

      // Sort by isPrimary flag (not yet implemented in User model, but shown for future)
      const formatted = coordinators.map(coord => ({
        id: coord._id,
        name: `${coord.firstName} ${coord.lastName}`,
        email: coord.email,
        authority: coord.authority,
        organizations: coord.organizations.map(org => org.organizationId),
        authorityQualified: coord.authority >= requesterAuthority,
        isPrimary: coord.organizations.some(org => String(org.organizationId) === String(organizationId)) // Heuristic
      }));

      // If only one coordinator, auto-assign
      if (formatted.length === 1) {
        const coordinator = formatted[0];
        request.coordinator_id = coordinator.id;
        request.reviewer = {
          id: coordinator.id,
          role: 'coordinator',
          authority: coordinator.authority
        };
        await request.save();

        return res.status(200).json({
          success: true,
          message: 'Coordinator auto-assigned',
          data: {
            request: request,
            assignedCoordinator: coordinator,
            autoAssigned: true
          }
        });
      }

      // If multiple, return list for selection
      if (formatted.length > 1) {
        return res.status(200).json({
          success: true,
          message: 'Multiple coordinators available - please select',
          data: {
            coordinators: formatted.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)),
            requiresSelection: true,
            hint: 'Coordinators marked isPrimary=true are recommended'
          }
        });
      }

      // No coordinators found
      return res.status(400).json({
        success: false,
        message: 'No qualified coordinators found for this request',
        reason: 'NO_COORDINATORS_AVAILABLE',
        searched: {
          organization: organizationId,
          municipality: municipalityId,
          requiredAuthority: `>= ${requesterAuthority}`
        }
      });
    } catch (error) {
      console.error('[assignCoordinator] Error:', error.message);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to assign coordinator'
      });
    }
  }
}

module.exports = new EventRequestController();

