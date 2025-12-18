const mongoose = require('mongoose');

// ============================================
// USER MODELS
// ============================================
const User = require('./users_models/user.model'); // Unified User model (replaces BloodbankStaff, SystemAdmin, Coordinator, Stakeholder)
const BloodbankStaff = require('./users_models/bloodbank.staff'); // Legacy - to be deprecated
const SystemAdmin = require('./users_models/systemAdmin.model'); // Legacy - to be deprecated
const Coordinator = require('./users_models/coordinator.model'); // Legacy - to be deprecated
const Stakeholder = require('./users_models/stakeholder.model'); // Legacy - to be deprecated

// ============================================
// RBAC MODELS
// ============================================
const Role = require('./users_models/role.model');
const Permission = require('./users_models/permission.model');
const UserRole = require('./users_models/userRole.model');
const UserLocation = require('./users_models/userLocation.model');

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
const BloodBagRequest = require('./request_models/bloodBagRequest.model');

// ============================================
// UTILITY MODELS
// ============================================
const Province = require('./utility_models/province.model');
const District = require('./utility_models/distric.model');
const Municipality = require('./utility_models/municipality.model');
const Location = require('./utility_models/location.model'); // Flexible location model
const Notification = require('./utility_models/notifications.model');
const RegistrationCode = require('./utility_models/registrationCode.model');
const SystemSettings = require('./utility_models/systemSettings.model');
const SignUpRequest = require('./utility_models/signupRequest.model');
const BloodBag = require('./utility_models/bloodbag.model');

// ============================================
// CHAT MODELS
// ============================================
const Message = require('./chat_models/message.model');
const Conversation = require('./chat_models/conversation.model');
const Presence = require('./chat_models/presence.model');

// ============================================
// MODEL RELATIONSHIPS & CONSTRAINTS
// ============================================

/**
 * Relationships Documentation:
 * 
 * USER HIERARCHY:
 * - User (Unified Model) - Replaces BloodbankStaff, SystemAdmin, Coordinator, Stakeholder
 *   - User.userId → Legacy ID mapping (BloodbankStaff.ID, SystemAdmin.Admin_ID, etc.)
 *   - User._id → Referenced by UserRole.userId (RBAC)
 *   - User.organizationId → Organization._id (future reference)
 * - SystemAdmin.Admin_ID → BloodbankStaff.ID (FK) [Legacy - to be deprecated]
 * - Coordinator.Coordinator_ID → BloodbankStaff.ID (FK) [Legacy - to be deprecated]
 * - Coordinator.District_ID → District.District_ID (FK) [Legacy - to be deprecated]
 * 
 * RBAC RELATIONSHIPS:
 * - UserRole.userId → User._id (FK)
 * - UserRole.roleId → Role._id (FK)
 * - Role.permissions → Permission references (embedded)
 * - UserLocation.userId → User._id (FK)
 * - UserLocation.locationId → Location._id (FK)
 * - UserLocation.assignedBy → User._id (FK)
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
 * 
 * LOCATION HIERARCHY:
 * - Location.parent → Location._id (FK, self-referencing)
 * - Location.province → Location._id (FK, denormalized province reference)
 * - UserLocation.userId → User._id (FK)
 * - UserLocation.locationId → Location._id (FK)
 * - UserLocation.assignedBy → User._id (FK)
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
    const district = await District.findById(districtId);
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

/**
 * Validates that a User exists (by ObjectId or legacy userId)
 * @param {string|ObjectId} userId - The User ID to validate (ObjectId or legacy userId)
 * @returns {Promise<boolean>}
 */
const validateUser = async (userId) => {
  try {
    // Try as ObjectId first
    if (mongoose.Types.ObjectId.isValid(userId)) {
      const user = await User.findById(userId);
      if (user) return true;
    }
    // Try as legacy userId
    const user = await User.findByLegacyId(userId);
    return !!user;
  } catch (error) {
    return false;
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // User Models
  User, // Unified User model (primary)
  BloodbankStaff, // Legacy - to be deprecated
  SystemAdmin, // Legacy - to be deprecated
  Coordinator, // Legacy - to be deprecated
  Stakeholder, // Legacy - to be deprecated
  
  // RBAC Models
  Role,
  Permission,
  UserRole,
  UserLocation,
  
  // Event Models
  Event,
  EventStaff,
  BloodDrive,
  Advocacy,
  Training,
  
  // Request Models
  EventRequest,
  EventRequestHistory,
  BloodBagRequest,
  
  // Utility Models
  Province,
  District,
  Municipality,
  Location, // Flexible location model
  Notification,
  RegistrationCode,
  SystemSettings,
  SignUpRequest,
  BloodBag,
  
  // CHAT MODELS
  Message,
  Conversation,
  Presence,
  
  // Validation Helpers
  validateCoordinator,
  validateAdmin,
  validateDistrict,
  validateEvent,
  validateRequest,
  validateBloodbankStaff,
  validateUser,
  
  
  // Mongoose instance (in case needed elsewhere)
  mongoose
};

