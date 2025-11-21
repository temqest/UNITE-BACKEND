const eventRequestService = require('../../services/request_services/eventRequest.service');

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
   */
  async createEventRequest(req, res) {
    try {
      // Prefer deriving actor identity from authenticated token when available
      const user = req.user || null;
      const body = req.body || {};

      // Accept coordinatorId from body (common frontend key), or fallback to other possible names
      let coordinatorId = body.coordinatorId || body.Coordinator_ID || body.coordinator || null;
      const eventData = { ...body };

      // If authenticated user is a Coordinator, prefer their id when coordinatorId missing
      if (!coordinatorId && user && (user.staff_type === 'Coordinator' || user.role === 'Coordinator')) {
        coordinatorId = user.Coordinator_ID || user.CoordinatorId || user.id || null;
      }

      // Tag actor info on eventData for service-level validation logic
      if (user) {
        const role = user.staff_type || user.role || null;
        const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;
        if (role) eventData._actorRole = role;
        if (actorId) eventData._actorId = actorId;

        // If authenticated user is a Stakeholder, record them as the creator of this request
        if (role === 'Stakeholder' || role === 'stakeholder') {
          eventData.stakeholder_id = eventData.stakeholder_id || eventData.Stakeholder_ID || eventData.MadeByStakeholderID || user.Stakeholder_ID || user.StakeholderId || user.id || null;
          // If coordinatorId is missing but stakeholder belongs to a coordinator, derive it
          if (!coordinatorId && (user.Coordinator_ID || user.CoordinatorId)) {
            coordinatorId = user.Coordinator_ID || user.CoordinatorId;
          }
        }

        // If user is Coordinator and coordinatorId missing, prefer their id
        if (!coordinatorId && (role === 'Coordinator' || role === 'coordinator')) {
          coordinatorId = user.Coordinator_ID || user.CoordinatorId || user.id || null;
        }
      }

      if (!coordinatorId) {
        return res.status(400).json({ success: false, message: 'Coordinator ID is required' });
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
  async createImmediateEvent(req, res) {
    try {
      // Prefer deriving creator identity from authenticated token if present.
      // For legacy clients (no token) we still accept creatorId/creatorRole in the body.
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

      // Convert "Admin" to "SystemAdmin" for enum compatibility
      if (creatorRole === 'Admin') {
        creatorRole = 'SystemAdmin';
      }

      if (user) {
        // Determine role and id from token
        const inferredRole = user.staff_type || user.role || null;
        const inferredId = user.Admin_ID || user.Coordinator_ID || user.id || user.Stakeholder_ID || null;
        if (inferredRole) creatorRole = creatorRole || inferredRole;
        if (inferredId) creatorId = creatorId || inferredId;
      }

      if (!creatorId || !creatorRole) {
        return res.status(400).json({ success: false, message: 'creatorId and creatorRole are required' });
      }

      const result = await eventRequestService.createImmediateEvent(creatorId, creatorRole, eventData);

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
          const actorRole = user.staff_type || user.role || null;
          const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;
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

      // Determine actor roles from token
      const actorIsAdmin = !!(user.role === 'Admin' || user.staff_type === 'Admin');
      const actorIsCoordinator = !!(user.role === 'Coordinator' || user.staff_type === 'Coordinator');
      const actorIsStakeholder = !!(user.role === 'Stakeholder' || user.staff_type === 'Stakeholder');
      const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;

      if (!actorIsAdmin && !actorIsCoordinator && !actorIsStakeholder) {
        return res.status(403).json({ success: false, message: 'Unable to determine actor role from authentication token' });
      }

        const result = await eventRequestService.updateEventRequest(requestId, actorId, updateData, actorIsAdmin, actorIsCoordinator, actorIsStakeholder);

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
  async adminAcceptRequest(req, res) {
    try {
      const { requestId } = req.params;
      // Derive actor from authenticated token
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
      
      const actorRole = user.staff_type || user.role;
      if (!['Admin', 'Coordinator', 'Stakeholder'].includes(actorRole)) {
        return res.status(403).json({ success: false, message: 'Invalid actor role' });
      }

      const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;
      const { action, note, rescheduledDate } = req.body;
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
        if (user.Admin_ID) adminId = user.Admin_ID;
        else if (user.Coordinator_ID) adminId = user.Coordinator_ID;
        else if (user.id) adminId = user.id;
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

      const result = await eventRequestService.coordinatorConfirmRequest(coordinatorId, requestId, action);

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
      if (!(user.role === 'Coordinator' || user.staff_type === 'Coordinator')) {
        return res.status(403).json({ success: false, message: 'Only coordinators may perform this action' });
      }

      const actorId = user.Coordinator_ID || user.id || null;
      const { action, note, rescheduledDate } = req.body;
      const actionData = {
        action,
        note,
        rescheduledDate: rescheduledDate ? new Date(rescheduledDate) : null
      };

      const result = await eventRequestService.processRequestAction(actorId, 'Coordinator', requestId, actionData);

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
      if (!(user.role === 'Stakeholder' || user.staff_type === 'Stakeholder')) {
        return res.status(403).json({ success: false, message: 'Only stakeholders may perform this action' });
      }

      const actorId = user.Stakeholder_ID || user.id || null;
      const { action, note, rescheduledDate } = req.body;
      const actionData = {
        action,
        note,
        rescheduledDate: rescheduledDate ? new Date(rescheduledDate) : null
      };

      const result = await eventRequestService.processRequestAction(actorId, 'Stakeholder', requestId, actionData);

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
   */
  async stakeholderConfirmRequest(req, res) {
    try {
      const { requestId } = req.params;
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
      if (!(user.role === 'Stakeholder' || user.staff_type === 'Stakeholder')) {
        return res.status(403).json({ success: false, message: 'Only stakeholders may perform this action' });
      }

      const stakeholderId = user.Stakeholder_ID || user.id || null;
      const { action } = req.body;
      if (!action) {
        return res.status(400).json({ success: false, message: 'Action is required' });
      }

      const result = await eventRequestService.stakeholderConfirmRequest(stakeholderId, requestId, action);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to record stakeholder confirmation'
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
      let actorRole = user.staff_type || user.role;
      let actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id;

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
      let actorRole = user.staff_type || user.role;
      let actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id;

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

      // Enrich each request with its event and coordinator/staff info for frontend convenience
      const enriched = await Promise.all(result.requests.map(async (r) => {
        const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);
        const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.coordinator_id }).catch(() => null);
        const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.coordinator_id }).catch(() => null);
        // Fetch district details if coordinator has District_ID
        let districtInfo = null;
        try {
          if (coordinator && coordinator.District_ID) {
            districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
          }
        } catch (e) {
          districtInfo = null;
        }

        // Fetch stakeholder info if request was made by stakeholder
        let stakeholder = null;
        let stakeholderDistrict = null;
        if (r.made_by_role === 'Stakeholder' && r.stakeholder_id) {
          stakeholder = await require('../../models/index').Stakeholder.findOne({ Stakeholder_ID: r.stakeholder_id ? r.stakeholder_id.toString().trim() : r.stakeholder_id }).catch(() => null);
          if (stakeholder) {
            stakeholderDistrict = await require('../../models/index').District.findOne({ _id: stakeholder.district }).catch(() => null);
          }
        }

        const plain = {
          ...toPlain(r),
          event: event ? toPlain(event) : null,
          coordinator: coordinator ? {
            ...toPlain(coordinator),
            staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
            District_Name: districtInfo ? districtInfo.District_Name : undefined,
            District_Number: districtInfo ? districtInfo.District_Number : undefined
          } : null,
          stakeholder: stakeholder ? {
            ...toPlain(stakeholder),
            staff: stakeholder ? {
              First_Name: stakeholder.firstName,
              Last_Name: stakeholder.lastName,
              Email: stakeholder.email,
              Phone_Number: stakeholder.phoneNumber
            } : null,
            District_Name: stakeholderDistrict ? stakeholderDistrict.District_Name : undefined,
            District_Number: stakeholderDistrict ? stakeholderDistrict.District_Number : undefined
          } : null
        };
        try {
          // Attach creator display name: prefer stakeholder full name when present
          const models = require('../../models/index');
          if (plain.stakeholder_id) {
            try {
              const st = await models.Stakeholder.findOne({ Stakeholder_ID: plain.stakeholder_id }).catch(() => null);
              if (st) {
                              if (st) plain.createdByName = `${(st.firstName || '').toString().trim()} ${(st.lastName || '').toString().trim()}`.trim();
              }
            } catch (e) { /* ignore */ }
          }
          if (!plain.createdByName) {
            plain.createdByName = staff ? `${staff.First_Name} ${staff.Last_Name}` : (coordinator ? (coordinator.Coordinator_Name || coordinator.Name || null) : null);
          }
        } catch (e) {}
        try {
          const actorRole = 'Coordinator';
          const actorId = coordinator && (coordinator.Coordinator_ID || coordinator.Id) ? (coordinator.Coordinator_ID || coordinator.Id) : coordinatorId;
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
   * Get requests for the authenticated user (role-aware)
   * GET /api/requests/me
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

      // Admin
      if (user.staff_type === 'Admin' || user.role === 'Admin') {
        // If admin applied a status filter for pending requests, use getPendingRequests
        // Otherwise use a filtered query so status/coordinator/date/search filters are honored
        let result;
        if (filters.status === 'Pending_Admin_Review') {
          result = await eventRequestService.getPendingRequests(filters, page, limit);
        } else if (Object.keys(filters).length > 0) {
          // Use filtered method (honors status, coordinator, date range, search)
          result = await eventRequestService.getFilteredRequests(filters, page, limit);
        } else {
          result = await eventRequestService.getAllRequests(page, limit);
        }
          // Enrich similar to getAllRequests controller behavior
        const enriched = await Promise.all(result.requests.map(async (r) => {
          const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);
          const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.coordinator_id }).catch(() => null);
          const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.coordinator_id }).catch(() => null);
          let districtInfo = null;
          try {
            if (coordinator && coordinator.District_ID) {
              districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
            }
          } catch (e) { districtInfo = null; }

          // Fetch stakeholder info if request was made by stakeholder
          let stakeholder = null;
          let stakeholderDistrict = null;
          if (r.made_by_role === 'Stakeholder' && r.stakeholder_id) {
            stakeholder = await require('../../models/index').Stakeholder.findOne({ _id: r.stakeholder_id }).catch(() => null);
            if (stakeholder) {
              stakeholderDistrict = await require('../../models/index').District.findOne({ _id: stakeholder.district }).catch(() => null);
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
            coordinator: coordinator ? {
              ...toPlain(coordinator),
              staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
              District_Name: districtInfo ? districtInfo.name : undefined,
              District_Number: districtInfo ? districtInfo.code : undefined
            } : null,
            stakeholder: stakeholder ? {
              ...toPlain(stakeholder),
              staff: stakeholder ? {
                First_Name: stakeholder.firstName,
                Last_Name: stakeholder.lastName,
                Email: stakeholder.email,
                Phone_Number: stakeholder.phoneNumber
              } : null,
              District_Name: stakeholderDistrict ? stakeholderDistrict.name : undefined,
              District_Number: stakeholderDistrict ? stakeholderDistrict.code : undefined
            } : null
          };
          try {
            const models = require('../../models/index');
            if (plain.made_by_role === 'Stakeholder' && plain.made_by_id) {
              const st = await models.Stakeholder.findOne({ _id: plain.made_by_id ? plain.made_by_id.toString().trim() : plain.made_by_id }).catch(() => null);
              if (st) plain.createdByName = `${(st.firstName || '').toString().trim()} ${(st.lastName || '').toString().trim()}`.trim();
            }
            if (!plain.createdByName && plain.stakeholder_id) {
              const st = await models.Stakeholder.findOne({ Stakeholder_ID: plain.stakeholder_id ? plain.stakeholder_id.toString().trim() : plain.stakeholder_id }).catch(() => null);
              if (st) plain.createdByName = `${(st.firstName || '').toString().trim()} ${(st.lastName || '').toString().trim()}`.trim();
            }
            if (!plain.createdByName) plain.createdByName = staff ? `${staff.First_Name} ${staff.Last_Name}` : (coordinator ? (coordinator.Coordinator_Name || coordinator.Name || null) : null);
          } catch (e) {}
          try {
            const actorRole = user.staff_type || user.role || 'Admin';
            const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;
            plain.allowedActions = await eventRequestService.computeAllowedActions(actorRole, actorId, plain, plain.event);
            Object.assign(plain, await eventRequestService.computeActionFlags(actorRole, actorId, plain, plain.event));
          } catch (e) {}
          return plain;
        }));

        return res.status(200).json({ success: true, data: enriched, pagination: result.pagination });
      }

      // Coordinator
      if (user.staff_type === 'Coordinator' || user.role === 'Coordinator') {
        const coordinatorId = user.Coordinator_ID || user.id || user.CoordinatorId || user.CoordinatorId;
        const result = await eventRequestService.getCoordinatorRequests(coordinatorId, filters, page, limit);
        // Enrich each request similar to getCoordinatorRequests
        const enriched = await Promise.all(result.requests.map(async (r) => {
          const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);
          const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.coordinator_id }).catch(() => null);
          const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.coordinator_id }).catch(() => null);
          let districtInfo = null;
          try {
            if (coordinator && coordinator.District_ID) {
              districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
            }
          } catch (e) { districtInfo = null; }

          // Fetch stakeholder info if request was made by stakeholder
          let stakeholder = null;
          let stakeholderDistrict = null;
          if (r.made_by_role === 'Stakeholder' && r.stakeholder_id) {
            stakeholder = await require('../../models/index').Stakeholder.findOne({ Stakeholder_ID: r.stakeholder_id ? r.stakeholder_id.toString().trim() : r.stakeholder_id }).catch(() => null);
            if (stakeholder) {
              stakeholderDistrict = await require('../../models/index').District.findOne({ _id: stakeholder.district }).catch(() => null);
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
            coordinator: coordinator ? {
              ...toPlain(coordinator),
              staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
              District_Name: districtInfo ? districtInfo.name : undefined,
              District_Number: districtInfo ? districtInfo.code : undefined
            } : null,
            stakeholder: stakeholder ? {
              ...toPlain(stakeholder),
              staff: stakeholder ? {
                First_Name: stakeholder.firstName,
                Last_Name: stakeholder.lastName,
                Email: stakeholder.email,
                Phone_Number: stakeholder.phoneNumber
              } : null,
              District_Name: stakeholderDistrict ? stakeholderDistrict.name : undefined,
              District_Number: stakeholderDistrict ? stakeholderDistrict.code : undefined
            } : null
          };
          try {
            const models = require('../../models/index');
            if (plain.stakeholder_id) {
              const st = await models.Stakeholder.findOne({ Stakeholder_ID: plain.stakeholder_id ? plain.stakeholder_id.toString().trim() : plain.stakeholder_id }).catch(() => null);
              if (st) plain.createdByName = `${(st.firstName || '').toString().trim()} ${(st.lastName || '').toString().trim()}`.trim();
            }
            if (!plain.createdByName) plain.createdByName = staff ? `${staff.First_Name} ${staff.Last_Name}` : (coordinator ? (coordinator.Coordinator_Name || coordinator.Name || null) : null);
          } catch (e) {}
          try {
            const actorRole = 'Coordinator';
            const actorId = coordinatorId;
            plain.allowedActions = await eventRequestService.computeAllowedActions(actorRole, actorId, plain, plain.event);
            Object.assign(plain, await eventRequestService.computeActionFlags(actorRole, actorId, plain, plain.event));
          } catch (e) {}
          return plain;
        }));

        return res.status(200).json({ success: true, data: enriched, pagination: result.pagination });
      }

      // Stakeholder
      const stakeholderId = user.Stakeholder_ID || user.StakeholderId || user.id || user.StakeholderId;
      if (stakeholderId) {
        const result = await eventRequestService.getRequestsByStakeholder(stakeholderId, page, limit);
        // Enrich each returned request with allowedActions for this stakeholder
        const enriched = await Promise.all(result.requests.map(async (r) => {
          const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);

          // Populate request district if it's an ObjectId
          if (r.district && typeof r.district === 'string') {
            const district = await require('../../models/index').District.findById(r.district).catch(() => null);
            if (district) r.district = district;
          }

          const plain = { ...toPlain(r), event: event ? toPlain(event) : null };
          
          // For stakeholder's own requests, populate stakeholder data
          if (r.made_by_role === 'Stakeholder' && r.stakeholder_id) {
            const stakeholder = await require('../../models/index').Stakeholder.findOne({ Stakeholder_ID: r.stakeholder_id ? r.stakeholder_id.toString().trim() : r.stakeholder_id }).catch(() => null);
            let stakeholderDistrict = null;
            if (stakeholder) {
              stakeholderDistrict = await require('../../models/index').District.findOne({ _id: stakeholder.district }).catch(() => null);
            }
            plain.stakeholder = stakeholder ? {
              ...toPlain(stakeholder),
              staff: stakeholder ? {
                First_Name: stakeholder.firstName,
                Last_Name: stakeholder.lastName,
                Email: stakeholder.email,
                Phone_Number: stakeholder.phoneNumber
              } : null,
              District_Name: stakeholderDistrict ? stakeholderDistrict.name : undefined,
              District_Number: stakeholderDistrict ? stakeholderDistrict.code : undefined
            } : null;
          }
          
          try {
            const models = require('../../models/index');
            if (plain.stakeholder_id) {
              const st = await models.Stakeholder.findOne({ Stakeholder_ID: plain.stakeholder_id }).catch(() => null);
              if (st) plain.createdByName = `${(st.firstName || '').toString().trim()} ${(st.lastName || '').toString().trim()}`.trim();
            }
            if (!plain.createdByName) plain.createdByName = null;
          } catch (e) {}
          try {
            const allowed = await eventRequestService.computeAllowedActions('Stakeholder', stakeholderId, plain, plain.event);
            const flags = await eventRequestService.computeActionFlags('Stakeholder', stakeholderId, plain, plain.event);
            plain.allowedActions = allowed;
            Object.assign(plain, flags);
            return plain;
          } catch (e) {
            return { ...toPlain(r), event: event ? toPlain(event) : null };
          }
        }));

        return res.status(200).json({ success: true, data: enriched, pagination: result.pagination });
      }

      return res.status(403).json({ success: false, message: 'Unable to determine user role or id' });
    } catch (error) {
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
      const actorRole = user ? (user.staff_type || user.role) : null;
      const actorId = user ? (user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null) : null;

      const enriched = await Promise.all(result.requests.map(async (r) => {
        try {
          const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);

          // Populate request district if it's an ObjectId
          if (r.district && typeof r.district === 'string') {
            const district = await require('../../models/index').District.findById(r.district).catch(() => null);
            if (district) r.district = district;
          }

          const plain = { ...toPlain(r), event: event ? toPlain(event) : null };
          
          // For stakeholder requests, populate stakeholder data
          if (r.made_by_role === 'Stakeholder' && r.stakeholder_id) {
            const stakeholder = await require('../../models/index').Stakeholder.findOne({ Stakeholder_ID: r.stakeholder_id ? r.stakeholder_id.toString().trim() : r.stakeholder_id }).catch(() => null);
            let stakeholderDistrict = null;
            if (stakeholder) {
              stakeholderDistrict = await require('../../models/index').District.findOne({ _id: stakeholder.district }).catch(() => null);
            }
            plain.stakeholder = stakeholder ? {
              ...toPlain(stakeholder),
              staff: stakeholder ? {
                First_Name: stakeholder.firstName,
                Last_Name: stakeholder.lastName,
                Email: stakeholder.email,
                Phone_Number: stakeholder.phoneNumber
              } : null,
              District_Name: stakeholderDistrict ? stakeholderDistrict.name : undefined,
              District_Number: stakeholderDistrict ? stakeholderDistrict.code : undefined
            } : null;
          }
          
          try {
            const models = require('../../models/index');
            if (plain.stakeholder_id) {
              const st = await models.Stakeholder.findOne({ Stakeholder_ID: plain.stakeholder_id ? plain.stakeholder_id.toString().trim() : plain.stakeholder_id }).catch(() => null);
              if (st) plain.createdByName = `${(st.firstName || '').toString().trim()} ${(st.lastName || '').toString().trim()}`.trim();
            }
            if (!plain.createdByName) plain.createdByName = null;
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
        const actorRole = user.staff_type || user.role || null;
        const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;
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

      // Enrich requests with event and coordinator/staff info
      const enriched = await Promise.all(result.requests.map(async (r) => {
        const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).populate('district').catch(() => null);
        const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.coordinator_id }).catch(() => null);
        const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.coordinator_id }).catch(() => null);
        let districtInfo = null;
        try {
          if (coordinator && coordinator.District_ID) {
            districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
          }
        } catch (e) {
          districtInfo = null;
        }

        // Fetch stakeholder info if request was made by stakeholder
        let stakeholder = null;
        let stakeholderDistrict = null;
        if (r.made_by_role === 'Stakeholder' && r.stakeholder_id) {
          stakeholder = await require('../../models/index').Stakeholder.findOne({ Stakeholder_ID: r.stakeholder_id ? r.stakeholder_id.toString().trim() : r.stakeholder_id }).catch(() => null);
          if (stakeholder) {
            stakeholderDistrict = await require('../../models/index').District.findOne({ _id: stakeholder.district }).catch(() => null);
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
          coordinator: coordinator ? {
            ...toPlain(coordinator),
            staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
            District_Name: districtInfo ? districtInfo.name : undefined,
            District_Number: districtInfo ? districtInfo.code : undefined
          } : null,
          stakeholder: stakeholder ? {
            ...toPlain(stakeholder),
            staff: stakeholder ? {
              First_Name: stakeholder.firstName,
              Last_Name: stakeholder.lastName,
              Email: stakeholder.email,
              Phone_Number: stakeholder.phoneNumber
            } : null,
            District_Name: stakeholderDistrict ? stakeholderDistrict.name : undefined,
            District_Number: stakeholderDistrict ? stakeholderDistrict.code : undefined
          } : null
        };
        try {
          const models = require('../../models/index');
          if (plain.stakeholder_id) {
            const st = await models.Stakeholder.findOne({ $or: [{ Stakeholder_ID: plain.stakeholder_id }, { _id: plain.stakeholder_id }] }).catch(() => null);
            if (st) plain.createdByName = `${(st.firstName || '').toString().trim()} ${(st.lastName || '').toString().trim()}`.trim();
          }
          if (!plain.createdByName) plain.createdByName = staff ? `${staff.First_Name} ${staff.Last_Name}` : (coordinator ? (coordinator.Coordinator_Name || coordinator.Name || null) : null);
        } catch (e) {}
        try {
          const user = req.user || null;
          if (user) {
            const actorRole = user.staff_type || user.role || 'Admin';
            const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;
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
}

module.exports = new EventRequestController();

