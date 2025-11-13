const eventRequestService = require('../../services/request_services/eventRequest.service');

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
      const { coordinatorId } = req.body;
      const eventData = req.body;

      if (!coordinatorId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID is required'
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
   * Immediate event creation (auto-publish for Admin or Coordinator)
   * POST /api/events/direct
   */
  async createImmediateEvent(req, res) {
    try {
      const { creatorId, creatorRole } = req.body;
      const eventData = req.body;

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

      // Determine actor roles from token
      const actorIsAdmin = !!(user.role === 'Admin' || user.staff_type === 'Admin');
      const actorIsCoordinator = !!(user.role === 'Coordinator' || user.staff_type === 'Coordinator');
      const actorIsStakeholder = !!(user.role === 'Stakeholder' || user.staff_type === 'Stakeholder');
      const actorId = user.Admin_ID || user.Coordinator_ID || user.Stakeholder_ID || user.id || null;

      if (!actorIsAdmin && !actorIsCoordinator && !actorIsStakeholder) {
        return res.status(403).json({ success: false, message: 'Unable to determine actor role from authentication token' });
      }

      // (debug logs removed)

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
      // Log error for debugging update failures
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
   * Admin accepts/rejects/reschedules the request
   * POST /api/requests/:requestId/admin-action
   */
  async adminAcceptRequest(req, res) {
    try {
      const { requestId } = req.params;
      // Derive admin id from authenticated token only
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'Authentication required' });
      if (!(user.role === 'Admin' || user.staff_type === 'Admin' || user.role === 'Coordinator' || user.staff_type === 'Coordinator')) {
        return res.status(403).json({ success: false, message: 'Only admins or coordinators may perform this action' });
      }

      const adminId = user.Admin_ID || user.Coordinator_ID || user.id || null;
      const { action, note, rescheduledDate } = req.body;
      const adminAction = {
        action,
        note,
        rescheduledDate: rescheduledDate ? new Date(rescheduledDate) : null
      };

      const result = await eventRequestService.adminAcceptRequest(adminId, requestId, adminAction);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to process admin action'
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
      const { adminId, eventId, staffMembers } = req.body;

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
   * Stakeholder confirms admin/coordinator decision
   * POST /api/requests/:requestId/stakeholder-confirm
   */
  async stakeholderConfirmRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { stakeholderId, action } = req.body;

      if (!stakeholderId) {
        return res.status(400).json({ success: false, message: 'Stakeholder ID is required' });
      }

      if (!action) {
        return res.status(400).json({ success: false, message: 'Action is required' });
      }

      const result = await eventRequestService.stakeholderConfirmRequest(stakeholderId, requestId, action);

      return res.status(200).json({ success: result.success, message: result.message, data: result.request });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message || 'Failed to record stakeholder confirmation' });
    }
  }

  /**
   * Cancel/Delete pending request
   * DELETE /api/requests/:requestId
   */
  async cancelEventRequest(req, res) {
    try {
      const { requestId } = req.params;
      const { coordinatorId } = req.body;

      if (!coordinatorId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID is required'
        });
      }

      const result = await eventRequestService.cancelEventRequest(requestId, coordinatorId);

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
   * Get all requests for coordinator
   * GET /api/requests/coordinator/:coordinatorId
   */
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
        const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).catch(() => null);
        const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.Coordinator_ID }).catch(() => null);
        const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.Coordinator_ID }).catch(() => null);
        // Fetch district details if coordinator has District_ID
        let districtInfo = null;
        try {
          if (coordinator && coordinator.District_ID) {
            districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
          }
        } catch (e) {
          districtInfo = null;
        }

        return {
          ...r.toObject(),
          event: event ? event.toObject() : null,
          coordinator: coordinator ? {
            ...coordinator.toObject(),
            staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
            District_Name: districtInfo ? districtInfo.District_Name : undefined,
            District_Number: districtInfo ? districtInfo.District_Number : undefined
          } : null
        };
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
          const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).catch(() => null);
          const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.Coordinator_ID }).catch(() => null);
          const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.Coordinator_ID }).catch(() => null);
          let districtInfo = null;
          try {
            if (coordinator && coordinator.District_ID) {
              districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
            }
          } catch (e) { districtInfo = null; }

          return {
            ...r.toObject(),
            event: event ? event.toObject() : null,
            coordinator: coordinator ? {
              ...coordinator.toObject(),
              staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
              District_Name: districtInfo ? districtInfo.District_Name : undefined,
              District_Number: districtInfo ? districtInfo.District_Number : undefined
            } : null
          };
        }));

        return res.status(200).json({ success: true, data: enriched, pagination: result.pagination });
      }

      // Coordinator
      if (user.staff_type === 'Coordinator' || user.role === 'Coordinator') {
        const coordinatorId = user.Coordinator_ID || user.id || user.CoordinatorId || user.CoordinatorId;
        const result = await eventRequestService.getCoordinatorRequests(coordinatorId, filters, page, limit);
        // Enrich each request similar to getCoordinatorRequests
        const enriched = await Promise.all(result.requests.map(async (r) => {
          const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).catch(() => null);
          const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.Coordinator_ID }).catch(() => null);
          const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.Coordinator_ID }).catch(() => null);
          let districtInfo = null;
          try {
            if (coordinator && coordinator.District_ID) {
              districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
            }
          } catch (e) { districtInfo = null; }

          return {
            ...r.toObject(),
            event: event ? event.toObject() : null,
            coordinator: coordinator ? {
              ...coordinator.toObject(),
              staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
              District_Name: districtInfo ? districtInfo.District_Name : undefined,
              District_Number: districtInfo ? districtInfo.District_Number : undefined
            } : null
          };
        }));

        return res.status(200).json({ success: true, data: enriched, pagination: result.pagination });
      }

      // Stakeholder
      const stakeholderId = user.Stakeholder_ID || user.StakeholderId || user.id || user.StakeholderId;
      if (stakeholderId) {
        const result = await eventRequestService.getRequestsByStakeholder(stakeholderId, page, limit);
        return res.status(200).json({ success: true, data: result.requests, pagination: result.pagination });
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

      return res.status(200).json({
        success: result.success,
        data: result.requests,
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

      return res.status(200).json({
        success: result.success,
        data: result.requests,
        pagination: result.pagination
      });
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
        const event = await require('../../models/index').Event.findOne({ Event_ID: r.Event_ID }).catch(() => null);
        const coordinator = await require('../../models/index').Coordinator.findOne({ Coordinator_ID: r.Coordinator_ID }).catch(() => null);
        const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.Coordinator_ID }).catch(() => null);
        let districtInfo = null;
        try {
          if (coordinator && coordinator.District_ID) {
            districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
          }
        } catch (e) {
          districtInfo = null;
        }

        return {
          ...r.toObject(),
          event: event ? event.toObject() : null,
          coordinator: coordinator ? {
            ...coordinator.toObject(),
            staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
            District_Name: districtInfo ? districtInfo.District_Name : undefined,
            District_Number: districtInfo ? districtInfo.District_Number : undefined
          } : null
        };
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

