# Models and Routes Guide (Non-V2)

Scope
- This guide covers models in src/models and routes in src/routes.
- V2 routes are excluded (src/routes/v2.0_eventRoutes.js).
- Model details are based on Mongoose schemas (required fields, types, refs, enums, defaults).

Table of contents
1. Models
   - User and RBAC
   - Events
   - Requests
   - Utility
   - Chat
2. Routes
3. Model to Routes Map

================================================================================
1. MODELS
================================================================================

1.1 User and RBAC Models

User (Unified)
- Model: User
- File: src/models/users_models/user.model.js
- Required fields
  - email: String (lowercase)
  - password: String
  - firstName: String
  - lastName: String
  - authority: Number (min 20, max 100)
- Optional core identity fields
  - userId: String (legacy)
  - middleName: String
  - phoneNumber: String
- Organization fields
  - organizationType: String
  - organizationId: ObjectId ref Organization
  - organizationInstitution: String
  - field: String
  - registrationCode: String
- Authority audit
  - authority_changed_at: Date
  - authority_changed_by: ObjectId ref User
- Roles array (embedded)
  - roles[].roleId: ObjectId ref Role (required)
  - roles[].roleCode: String (required, lowercase)
  - roles[].roleAuthority: Number (required, 20-100)
  - roles[].assignedAt: Date (default now)
  - roles[].assignedBy: ObjectId ref User
  - roles[].isActive: Boolean (default true)
- Organizations array (embedded)
  - organizations[].organizationId: ObjectId ref Organization (required)
  - organizations[].organizationName: String (required)
  - organizations[].organizationType: String (required)
  - organizations[].isPrimary: Boolean (default false)
  - organizations[].assignedAt: Date (default now)
  - organizations[].assignedBy: ObjectId ref User
- Coverage areas array (embedded)
  - coverageAreas[].coverageAreaId: ObjectId ref CoverageArea (required)
  - coverageAreas[].coverageAreaName: String (required)
  - coverageAreas[].districtIds: ObjectId[] ref Location
  - coverageAreas[].municipalityIds: ObjectId[] ref Location
  - coverageAreas[].isPrimary: Boolean (default false)
  - coverageAreas[].assignedAt: Date (default now)
  - coverageAreas[].assignedBy: ObjectId ref User
- Location (stakeholder)
  - locations.municipalityId: ObjectId ref Location
  - locations.municipalityName: String
  - locations.barangayId: ObjectId ref Location
  - locations.barangayName: String
- Account flags
  - isSystemAdmin: Boolean (default false)
  - isActive: Boolean (default true)
  - lastLoginAt: Date
- metadata: Mixed (flexible)

UserNotificationPreferences
- Model: UserNotificationPreferences
- File: src/models/users_models/userNotificationPreferences.model.js
- Required fields
  - userId: ObjectId ref User
- Preferences
  - emailNotificationsEnabled: Boolean (default true)
  - emailDigestMode: Boolean (default false)
  - emailDigestFrequency: String enum [hourly, daily, never] (default hourly)
  - enabledNotificationTypes: String[]
  - autoDigestThreshold: Number (default 5, min 1, max 20)
  - autoDigestRevertHours: Number (default 24, min 1, max 168)
  - temporaryDigestMode: Boolean (default false)
  - temporaryDigestUntil: Date
  - lastDigestSentAt: Date
  - lastEmailSentAt: Date
  - emailCountLastHour: Number (default 0)
  - emailCountResetAt: Date (default now + 1 hour)
  - mutedUntil: Date

Role
- Model: Role
- File: src/models/users_models/role.model.js
- Required fields
  - code: String (lowercase)
  - name: String
  - authority: Number (default 20, min 20, max 100)
- Optional fields
  - description: String
  - isSystemRole: Boolean (default false)
  - isActive: Boolean (default true)
- permissions: Array
  - permissions[].resource: String (required)
  - permissions[].actions: String[] (required)
  - permissions[].metadata: Mixed

Permission
- Model: Permission
- File: src/models/users_models/permission.model.js
- Required fields
  - code: String (lowercase)
  - name: String
  - resource: String
  - action: String
- Optional fields
  - description: String
  - type: String enum [resource, page, feature, staff] (default resource)
  - metadata: Mixed (default {})

UserRole
- Model: UserRole
- File: src/models/users_models/userRole.model.js
- Required fields
  - userId: ObjectId ref User
  - roleId: ObjectId ref Role
- Optional fields
  - assignedAt: Date (default now)
  - assignedBy: ObjectId ref User
  - expiresAt: Date
  - isActive: Boolean (default true)
  - context.locationScope: ObjectId[] ref Location
  - context.coverageAreaScope: ObjectId[] ref CoverageArea
  - context.organizationScope: ObjectId ref Organization

UserLocation
- Model: UserLocation
- File: src/models/users_models/userLocation.model.js
- Required fields
  - userId: ObjectId ref User
  - locationId: ObjectId ref Location
  - scope: String enum [exact, descendants, ancestors, all] (default exact)
- Optional fields
  - isPrimary: Boolean (default false)
  - assignedAt: Date (default now)
  - assignedBy: ObjectId ref User
  - expiresAt: Date
  - isActive: Boolean (default true)

UserCoverageAssignment
- Model: UserCoverageAssignment
- File: src/models/users_models/userCoverageAssignment.model.js
- Required fields
  - userId: ObjectId ref User
  - coverageAreaId: ObjectId ref CoverageArea
- Optional fields
  - isPrimary: Boolean (default false)
  - autoCoverDescendants: Boolean (default false)
  - assignedBy: ObjectId ref User
  - assignedAt: Date (default now)
  - expiresAt: Date
  - isActive: Boolean (default true)

UserOrganization
- Model: UserOrganization
- File: src/models/users_models/userOrganization.model.js
- Required fields
  - userId: ObjectId ref User
  - organizationId: ObjectId ref Organization
  - assignedAt: Date (default now)
- Optional fields
  - roleInOrg: String (default member)
  - isPrimary: Boolean (default false)
  - assignedBy: ObjectId ref User
  - expiresAt: Date
  - isActive: Boolean (default true)

================================================================================
1.2 Event Models
================================================================================

Event
- Model: Event
- File: src/models/events_models/event.model.js
- Required fields
  - Event_ID: String (unique)
  - Event_Title: String
  - Location: String
  - Start_Date: Date
  - coordinator_id: String (legacy)
  - made_by_id: String (legacy)
  - made_by_role: String enum [SystemAdmin, Coordinator, Stakeholder]
  - Status: String enum [Pending, Approved, Rescheduled, Rejected, Completed, Cancelled] (default Pending)
- Optional fields
  - Request_ID: String (index)
  - isBatchCreated: Boolean (default false)
  - End_Date: Date
  - stakeholder_id: String (legacy)
  - province: ObjectId ref Province (legacy)
  - district: ObjectId ref District (legacy)
  - municipality: ObjectId ref Municipality (legacy)
  - stakeholder: ObjectId ref Stakeholder (legacy)
  - StaffAssignmentID: String
  - Email: String
  - Phone_Number: String
  - Event_Description: String
  - Category: String

EventStaff
- Model: EventStaff
- File: src/models/events_models/eventStaff.model.js
- Required fields
  - EventID: String ref Event
  - Staff_FullName: String
  - Role: String

BloodDrive
- Model: BloodDrive
- File: src/models/events_models/bloodDrive.model.js
- Required fields
  - BloodDrive_ID: String (unique, ref Event)
  - Target_Donation: Number
- Optional fields
  - VenueType: String

Advocacy
- Model: Advocacy
- File: src/models/events_models/advocacy.model.js
- Required fields
  - Advocacy_ID: String (unique, ref Event)
- Optional fields
  - Topic: String
  - TargetAudience: String
  - ExpectedAudienceSize: Number
  - PartnerOrganization: String

Training
- Model: Training
- File: src/models/events_models/training.model.js
- Required fields
  - Training_ID: String (unique, ref Event)
  - MaxParticipants: Number
- Optional fields
  - TrainingType: String

================================================================================
1.3 Request Models
================================================================================

EventRequest (New)
- Model: EventRequest
- File: src/models/eventRequests_models/eventRequest.model.js
- Required fields
  - Request_ID: String (unique)
  - requester.userId: ObjectId ref User
  - requester.authoritySnapshot: Number
  - Event_Title: String
  - Location: String
  - Date: Date
  - status: String enum REQUEST_STATES (default PENDING_REVIEW)
- Optional fields
  - Event_ID: String ref Event
  - requester.name: String
  - requester.roleSnapshot: String
  - reviewer: object (see below)
  - validCoordinators: array (see below)
  - claimedBy: object
  - latestAction: object
  - organizationId: ObjectId ref Organization
  - coverageAreaId: ObjectId ref CoverageArea
  - municipalityId: ObjectId ref Location
  - district: ObjectId ref Location
  - province: ObjectId ref Location
  - Email: String
  - Phone_Number: String
  - Event_Description: String
  - Category: String
  - Target_Donation: Number
  - VenueType: String
  - TrainingType: String
  - MaxParticipants: Number
  - Topic: String
  - TargetAudience: String
  - ExpectedAudienceSize: Number
  - PartnerOrganization: String
  - StaffAssignmentID: String
  - statusHistory: StatusHistory[]
  - decisionHistory: Decision[]
  - rescheduleProposal: RescheduleProposal
  - eventId: ObjectId ref Event
  - notes: String
  - activeResponder: object
  - lastAction: object
- reviewer (Reviewer schema)
  - userId: ObjectId ref User (required)
  - name: String
  - roleSnapshot: String
  - assignedAt: Date (default now)
  - autoAssigned: Boolean (default true)
  - assignmentRule: String enum [stakeholder-to-coordinator, coordinator-to-admin, coordinator-to-stakeholder, admin-to-coordinator, auto-assigned, manual]
  - overriddenAt: Date
  - overriddenBy: ActorSnapshot
- validCoordinators[]
  - userId: ObjectId ref User (required)
  - name: String
  - roleSnapshot: String
  - coverageAreaId: ObjectId ref CoverageArea
  - organizationType: String
  - isActive: Boolean (default true)
  - discoveredAt: Date (default now)
- claimedBy
  - userId: ObjectId ref User
  - name: String
  - claimedAt: Date (default now)
  - claimTimeoutAt: Date
- latestAction
  - action: String
  - actor.userId: ObjectId ref User
  - actor.name: String
  - timestamp: Date (default now)
- StatusHistory
  - status: String
  - note: String
  - changedAt: Date (default now)
  - actor: ActorSnapshot
- Decision
  - type: String enum [accept, reject, reschedule]
  - notes: String
  - decidedAt: Date (default now)
  - actor: ActorSnapshot (required)
  - payload.proposedDate: Date
  - payload.proposedStartTime: String
  - payload.proposedEndTime: String
- RescheduleProposal
  - proposedDate: Date
  - proposedStartTime: String
  - proposedEndTime: String
  - reviewerNotes: String
  - proposedAt: Date (default now)
  - proposedBy: ActorSnapshot
- ActorSnapshot
  - userId: ObjectId ref User (required)
  - name: String
  - roleSnapshot: String
  - authoritySnapshot: Number

EventRequest (Legacy)
- Model: EventRequestLegacy
- File: src/models/request_models/eventRequest.model.js
- Required fields
  - Request_ID: String (unique)
  - Event_ID: String ref Event
  - Status: String (default pending-review)
- Optional fields
  - coordinator_id: String (legacy)
  - stakeholder_id: String (legacy)
  - made_by_id: String (legacy)
  - made_by_role: String (legacy)
  - requester: object (userId, id, roleSnapshot, authoritySnapshot, name)
  - assignedCoordinator: object
  - stakeholderReference: object
  - organizationId: ObjectId ref Organization
  - coverageAreaId: ObjectId ref CoverageArea
  - municipalityId: ObjectId ref Location
  - reviewer: object
  - creator: actorSnapshot
  - stakeholderPresent: Boolean
  - province, district, municipality: ObjectId ref legacy models
  - stakeholder: ObjectId ref Stakeholder
  - location: object (province, district, municipality, custom)
  - permissions: object (canEdit, canReview, canApprove arrays of ObjectId ref User)
  - auditTrail: array of { action, actor, timestamp, changes, location }
  - Category: String
  - statusHistory, decisionHistory, rescheduleProposal, creatorConfirmation, finalResolution
  - activeResponder, lastAction, reviewSummary, decisionSummary
  - expiresAt, confirmationDueAt, expiredAt, reviewDeadlineHours
  - summaryTemplate, revision, originalData

EventRequestHistory
- Model: EventRequestHistory
- File: src/models/request_models/eventRequestHistory.model.js
- Required fields
  - History_ID: String (unique)
  - Request_ID: String ref EventRequest
  - Event_ID: String ref Event
  - Action: String enum [created, review-assigned, review-decision, review-expired, creator-response, status-updated, finalized, revision-requested]
  - ActionDate: Date (default now)
- Optional fields
  - Actor: { id, role, name, authority }
  - Note: String
  - PreviousStatus: String
  - NewStatus: String
  - Metadata: Mixed
  - PermissionUsed: String
  - ReviewerAuthority: Number
  - RequesterAuthority: Number

BloodBagRequest
- Model: BloodBagRequest
- File: src/models/request_models/bloodBagRequest.model.js
- Required fields
  - Request_ID: String
  - Requester_ID: String
  - Requestee_ID: String
  - RequestedItems: Array of { BloodType: String enum, Amount: Number }
- Optional fields
  - RequestedForAt: Date
  - Urgency: String enum [low, medium, high] (default medium)
  - Notes: String

================================================================================
1.4 Utility Models
================================================================================

Location
- Model: Location
- File: src/models/utility_models/location.model.js
- Required fields
  - name: String
  - type: String enum [province, district, city, municipality, barangay, custom]
- Optional fields
  - code: String (lowercase)
  - parent: ObjectId ref Location
  - level: Number (default 0)
  - province: ObjectId ref Location
  - administrativeCode: String
  - metadata.isCity: Boolean (default false)
  - metadata.isCombined: Boolean (default false)
  - metadata.operationalGroup: String
  - metadata.custom: Mixed
  - isActive: Boolean (default true)

Organization
- Model: Organization
- File: src/models/utility_models/organization.model.js
- Required fields
  - name: String
  - type: String enum [LGU, NGO, Hospital, BloodBank, RedCross, Non-LGU, Other]
- Optional fields
  - code: String (lowercase)
  - description: String
  - contactInfo.email: String
  - contactInfo.phone: String
  - contactInfo.address: String
  - isActive: Boolean (default true)
  - metadata: Mixed

CoverageArea
- Model: CoverageArea
- File: src/models/utility_models/coverageArea.model.js
- Required fields
  - name: String
  - geographicUnits: ObjectId[] ref Location (must have at least one)
- Optional fields
  - code: String (lowercase)
  - description: String
  - organizationId: ObjectId ref Organization
  - isActive: Boolean (default true)
  - metadata.isDefault: Boolean (default false)
  - metadata.tags: String[]
  - metadata.custom: Mixed

Notification
- Model: Notification
- File: src/models/utility_models/notifications.model.js
- Required fields
  - Notification_ID: String (unique)
  - Title: String
  - Message: String
  - NotificationType: String enum (see file for full list)
- Optional fields
  - recipientUserId: ObjectId ref User
  - Recipient_ID: String (legacy)
  - RecipientType: String enum [Admin, Coordinator, Stakeholder] (legacy)
  - Request_ID: String ref EventRequest
  - Event_ID: String ref Event
  - IsRead: Boolean (default false)
  - ReadAt: Date
  - ActionTaken: String
  - ActionNote: String
  - RescheduledDate: Date
  - OriginalDate: Date
  - actor.userId: ObjectId ref User
  - actor.name: String
  - actor.roleSnapshot: String
  - actor.authoritySnapshot: Number
  - deliveryStatus.inApp: Boolean (default true)
  - deliveryStatus.email: Boolean (default false)
  - deliveryStatus.emailSentAt: Date
  - deliveryStatus.emailError: String
  - deliveryStatus.queuedForDigest: Boolean (default false)
  - deliveryStatus.queuedAt: Date
  - batchId: String
  - Message_ID: String (legacy chat)
  - Sender_ID: String (legacy chat)
  - Conversation_ID: String (legacy chat)

RegistrationCode
- Model: RegistrationCode
- File: src/models/utility_models/registrationCode.model.js
- Required fields
  - Code: String
  - Coordinator_ID: String (legacy)
  - District_ID: String (legacy)
  - Max_Uses: Number (default 1)
  - Uses: Number (default 0)
  - IsActive: Boolean (default true)
- Optional fields
  - Expires_At: Date

SystemSettings
- Model: SystemSettings
- File: src/models/utility_models/systemSettings.model.js
- Fields
  - notificationsEnabled: Boolean (default true)
  - maxBloodBagsPerDay: Number (default 200)
  - maxEventsPerDay: Number (default 3)
  - allowWeekendEvents: Boolean (default false)
  - advanceBookingDays: Number (default 30)
  - maxPendingRequests: Number (default 1)
  - preventOverlappingRequests: Boolean (default true)
  - preventDoubleBooking: Boolean (default false)
  - allowCoordinatorStaffAssignment: Boolean (default false)
  - requireStaffAssignment: Boolean (default false)
  - blockedWeekdays: Number[] (0-6)
  - blockedDates: String[] (YYYY-MM-DD)
  - reviewAutoExpireHours: Number (default 72)
  - reviewConfirmationWindowHours: Number (default 48)
  - notifyCounterpartAdmins: Boolean (default true)

SignUpRequest
- Model: SignUpRequest
- File: src/models/utility_models/signupRequest.model.js
- Required fields
  - firstName: String
  - lastName: String
  - email: String (lowercase)
  - roleId: ObjectId ref Role
  - organizationId: ObjectId ref Organization
  - province: ObjectId ref Location
  - district: ObjectId ref Location
  - municipality: ObjectId ref Location
- Optional fields
  - middleName: String
  - phoneNumber: String
  - organization: String
  - assignedCoordinator: ObjectId ref User
  - status: String enum [pending, approved, rejected] (default pending)
  - emailVerificationToken: String
  - verificationCode: String
  - emailVerified: Boolean (default false)
  - passwordActivationToken: String
  - passwordActivationExpires: Date
  - submittedAt: Date (default now)
  - decisionAt: Date

BloodBag
- Model: BloodBag
- File: src/models/utility_models/bloodbag.model.js
- Required fields
  - BloodBag_ID: String (unique)
  - BloodType: String enum [A+, A-, B+, B-, AB+, AB-, O+, O-]

EmailDailyLimit
- Model: EmailDailyLimit
- File: src/models/utility_models/emailDailyLimit.model.js
- Required fields
  - date: Date (unique)
- Optional fields
  - emailsSent: Number (default 0)
  - isLocked: Boolean (default false)
  - lockedAt: Date
  - lastResetAt: Date

CalendarNote
- Model: CalendarNote
- File: src/models/utility_models/calendarNote.model.js
- Required fields
  - noteDate: String (YYYY-MM-DD)
  - content: String (max 500)
  - createdBy: String
- Optional fields
  - updatedBy: String

BugReport
- Model: BugReport
- File: src/models/utility_models/bugReport.model.js
- Required fields
  - Report_ID: String (unique)
  - Reporter_ID: ObjectId ref User
  - Reporter_Name: String
  - Reporter_Email: String
  - Description: String (max 5000)
- Optional fields
  - Image_Keys[]: { key, filename, contentType, size, uploadedAt }
  - Status: String enum [Open, In Progress, Resolved, Closed, Cannot Reproduce] (default Open)
  - Priority: String enum [Low, Medium, High, Critical] (default Medium)
  - Admin_Notes: String (max 5000)
  - Assigned_To: ObjectId ref User
  - Resolved_At: Date
  - Resolved_By: ObjectId ref User
  - User_Agent: String
  - Page_URL: String

================================================================================
1.5 Chat Models
================================================================================

Conversation
- Model: Conversation
- File: src/models/chat_models/conversation.model.js
- Required fields
  - conversationId: String (unique)
- Optional fields
  - participants[]: { userId: String, joinedAt: Date }
  - type: String enum [direct, group] (default direct)
  - lastMessage: { messageId, content, senderId, timestamp }
  - unreadCount: Map<String, Number>

Message
- Model: Message
- File: src/models/chat_models/message.model.js
- Required fields
  - messageId: String (unique)
  - senderId: String ref User
  - receiverId: String ref User
  - conversationId: String
  - content: String (required if messageType is text)
- Optional fields
  - messageType: String enum [text, image, file, system] (default text)
  - attachments[]: { filename, url, key, mime, fileType, size }
  - timestamp: Date (default now)
  - status: String enum [sent, delivered, read] (default sent)
  - readAt: Date

Presence
- Model: Presence
- File: src/models/chat_models/presence.model.js
- Required fields
  - userId: String (unique)
- Optional fields
  - status: String enum [online, offline, idle] (default offline)
  - lastSeen: Date (default now)
  - socketId: String

================================================================================
2. ROUTES (NON-V2)
================================================================================

Route mounts
- All routes are mounted under /api unless noted.
- RBAC routes are mounted under /api/rbac.
- Chat routes are mounted under /api/chat.
- File routes are mounted under /api/files.

Auth (src/routes/auth.routes.js)
- POST /api/auth/login
- POST /api/auth/refresh
- GET /api/auth/me
- POST /api/auth/logout
- GET /api/auth/activate-account
- POST /api/auth/activate-account

Users (src/routes/users.routes.js)
- GET /api/users/check-email/:email
- GET /api/users
- GET /api/users/create-context
- GET /api/users/creation-context/municipalities
- GET /api/users/by-capability
- GET /api/users/:userId/coordinator
- GET /api/users/:userId/coordinator/diagnostic
- GET /api/users/:userId
- GET /api/users/:userId/capabilities
- GET /api/users/:userId/edit-context
- GET /api/users/:userId/diagnostics
- POST /api/users
- PUT /api/users/:userId
- DELETE /api/users/:userId
- GET /api/registration-codes/validate
- POST /api/users/:userId/coverage-areas
- GET /api/users/:userId/coverage-areas
- GET /api/users/:userId/coverage-areas/primary
- GET /api/users/:userId/coverage-areas/geographic-units
- DELETE /api/users/:userId/coverage-areas/:coverageAreaId
- GET /api/coverage-areas/:coverageAreaId/users
- GET /api/users/me/notification-preferences
- GET /api/users/:userId/notification-preferences
- PUT /api/users/me/notification-preferences
- PUT /api/users/:userId/notification-preferences
- POST /api/users/me/notification-preferences/mute
- POST /api/users/:userId/notification-preferences/toggle-digest

RBAC (src/routes/rbac.routes.js)
- GET /api/rbac/roles
- GET /api/rbac/roles/:roleId
- POST /api/rbac/roles
- PUT /api/rbac/roles/:roleId
- GET /api/rbac/roles/:roleId/users-count
- DELETE /api/rbac/roles/:roleId
- GET /api/rbac/permissions
- GET /api/rbac/permissions/:id
- POST /api/rbac/permissions
- PUT /api/rbac/permissions/:id
- DELETE /api/rbac/permissions/:id
- POST /api/rbac/permissions/check
- GET /api/rbac/users/:userId/roles
- POST /api/rbac/users/:userId/roles
- DELETE /api/rbac/users/:userId/roles/:roleId
- GET /api/rbac/users/:userId/permissions
- GET /api/rbac/permissions/user/:userId/pages
- GET /api/rbac/permissions/user/:userId/features
- GET /api/rbac/permissions/user/:userId/staff-types/:action
- GET /api/rbac/authority/user/:userId
- GET /api/rbac/authority/role/:roleId
- GET /api/rbac/authority/assignable-roles

Events (src/routes/events.routes.js)
- GET /api/public/events
- GET /api/public/events/:eventId
- GET /api/events/all
- GET /api/me/events
- GET /api/calendar/month
- GET /api/calendar/week
- GET /api/calendar/day
- GET /api/calendar/notes
- POST /api/calendar/notes
- PATCH /api/calendar/notes/:id
- DELETE /api/calendar/notes/:id
- GET /api/calendar/events/:eventId/category
- GET /api/calendar/upcoming
- GET /api/events/:eventId
- POST /api/events/batch
- GET /api/events/:eventId/category
- GET /api/events/coordinators/:coordinatorId
- GET /api/events/:eventId/statistics
- GET /api/events/:eventId/completeness
- GET /api/events
- GET /api/events/by-status
- GET /api/events/upcoming
- GET /api/events/recent
- GET /api/events/search
- GET /api/events/statistics
- GET /api/events/statistics/by-status
- GET /api/events/statistics/by-category
- GET /api/events/statistics/requests
- GET /api/events/statistics/blood-drives
- GET /api/events/statistics/coordinators
- GET /api/events/statistics/timeline
- GET /api/events/statistics/dashboard
- POST /api/events
- POST /api/events/:eventId/publish

Event Requests (new) (src/routes/eventRequests.routes.js)
- POST /api/event-requests
- POST /api/event-requests/batch
- GET /api/event-requests
- GET /api/event-requests/:requestId
- PUT /api/event-requests/:requestId
- POST /api/event-requests/:requestId/actions
- GET /api/event-requests/:requestId/actions
- DELETE /api/event-requests/:requestId
- DELETE /api/event-requests/:requestId/delete
- GET /api/event-requests/:requestId/staff
- POST /api/event-requests/:requestId/staff
- PUT /api/event-requests/:requestId/override-coordinator
- POST /api/event-requests/:requestId/claim
- POST /api/event-requests/:requestId/release
- GET /api/event-requests/:requestId/valid-coordinators

Requests (legacy, non-event) (src/routes/requests.routes.js)
- POST /api/requests/blood
- GET /api/requests/blood
- GET /api/requests/blood/:requestId
- PUT /api/requests/blood/:requestId
- DELETE /api/requests/blood/:requestId
- GET /api/settings
- POST /api/settings
- GET /api/settings/:settingKey
- POST /api/settings/validate-advance-booking
- POST /api/settings/validate-weekend
- POST /api/settings/validate-pending-requests
- GET /api/settings/min-booking-date
- GET /api/settings/max-booking-date
- GET /api/settings/staff-assignment-required
- GET /api/settings/coordinator-can-assign-staff
- POST /api/settings/validate-all-rules

Chat (src/routes/chat.routes.js)
- POST /api/chat/messages
- GET /api/chat/messages/:conversationId
- PUT /api/chat/messages/:messageId/read
- DELETE /api/chat/messages/:messageId
- GET /api/chat/conversations
- GET /api/chat/recipients
- GET /api/chat/presence/:userId
- POST /api/chat/presence/batch
- GET /api/chat/presence/online

Files (src/routes/files.routes.js)
- POST /api/files/presign
- GET /api/files/signed-url
- DELETE /api/files/:messageId/:index
- PATCH /api/files/:messageId/:index
- POST /api/files/attach

Locations (new system) (src/routes/locations.routes.js)
- POST /api/locations
- GET /api/locations/tree
- GET /api/locations/:locationId
- GET /api/locations/:locationId/ancestors
- GET /api/locations/:locationId/descendants
- GET /api/locations/provinces
- GET /api/locations/provinces/:provinceId/tree
- GET /api/locations/lazy-children/:parentId
- GET /api/locations/provinces/:provinceId/districts
- GET /api/locations/districts/:districtId/municipalities
- GET /api/locations/type/:type
- GET /api/districts
- GET /api/locations/municipalities
- PUT /api/locations/:locationId
- DELETE /api/locations/:locationId
- POST /api/users/:userId/locations
- GET /api/users/:userId/locations
- GET /api/users/:userId/locations/primary
- DELETE /api/users/:userId/locations/:locationId
- GET /api/users/:userId/locations/:locationId/access
- GET /api/cache/locations/status
- POST /api/cache/locations/rebuild
- POST /api/cache/locations/clear

Organizations (src/routes/organizations.routes.js)
- POST /api/organizations
- GET /api/organizations
- GET /api/organizations/:id
- PUT /api/organizations/:id
- DELETE /api/organizations/:id
- GET /api/organizations/:id/coverage-areas

Coverage Areas (src/routes/coverageAreas.routes.js)
- POST /api/coverage-areas
- GET /api/coverage-areas
- GET /api/coverage-areas/:id
- PUT /api/coverage-areas/:id
- DELETE /api/coverage-areas/:id
- GET /api/coverage-areas/:id/geographic-units
- GET /api/geographic-units/:id/coverage-areas
- POST /api/coverage-areas/:id/geographic-units
- DELETE /api/coverage-areas/:id/geographic-units/:geographicUnitId

Utility (legacy districts, notifications, signup, bug reports) (src/routes/utility.routes.js)
- POST /api/districts
- GET /api/districts/:districtId
- GET /api/districts
- GET /api/districts/by-region
- PUT /api/districts/:districtId
- DELETE /api/districts/:districtId
- GET /api/districts/search
- GET /api/districts/statistics
- GET /api/districts/:districtId/exists
- POST /api/utility/bug-reports
- GET /api/utility/bug-reports
- GET /api/utility/bug-reports/statistics
- GET /api/utility/bug-reports/:reportId
- PUT /api/utility/bug-reports/:reportId
- DELETE /api/utility/bug-reports/:reportId
- POST /api/notifications
- GET /api/notifications
- GET /api/notifications/unread-count
- PUT /api/notifications/:notificationId/read
- PUT /api/notifications/mark-multiple-read
- PUT /api/notifications/mark-all-read
- GET /api/notifications/:notificationId
- DELETE /api/notifications/:notificationId
- GET /api/notifications/statistics
- GET /api/notifications/latest
- POST /api/notifications/new-request
- POST /api/notifications/admin-action
- POST /api/notifications/coordinator-action
- POST /api/notifications/admin-cancellation
- POST /api/notifications/stakeholder-cancellation
- POST /api/notifications/request-deletion
- POST /api/notifications/stakeholder-deletion
- POST /api/notifications/new-signup-request
- POST /api/notifications/signup-request-approved
- POST /api/notifications/signup-request-rejected
- GET /api/locations/provinces
- GET /api/locations/provinces/:provinceId/districts
- GET /api/locations/districts/:districtId/municipalities
- GET /api/locations/municipalities
- POST /api/signup-requests
- PUT /api/signup-requests/:id/approve
- PUT /api/signup-requests/:id/reject
- GET /api/signup-requests
- GET /api/signup-requests/verify-email
- GET /api/public/roles/stakeholder
- GET /api/public/organizations

Inventory (src/routes/inventory.routes.js)
- POST /api/bloodbags
- GET /api/bloodbags
- GET /api/bloodbags/:bloodBagId
- PUT /api/bloodbags/:bloodBagId
- DELETE /api/bloodbags/:bloodBagId

Pages and Features (src/routes/pages.routes.js)
- GET /api/pages/check/:pageRoute
- GET /api/pages/accessible
- GET /api/features/available
- GET /api/features/check/:featureCode

Stakeholder (src/routes/stakeholder.routes.js)
- GET /api/stakeholders/creation-context
- GET /api/stakeholders/barangays/:municipalityId
- GET /api/stakeholders/diagnostics/:userId

Monitoring (src/routes/monitoring.routes.js)
- GET /api/monitoring/health
- GET /api/monitoring/metrics
- GET /api/monitoring/activity
- GET /api/monitoring/ping
- ALL /api/monitoring/echo

Public (src/routes/public.routes.js)
- (empty)

================================================================================
3. MODEL TO ROUTES MAP
================================================================================

User
- /api/auth/* (login, me, refresh)
- /api/users/* (CRUD, context, diagnostics, capabilities)
- /api/users/:userId/roles (via /api/rbac)
- /api/stakeholders/* (diagnostics, barangays context)

UserNotificationPreferences
- /api/users/me/notification-preferences
- /api/users/:userId/notification-preferences

Role / Permission / UserRole
- /api/rbac/roles
- /api/rbac/permissions
- /api/rbac/users/:userId/roles
- /api/rbac/users/:userId/permissions
- /api/pages/* and /api/features/* (capability checks)

UserLocation
- /api/users/:userId/locations (assign, list, primary, revoke)
- /api/users/:userId/locations/:locationId/access

UserCoverageAssignment
- /api/users/:userId/coverage-areas (assign, list, primary, revoke)
- /api/coverage-areas/:coverageAreaId/users

UserOrganization
- Indirect via user create/update and organization management routes

Event
- /api/events/* and /api/public/events/*
- /api/event-requests/:requestId/staff (staff assignment linked to event)

EventStaff
- /api/event-requests/:requestId/staff

BloodDrive / Advocacy / Training
- /api/events/:eventId/category
- /api/calendar/events/:eventId/category

EventRequest (new)
- /api/event-requests/*
- /api/notifications/* (request-related notifications)
- /api/events/statistics/requests

EventRequestLegacy / EventRequestHistory
- EventRequestHistory is used by request workflow services (no direct routes)
- Legacy request endpoints live under /api/requests (non-event)

BloodBagRequest
- /api/requests/blood*

BloodBag
- /api/bloodbags*

Location
- /api/locations/*
- /api/districts
- /api/locations/provinces
- /api/locations/municipalities
- /api/cache/locations/*
- /api/public/organizations (indirect for signup)

CoverageArea
- /api/coverage-areas/*
- /api/users/:userId/coverage-areas/*

Organization
- /api/organizations/*
- /api/public/organizations

Notification
- /api/notifications/*

RegistrationCode
- /api/registration-codes/validate

SystemSettings
- /api/settings*

SignUpRequest
- /api/signup-requests*

BugReport
- /api/utility/bug-reports*

CalendarNote
- /api/calendar/notes*

EmailDailyLimit
- No direct routes (internal mail limit tracking)

Conversation / Message / Presence
- /api/chat/*
- /api/files/* (message attachment flows)
