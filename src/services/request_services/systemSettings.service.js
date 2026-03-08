/**
 * System Settings Service
 * 
 * This service manages configurable system settings for the UNITE Blood Bank System.
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

// In-memory cache keyed by organizationId (string) or 'global'
const cache = new Map();

function cacheKey(orgId) {
  return orgId ? String(orgId) : 'global';
}

async function loadSettingsForOrg(orgId) {
  const key = cacheKey(orgId);
  if (cache.has(key)) {
    return cache.get(key);
  }

  try {
    const query = orgId ? { organizationId: orgId } : { organizationId: { $exists: false } };
    let doc = await SystemSettingsModel.findOne(query).lean().exec();
    if (!doc) {
      // create default document for this org/global
      const toSet = Object.assign({}, DEFAULTS);
      if (orgId) {
        toSet.organizationId = orgId;
      }
      doc = await SystemSettingsModel.findOneAndUpdate(
        query,
        { $set: toSet },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean().exec();
    }
    const merged = Object.assign({}, DEFAULTS, doc);
    delete merged._id;
    delete merged.__v;
    cache.set(key, merged);
    return merged;
  } catch (e) {
    try {
      console.warn('[SystemSettingsService] failed to load settings from DB, using defaults', e.message);
    } catch {}
    const fallback = Object.assign({}, DEFAULTS);
    cache.set(key, fallback);
    return fallback;
  }
}

class SystemSettingsService {
  /**
   * Get all system settings
   * @param {string|ObjectId|null} organizationId - optional tenant organization id
   * @returns {Promise<Object>} All system settings
   */
  async getSettings(organizationId = null) {
    const settings = await loadSettingsForOrg(organizationId);
    // Return a shallow copy so callers don't mutate the cache accidentally
    return Object.assign({}, settings);
  }

  /**
   * Get a specific setting
   * @param {string} settingKey 
   * @param {string|ObjectId|null} organizationId 
   * @returns {any} Setting value
   */
  async getSetting(settingKey, organizationId = null) {
    const settings = await this.getSettings(organizationId);
    return settings[settingKey];
  }

  /**
   * Update persistent settings and refresh in-memory cache
   * @param {Object} newSettings
   * @param {string|ObjectId|null} organizationId
   * @returns {Object} updated settings
   */
  async updateSettings(newSettings, organizationId = null) {
    try {
      const query = organizationId ? { organizationId } : { organizationId: { $exists: false } };
      const updated = await SystemSettingsModel.findOneAndUpdate(
        query,
        { $set: newSettings },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean().exec();
      const key = cacheKey(organizationId);
      if (updated) {
        const merged = Object.assign({}, DEFAULTS, updated);
        delete merged._id;
        delete merged.__v;
        cache.set(key, merged);
        return Object.assign({}, merged);
      }
      // Fallback to existing cache or defaults
      const settings = await loadSettingsForOrg(organizationId);
      return Object.assign({}, settings);
    } catch (e) {
      throw new Error(`Failed to persist settings: ${e.message}`);
    }
  }

  /**
   * Check if a date is allowed based on advance booking rules
   * @param {Date} eventDate 
   * @param {string|ObjectId|null} organizationId
   * @returns {Object} Validation result
   */
  async validateAdvanceBooking(eventDate, organizationId = null) {
    const advanceDaysSetting = await this.getSetting('advanceBookingDays', organizationId);
    const advanceDays = advanceDaysSetting || advanceDaysSetting === 0 ? advanceDaysSetting : DEFAULTS.advanceBookingDays;
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
   * @param {string|ObjectId|null} organizationId
   * @returns {Object} Validation result
   */
  async validateWeekendRestriction(eventDate, organizationId = null) {
    const dayOfWeek = eventDate.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const allowWeekends = await this.getSetting('allowWeekendEvents', organizationId);

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
   * @param {string|ObjectId|null} organizationId
   * @returns {Object} Validation result
   */
  async validatePendingRequestsLimit(pendingCount, organizationId = null) {
    const maxPending = await this.getSetting('maxPendingRequests', organizationId);
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
   * @param {string|ObjectId|null} organizationId
   * @returns {Date} Minimum allowed date
   */
  async getMinBookingDate(organizationId = null) {
    const advanceDaysSetting = await this.getSetting('advanceBookingDays', organizationId);
    const advanceDays = advanceDaysSetting || DEFAULTS.advanceBookingDays;
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + advanceDays);
    return minDate;
  }

  /**
   * Get maximum date coordinator can book
   * @param {string|ObjectId|null} organizationId
   * @returns {Date} Maximum allowed date
   */
  async getMaxBookingDate(organizationId = null) {
    // No hard maximum, but set to 1 year from today for UI purposes
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    return maxDate;
  }

  /**
   * Check if staff assignment is required
   * @param {string|ObjectId|null} organizationId
   * @returns {boolean} True if required
   */
  async isStaffAssignmentRequired(organizationId = null) {
    const val = await this.getSetting('requireStaffAssignment', organizationId);
    return !!val;
  }

  /**
   * Check if coordinators can assign staff
   * @param {string|ObjectId|null} organizationId
   * @returns {boolean} True if allowed
   */
  async canCoordinatorAssignStaff(organizationId = null) {
    const val = await this.getSetting('allowCoordinatorStaffAssignment', organizationId);
    return !!val;
  }

  /**
   * Get all validation checks for an event request
   * @param {Object} eventData 
   * @param {string|ObjectId|null} organizationId
   * @returns {Object} All validation results
   */
  async validateAllRules(eventData, organizationId = null) {
    const results = {
      advanceBooking: null,
      weekend: null,
      overlaps: null,
      doubleBooking: null
    };

    if (eventData.Start_Date) {
      results.advanceBooking = await this.validateAdvanceBooking(eventData.Start_Date, organizationId);
      results.weekend = await this.validateWeekendRestriction(eventData.Start_Date, organizationId);
    }

    return {
      isValid: results.advanceBooking?.isValid && results.weekend?.allowed,
      results,
      settings: await this.getSettings(organizationId)
    };
  }
}

module.exports = new SystemSettingsService();

