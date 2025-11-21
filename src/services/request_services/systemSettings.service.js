/**
 * System Settings Service
 * 
 * This service manages configurable system settings for the UNITE Blood Bank Event Management System.
 * 
 * TODO: Replace hardcoded values with database-driven settings in the future.
 * For now, these are defined here as defaults and can be easily moved to a Settings model.
 */

const SystemSettingsModel = require('../../models/utility_models/systemSettings.model');

// Default settings used as fallback and to initialize DB document
const DEFAULTS = {
  notificationsEnabled: true,
  maxEventsPerDay: 3,
  maxBloodBagsPerDay: 200,
  allowWeekendEvents: false,
  advanceBookingDays: 30,
  maxPendingRequests: 1,
  pendingFollowUpDays: 3,
  preventOverlappingRequests: true,
  preventDoubleBooking: false,
  allowCoordinatorStaffAssignment: false,
  requireStaffAssignment: false,
  blockedWeekdays: [],
  blockedDates: [],
  reviewAutoExpireHours: 72,
  reviewConfirmationWindowHours: 48,
  notifyCounterpartAdmins: true
};

let cachedSettings = Object.assign({}, DEFAULTS);

// Load persisted settings into cache (best-effort). This runs once on module load.
(async function initCache() {
  try {
    const doc = await SystemSettingsModel.findOne({}).lean().exec();
    if (doc) {
      cachedSettings = Object.assign({}, DEFAULTS, doc);
    } else {
      // create default document
      const created = await SystemSettingsModel.findOneAndUpdate({}, DEFAULTS, { upsert: true, new: true, setDefaultsOnInsert: true }).lean().exec();
      if (created) cachedSettings = Object.assign({}, DEFAULTS, created);
    }
    // strip mongoose internal fields if present
    delete cachedSettings._id;
    delete cachedSettings.__v;
  } catch (e) {
    // If DB isn't ready or an error occurs, keep using in-memory defaults
    try { console.warn('[SystemSettingsService] failed to load settings from DB, using defaults', e.message); } catch (e2) {}
  }
})();

class SystemSettingsService {
  /**
   * Get all system settings
   * @returns {Object} All system settings
   */
  getSettings() {
    // Return a shallow copy of cached settings so callers don't mutate the cache accidentally
    return Object.assign({}, cachedSettings);
  }

  /**
   * Get a specific setting
   * @param {string} settingKey 
   * @returns {any} Setting value
   */
  getSetting(settingKey) {
    const settings = this.getSettings();
    return settings[settingKey];
  }

  /**
   * Update persistent settings and refresh in-memory cache
   * @param {Object} newSettings
   * @returns {Object} updated settings
   */
  async updateSettings(newSettings) {
    try {
      const updated = await SystemSettingsModel.findOneAndUpdate({}, { $set: newSettings }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean().exec();
      if (updated) {
        cachedSettings = Object.assign({}, DEFAULTS, updated);
        delete cachedSettings._id;
        delete cachedSettings.__v;
      }
      return Object.assign({}, cachedSettings);
    } catch (e) {
      throw new Error(`Failed to persist settings: ${e.message}`);
    }
  }

  /**
   * Check if a date is allowed based on advance booking rules
   * @param {Date} eventDate 
   * @returns {Object} Validation result
   */
  validateAdvanceBooking(eventDate) {
    const advanceDays = this.getSetting('advanceBookingDays') || this.getSetting('advanceBookingDays') === 0 ? this.getSetting('advanceBookingDays') : DEFAULTS.advanceBookingDays;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const minAllowedDate = new Date(today);
    minAllowedDate.setDate(minAllowedDate.getDate() + advanceDays);
    
    const isValid = eventDate >= minAllowedDate;

    return {
      isValid,
      minAllowedDate,
      currentDate: today,
      eventDate,
      allowed: isValid,
      message: isValid 
        ? 'Date is within allowed booking window'
        : `Events must be booked at least ${advanceDays} days in advance`
    };
  }

  /**
   * Check if weekend events are allowed
   * @param {Date} eventDate 
   * @returns {Object} Validation result
   */
  validateWeekendRestriction(eventDate) {
    const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const allowWeekends = this.getSetting('allowWeekendEvents');

    return {
      isWeekend,
      allowed: !isWeekend || allowWeekends,
      requiresOverride: isWeekend && !allowWeekends,
      message: isWeekend && !allowWeekends
        ? 'Weekend events require admin override'
        : 'Date is allowed'
    };
  }

  /**
   * Check if coordinator has reached max pending requests
   * @param {number} pendingCount 
   * @returns {Object} Validation result
   */
  validatePendingRequestsLimit(pendingCount) {
    const maxPending = this.getSetting('maxPendingRequests');
    const isValid = pendingCount < maxPending;

    return {
      isValid,
      currentCount: pendingCount,
      maxAllowed: maxPending,
      allowed: isValid,
      message: isValid
        ? 'Under pending request limit'
        : `Maximum ${maxPending} pending request${maxPending > 1 ? 's' : ''} allowed per coordinator`
    };
  }

  /**
   * Get minimum date coordinator can book
   * @returns {Date} Minimum allowed date
   */
  getMinBookingDate() {
    const advanceDays = this.getSetting('advanceBookingDays') || DEFAULTS.advanceBookingDays;
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + advanceDays);
    return minDate;
  }

  /**
   * Get maximum date coordinator can book
   * @returns {Date} Maximum allowed date
   */
  getMaxBookingDate() {
    // No hard maximum, but set to 1 year from today for UI purposes
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    return maxDate;
  }

  /**
   * Check if staff assignment is required
   * @returns {boolean} True if required
   */
  isStaffAssignmentRequired() {
    return !!this.getSetting('requireStaffAssignment');
  }

  /**
   * Check if coordinators can assign staff
   * @returns {boolean} True if allowed
   */
  canCoordinatorAssignStaff() {
    return !!this.getSetting('allowCoordinatorStaffAssignment');
  }

  /**
   * Get all validation checks for an event request
   * @param {Object} eventData 
   * @returns {Object} All validation results
   */
  validateAllRules(eventData) {
    const results = {
      advanceBooking: null,
      weekend: null,
      overlaps: null,
      doubleBooking: null
    };

    if (eventData.Start_Date) {
      results.advanceBooking = this.validateAdvanceBooking(eventData.Start_Date);
      results.weekend = this.validateWeekendRestriction(eventData.Start_Date);
    }

    return {
      isValid: results.advanceBooking?.isValid && results.weekend?.allowed,
      results,
      settings: this.getSettings()
    };
  }
}

module.exports = new SystemSettingsService();

