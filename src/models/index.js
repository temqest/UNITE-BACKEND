const mongoose = require('mongoose');

// ============================================
// USER MODELS
// ============================================
const BloodbankStaff = require('./users_models/bloodbank.staff');
const SystemAdmin = require('./users_models/systemAdmin.model');
const Coordinator = require('./users_models/coordinator.model');
const Stakeholder = require('./users_models/stakeholder.model');

// ============================================
// EVENT MODELS
// ============================================
const Event = require('./events_models/event.model');
const EventStaff = require('./events_models/eventStaff.model');
const BloodDrive = require('./events_models/bloodDrive.model');
const Advocacy = require('./events_models/advocacy.model');
const Training = require('./events_models/training.model');

// ============================================
// REQUEST MODELS
// ============================================
const EventRequest = require('./request_models/eventRequest.model');
const EventRequestHistory = require('./request_models/eventRequestHistory.model');

// ============================================
// UTILITY MODELS
// ============================================
const District = require('./utility_models/distric.model');
const Notification = require('./utility_models/notifications.model');
const RegistrationCode = require('./utility_models/registrationCode.model');

// ============================================
// MODEL RELATIONSHIPS & CONSTRAINTS
// ============================================

/**
 * Relationships Documentation:
 * 
 * USER HIERARCHY:
 * - SystemAdmin.Admin_ID → BloodbankStaff.ID (FK)
 * - Coordinator.Coordinator_ID → BloodbankStaff.ID (FK)
 * - Coordinator.District_ID → District.District_ID (FK)
 * 
 * EVENT HIERARCHY:
 * - EventStaff.EventID → Event.Event_ID (FK)
 * - BloodDrive.BloodDrive_ID → Event.Event_ID (FK)
 * - Advocacy.Advocacy_ID → Event.Event_ID (FK)
 * - Training.Training_ID → Event.Event_ID (FK)
 * 
 * REQUEST FLOW:
 * - EventRequest.Coordinator_ID → Coordinator.Coordinator_ID (FK)
 * - EventRequest.Admin_ID → SystemAdmin.Admin_ID (FK)
 * - EventRequest.Event_ID → Event.Event_ID (FK)
 * - EventRequestHistory.Request_ID → EventRequest.Request_ID (FK)
 * - EventRequestHistory.Event_ID → Event.Event_ID (FK)
 * 
 * NOTIFICATIONS:
 * - Notification.Request_ID → EventRequest.Request_ID (FK)
 * - Notification.Event_ID → Event.Event_ID (FK)
 * - Notification.Recipient_ID → SystemAdmin.Admin_ID OR Coordinator.Coordinator_ID
 */

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validates that a Coordinator_ID exists
 * @param {string} coordinatorId - The Coordinator ID to validate
 * @returns {Promise<boolean>}
 */
const validateCoordinator = async (coordinatorId) => {
  try {
    const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
    return !!coordinator;
  } catch (error) {
    return false;
  }
};

/**
 * Validates that an Admin_ID exists
 * @param {string} adminId - The Admin ID to validate
 * @returns {Promise<boolean>}
 */
const validateAdmin = async (adminId) => {
  try {
    const admin = await SystemAdmin.findOne({ Admin_ID: adminId });
    return !!admin;
  } catch (error) {
    return false;
  }
};

/**
 * Validates that a District_ID exists
 * @param {string} districtId - The District ID to validate
 * @returns {Promise<boolean>}
 */
const validateDistrict = async (districtId) => {
  try {
    const district = await District.findOne({ District_ID: districtId });
    return !!district;
  } catch (error) {
    return false;
  }
};

/**
 * Validates that an Event_ID exists
 * @param {string} eventId - The Event ID to validate
 * @returns {Promise<boolean>}
 */
const validateEvent = async (eventId) => {
  try {
    const event = await Event.findOne({ Event_ID: eventId });
    return !!event;
  } catch (error) {
    return false;
  }
};

/**
 * Validates that a Request_ID exists
 * @param {string} requestId - The Request ID to validate
 * @returns {Promise<boolean>}
 */
const validateRequest = async (requestId) => {
  try {
    const request = await EventRequest.findOne({ Request_ID: requestId });
    return !!request;
  } catch (error) {
    return false;
  }
};

/**
 * Validates that a BloodbankStaff ID exists
 * @param {string} staffId - The Staff ID to validate
 * @returns {Promise<boolean>}
 */
const validateBloodbankStaff = async (staffId) => {
  try {
    const staff = await BloodbankStaff.findOne({ ID: staffId });
    return !!staff;
  } catch (error) {
    return false;
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // User Models
  BloodbankStaff,
  SystemAdmin,
  Coordinator,
  Stakeholder,
  
  // Event Models
  Event,
  EventStaff,
  BloodDrive,
  Advocacy,
  Training,
  
  // Request Models
  EventRequest,
  EventRequestHistory,
  
  // Utility Models
  District,
  Notification,
  RegistrationCode,
  
  // Validation Helpers
  validateCoordinator,
  validateAdmin,
  validateDistrict,
  validateEvent,
  validateRequest,
  validateBloodbankStaff,
  
  // Mongoose instance (in case needed elsewhere)
  mongoose
};

