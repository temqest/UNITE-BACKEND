# User Services Documentation

This directory contains all user-related business logic services for the UNITE Blood Bank System.

## Services Overview

### 1. `bloodbankStaff.service.js`
**Purpose:** Core authentication and user management operations

**Key Methods:**
- `authenticateUser(username, password)` - Login authentication
- `verifyPassword(userId, password)` - Verify password
- `changePassword(userId, currentPassword, newPassword)` - User password change
- `resetPassword(userId, newPassword)` - Admin password reset
- `getUserById(userId)` - Get user by ID
- `getUserByUsername(username)` - Get user by username
- `isUsernameAvailable(username)` - Check username availability
- `isEmailAvailable(email)` - Check email availability
- `updateProfile(userId, updateData)` - Update user profile
- `getFullName(userId)` - Get user's full name
- `searchUsers(searchTerm, limit)` - Search users
- `staffExists(staffId)` - Check if staff exists

**Usage Example:**
```javascript
const { bloodbankStaffService } = require('./users_services');

// Login
const result = await bloodbankStaffService.authenticateUser('coordinator1', 'password123');
console.log(result.user); // User data with role information

// Change password
await bloodbankStaffService.changePassword(userId, 'oldpass', 'newpass');
```

---

### 2. `coordinator.service.js`
**Purpose:** Coordinator account and dashboard management

**Key Methods:**
- `createCoordinatorAccount(staffData, coordinatorData, createdByAdminId)` - Create new coordinator
- `getCoordinatorById(coordinatorId)` - Get coordinator details
- `getAllCoordinators(filters, page, limit)` - List all coordinators with pagination
- `updateCoordinator(coordinatorId, updateData)` - Update coordinator info
- `getCoordinatorDashboard(coordinatorId)` - Get dashboard data
- `deleteCoordinator(coordinatorId)` - Delete/Deactivate coordinator
- `getCoordinatorEventHistory(coordinatorId, filters, page, limit)` - Event history

**Usage Example:**
```javascript
const { coordinatorService } = require('./users_services');

// Create coordinator (called by SystemAdmin)
const result = await coordinatorService.createCoordinatorAccount(
  {
    Username: 'coord1',
    First_Name: 'John',
    Middle_Name: 'D',
    Last_Name: 'Doe',
    Email: 'john.doe@bloodbank.com',
    Phone_Number: '1234567890',
    Password: 'SecurePass123'
  },
  {
    District_ID: 'DIST_001'
  },
  'ADMIN_123' // Admin who is creating
);

console.log(result.coordinator); // Created coordinator data
console.log(result.credentials); // Username and password to give to coordinator

// Get dashboard
const dashboard = await coordinatorService.getCoordinatorDashboard('COORD_123');
console.log(dashboard.dashboard.stats); // Statistics
console.log(dashboard.dashboard.pending_requests); // Pending requests
```

---

### 3. `systemAdmin.service.js`
**Purpose:** System administrator operations and system-wide management

**Key Methods:**
- `createSystemAdminAccount(staffData, adminData, createdByAdminId)` - Create new admin
- `getAdminById(adminId)` - Get admin details
- `getAllAdmins()` - List all admins
- `updateAdmin(adminId, updateData)` - Update admin info
- `getAdminDashboard(adminId)` - Get admin dashboard with stats
- `getSystemStatistics()` - System-wide statistics
- `deleteAdmin(adminId)` - Delete admin (prevents deletion of last admin)
- `getManagedCoordinators(adminId, page, limit)` - Get all coordinators
- `createCoordinatorAccount(...)` - Delegates to CoordinatorService
- `getRequestsRequiringAttention(adminId, limit)` - Get pending requests

**Usage Example:**
```javascript
const { systemAdminService } = require('./users_services');

// Create admin
const result = await systemAdminService.createSystemAdminAccount(
  {
    Username: 'admin1',
    First_Name: 'Admin',
    Last_Name: 'User',
    Email: 'admin@bloodbank.com',
    Phone_Number: '1234567890',
    Password: 'AdminPass123'
  },
  {
    AccessLevel: 'Super Admin'
  }
);

// Get admin dashboard
const dashboard = await systemAdminService.getAdminDashboard('ADMIN_123');
console.log(dashboard.dashboard.stats.total_coordinators);
console.log(dashboard.dashboard.pending_requests);

// Get system statistics
const stats = await systemAdminService.getSystemStatistics();
console.log(stats.statistics.overview);
```

---

## Workflow: Creating a Coordinator Account

The complete flow for a SystemAdmin to create a coordinator account:

```javascript
const { systemAdminService } = require('./users_services');

// Step 1: Admin creates coordinator account
const result = await systemAdminService.createCoordinatorAccount(
  {
    Username: 'new_coord',
    First_Name: 'Jane',
    Middle_Name: 'Marie',
    Last_Name: 'Smith',
    Email: 'jane.smith@bloodbank.com',
    Phone_Number: '+63-123-456-7890',
    Password: 'TempPassword123!'
  },
  {
    District_ID: 'DIST_001' // Must exist in District collection
  },
  'ADMIN_123' // Current admin creating this account
);

// Step 2: Result contains credentials to give to coordinator
console.log(result.credentials);
// {
//   Username: 'new_coord',
//   Password: 'TempPassword123!'
// }

// Step 3: Coordinator can login using these credentials
const { bloodbankStaffService } = require('./users_services');
const loginResult = await bloodbankStaffService.authenticateUser(
  result.credentials.Username,
  result.credentials.Password
);

// Step 4: Coordinator should change password on first login
await bloodbankStaffService.changePassword(
  loginResult.user.id,
  'TempPassword123!',
  'MyNewSecurePassword456!'
);
```

---

## Security Features

### Password Hashing
- All passwords are hashed using bcrypt with 10 salt rounds
- Plain passwords are NEVER stored in the database
- Only returned to SystemAdmin when creating accounts

### Authentication
- Username and password authentication
- Returns user data with role-specific information
- Validates credentials before returning user data

### Authorization Checks
- Coordinators can only see their own dashboard data
- Admins can see system-wide information
- Proper error handling for unauthorized access

---

## Error Handling

All services throw errors with descriptive messages:

```javascript
try {
  const result = await coordinatorService.createCoordinatorAccount(...);
} catch (error) {
  console.error(error.message); // "Invalid District ID. District does not exist"
  // Handle error appropriately
}
```

Common errors:
- `Invalid District ID` - District doesn't exist
- `Username or Email already exists` - Duplicate credentials
- `Coordinator not found` - ID doesn't exist
- `Cannot delete coordinator with active events` - Deletion blocked
- `Cannot delete the last remaining admin` - Admin protection

---

## Data Flow

```
Controller → Service → Model → Database
    ↓           ↓         ↓         ↓
Request    Business  Validation  Storage
Validation  Logic
```

### Example Flow:
1. **Controller** receives HTTP request
2. **Validator** (Joi) validates request data
3. **Service** executes business logic:
   - Validates relationships (District exists)
   - Checks constraints (No duplicates)
   - Performs operations (Hash password)
   - Calls models to persist data
4. **Model** interacts with MongoDB
5. **Service** returns formatted response
6. **Controller** sends HTTP response

---

## Integration Points

These services integrate with:

### Models
- `BloodbankStaff` - Core staff data
- `SystemAdmin` - Admin-specific data
- `Coordinator` - Coordinator-specific data
- `District` - District information

### Other Services (Future)
- `EventRequestService` - For event-related operations
- `NotificationService` - For creating notifications
- `CalendarService` - For calendar data

---

## Testing

Each service should be unit tested for:
- ✅ Valid inputs
- ✅ Invalid inputs
- ✅ Duplicate prevention
- ✅ Relationship validation
- ✅ Error handling
- ✅ Security (password hashing)

---

## Next Steps

After services, implement:
1. Controllers - HTTP request handlers
2. Routes - API endpoints
3. Middleware - Authentication, validation, error handling
4. Express app configuration

