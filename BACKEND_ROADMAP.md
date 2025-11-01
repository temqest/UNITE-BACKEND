# UNITE Backend Development Roadmap
Based on system-goal.md requirements

## ✅ COMPLETED (Phase 1: Foundation)

### 1. Data Models Created ✓
All database schemas are in place:

#### User Models
- ✅ `BloodbankStaff` - Base staff model with optional Middle_Name
- ✅ `SystemAdmin` - Admin profiles  
- ✅ `Coordinator` - Coordinator profiles linked to districts

#### Event Models
- ✅ `Event` - Core event data (Title, Location, Date, Status, Coordinator info)
- ✅ `BloodDrive` - Blood drive specific (Target_Donation, VenueType)
- ✅ `Advocacy` - Advocacy specific (Topic, TargetAudience, ExpectedAudienceSize, PartnerOrganization)
- ✅ `Training` - Training specific (TrainingType, MaxParticipants)
- ✅ `EventStaff` - Staff assignment per event

#### Request Models
- ✅ `EventRequest` - Request workflow with double-confirmation
- ✅ `EventRequestHistory` - Complete audit trail

#### Utility Models
- ✅ `District` - District management
- ✅ `Notification` - Notification system with types and read status

### 2. Data Validation ✓
All validators created using Joi:
- ✅ User validators (bloodbank_users, coordinator, systemAdmin)
- ✅ Event validators (event, bloodDrive, advocacy, training, eventStaff)
- ✅ Request validators (eventRequest, eventRequestHistory)
- ✅ Utility validators (district, notifications)

### 3. Model Features ✓
- ✅ Timestamps on all models
- ✅ Pre-save hooks for status management
- ✅ Conditional validation logic
- ✅ Proper references between models
- ✅ Model relationships documented

---

## 🚧 TO BUILD (Phase 2: Business Logic)

### 1. Authentication & Authorization
**Required:**
```
- [ ] JWT-based authentication
- [ ] Password hashing (bcrypt)
- [ ] Role-based access control (RBAC)
- [ ] Login/Logout endpoints
- [ ] Token refresh mechanism
- [ ] Password reset flow
```

**Middleware to create:**
- `authenticate.js` - Verify JWT tokens
- `requireAdmin.js` - Admin-only routes
- `requireCoordinator.js` - Coordinator-only routes

### 2. Scheduling Rules Enforcement
**Must implement business logic:**

```javascript
// Scheduling Service needed:

// Rule 1: Max 3 events per day
async checkDailyEventCapacity(date) {
  const eventCount = await Event.countDocuments({
    Start_Date: { $gte: startOfDay, $lt: endOfDay },
    Status: { $in: ['Approved', 'Completed'] }
  });
  if (eventCount >= 3) throw new Error('Daily limit reached');
}

// Rule 2: Max 200 blood bags per day
async checkBloodBagCapacity(date) {
  const bloodDrives = await BloodDrive.aggregate([
    { $match: { Start_Date: date } },
    { $group: { _id: null, total: { $sum: '$Target_Donation' } } }
  ]);
  if (total > 200) throw new Error('Blood bag limit exceeded');
}

// Rule 3: No weekend events (unless admin override)
async checkWeekendRestriction(date) {
  const dayOfWeek = date.getDay();
  if ((dayOfWeek === 0 || dayOfWeek === 6) && !adminOverride) {
    throw new Error('Weekend events require admin override');
  }
}

// Rule 4: One pending event per coordinator
async checkPendingEventLimit(coordinatorId) {
  const pendingCount = await EventRequest.countDocuments({
    Coordinator_ID: coordinatorId,
    Status: 'Pending_Admin_Review'
  });
  if (pendingCount >= 1) throw new Error('One pending request allowed');
}

// Rule 5: Auto-follow-up after 3 days
// Requires scheduled job (cron) or background worker
```

### 3. Event Request Workflow Service
**Service methods needed:**

```javascript
// src/services/request_services/eventRequest.service.js

class EventRequestService {
  // 1. Coordinator submits request
  async createRequest(coordinatorId, eventData) {
    // - Validate scheduling rules
    // - Create Event + category-specific model
    // - Create EventRequest
    // - Create notification for admin
  }

  // 2. Admin reviews and decides
  async adminAction(adminId, requestId, action, note, rescheduledDate) {
    // - Update EventRequest
    // - Create notification for coordinator
    // - Update event status
  }

  // 3. Coordinator confirms admin's decision
  async coordinatorConfirm(coordinatorId, requestId, action) {
    // - Update EventRequest
    // - Create notification for admin
    // - Complete workflow if approved
  }

  // 4. Admin final confirmation
  async adminFinalConfirm(adminId, requestId) {
    // - Mark event as Completed
    // - Create notifications
  }
}
```

### 4. Notification Service
**Features:**
```javascript
// src/services/utility_services/notification.service.js

class NotificationService {
  // Auto-create notifications at workflow stages
  async createNewRequestNotification(adminId, requestId, eventId)
  async createAdminActionNotification(coordinatorId, action, ...)
  async createCoordinatorConfirmationNotification(adminId, ...)
  
  // Mark as read
  async markAsRead(notificationId, userId)
  
  // Get unread count
  async getUnreadCount(userId, userType)
  
  // Get all notifications with pagination
  async getNotifications(userId, userType, filters)
}
```

### 5. Coordinator Account Creation Service
**Business logic for SystemAdmin creating coordinator accounts:**

```javascript
// src/services/users_services/coordinator.service.js

class CoordinatorService {
  async createCoordinatorAccount(staffData, coordinatorData, createdByAdminId) {
    // 1. Create BloodbankStaff record
    // 2. Validate District_ID exists
    // 3. Create Coordinator record
    // 4. Hash password before storing
    // 5. Generate credentials
    // 6. Create audit log
    // 7. Return credentials to admin
  }

  async updateCoordinatorInfo(coordinatorId, updates)
  async deactivateCoordinator(coordinatorId)
  async getCoordinatorDashboard(coordinatorId)
}
```

### 6. Event Calendar Service
**For calendar view:**

```javascript
// src/services/event_services/calendar.service.js

class CalendarService {
  async getMonthView(year, month, filters)
  async getWeekView(startDate, endDate, filters)
  async getDayView(date, filters)
  
  // Counts by status
  async getStatusCounts(dateRange)
  async getUpcomingEvents(userId, limit)
}
```

### 7. Dashboard Services
**For both Admin and Coordinator:**

```javascript
// Admin Dashboard
- Pending requests count
- Upcoming events
- Daily/weekly stats
- Recent activity log

// Coordinator Dashboard  
- My pending requests
- My upcoming events
- My notification inbox
- Activity summary
```

---

## 🔨 TO BUILD (Phase 3: API Endpoints)

### Authentication Routes
```
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh-token
POST   /api/auth/reset-password
POST   /api/auth/forgot-password
```

### Coordinator Routes
```
POST   /api/coordinators/events           - Create event request
GET    /api/coordinators/events           - Get my events
GET    /api/coordinators/events/:id       - Get event details
PUT    /api/coordinators/events/:id       - Update pending event
DELETE /api/coordinators/events/:id       - Cancel pending event

POST   /api/coordinators/requests/:id/confirm  - Confirm admin decision
GET    /api/coordinators/dashboard        - Dashboard data
GET    /api/coordinators/notifications    - Get notifications
PUT    /api/coordinators/notifications/:id/read - Mark as read
```

### Admin Routes
```
// Account Management
POST   /api/admin/coordinators/create     - Create coordinator account
GET    /api/admin/coordinators            - List all coordinators
PUT    /api/admin/coordinators/:id        - Update coordinator
DELETE /api/admin/coordinators/:id        - Deactivate coordinator

// Event Management
GET    /api/admin/events/pending          - Pending events
GET    /api/admin/events                  - All events
GET    /api/admin/events/calendar         - Calendar view
POST   /api/admin/events/:id/approve      - Approve event
POST   /api/admin/events/:id/reject       - Reject event
POST   /api/admin/events/:id/reschedule   - Reschedule event
POST   /api/admin/events/:id/final-confirm - Final confirmation

// Dashboard
GET    /api/admin/dashboard               - Admin dashboard
GET    /api/admin/stats                   - Statistics
GET    /api/admin/notifications           - Get notifications
```

### Utility Routes
```
GET    /api/districts                     - Get all districts
POST   /api/districts                     - Create district (admin only)
PUT    /api/districts/:id                 - Update district
DELETE /api/districts/:id                 - Delete district

GET    /api/notifications                 - Get my notifications
PUT    /api/notifications/:id/read        - Mark as read
```

---

## 🔨 TO BUILD (Phase 4: Additional Features)

### 1. Background Jobs
**For scheduling rules:**
- [ ] Auto-follow-up notification after 3 days
- [ ] Daily capacity check reminders
- [ ] Report generation (daily/weekly/monthly)
- [ ] Cleanup expired tokens

### 2. Audit & Logging
- [ ] Activity logs for all actions
- [ ] Request history tracking
- [ ] Security event logging
- [ ] Error tracking

### 3. API Documentation
- [ ] Swagger/OpenAPI docs
- [ ] Endpoint descriptions
- [ ] Request/response examples
- [ ] Authentication guide

### 4. Testing
- [ ] Unit tests for services
- [ ] Integration tests for API
- [ ] Test data fixtures
- [ ] Code coverage reports

### 5. Security Enhancements
- [ ] Rate limiting
- [ ] Input sanitization
- [ ] CORS configuration
- [ ] Environment variables
- [ ] Secrets management

### 6. Deployment Configuration
- [ ] Docker setup
- [ ] Environment configs
- [ ] Database migrations
- [ ] Health check endpoints
- [ ] CI/CD pipeline

---

## 📊 PROGRESS SUMMARY

| Component | Status | Progress |
|-----------|--------|----------|
| **Data Models** | ✅ Complete | 100% |
| **Validators** | ✅ Complete | 100% |
| **Services** | ⏳ Pending | 0% |
| **Controllers** | ⏳ Pending | 0% |
| **Routes** | ⏳ Pending | 0% |
| **Authentication** | ⏳ Pending | 0% |
| **Middleware** | ⏳ Pending | 0% |
| **Background Jobs** | ⏳ Pending | 0% |
| **Documentation** | ⏳ Pending | 20% |
| **Testing** | ⏳ Pending | 0% |

---

## 🎯 NEXT IMMEDIATE STEPS

1. **Install missing dependencies**
   - bcrypt (password hashing)
   - jsonwebtoken (JWT auth)
   - express (if not installed)
   - express-validator or keep using Joi

2. **Setup basic Express server**
   - app.js configuration
   - Middleware setup
   - Error handling
   - Logging

3. **Implement Authentication**
   - JWT strategy
   - Login endpoint
   - Password hashing
   - Auth middleware

4. **Build first Service**
   - Start with EventRequestService (core workflow)
   - Implement scheduling rules
   - Test with sample data

5. **Create first Controller + Routes**
   - Coordinator event request flow
   - Admin approval flow

---

## 📝 NOTES

- All models follow naming convention: ModelName.model.js
- All validators follow: modelName.validators.js
- Services should handle ALL business logic
- Controllers should be thin (just handle HTTP)
- Use async/await throughout
- Implement proper error handling
- Add comprehensive logging
- Follow RESTful API conventions

---

**Ready to proceed with Phase 2! 🚀**

