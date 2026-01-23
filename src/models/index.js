const mongoose = require('mongoose');

// ============================================
// USER MODELS
// ============================================
const User = require('./users_models/user.model'); // Unified User model
const UserNotificationPreferences = require('./users_models/userNotificationPreferences.model');

// ============================================
// RBAC MODELS
// ============================================
const Role = require('./users_models/role.model');
const Permission = require('./users_models/permission.model');
const UserRole = require('./users_models/userRole.model');
const UserLocation = require('./users_models/userLocation.model');
const UserCoverageAssignment = require('./users_models/userCoverageAssignment.model');
const UserOrganization = require('./users_models/userOrganization.model');

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
const EventRequest = require('./eventRequests_models/eventRequest.model'); // New clean model
// Legacy EventRequest model is not loaded here to avoid conflicts
// It's available in /legacy-event-request folder for reference
const EventRequestHistory = require('./request_models/eventRequestHistory.model');
const BloodBagRequest = require('./request_models/bloodBagRequest.model');

// ============================================
// UTILITY MODELS
// ============================================
const Location = require('./utility_models/location.model'); // Flexible location model
const Organization = require('./utility_models/organization.model'); // Organization model
const CoverageArea = require('./utility_models/coverageArea.model'); // Coverage area model
const Notification = require('./utility_models/notifications.model');
const RegistrationCode = require('./utility_models/registrationCode.model');
const SystemSettings = require('./utility_models/systemSettings.model');
const SignUpRequest = require('./utility_models/signupRequest.model');
const BloodBag = require('./utility_models/bloodbag.model');
const EmailDailyLimit = require('./utility_models/emailDailyLimit.model');
const CalendarNote = require('./utility_models/calendarNote.model');
const BugReport = require('./utility_models/bugReport.model');

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
 * - User (Unified Model)
 *   - User.userId → Legacy ID mapping (for backward compatibility during migration)
 *   - User._id → Referenced by UserRole.userId (RBAC)
 *   - User.organizationId → Organization._id
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
 * - EventRequest.requester → User._id (FK, with roleSnapshot)
 * - EventRequest.reviewer → User._id (FK, with roleSnapshot)
 * - EventRequest.Event_ID → Event.Event_ID (FK)
 * - EventRequestHistory.Request_ID → EventRequest.Request_ID (FK)
 * - EventRequestHistory.Event_ID → Event.Event_ID (FK)
 * 
 * NOTIFICATIONS:
 * - Notification.Request_ID → EventRequest.Request_ID (FK)
 * - Notification.Event_ID → Event.Event_ID (FK)
 * - Notification.Recipient_ID → User._id (FK)
 * 
 * LOCATION HIERARCHY:
 * - Location.parent → Location._id (FK, self-referencing)
 * - Location.province → Location._id (FK, denormalized province reference)
 * - UserLocation.userId → User._id (FK) [Legacy, for backward compatibility]
 * - UserLocation.locationId → Location._id (FK)
 * - UserLocation.assignedBy → User._id (FK)
 * 
 * COVERAGE SYSTEM:
 * - CoverageArea.geographicUnits → Location._id (FK, array)
 * - CoverageArea.organizationId → Organization._id (FK, optional)
 * - UserCoverageAssignment.userId → User._id (FK)
 * - UserCoverageAssignment.coverageAreaId → CoverageArea._id (FK)
 * - UserCoverageAssignment.assignedBy → User._id (FK)
 */

// ============================================
// VALIDATION HELPERS
// ============================================

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
  User, // Unified User model
  UserNotificationPreferences,
  
  // RBAC Models
  Role,
  Permission,
  UserRole,
  UserLocation,
  UserCoverageAssignment,
  UserOrganization,
  
  // Event Models
  Event,
  EventStaff,
  BloodDrive,
  Advocacy,
  Training,
  
  // Request Models
  EventRequest, // New clean model
  EventRequestHistory,
  BloodBagRequest,
  
  // Utility Models
  Location, // Flexible location model (Geographic Units)
  Organization, // Organization model
  CoverageArea, // Coverage area model
  Notification,
  RegistrationCode,
  SystemSettings,
  SignUpRequest,
  BloodBag,
  EmailDailyLimit,
  CalendarNote,
  BugReport,
  
  // CHAT MODELS
  Message,
  Conversation,
  Presence,
  
  // Validation Helpers
  validateEvent,
  validateRequest,
  validateUser,
  
  // Mongoose instance (in case needed elsewhere)
  mongoose
};

