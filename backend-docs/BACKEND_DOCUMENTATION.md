# UNITE Backend - Detailed Documentation

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Database Models](#database-models)
5. [API Routes](#api-routes)
6. [Services](#services)
7. [Authentication & Authorization](#authentication--authorization)
8. [Request Workflow System](#request-workflow-system)
9. [Real-Time Features](#real-time-features)
10. [Security Features](#security-features)
11. [Error Handling](#error-handling)
12. [Deployment](#deployment)

---BMC

## System Overview

### Purpose

The UNITE Backend is a comprehensive RESTful API and WebSocket server designed for the Bicol Medical Center Blood Bank Event Management System. It streamlines the planning, approval, scheduling, and monitoring of blood-related activities through a centralized platform.

### Primary Users

1. **System Administrators**: Full system control, event approval, user management
2. **Coordinators**: Event request submission, confirmation, staff coordination
3. **Stakeholders**: Event creation, participation in workflow

### Core Objectives

- Enable coordinators to request, modify, and confirm blood-related events
- Allow admins to review, approve, reject, or reschedule event requests
- Enforce operational rules (daily capacity, bag limits, weekend restrictions)
- Operate a double-confirmation approval process
- Generate notifications across the event lifecycle
- Provide calendar-based and list-based visibility into scheduled events
- Store detailed logistics, staff, and institutional information

---

## Architecture

### Layered Architecture

The backend follows a clean, modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────┐
│         Express Server              │
│  (server.js - Entry Point)          │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│   Routes    │  │  Socket.IO   │
│  (REST API) │  │  (WebSocket) │
└──────┬──────┘  └──────┬───────┘
       │                │
┌──────▼────────────────▼──────┐
│      Middleware Layer         │
│  (Auth, Rate Limiting, CORS)  │
└──────┬───────────────────────┘
       │
┌──────▼──────┐
│ Controllers │
│ (Request    │
│  Handlers)  │
└──────┬──────┘
       │
┌──────▼──────┐
│   Services   │
│ (Business   │
│   Logic)     │
└──────┬──────┘
       │
┌──────▼──────┐
│    Models   │
│  (MongoDB   │
│   Schemas)   │
└─────────────┘
```

### Directory Structure

```
src/
├── models/              # MongoDB schemas
│   ├── users_models/    # User-related models
│   ├── events_models/   # Event-related models
│   ├── request_models/  # Request workflow models
│   ├── chat_models/     # Chat system models
│   └── utility_models/  # Utility models (notifications, locations, etc.)
├── controllers/         # Request handlers
│   ├── users_controller/
│   ├── events_controller/
│   ├── request_controller/
│   ├── chat_controller/
│   ├── inventory_controller/
│   └── utility_controller/
├── services/            # Business logic layer
│   ├── users_services/
│   ├── event_services/
│   ├── request_services/
│   ├── chat_services/
│   └── utility_services/
├── routes/              # API route definitions
│   ├── auth.routes.js
│   ├── users.routes.js
│   ├── events.routes.js
│   ├── requests.routes.js
│   ├── chat.routes.js
│   ├── inventory.routes.js
│   └── utility.routes.js
├── middleware/          # Express middleware
│   ├── authenticate.js
│   ├── requireRoles.js
│   └── rateLimiter.js
├── validators/          # Input validation schemas
│   ├── users_validators/
│   ├── event_validators/
│   ├── request_validators/
│   ├── chat_validators/
│   └── utility_validators/
└── utils/               # Utility functions
    ├── jwt.js
    ├── cache.js
    └── seedLocations.js
```

---

## Technology Stack

### Core Technologies

- **Node.js**: JavaScript runtime environment
- **Express.js**: Web application framework
- **MongoDB**: NoSQL database
- **Mongoose**: MongoDB object modeling tool

### Key Dependencies

- **jsonwebtoken**: JWT token generation and verification
- **bcrypt**: Password hashing
- **socket.io**: WebSocket communication for real-time features
- **joi**: Schema validation
- **rate-limiter-flexible**: Rate limiting with Redis support
- **compression**: Response compression middleware
- **cors**: Cross-Origin Resource Sharing
- **node-cache**: In-memory caching
- **@sendgrid/mail**: Email service integration
- **uuid**: Unique identifier generation

---

## Database Models

### User Models

#### BloodbankStaff
Base staff model containing:
- Personal information (First_Name, Middle_Name, Last_Name, Email, Phone)
- Authentication (Password hash)
- Staff identification (ID, StaffType: 'Admin' or 'Coordinator')
- Timestamps (createdAt, updatedAt)

#### SystemAdmin
Extends BloodbankStaff:
- Admin_ID (references BloodbankStaff.ID)
- Admin-specific permissions and settings

#### Coordinator
Extends BloodbankStaff:
- Coordinator_ID (references BloodbankStaff.ID)
- District_ID (references District)
- Coordinator-specific settings

#### Stakeholder
Independent stakeholder model:
- Stakeholder_ID
- Personal information
- District_ID assignment
- Institution details

### Event Models

#### Event
Core event model:
- Event_ID (unique identifier)
- Title, Description, Location
- Event_Date, Start_Time, End_Time
- Status (Pending, Approved, Confirmed, Rejected, Completed, Rescheduled)
- Category (BloodDrive, Advocacy, Training)
- Coordinator_ID reference
- Timestamps

#### BloodDrive
Event subtype for blood drives:
- BloodDrive_ID (references Event.Event_ID)
- Target_Donation (blood bag target)
- VenueType
- Blood drive specific fields

#### Advocacy
Event subtype for advocacy events:
- Advocacy_ID (references Event.Event_ID)
- Topic, TargetAudience
- ExpectedAudienceSize
- PartnerOrganization

#### Training
Event subtype for training events:
- Training_ID (references Event.Event_ID)
- TrainingType
- MaxParticipants

#### EventStaff
Staff assignment to events:
- EventID (references Event.Event_ID)
- Staff_ID (references BloodbankStaff.ID)
- Role, Assignment_Date

### Request Models

#### EventRequest
Core request workflow model:
- Request_ID (unique identifier)
- Coordinator_ID, Admin_ID, Stakeholder_ID (optional)
- Event_ID (references Event)
- Status (state machine states)
- Request_Date, Proposed_Date
- Review_Decision, Reviewer_ID
- Scheduling validation fields
- Complete audit trail

#### EventRequestHistory
Historical record of all request actions:
- History_ID
- Request_ID (references EventRequest)
- Event_ID (references Event)
- Action_Type, Actor_ID, Actor_Role
- Previous_Status, New_Status
- Action_Details, Timestamp

#### BloodBagRequest
Blood bag request model:
- Request_ID
- Requester_ID, Requestee_ID
- Blood_Type, Quantity
- Status, Priority
- Request_Date, Fulfillment_Date

### Chat Models

#### Message
Chat message model:
- Message_ID
- Conversation_ID (references Conversation)
- Sender_ID, Receiver_ID
- Content, Message_Type
- Status (sent, delivered, read)
- Timestamps

#### Conversation
Chat conversation model:
- Conversation_ID
- Participants (array of user IDs)
- Last_Message_ID
- Last_Activity
- Conversation_Type (direct, group)

#### Presence
User presence status:
- User_ID
- Status (online, offline, idle)
- Last_Seen
- Socket_ID

### Utility Models

#### Notification
System notifications:
- Notification_ID
- Recipient_ID, Recipient_Type (Admin/Coordinator)
- Type (request, admin_action, coordinator_action, message, etc.)
- Title, Message
- Related_Request_ID, Related_Event_ID
- Read_Status, Read_At
- Timestamps

#### District
Geographic district:
- District_ID
- District_Name, Province_Name
- Region information

#### Province
Geographic province:
- Province_ID
- Province_Name
- Region

#### Municipality
Geographic municipality:
- Municipality_ID
- Municipality_Name
- District_ID reference

#### SystemSettings
System configuration:
- Setting_Key, Setting_Value
- Configurable rules:
  - Max events per day
  - Max blood bags per day
  - Weekend restriction
  - Advance booking limits
  - Staff assignment requirements

#### RegistrationCode
User registration codes:
- Code (unique)
- Coordinator_ID
- District_ID
- Expiration_Date
- Usage_Count, Max_Usage

#### BloodBag
Blood bag inventory:
- BloodBag_ID
- Blood_Type
- Status (available, reserved, used, expired)
- Collection_Date, Expiration_Date
- Donor information

---

## API Routes

### Authentication Routes (`/api/auth`)

#### POST `/api/auth/login`
- **Description**: Authenticate user and return JWT token
- **Access**: Public
- **Request Body**: `{ email, password }`
- **Response**: `{ success, token, user }`

#### GET `/api/auth/me`
- **Description**: Get current authenticated user information
- **Access**: Private
- **Headers**: `Authorization: Bearer <token>`
- **Response**: `{ success, user }`

#### POST `/api/auth/logout`
- **Description**: Logout user (clears cookies)
- **Access**: Public
- **Response**: `{ success, message }`

#### POST `/api/auth/stakeholders/login`
- **Description**: Stakeholder-specific login
- **Access**: Public
- **Request Body**: `{ email, password }`

### User Management Routes (`/api/users`)

#### User Profile
- `GET /api/users/:userId` - Get user by ID
- `PUT /api/users/:userId/profile` - Update user profile
- `PUT /api/users/:userId/password` - Change password
- `PUT /api/users/:userId/reset-password` - Reset password (Admin only)
- `GET /api/users/check-email/:email` - Check email availability
- `GET /api/users/search` - Search users

#### Coordinator Creation
- `GET /api/users/create-context?pageContext=coordinator-management` - Get creation context (organizations, municipalities, roles)
- `GET /api/users/creation-context/municipalities` - Get municipalities with nested barangays
- `POST /api/users` - Create coordinator (with `pageContext: 'coordinator-management'` header)

#### System Admin
- `POST /api/admin` - Create system admin (Admin only)
- `GET /api/admin` - Get all admins (Admin only)
- `GET /api/admin/:adminId` - Get admin by ID (Admin only)
- `PUT /api/admin/:adminId` - Update admin (Admin only)
- `DELETE /api/admin/:adminId` - Delete admin (Admin only)
- `GET /api/admin/:adminId/dashboard` - Get admin dashboard
- `GET /api/admin/statistics` - Get system statistics

#### Coordinator
- `POST /api/coordinators` - Create coordinator (Admin only)
- `GET /api/coordinators` - Get all coordinators
- `GET /api/coordinators/:coordinatorId` - Get coordinator by ID
- `PUT /api/coordinators/:coordinatorId` - Update coordinator (Admin only)
- `DELETE /api/coordinators/:coordinatorId` - Delete coordinator (Admin only)
- `GET /api/coordinators/:coordinatorId/dashboard` - Get coordinator dashboard
- `POST /api/coordinators/:coordinatorId/registration-codes` - Create registration code
- `GET /api/coordinators/:coordinatorId/registration-codes` - List registration codes

#### Stakeholder
- `POST /api/stakeholders/register` - Register stakeholder
- `GET /api/stakeholders` - List stakeholders
- `GET /api/stakeholders/:stakeholderId` - Get stakeholder by ID
- `PUT /api/stakeholders/:stakeholderId` - Update stakeholder
- `DELETE /api/stakeholders/:stakeholderId` - Delete stakeholder

### Event Routes (`/api/events`)

#### Calendar Views
- `GET /api/calendar/month` - Get month view events
- `GET /api/calendar/week` - Get week view events
- `GET /api/calendar/day` - Get day view events
- `GET /api/calendar/upcoming` - Get upcoming events summary
- `GET /api/calendar/events/:eventId/category` - Get event category

#### Event Details
- `GET /api/events/:eventId` - Get complete event details
- `POST /api/events/batch` - Get multiple events by IDs
- `GET /api/events/:eventId/category` - Get event category data
- `GET /api/events/:eventId/statistics` - Get event statistics
- `GET /api/events/:eventId/completeness` - Check event completeness

#### Event Overview
- `GET /api/events` - Get all events (filtered, sorted, paginated)
- `GET /api/events/by-status` - Get events grouped by status
- `GET /api/events/upcoming` - Get upcoming events
- `GET /api/events/recent` - Get recent events
- `GET /api/events/search` - Search events
- `GET /api/public/events` - Get public events (no auth required)

#### Event Statistics
- `GET /api/events/statistics` - Comprehensive event statistics
- `GET /api/events/statistics/by-status` - Statistics by status
- `GET /api/events/statistics/by-category` - Statistics by category
- `GET /api/events/statistics/requests` - Request workflow statistics
- `GET /api/events/statistics/blood-drives` - Blood drive statistics
- `GET /api/events/statistics/coordinators` - Coordinator activity statistics
- `GET /api/events/statistics/timeline` - Timeline statistics (monthly)
- `GET /api/events/statistics/dashboard` - Dashboard summary statistics

### Request Routes (`/api/requests`)

#### Event Requests
- `POST /api/requests` - Submit event request (Coordinator/Stakeholder)
- `POST /api/events/direct` - Create immediate event (Admin/Coordinator)
- `GET /api/requests/pending` - Get pending requests (Admin)
- `GET /api/requests/me` - Get my requests (role-aware)
- `GET /api/requests/all` - Get all requests (Admin)
- `GET /api/requests/:requestId` - Get request by ID
- `PUT /api/requests/:requestId` - Update pending request (Coordinator)
- `DELETE /api/requests/:requestId` - Cancel request (Coordinator)
- `DELETE /api/requests/:requestId/delete` - Delete request

#### Request Actions
- `POST /api/requests/:requestId/admin-action` - Admin approve/reject/reschedule
- `POST /api/requests/:requestId/coordinator-action` - Coordinator accept/reject
- `POST /api/requests/:requestId/coordinator-confirm` - Coordinator confirm
- `POST /api/requests/:requestId/stakeholder-action` - Stakeholder accept/reject
- `POST /api/requests/:requestId/stakeholder-confirm` - Stakeholder confirm
- `POST /api/requests/:requestId/staff` - Assign staff to event (Admin)

#### Request Validation
- `GET /api/requests/check-overlap` - Check coordinator overlapping requests
- `GET /api/requests/check-double-booking` - Check date/location conflicts
- `POST /api/requests/validate` - Validate all scheduling rules
- `GET /api/requests/blood-bags/:date` - Get total blood bags for date

#### Blood Bag Requests
- `POST /api/requests/blood` - Create blood bag request
- `GET /api/requests/blood` - List blood bag requests
- `GET /api/requests/blood/:requestId` - Get blood bag request by ID
- `PUT /api/requests/blood/:requestId` - Update blood bag request
- `DELETE /api/requests/blood/:requestId` - Delete blood bag request

#### System Settings
- `GET /api/settings` - Get all system settings
- `POST /api/settings` - Update system settings (Admin only)
- `GET /api/settings/:settingKey` - Get specific setting
- `POST /api/settings/validate-advance-booking` - Validate advance booking
- `POST /api/settings/validate-weekend` - Validate weekend restriction
- `POST /api/settings/validate-pending-requests` - Validate pending limit
- `GET /api/settings/min-booking-date` - Get minimum booking date
- `GET /api/settings/max-booking-date` - Get maximum booking date
- `GET /api/settings/staff-assignment-required` - Check staff assignment requirement
- `GET /api/settings/coordinator-can-assign-staff` - Check coordinator staff assignment permission
- `POST /api/settings/validate-all-rules` - Validate all rules

### Chat Routes (`/api/chat`)

#### Messages
- `POST /api/chat/messages` - Send message
- `GET /api/chat/messages/:conversationId` - Get messages for conversation
- `PUT /api/chat/messages/:messageId/read` - Mark message as read
- `DELETE /api/chat/messages/:messageId` - Delete message

#### Conversations
- `GET /api/chat/conversations` - Get user conversations
- `GET /api/chat/recipients` - Get allowed recipients (permission-based)

#### Presence
- `GET /api/chat/presence/:userId` - Get user presence status
- `POST /api/chat/presence/batch` - Get multiple user presences
- `GET /api/chat/presence/online` - Get online users

### Inventory Routes (`/api/inventory`)

#### Blood Bags
- `POST /api/bloodbags` - Create blood bag
- `GET /api/bloodbags` - Get all blood bags
- `GET /api/bloodbags/:bloodBagId` - Get blood bag by ID
- `PUT /api/bloodbags/:bloodBagId` - Update blood bag
- `DELETE /api/bloodbags/:bloodBagId` - Delete blood bag

### Utility Routes (`/api/utility`)

#### Districts
- `POST /api/districts` - Create district (Admin only)
- `GET /api/districts` - Get all districts
- `GET /api/districts/:districtId` - Get district by ID
- `PUT /api/districts/:districtId` - Update district (Admin only)
- `DELETE /api/districts/:districtId` - Delete district (Admin only)
- `GET /api/districts/search` - Search districts
- `GET /api/districts/statistics` - Get district statistics
- `GET /api/districts/by-region` - Get districts by region

#### Notifications
- `POST /api/notifications` - Create notification
- `GET /api/notifications` - Get user notifications
- `GET /api/notifications/unread-count` - Get unread count
- `PUT /api/notifications/:notificationId/read` - Mark as read
- `PUT /api/notifications/mark-multiple-read` - Mark multiple as read
- `PUT /api/notifications/mark-all-read` - Mark all as read
- `GET /api/notifications/:notificationId` - Get notification by ID
- `DELETE /api/notifications/:notificationId` - Delete notification
- `GET /api/notifications/statistics` - Get notification statistics
- `GET /api/notifications/latest` - Get latest notifications

#### Convenience Notification Endpoints
- `POST /api/notifications/new-request` - Create new request notification
- `POST /api/notifications/admin-action` - Create admin action notification
- `POST /api/notifications/coordinator-action` - Create coordinator action notification
- `POST /api/notifications/admin-cancellation` - Create admin cancellation notification
- `POST /api/notifications/stakeholder-cancellation` - Create stakeholder cancellation notification
- `POST /api/notifications/request-deletion` - Create request deletion notification
- `POST /api/notifications/stakeholder-deletion` - Create stakeholder deletion notification
- `POST /api/notifications/new-signup-request` - Create signup request notification
- `POST /api/notifications/signup-request-approved` - Create signup approved notification
- `POST /api/notifications/signup-request-rejected` - Create signup rejected notification

#### Locations
- `GET /api/locations/provinces` - Get all provinces
- `GET /api/locations/provinces/:provinceId/districts` - Get districts by province
- `GET /api/locations/districts/:districtId/municipalities` - Get municipalities by district
- `GET /api/locations/municipalities` - Get all municipalities

#### Signup Requests
- `POST /api/signup-requests` - Submit signup request (Public)
- `GET /api/signup-requests` - Get signup requests (Coordinator/Admin)
- `PUT /api/signup-requests/:id/approve` - Approve signup request
- `PUT /api/signup-requests/:id/reject` - Reject signup request
- `GET /api/signup-requests/verify-email` - Verify email via token

---

## Services

### Request Services

#### RequestFlowEngine
State machine-based request processing engine:
- **Purpose**: Centralized request action processing
- **Features**:
  - State machine validation
  - Action normalization
  - Role-based permission checking
  - Automatic state transitions
  - History tracking

#### EventRequestService
Main service for event request operations:
- Create, read, update, delete requests
- Request validation (scheduling rules)
- Reviewer assignment
- Status management
- Integration with state machine

#### ReviewerAssignmentService
Configurable reviewer assignment:
- Rule-based assignment (Admin → Coordinator, Coordinator → Admin, Stakeholder → Coordinator)
- Admin override support
- Flexible configuration

#### SystemSettingsService
System configuration management:
- Get/update settings
- Rule validation (advance booking, weekend, pending limits)
- Minimum/maximum booking dates
- Staff assignment requirements

### Event Services

#### CalendarService
Calendar view operations:
- Month, week, day views
- Event filtering and grouping
- Upcoming events summary

#### EventDetailsService
Detailed event information:
- Complete event data retrieval
- Category-specific data
- Event statistics
- Completeness checking

#### EventOverviewService
Event listing and search:
- Filtered event lists
- Search functionality
- Status-based grouping
- Pagination support

#### EventStatisticsService
Comprehensive event analytics:
- Status-based statistics
- Category-based statistics
- Timeline statistics
- Coordinator activity
- Dashboard summaries

### Chat Services

#### MessageService
Message operations:
- Send messages
- Retrieve message history
- Mark as read/delivered
- Delete messages
- Conversation management

#### PresenceService
User presence tracking:
- Online/offline/idle status
- Last seen tracking
- Batch presence queries

#### TypingService
Typing indicator management:
- Start/stop typing
- Clear typing indicators
- Real-time updates

#### PermissionsService
Chat permission validation:
- Role-based chat permissions
- Can send message validation
- Allowed recipients list

### User Services

#### BloodbankStaffService
Staff management:
- User CRUD operations
- Authentication
- Profile management
- Password operations

#### CoordinatorService
Coordinator-specific operations:
- Coordinator management
- Dashboard data
- Event history
- Registration code management

#### SystemAdminService
Admin-specific operations:
- Admin management
- System statistics
- Dashboard data
- Coordinator management

#### StakeholderService
Stakeholder operations:
- Registration
- Profile management
- Request creation

#### RegistrationCodeService
Registration code management:
- Code generation
- Validation
- Usage tracking
- Expiration management

### Utility Services

#### NotificationService
Notification management:
- Create notifications
- Mark as read
- Get user notifications
- Statistics
- Type-specific notification creation

#### LocationService
Geographic data management:
- Province/district/municipality operations
- Signup request management
- Email verification

#### BloodBagService
Blood bag inventory management:
- CRUD operations
- Status tracking
- Expiration management

#### DistrictService
District management:
- CRUD operations
- Search and filtering
- Statistics

---

## Authentication & Authorization

### Authentication

#### JWT-Based Authentication
- Token generation on login
- Token verification middleware
- Token payload: `{ id, role, email, StaffType }`
- Token expiration handling

#### Authentication Middleware (`authenticate.js`)
- Verifies JWT from `Authorization: Bearer <token>` header
- Fallback to cookie-based authentication (`unite_user` cookie)
- Sets `req.user` with user information

### Authorization

#### Role-Based Access Control (RBAC)

**Roles:**
1. **System Admin** (`StaffType: 'Admin'`)
   - Full system access
   - User management
   - Event approval/rejection
   - System settings management
   - Override scheduling rules

2. **Coordinator** (`StaffType: 'Coordinator'`)
   - Event request creation
   - Request confirmation
   - Staff assignment (if permitted)
   - Registration code management
   - District-specific operations

3. **Stakeholder**
   - Event request creation
   - Request confirmation
   - Limited profile access

#### Authorization Middleware (`requireRoles.js`)
- `requireAdmin`: Admin-only routes
- `requireCoordinator`: Coordinator-only routes
- `requireAdminOrCoordinator`: Admin or Coordinator routes

### Chat Permissions

Strict role-based chat permissions:
- **System Admin**: Can chat only with Coordinators
- **Coordinator**: Can chat with System Admins and Stakeholders
- **Stakeholder**: Can chat only with Coordinators

---

## Request Workflow System

### State Machine Architecture

The request workflow uses a state machine pattern for robust, predictable state transitions.

#### States

1. **pending-review**: Initial state after request submission
2. **review-accepted**: Reviewer has accepted the request
3. **review-rejected**: Reviewer has rejected the request
4. **review-rescheduled**: Reviewer has proposed rescheduling
5. **awaiting-confirmation**: Waiting for requester confirmation
6. **approved**: Request approved and confirmed
7. **rejected**: Request rejected and confirmed
8. **cancelled**: Request cancelled
9. **closed**: Request closed (event completed)

#### Actions

1. **view**: View request details
2. **accept**: Reviewer accepts request
3. **reject**: Reviewer rejects request
4. **reschedule**: Reviewer proposes reschedule
5. **confirm**: Requester confirms reviewer decision
6. **decline**: Requester declines reviewer decision
7. **edit**: Edit request (pending state only)
8. **manage-staff**: Assign staff to event
9. **cancel**: Cancel request
10. **delete**: Delete request

### Workflow Flow

#### Standard Flow
1. Coordinator/Stakeholder submits request → `pending-review`
2. Reviewer (Admin/Coordinator) reviews → `review-accepted` / `review-rejected` / `review-rescheduled`
3. Requester confirms → `approved` / `rejected` / `awaiting-confirmation`
4. Final confirmation → Event created

#### Reschedule Flow
1. Reviewer proposes reschedule → `review-rescheduled`
2. Requester can:
   - Accept reschedule → `awaiting-confirmation`
   - Propose new date → `pending-review` (new cycle)
3. Reviewer confirms → `approved`

### Scheduling Rules Validation

Automatic validation of:
- **Maximum events per day**: Configurable (default: 3)
- **Maximum blood bags per day**: Configurable (default: 200)
- **Weekend restriction**: No weekend events unless admin override
- **Advance booking limits**: Minimum and maximum days in advance
- **Pending request limit**: One pending request per coordinator
- **Double booking**: Same location/venue on same date

### Reviewer Assignment

Configurable reviewer assignment rules:
- **Admin request** → Coordinator reviewer
- **Coordinator request** → Admin reviewer
- **Stakeholder request** → Coordinator reviewer (Admin can override)

---

## Real-Time Features

### WebSocket Communication (Socket.IO)

#### Connection Setup
- Authentication via JWT token in handshake
- User identification from token
- Connection tracking (`connectedUsers` Map)

#### Events

**Message Events:**
- `send_message`: Send a message
- `message_sent`: Confirmation to sender
- `new_message`: New message to receiver
- `message_delivered`: Delivery confirmation
- `message_read`: Read confirmation

**Presence Events:**
- `user_online`: User came online
- `user_offline`: User went offline
- `user_idle`: User is idle
- `presence_update`: Presence status update

**Typing Events:**
- `typing_start`: User started typing
- `typing_stop`: User stopped typing

**Conversation Events:**
- `join_conversation`: Join conversation room
- `leave_conversation`: Leave conversation room

**Presence Management:**
- `get_presence`: Get user presence
- `go_offline`: Manual offline status
- `set_idle`: Set idle status
- `set_active`: Set active status

### Real-Time Features

1. **Instant Messaging**: Real-time message delivery
2. **Presence Tracking**: Online/offline/idle status
3. **Typing Indicators**: Real-time typing status
4. **Read Receipts**: Message read status
5. **Notifications**: Real-time notification delivery

---

## Security Features

### Authentication Security
- JWT token-based authentication
- Password hashing with bcrypt (salt rounds: 10)
- Token expiration
- Secure token storage

### Authorization Security
- Role-based access control
- Route-level permission checks
- Service-level permission validation
- Chat permission enforcement

### Input Validation
- Joi schema validation on all endpoints
- Request body validation
- Parameter validation
- Type checking

### Security Headers
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (production only)
- Removed `X-Powered-By` header

### CORS Configuration
- Environment-based allowed origins
- Development: `localhost:3000, localhost:3001, localhost:5173`
- Production: Configurable via `ALLOWED_ORIGINS`
- Credentials support

### Rate Limiting
- General rate limiter (Redis-backed, configurable)
- Auth-specific rate limiter
- Protection against brute force attacks

### Data Protection
- Password never returned in responses
- Sensitive data filtering
- Secure error messages (hide stack traces in production)

---

## Error Handling

### Error Middleware

Global error handler in `server.js` handles:
- **CORS Errors**: 403 with descriptive message
- **Validation Errors**: 400 with error details
- **Mongoose Cast Errors**: 400 for invalid ID format
- **Duplicate Key Errors**: 409 for unique constraint violations
- **Default Errors**: 500 with error message (stack trace in development)

### Error Response Format

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error (development only)"
}
```

### 404 Handler

Catches all unmatched routes:
```json
{
  "success": false,
  "message": "Route /api/unknown not found",
  "method": "GET"
}
```

### Process Error Handlers

- **Unhandled Promise Rejection**: Logs error, exits in production
- **Uncaught Exception**: Logs error, exits process
- **SIGINT**: Graceful MongoDB disconnection

---

## Deployment

### Environment Variables

Required:
- `MONGODB_URI` or `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3000)

Optional:
- `MONGO_DB_NAME`: Specific database name
- `ALLOWED_ORIGINS`: Comma-separated allowed origins for CORS
- `SENDGRID_API_KEY`: Email service API key

### Health Check

Endpoint: `GET /health`

Response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "production",
  "database": "connected"
}
```

### Server Startup

1. Load environment variables
2. Validate required environment variables
3. Connect to MongoDB
4. Initialize Express app
5. Setup middleware (CORS, compression, body parser, security headers)
6. Mount routes
7. Setup Socket.IO
8. Setup error handlers
9. Start HTTP server

### Database Connection

- Connection pool: Max 5 connections
- Server selection timeout: 5 seconds
- Socket timeout: 45 seconds
- IPv4 only (family: 4)
- Automatic reconnection
- Graceful disconnection on SIGINT

### Production Considerations

- Enable rate limiting
- Use HTTPS
- Set secure CORS origins
- Enable security headers
- Disable detailed error messages
- Use environment-specific MongoDB URI
- Monitor connection pool
- Logging and monitoring setup

---

## Additional Features

### Caching
- In-memory caching with `node-cache`
- Configurable TTL
- Cache invalidation strategies

### Compression
- Response compression with `compression` middleware
- Reduces payload size
- Improves performance

### Email Integration
- SendGrid integration for email notifications
- Email verification for signup requests
- Configurable email templates

### Location Seeding
- Utility script for seeding provinces, districts, municipalities
- JSON-based location data
- Batch insertion support

### System Admin Creation
- Utility script for creating initial system admin
- JSON-based admin configuration
- Password hashing

---

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error (development only)"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

---

## Coordinator Creation API

### Overview

The coordinator creation API allows users with authority level ≥ 60 to create coordinators with multiple organizations, coverage areas, and roles. The system ensures proper authority validation, jurisdiction enforcement, and idempotent behavior.

### Endpoints

#### GET /api/users/create-context

Get creation context for coordinator creation, including available organizations, municipalities, and assignable roles.

**Query Parameters:**
- `pageContext` (required): Must be `'coordinator-management'`

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pageContext": "coordinator-management",
    "allowedRoles": [
      {
        "_id": "...",
        "code": "coordinator",
        "name": "Coordinator",
        "description": "...",
        "authority": 60
      }
    ],
    "lockedFields": [],
    "defaultValues": {},
    "requiredFields": ["role", "coverageArea", "organization"],
    "optionalFields": [],
    "allowedOrganizations": [
      {
        "_id": "...",
        "name": "Organization Name",
        "type": "LGU",
        "code": "org-code"
      }
    ],
    "allowedMunicipalities": [
      {
        "_id": "...",
        "name": "Municipality Name",
        "code": "muni-code",
        "type": "municipality",
        "parent": "...",
        "districtId": "...",
        "province": "..."
      }
    ],
    "allowedCoverageAreas": [
      {
        "_id": "...",
        "name": "Coverage Area Name"
      }
    ],
    "isSystemAdmin": false
  }
}
```

#### GET /api/users/creation-context/municipalities

Get municipalities available to the creator with nested barangays.

**Headers:**
- `Authorization: Bearer <token>` (required)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "municipalities": [
      {
        "_id": "...",
        "name": "Municipality Name",
        "code": "muni-code",
        "type": "municipality",
        "parent": "...",
        "districtId": "...",
        "province": "...",
        "barangays": [
          {
            "_id": "...",
            "name": "Barangay Name",
            "code": "brgy-code",
            "type": "barangay",
            "parent": "..."
          }
        ]
      }
    ]
  }
}
```

#### POST /api/users

Create a new coordinator user.

**Headers:**
- `Authorization: Bearer <token>` (required)
- `x-page-context: coordinator-management` (required)

**Request Body:**
```json
{
  "email": "coordinator@example.com",
  "password": "password123",
  "firstName": "John",
  "middleName": "Michael",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "organizationIds": ["org-id-1", "org-id-2"],
  "roles": ["coordinator"],
  "coverageAreaIds": ["coverage-area-id-1"],
  "pageContext": "coordinator-management"
}
```

**Validation Rules:**
1. Creator must have authority ≥ 60
2. At least one organization required (`organizationIds` array)
3. At least one coverage area required (`coverageAreaIds` array)
4. At least one role required (must have operational permissions)
5. Role authority must be < creator authority
6. Organizations must be within creator's jurisdiction
7. Coverage areas must be within creator's jurisdiction
8. Email must be unique (idempotent check)

**Response (201):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "_id": "...",
    "email": "coordinator@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "authority": 60,
    "roles": [
      {
        "roleId": "...",
        "roleCode": "coordinator",
        "roleAuthority": 60,
        "isActive": true
      }
    ],
    "organizations": [
      {
        "organizationId": "...",
        "organizationName": "Organization Name",
        "organizationType": "LGU",
        "isPrimary": true
      }
    ],
    "coverageAreas": [
      {
        "coverageAreaId": "...",
        "coverageAreaName": "Coverage Area Name",
        "districtIds": ["..."],
        "municipalityIds": ["...", "..."],
        "isPrimary": true
      }
    ],
    "isActive": true,
    "createdAt": "2024-01-20T15:00:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request** - Missing required fields
```json
{
  "success": false,
  "message": "Coordinator must have at least one organization assigned",
  "code": "MISSING_ORGANIZATION"
}
```

**403 Forbidden** - Insufficient authority
```json
{
  "success": false,
  "message": "Only users with authority level 60 or higher can create coordinators",
  "code": "INSUFFICIENT_AUTHORITY_FOR_COORDINATOR_CREATION"
}
```

**403 Forbidden** - Organization outside jurisdiction
```json
{
  "success": false,
  "message": "Cannot assign organization outside your jurisdiction",
  "code": "ORGANIZATION_OUTSIDE_JURISDICTION"
}
```

### Data Structure

#### Coordinator User Model

Coordinators are stored in the unified `User` model with the following structure:

```javascript
{
  _id: ObjectId,
  email: String (unique),
  firstName: String,
  lastName: String,
  authority: Number (≥ 60 for coordinators),
  roles: [{
    roleId: ObjectId,
    roleCode: String,
    roleAuthority: Number,
    assignedAt: Date,
    assignedBy: ObjectId,
    isActive: Boolean
  }],
  organizations: [{
    organizationId: ObjectId,
    organizationName: String,
    organizationType: String,
    isPrimary: Boolean,
    assignedAt: Date,
    assignedBy: ObjectId
  }],
  coverageAreas: [{
    coverageAreaId: ObjectId,
    coverageAreaName: String,
    districtIds: [ObjectId],
    municipalityIds: [ObjectId], // Derived from districts
    isPrimary: Boolean,
    assignedAt: Date,
    assignedBy: ObjectId
  }],
  isActive: Boolean
}
```

### Authority Requirements

- **Creator Authority**: Must be ≥ 60 (coordinator level or higher)
- **Role Authority**: Assigned role must have authority < creator authority
- **System Admins**: Can create coordinators with any organization and coverage area
- **Coordinators**: Can only assign their own organizations and coverage areas within their jurisdiction

### Idempotent Behavior

The API checks for existing users by email before creation. If a user with the same email already exists, the request will fail with a 400 error. This ensures that duplicate submissions do not create multiple users.

---

## Version

**Current Version**: 1.0.0

---

## License

ISC

