const systemSettingsService = require('../../services/request_services/systemSettings.service');

/**
 * System Settings Controller
 * Handles all HTTP requests related to system settings operations
 */
class SystemSettingsController {
  /**
   * Get all system settings
   * GET /api/settings
   */
  async getSettings(req, res) {
    try {
      const settings = systemSettingsService.getSettings();

      return res.status(200).json({ success: true, data: settings });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve settings'
      });
    }
  }

  /**
   * Get a specific setting
   * GET /api/settings/:settingKey
   */
  async getSetting(req, res) {
    try {
      const { settingKey } = req.params;
      
      const setting = systemSettingsService.getSetting(settingKey);

      if (setting === undefined) {
        return res.status(404).json({
          success: false,
          message: 'Setting not found'
        });
      }

      return res.status(200).json({
        success: true,
        settingKey,
        value: setting
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve setting'
      });
    }
  }

  /**
   * Validate advance booking rules
   * POST /api/settings/validate-advance-booking
   */
  async validateAdvanceBooking(req, res) {
    try {
      const { eventDate } = req.body;

      if (!eventDate) {
        return res.status(400).json({
          success: false,
          message: 'Event date is required'
        });
      }

  const validation = systemSettingsService.validateAdvanceBooking(new Date(eventDate));

      return res.status(200).json({
        success: true,
        validation
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate advance booking'
      });
    }
  }

  /**
   * Validate weekend restriction
   * POST /api/settings/validate-weekend
   */
  async validateWeekendRestriction(req, res) {
    try {
      const { eventDate } = req.body;

      if (!eventDate) {
        return res.status(400).json({
          success: false,
          message: 'Event date is required'
        });
      }

  const validation = systemSettingsService.validateWeekendRestriction(new Date(eventDate));

      return res.status(200).json({
        success: true,
        validation
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate weekend restriction'
      });
    }
  }

  /**
   * Validate pending requests limit
   * POST /api/settings/validate-pending-requests
   */
  async validatePendingRequestsLimit(req, res) {
    try {
      const { pendingCount } = req.body;

      if (pendingCount === undefined || pendingCount === null) {
        return res.status(400).json({
          success: false,
          message: 'Pending count is required'
        });
      }

  const validation = systemSettingsService.validatePendingRequestsLimit(parseInt(pendingCount));

      return res.status(200).json({
        success: true,
        validation
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate pending requests limit'
      });
    }
  }

  /**
   * Get minimum booking date
   * GET /api/settings/min-booking-date
   */
  async getMinBookingDate(req, res) {
    try {
      const minDate = systemSettingsService.getMinBookingDate();
      return res.status(200).json({ success: true, minDate });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get minimum booking date'
      });
    }
  }

  /**
   * Get maximum booking date
   * GET /api/settings/max-booking-date
   */
  async getMaxBookingDate(req, res) {
    try {
      const maxDate = systemSettingsService.getMaxBookingDate();
      return res.status(200).json({ success: true, maxDate });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get maximum booking date'
      });
    }
  }

  /**
   * Check if staff assignment is required
   * GET /api/settings/staff-assignment-required
   */
  async isStaffAssignmentRequired(req, res) {
    try {
      const isRequired = systemSettingsService.isStaffAssignmentRequired();

      return res.status(200).json({
        success: true,
        isRequired
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check staff assignment requirement'
      });
    }
  }

  /**
   * Check if coordinators can assign staff
   * GET /api/settings/coordinator-can-assign-staff
   */
  async canCoordinatorAssignStaff(req, res) {
    try {
      const canAssign = systemSettingsService.canCoordinatorAssignStaff();
      return res.status(200).json({ success: true, canAssign });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check coordinator staff assignment permission'
      });
    }
  }

  /**
   * Validate all rules for an event request
   * POST /api/settings/validate-all-rules
   */
  async validateAllRules(req, res) {
    try {
      const { eventData } = req.body;

      if (!eventData) {
        return res.status(400).json({
          success: false,
          message: 'Event data is required'
        });
      }

      const validation = systemSettingsService.validateAllRules(eventData);

      return res.status(200).json({ success: true, validation });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to validate rules'
      });
    }
  }

  /**
   * Update and persist system settings
   * POST /api/settings
   */
  async updateSettings(req, res) {
    try {
      const payload = req.body || {};
      // Only allow specific keys to be updated
      const allowedKeys = [
        'notificationsEnabled',
        'maxBloodBagsPerDay',
        'maxEventsPerDay',
        'allowWeekendEvents',
        'advanceBookingDays',
        'maxPendingRequests',
        'preventOverlappingRequests',
        'preventDoubleBooking',
        'allowCoordinatorStaffAssignment',
        'requireStaffAssignment',
        'blockedWeekdays',
        'blockedDates'
      ];

      const updateObj = {};
      for (const k of allowedKeys) {
        if (Object.prototype.hasOwnProperty.call(payload, k)) updateObj[k] = payload[k];
      }

      const updated = await systemSettingsService.updateSettings(updateObj);

      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to update settings' });
    }
  }
}

module.exports = new SystemSettingsController();

