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
      const { coordinatorId } = req.body;
      const updateData = req.body;

      if (!coordinatorId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID is required'
        });
      }

      const result = await eventRequestService.updateEventRequest(requestId, coordinatorId, updateData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.request,
        updatedFields: result.updatedFields
      });
    } catch (error) {
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
      const { adminId, action, note, rescheduledDate } = req.body;

      if (!adminId) {
        return res.status(400).json({
          success: false,
          message: 'Admin ID is required'
        });
      }

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

      return res.status(200).json({
        success: result.success,
        data: result.requests,
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

