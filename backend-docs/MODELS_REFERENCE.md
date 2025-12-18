# Models Reference

## Overview

This document provides complete schema definitions for all data models in the UNITE Backend system. All models use Mongoose (MongoDB ODM) and follow consistent patterns.

## User Models

### User

**File:** `src/models/users_models/user.model.js`

**Description:** Unified user model replacing legacy BloodbankStaff, SystemAdmin, Coordinator, and Stakeholder models.

**Schema:**
```javascript
{
  userId: String,              // Legacy ID (optional, unique, sparse)
  email: String,               // Required, unique, lowercase, indexed
  password: String,             // Required (hashed)
  firstName: String,            // Required
  middleName: String,           // Optional
  lastName: String,             // Required
  phoneNumber: String,          // Optional
  organizationType: String,    // Enum: 'LGU', 'NGO', 'Hospital', 'RedCross', 'Non-LGU', 'Other'
  organizationId: ObjectId,    // Optional (future Organization reference)
  organizationInstitution: String,  // Optional
  field: String,                // Optional
  registrationCode: String,     // Optional
  isSystemAdmin: Boolean,       // Default: false, indexed
  isActive: Boolean,           // Default: true, indexed
  lastLoginAt: Date,           // Optional
  metadata: Mixed,             // Flexible metadata object
  createdAt: Date,             // Auto-generated
  updatedAt: Date              // Auto-generated
}
```

**Indexes:**
- `email` (unique)
- `userId` (unique, sparse)
- `isActive, isSystemAdmin` (compound)
- `organizationType`
- `createdAt` (descending)

**Virtual Fields:**
- `fullName` - Computed full name (firstName + middleName + lastName)

**Methods:**
- `isAccountActive()` - Check if account is active
- `updateLastLogin()` - Update last login timestamp

**Static Methods:**
- `findByEmail(email)` - Find user by email
- `findByLegacyId(userId)` - Find user by legacy userId

**Example Document:**
```json
{
  "_id": "601abc1234567890abcdef",
  "userId": "LEGACY123",
  "email": "user@example.com",
  "firstName": "John",
  "middleName": "Michael",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "organizationType": "LGU",
  "isSystemAdmin": false,
  "isActive": true,
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-20T14:00:00.000Z"
}
```

---

### UserRole

**File:** `src/models/users_models/userRole.model.js`

**Description:** Links users to roles with optional location and organization scope.

**Schema:**
```javascript
{
  userId: ObjectId,            // Required, ref: 'User', indexed
  roleId: ObjectId,            // Required, ref: 'Role', indexed
  assignedAt: Date,            // Default: now
  assignedBy: ObjectId,         // Optional, ref: 'User'
  expiresAt: Date,             // Optional (TTL index)
  isActive: Boolean,           // Default: true, indexed
  context: {
    locationScope: [ObjectId], // Array of Location IDs
    organizationScope: ObjectId  // Optional, ref: 'Organization'
  },
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `userId, isActive` (compound)
- `roleId, isActive` (compound)
- `userId, roleId` (compound)
- `expiresAt` (TTL index)

**Example Document:**
```json
{
  "_id": "601xyz1234567890abcdef",
  "userId": "601abc1234567890abcdef",
  "roleId": "601def1234567890abcdef",
  "assignedAt": "2024-01-15T10:00:00.000Z",
  "assignedBy": "601ghi1234567890abcdef",
  "expiresAt": null,
  "isActive": true,
  "context": {
    "locationScope": ["601jkl1234567890abcdef"]
  }
}
```

---

### UserLocation

**File:** `src/models/users_models/userLocation.model.js`

**Description:** Links users to locations with flexible scope coverage.

**Schema:**
```javascript
{
  userId: ObjectId,            // Required, ref: 'User', indexed
  locationId: ObjectId,       // Required, ref: 'Location', indexed
  scope: String,               // Enum: 'exact', 'descendants', 'ancestors', 'all', default: 'exact', indexed
  isPrimary: Boolean,          // Default: false, indexed
  assignedAt: Date,           // Required, default: now
  assignedBy: ObjectId,        // Optional, ref: 'User'
  expiresAt: Date,            // Optional, indexed
  isActive: Boolean,           // Default: true, indexed
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `userId, isActive` (compound)
- `locationId, isActive` (compound)
- `userId, isPrimary, isActive` (compound)
- `userId, locationId` (unique compound)
- `expiresAt` (sparse)

**Methods:**
- `isExpired()` - Check if assignment is expired
- `isValid()` - Check if assignment is valid (active and not expired)

**Static Methods:**
- `findUserLocations(userId, includeInactive)` - Find all locations for user
- `findPrimaryLocation(userId)` - Find primary location for user
- `findLocationUsers(locationId, includeInactive)` - Find all users for location
- `assignLocation(userId, locationId, options)` - Assign location to user
- `revokeLocation(userId, locationId)` - Revoke location assignment

**Example Document:**
```json
{
  "_id": "601xyz1234567890abcdef",
  "userId": "601abc1234567890abcdef",
  "locationId": "601def1234567890abcdef",
  "scope": "descendants",
  "isPrimary": true,
  "assignedAt": "2024-01-15T10:00:00.000Z",
  "assignedBy": "601ghi1234567890abcdef",
  "expiresAt": null,
  "isActive": true
}
```

---

## RBAC Models

### Role

**File:** `src/models/users_models/role.model.js`

**Description:** Role definition with embedded permissions.

**Schema:**
```javascript
{
  code: String,                // Required, unique, lowercase, indexed
  name: String,                // Required
  description: String,         // Optional
  isSystemRole: Boolean,       // Default: false, indexed
  permissions: [{
    resource: String,          // Required
    actions: [String],         // Required (array of action strings)
    metadata: Mixed            // Optional (e.g., { allowedStaffTypes: [...] })
  }],
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `code` (unique)
- `isSystemRole`

**Example Document:**
```json
{
  "_id": "601abc1234567890abcdef",
  "code": "coordinator",
  "name": "Coordinator",
  "description": "Event and request coordinator",
  "isSystemRole": true,
  "permissions": [
    {
      "resource": "event",
      "actions": ["create", "read", "update"],
      "metadata": {}
    },
    {
      "resource": "staff",
      "actions": ["read"],
      "metadata": {
        "allowedStaffTypes": ["stakeholder"]
      }
    }
  ]
}
```

---

### Permission

**File:** `src/models/users_models/permission.model.js`

**Description:** Permission definition with type and metadata support.

**Schema:**
```javascript
{
  code: String,                // Required, unique, lowercase, indexed
  name: String,                // Required
  resource: String,            // Required, indexed
  action: String,              // Required, indexed
  description: String,         // Optional
  type: String,                // Enum: 'resource', 'page', 'feature', 'staff', default: 'resource', indexed
  metadata: Mixed,             // Optional (e.g., { allowedStaffTypes: [...] })
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `code` (unique)
- `resource, action` (compound)
- `type`
- `type, resource` (compound)

**Example Document:**
```json
{
  "_id": "601abc1234567890abcdef",
  "code": "staff.create",
  "name": "Create Staff",
  "resource": "staff",
  "action": "create",
  "type": "staff",
  "description": "Create new staff members",
  "metadata": {
    "allowedStaffTypes": ["stakeholder", "coordinator"]
  }
}
```

---

## Event Models

### Event

**File:** `src/models/events_models/event.model.js`

**Description:** Base event model.

**Schema:**
```javascript
{
  Event_ID: String,            // Required, unique
  Event_Title: String,         // Required
  Location: String,             // Required
  Start_Date: Date,            // Required
  End_Date: Date,              // Optional
  coordinator_id: String,      // Required, ref: 'Coordinator'
  stakeholder_id: String,      // Optional, ref: 'Stakeholder'
  made_by_id: String,         // Required
  made_by_role: String,        // Enum: 'SystemAdmin', 'Coordinator', 'Stakeholder'
  province: ObjectId,          // Optional, ref: 'Province'
  district: ObjectId,         // Optional, ref: 'District'
  municipality: ObjectId,     // Optional, ref: 'Municipality'
  stakeholder: ObjectId,       // Optional, ref: 'Stakeholder'
  StaffAssignmentID: String,  // Optional
  Email: String,              // Required, lowercase
  Phone_Number: String,       // Required
  Event_Description: String,   // Optional
  Category: String,           // Optional
  Status: String,             // Enum: 'Pending', 'Approved', 'Rescheduled', 'Rejected', 'Completed', 'Cancelled', default: 'Pending'
  createdAt: Date,
  updatedAt: Date
}
```

**Example Document:**
```json
{
  "_id": "601abc1234567890abcdef",
  "Event_ID": "EVT001",
  "Event_Title": "Community Blood Drive",
  "Location": "City Hall",
  "Start_Date": "2024-02-15T09:00:00.000Z",
  "End_Date": "2024-02-15T17:00:00.000Z",
  "coordinator_id": "COORD001",
  "Category": "BloodDrive",
  "Status": "Approved",
  "Email": "coordinator@example.com",
  "Phone_Number": "+1234567890"
}
```

---

### BloodDrive

**File:** `src/models/events_models/bloodDrive.model.js`

**Description:** Blood drive event category data.

**Schema:**
```javascript
{
  BloodDrive_ID: String,       // Required, unique, ref: 'Event'
  Target_Donation: Number,    // Required
  VenueType: String,          // Optional
  createdAt: Date,
  updatedAt: Date
}
```

---

### Advocacy

**File:** `src/models/events_models/advocacy.model.js`

**Description:** Advocacy event category data.

**Schema:**
```javascript
{
  Advocacy_ID: String,         // Required, unique, ref: 'Event'
  Topic: String,              // Optional
  TargetAudience: String,     // Optional
  ExpectedAudienceSize: Number,  // Optional
  PartnerOrganization: String,  // Optional
  createdAt: Date,
  updatedAt: Date
}
```

---

### Training

**File:** `src/models/events_models/training.model.js`

**Description:** Training event category data.

**Schema:**
```javascript
{
  Training_ID: String,         // Required, unique, ref: 'Event'
  TrainingType: String,       // Optional
  MaxParticipants: Number,   // Required
  createdAt: Date,
  updatedAt: Date
}
```

---

### EventStaff

**File:** `src/models/events_models/eventStaff.model.js`

**Description:** Staff assignments for events.

**Schema:**
```javascript
{
  EventID: String,            // Required, ref: 'Event'
  Staff_FullName: String,     // Required
  Role: String,              // Required
  createdAt: Date,
  updatedAt: Date
}
```

---

## Request Models

### EventRequest

**File:** `src/models/request_models/eventRequest.model.js`

**Description:** Event request with state machine workflow.

**Schema:**
```javascript
{
  Request_ID: String,          // Required, unique
  Event_ID: String,           // Required, ref: 'Event'
  // Legacy fields
  coordinator_id: String,      // Optional
  stakeholder_id: String,      // Optional
  made_by_id: String,         // Optional
  made_by_role: String,       // Optional
  // New role-agnostic fields
  requester: {
    userId: ObjectId,         // Optional, ref: 'User'
    id: String,              // Legacy ID
    roleSnapshot: String,    // Role at creation
    name: String
  },
  reviewer: {
    id: String,              // Legacy ID
    userId: ObjectId,        // Optional, ref: 'User'
    role: String,
    roleSnapshot: String,
    name: String,
    assignedAt: Date,
    autoAssigned: Boolean,
    assignmentRule: String,
    overriddenAt: Date,
    overriddenBy: Object     // actorSnapshotSchema
  },
  creator: Object,           // actorSnapshotSchema
  stakeholderPresent: Boolean,  // Default: false
  // Location references
  province: ObjectId,        // Optional, ref: 'Province'
  district: ObjectId,       // Optional, ref: 'District'
  municipality: ObjectId,   // Optional, ref: 'Municipality'
  stakeholder: ObjectId,     // Optional, ref: 'Stakeholder'
  // Status and workflow
  Status: String,            // State machine state
  AdminAction: String,       // Optional
  AdminNote: String,         // Optional
  RescheduledDate: Date,     // Optional
  // Decision and confirmation
  decision: Object,         // decisionSchema
  reschedule: Object,       // rescheduleSchema
  confirmation: Object,     // confirmationSchema
  finalResolution: Object,  // finalResolutionSchema
  revision: Object,         // revisionSchema
  // Audit trail
  statusHistory: [Object],  // statusHistorySchema array
  auditTrail: [Object],     // Audit entries array
  createdAt: Date,
  updatedAt: Date
}
```

**State Values:**
- `pending-review`
- `review-accepted`
- `review-rejected`
- `review-rescheduled`
- `awaiting-confirmation`
- `approved`
- `rejected`
- `cancelled`
- `closed`

---

### EventRequestHistory

**File:** `src/models/request_models/eventRequestHistory.model.js`

**Description:** Historical record of request actions.

**Schema:**
```javascript
{
  History_ID: String,         // Required, unique
  Request_ID: String,         // Required, ref: 'EventRequest', indexed
  Event_ID: String,          // Required, ref: 'Event', indexed
  Action: String,            // Enum: 'created', 'review-assigned', 'review-decision', etc.
  Actor: {
    id: String,
    role: String,
    name: String
  },
  Note: String,              // Optional
  PreviousStatus: String,    // Optional
  NewStatus: String,        // Optional
  Metadata: Mixed,          // Optional
  ActionDate: Date,         // Required, default: now, indexed
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `Request_ID, ActionDate` (compound, descending)
- `Actor.id, ActionDate` (compound, descending)
- `Event_ID, ActionDate` (compound, descending)

---

### BloodBagRequest

**File:** `src/models/request_models/bloodBagRequest.model.js`

**Description:** Blood bag request model.

**Schema:**
```javascript
{
  Request_ID: String,         // Required, unique, indexed
  Requester_ID: String,      // Required, indexed
  Requestee_ID: String,      // Required, indexed
  RequestedItems: [{
    BloodType: String,       // Enum: 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
    Amount: Number           // Required, min: 1
  }],
  RequestedForAt: Date,      // Optional
  Urgency: String,          // Enum: 'low', 'medium', 'high', default: 'medium'
  Notes: String,           // Optional
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `Requester_ID`
- `Requestee_ID`
- `Request_ID`

---

## Utility Models

### Location

**File:** `src/models/utility_models/location.model.js`

**Description:** Flexible hierarchical location model.

**Schema:**
```javascript
{
  code: String,               // Optional, unique, sparse, lowercase, indexed
  name: String,              // Required, indexed
  type: String,              // Enum: 'province', 'district', 'city', 'municipality', 'barangay', 'custom', required, indexed
  parent: ObjectId,          // Optional, ref: 'Location', self-referencing, indexed
  level: Number,             // Optional, default: 0, indexed
  province: ObjectId,        // Optional, ref: 'Location', denormalized, indexed
  administrativeCode: String,  // Optional
  metadata: {
    isCity: Boolean,         // Default: false
    isCombined: Boolean,    // Default: false
    operationalGroup: String,  // Optional
    custom: Mixed           // Additional custom metadata
  },
  isActive: Boolean,        // Default: true, indexed
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `code` (unique, sparse)
- `name`
- `type`
- `parent`
- `level`
- `province`
- `isActive`

**Example Document:**
```json
{
  "_id": "601abc1234567890abcdef",
  "code": "manila-city",
  "name": "Manila",
  "type": "city",
  "parent": "601def1234567890abcdef",
  "level": 1,
  "province": "601ghi1234567890abcdef",
  "metadata": {
    "isCity": true,
    "isCombined": false
  },
  "isActive": true
}
```

---

### Notification

**File:** `src/models/utility_models/notifications.model.js`

**Description:** Notification model for user notifications.

**Schema:**
```javascript
{
  Notification_ID: String,   // Required, unique
  Recipient_ID: String,      // Required
  RecipientType: String,     // Enum: 'Admin', 'Coordinator', 'Stakeholder', required
  Request_ID: String,        // Required, ref: 'EventRequest'
  Event_ID: String,         // Optional, ref: 'Event'
  Title: String,            // Required
  Message: String,          // Required
  NotificationType: String, // Enum: 'NewRequest', 'AdminAccepted', etc., required
  IsRead: Boolean,          // Default: false
  ReadAt: Date,            // Optional
  ActionTaken: String,      // Optional
  ActionNote: String,      // Optional
  RescheduledDate: Date,   // Optional
  OriginalDate: Date,     // Optional
  Message_ID: String,      // Optional (chat)
  Sender_ID: String,      // Optional (chat)
  Conversation_ID: String,  // Optional (chat)
  createdAt: Date,
  updatedAt: Date
}
```

---

### SystemSettings

**File:** `src/models/utility_models/systemSettings.model.js`

**Description:** Global system settings (single document).

**Schema:**
```javascript
{
  notificationsEnabled: Boolean,        // Default: true
  maxBloodBagsPerDay: Number,          // Default: 200
  maxEventsPerDay: Number,             // Default: 3
  allowWeekendEvents: Boolean,         // Default: false
  advanceBookingDays: Number,          // Default: 30
  maxPendingRequests: Number,         // Default: 1
  preventOverlappingRequests: Boolean, // Default: true
  preventDoubleBooking: Boolean,       // Default: false
  allowCoordinatorStaffAssignment: Boolean,  // Default: false
  requireStaffAssignment: Boolean,    // Default: false
  blockedWeekdays: [Number],          // Default: [] (0-6, Sun-Sat)
  blockedDates: [String],            // Default: [] (ISO date strings)
  reviewAutoExpireHours: Number,      // Default: 72
  reviewConfirmationWindowHours: Number,  // Default: 48
  notifyCounterpartAdmins: Boolean,   // Default: true
  createdAt: Date,
  updatedAt: Date
}
```

---

### RegistrationCode

**File:** `src/models/utility_models/registrationCode.model.js`

**Description:** Registration codes for user signup.

**Schema:**
```javascript
{
  Code: String,              // Required, unique
  Coordinator_ID: String,   // Required, ref: 'Coordinator'
  District_ID: String,      // Required, ref: 'District'
  Max_Uses: Number,         // Required, default: 1, min: 1
  Uses: Number,             // Required, default: 0, min: 0
  Expires_At: Date,         // Optional
  IsActive: Boolean,        // Required, default: true
  createdAt: Date,
  updatedAt: Date
}
```

**Methods:**
- `consume()` - Increment uses and deactivate if max reached

---

### SignUpRequest

**File:** `src/models/utility_models/signupRequest.model.js`

**Description:** Public signup requests.

**Schema:**
```javascript
{
  firstName: String,        // Required
  middleName: String,       // Optional
  lastName: String,         // Required
  email: String,           // Required, lowercase
  phoneNumber: String,      // Optional
  password: String,        // Required (hashed)
  organization: String,    // Optional
  province: ObjectId,      // Required, ref: 'Province'
  district: ObjectId,     // Required, ref: 'District'
  municipality: ObjectId, // Required, ref: 'Municipality'
  assignedCoordinator: ObjectId,  // Optional, ref: 'Coordinator'
  status: String,         // Enum: 'pending', 'approved', 'rejected', default: 'pending'
  emailVerificationToken: String,  // Optional
  verificationCode: String,  // Optional
  emailVerified: Boolean,   // Default: false
  submittedAt: Date,        // Default: now
  decisionAt: Date,        // Optional
  createdAt: Date,
  updatedAt: Date
}
```

---

### BloodBag

**File:** `src/models/utility_models/bloodbag.model.js`

**Description:** Blood bag inventory model.

**Schema:**
```javascript
{
  BloodBag_ID: String,      // Required, unique
  BloodType: String,       // Enum: 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', required
  createdAt: Date,
  updatedAt: Date
}
```

---

## Chat Models

### Message

**File:** `src/models/chat_models/message.model.js`

**Description:** Chat message model.

**Schema:**
```javascript
{
  messageId: String,         // Required, unique
  senderId: String,        // Required, ref: 'BloodbankStaff' (legacy)
  receiverId: String,     // Required, ref: 'BloodbankStaff' (legacy)
  content: String,         // Required if messageType === 'text'
  messageType: String,    // Enum: 'text', 'image', 'file', 'system', default: 'text'
  attachments: [{
    filename: String,
    url: String,
    key: String,
    mime: String,
    fileType: String,
    size: Number
  }],
  timestamp: Date,        // Default: now
  status: String,         // Enum: 'sent', 'delivered', 'read', default: 'sent'
  readAt: Date,          // Optional
  conversationId: String,  // Required, indexed
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `conversationId, timestamp` (compound, descending)
- `senderId, receiverId, timestamp` (compound, descending)

---

### Conversation

**File:** `src/models/chat_models/conversation.model.js`

**Description:** Conversation model for chat.

**Schema:**
```javascript
{
  conversationId: String,   // Required, unique
  participants: [{
    userId: String,        // Required
    joinedAt: Date        // Default: now
  }],
  type: String,           // Enum: 'direct', 'group', default: 'direct'
  lastMessage: {
    messageId: String,
    content: String,
    senderId: String,
    timestamp: Date
  },
  unreadCount: Map,      // Map of userId -> count
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `participants.userId`
- `updatedAt` (descending)

---

### Presence

**File:** `src/models/chat_models/presence.model.js`

**Description:** User presence status.

**Schema:**
```javascript
{
  userId: String,         // Required, unique, ref: 'BloodbankStaff' (legacy)
  status: String,        // Enum: 'online', 'offline', 'idle', default: 'offline'
  lastSeen: Date,       // Default: now
  socketId: String,     // Optional
  createdAt: Date,
  updatedAt: Date
}
```

---

## Model Relationships

### User Hierarchy
- `User.userId` → Legacy ID mapping
- `User._id` → Referenced by `UserRole.userId`, `UserLocation.userId`
- `User.organizationId` → Future Organization reference

### RBAC Relationships
- `UserRole.userId` → `User._id`
- `UserRole.roleId` → `Role._id`
- `Role.permissions` → Embedded permission objects
- `UserLocation.userId` → `User._id`
- `UserLocation.locationId` → `Location._id`
- `UserLocation.assignedBy` → `User._id`

### Event Hierarchy
- `EventStaff.EventID` → `Event.Event_ID`
- `BloodDrive.BloodDrive_ID` → `Event.Event_ID`
- `Advocacy.Advocacy_ID` → `Event.Event_ID`
- `Training.Training_ID` → `Event.Event_ID`

### Request Flow
- `EventRequest.requester.userId` → `User._id`
- `EventRequest.reviewer.userId` → `User._id`
- `EventRequest.Event_ID` → `Event.Event_ID`
- `EventRequestHistory.Request_ID` → `EventRequest.Request_ID`
- `EventRequestHistory.Event_ID` → `Event.Event_ID`

### Notifications
- `Notification.Recipient_ID` → `User._id` (or legacy ID)
- `Notification.Request_ID` → `EventRequest.Request_ID`
- `Notification.Event_ID` → `Event.Event_ID`

### Location Hierarchy
- `Location.parent` → `Location._id` (self-referencing)
- `Location.province` → `Location._id` (denormalized)

---

## Common Patterns

### Timestamps

All models include `createdAt` and `updatedAt` timestamps (via Mongoose `timestamps: true`).

### Soft Deletes

Many models use `isActive` flag for soft deletion instead of hard deletes.

### Indexes

Common index patterns:
- Unique fields: `{ field: 1 }, { unique: true }`
- Compound indexes: `{ field1: 1, field2: 1 }`
- Sparse indexes: `{ field: 1 }, { sparse: true }` (for optional unique fields)
- TTL indexes: `{ expiresAt: 1 }, { expireAfterSeconds: 0 }`

### Validation

Field-level validation is handled by:
- Mongoose schema validators
- Joi validators (in route handlers)
- Custom validation methods

---

## Related Documentation

- [Users API](API_USERS.md) - User model usage
- [RBAC API](API_RBAC.md) - Role and Permission models
- [Events API](API_EVENTS.md) - Event models
- [Requests API](API_REQUESTS.md) - Request models
- [Locations API](API_LOCATIONS.md) - Location model
- [Chat API](API_CHAT.md) - Chat models

---

**Last Updated:** 2024
