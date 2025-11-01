/**
 * System Settings Service
 * 
 * This service manages configurable system settings for the UNITE Blood Bank Event Management System.
 * 
 * TODO: Replace hardcoded values with database-driven settings in the future.
 * For now, these are defined here as defaults and can be easily moved to a Settings model.
 */

class SystemSettingsService {
  /**
   * Get all system settings
   * @returns {Object} All system settings
   */
  getSettings() {
    return {
      // Scheduling Rules
      maxEventsPerDay: 3,
      maxBloodBagsPerDay: 200,
      allowWeekendEvents: false, // By default, weekends are not allowed

      // Coordinator Restrictions
      advanceBookingDays: 30, // Days in advance coordinator can book
      maxPendingRequests: 1, // Maximum pending requests per coordinator
      
      // Auto-Follow-up
      pendingFollowUpDays: 3, // Days before auto-follow-up notification

      // Event Restrictions
      preventOverlappingRequests: true,
      preventDoubleBooking: true,
      
      // Staff Assignment
      allowCoordinatorStaffAssignment: false, // Only admin can assign staff
      requireStaffAssignment: false // Staff assignment is optional or required

      // Future settings can be added here:
      // - Email notifications enabled
      // - SMS notifications enabled
      // - Auto-approve option
      // - Event duration limits
      // - etc.
    };
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
   * Check if a date is allowed based on advance booking rules
   * @param {Date} eventDate 
   * @returns {Object} Validation result
   */
  validateAdvanceBooking(eventDate) {
    const advanceDays = this.getSetting('advanceBookingDays');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const maxAllowedDate = new Date(today);
    maxAllowedDate.setDate(maxAllowedDate.getDate() + advanceDays);
    
    const isValid = eventDate <= maxAllowedDate && eventDate >= today;

    return {
      isValid,
      maxAllowedDate,
      currentDate: today,
      eventDate,
      allowed: isValid,
      message: isValid 
        ? 'Date is within allowed booking window'
        : `Events can only be booked up to ${advanceDays} days in advance`
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
    return new Date(); // Today
  }

  /**
   * Get maximum date coordinator can book
   * @returns {Date} Maximum allowed date
   */
  getMaxBookingDate() {
    const advanceDays = this.getSetting('advanceBookingDays');
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + advanceDays);
    return maxDate;
  }

  /**
   * Check if staff assignment is required
   * @returns {boolean} True if required
   */
  isStaffAssignmentRequired() {
    return this.getSetting('requireStaffAssignment');
  }

  /**
   * Check if coordinators can assign staff
   * @returns {boolean} True if allowed
   */
  canCoordinatorAssignStaff() {
    return this.getSetting('allowCoordinatorStaffAssignment');
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

