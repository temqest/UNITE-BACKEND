# Middleware Reference

## Overview

This document provides complete documentation for all middleware used in the UNITE Backend system. Middleware functions are used for authentication, authorization, validation, rate limiting, and request processing.

## Authentication Middleware

### authenticate

**File:** `src/middleware/authenticate.js`

**Purpose:** Authenticate requests using JWT tokens or cookies.

**Usage:**
```javascript
const authenticate = require('../middleware/authenticate');

router.get('/protected', authenticate, (req, res) => {
  // Route handler
});
```

**Behavior:**
1. Checks for JWT token in `Authorization: Bearer <token>` header
2. Falls back to `unite_user` cookie if no Bearer token
3. Verifies token signature and expiration
4. Sets `req.user` with user information on success
5. Returns `401 Unauthorized` if authentication fails

**Request Modification:**
After successful authentication, `req.user` contains:
```javascript
{
  id: "601abc1234567890abcdef",
  email: "user@example.com",
  role: "coordinator",
  StaffType: "Coordinator"
}
```

**Error Responses:**
- `401 Unauthorized` - No token or invalid token
- `401 Unauthorized` - Invalid or expired token

**Example:**
```javascript
// JWT Token
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

// Cookie (fallback)
Cookie: unite_user={"id":"601abc1234567890abcdef","role":"coordinator"}
```

---

## Authorization Middleware

### requirePermission

**File:** `src/middleware/requirePermission.js`

**Purpose:** Check if user has a specific permission.

**Usage:**
```javascript
const { requirePermission } = require('../middleware/requirePermission');

router.post('/events', authenticate, requirePermission('event', 'create'), (req, res) => {
  // Route handler
});
```

**Parameters:**
- `resource` (string) - Resource name (e.g., `'event'`, `'request'`, `'user'`)
- `action` (string) - Action name (e.g., `'create'`, `'read'`, `'update'`, `'delete'`)

**Behavior:**
1. Extracts `userId` from `req.user`
2. Extracts `locationId` from request (body, params, or query)
3. Checks permission using `permissionService.checkPermission`
4. Returns `403 Forbidden` if permission denied
5. Calls `next()` if permission granted

**Request Modification:**
No modification (only checks permission).

**Error Responses:**
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Permission denied with message: `Permission denied: {resource}.{action}`

**Example:**
```javascript
// Check event.create permission
router.post('/events', 
  authenticate, 
  requirePermission('event', 'create'),
  eventController.createEvent
);
```

---

### requireAnyPermission

**File:** `src/middleware/requirePermission.js`

**Purpose:** Check if user has any of multiple permissions.

**Usage:**
```javascript
const { requireAnyPermission } = require('../middleware/requirePermission');

router.post('/requests/:id/actions', 
  authenticate, 
  requireAnyPermission([
    { resource: 'request', action: 'approve' },
    { resource: 'request', action: 'reject' }
  ]),
  (req, res) => {
    // Route handler
  }
);
```

**Parameters:**
- `permissions` (array) - Array of permission objects: `[{ resource, action }, ...]`

**Behavior:**
1. Checks each permission in order
2. Returns `next()` on first match
3. Returns `403 Forbidden` if none match

**Error Responses:**
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Permission denied: requires one of the following permissions

---

### requireAllPermissions

**File:** `src/middleware/requirePermission.js`

**Purpose:** Check if user has all of multiple permissions.

**Usage:**
```javascript
const { requireAllPermissions } = require('../middleware/requirePermission');

router.post('/events/direct', 
  authenticate, 
  requireAllPermissions([
    { resource: 'event', action: 'create' },
    { resource: 'event', action: 'approve' }
  ]),
  (req, res) => {
    // Route handler
  }
);
```

**Parameters:**
- `permissions` (array) - Array of permission objects

**Behavior:**
1. Checks all permissions
2. Returns `403 Forbidden` on first failure
3. Returns `next()` if all pass

**Error Responses:**
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Permission denied: requires {resource}.{action}

---

### requirePageAccess

**File:** `src/middleware/requirePageAccess.js`

**Purpose:** Check if user can access a specific page.

**Usage:**
```javascript
const { requirePageAccess } = require('../middleware/requirePageAccess');

router.get('/dashboard', 
  authenticate, 
  requirePageAccess('/dashboard'),
  (req, res) => {
    // Route handler
  }
);
```

**Parameters:**
- `pageRoute` (string) - Page route (e.g., `'/dashboard'`, `'/events'`)

**Behavior:**
1. Extracts `userId` from `req.user`
2. Extracts `locationId` from request
3. Checks page access using `permissionService.canAccessPage`
4. Returns `403 Forbidden` if access denied
5. Calls `next()` if access granted

**Error Responses:**
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Access denied: Page '{pageRoute}' is not accessible

---

### requireFeature

**File:** `src/middleware/requireFeature.js`

**Purpose:** Check if user can use a specific feature.

**Usage:**
```javascript
const { requireFeature } = require('../middleware/requireFeature');

router.post('/events', 
  authenticate, 
  requireFeature('create-event'),
  (req, res) => {
    // Route handler
  }
);
```

**Parameters:**
- `featureCode` (string) - Feature code (e.g., `'create-event'`, `'request-blood'`)

**Behavior:**
1. Extracts `userId` from `req.user`
2. Extracts `locationId` from request
3. Checks feature access using `permissionService.canUseFeature`
4. Returns `403 Forbidden` if access denied
5. Calls `next()` if access granted

**Error Responses:**
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Feature '{featureCode}' is not available

---

### requireStaffManagement

**File:** `src/middleware/requireStaffManagement.js`

**Purpose:** Check if user can perform staff management action with type restrictions.

**Usage:**
```javascript
const { requireStaffManagement } = require('../middleware/requireStaffManagement');

router.post('/users', 
  authenticate, 
  requireStaffManagement('create', 'staffType'),
  (req, res) => {
    // Controller can use req.allowedStaffTypes
    const allowedTypes = req.allowedStaffTypes; // ['stakeholder', 'coordinator']
    // Route handler
  }
);
```

**Parameters:**
- `action` (string) - Staff action: `'create'`, `'update'`, `'delete'`
- `staffTypeParam` (string, default: `'staffType'`) - Request parameter name containing staff type

**Behavior:**
1. Extracts `userId` from `req.user`
2. Extracts `locationId` from request
3. Extracts `staffType` from request (body, params, or query)
4. Checks staff management permission using `permissionService.canManageStaff`
5. Gets allowed staff types using `permissionService.getAllowedStaffTypes`
6. Attaches `req.allowedStaffTypes` array for use in controllers
7. Returns `403 Forbidden` if permission denied
8. Calls `next()` if permission granted

**Request Modification:**
Attaches `req.allowedStaffTypes` array:
```javascript
req.allowedStaffTypes = ['stakeholder', 'coordinator']; // or ['*'] for all
```

**Error Responses:**
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Permission denied: Cannot {action} staff for staff type '{staffType}'

**Example:**
```javascript
router.post('/users', 
  authenticate, 
  requireStaffManagement('create', 'staffType'),
  async (req, res) => {
    const requestedType = req.body.roles?.[0];
    const allowedTypes = req.allowedStaffTypes;
    
    if (requestedType && !allowedTypes.includes('*') && !allowedTypes.includes(requestedType)) {
      return res.status(403).json({
        success: false,
        message: `Cannot create staff of type '${requestedType}'. Allowed: ${allowedTypes.join(', ')}`
      });
    }
    
    // Create user...
  }
);
```

---

## Rate Limiting Middleware

### rateLimiter

**File:** `src/middleware/rateLimiter.js`

**Purpose:** Rate limit requests to prevent abuse.

**Note:** Currently disabled for development/testing. To re-enable, restore from backup.

**Usage:**
```javascript
const rateLimiter = require('../middleware/rateLimiter');

router.post('/login', rateLimiter.auth, (req, res) => {
  // Route handler
});

router.get('/data', rateLimiter.general, (req, res) => {
  // Route handler
});
```

**Methods:**
- `rateLimiter.auth` - Stricter rate limits for authentication endpoints
- `rateLimiter.general` - Standard rate limits for general endpoints

**Behavior:**
- Currently returns `next()` immediately (disabled)
- When enabled, checks request rate and returns `429 Too Many Requests` if exceeded

**Error Responses:**
- `429 Too Many Requests` - Rate limit exceeded

**Rate Limit Headers (when enabled):**
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset time

---

## Validation Middleware

Validation middleware is typically provided by Joi validators. Examples:

### validateCreateUser

**File:** `src/validators/users_validators/user.validators.js`

**Usage:**
```javascript
const { validateCreateUser } = require('../validators/users_validators/user.validators');

router.post('/users', authenticate, validateCreateUser, (req, res) => {
  // req.validatedData contains validated and sanitized data
});
```

**Behavior:**
1. Validates request body against Joi schema
2. Returns `400 Bad Request` with error details if validation fails
3. Attaches validated data to `req.validatedData` on success
4. Calls `next()` if validation passes

**Request Modification:**
Attaches `req.validatedData` with validated and sanitized data.

**Error Responses:**
- `400 Bad Request` - Validation error with array of error messages

---

## Middleware Execution Order

Typical middleware order in routes:

```javascript
router.post('/endpoint',
  authenticate,              // 1. Authenticate user
  requirePermission(...),    // 2. Check permission
  validateCreateUser,        // 3. Validate input
  rateLimiter.general,       // 4. Rate limit
  controllerMethod           // 5. Route handler
);
```

---

## Custom Middleware Patterns

### Location Scoping

Many middleware functions extract `locationId` from:
1. `req.body.locationId`
2. `req.params.locationId`
3. `req.query.locationId`
4. `req.body.location.district`
5. `req.body.location.province`

This allows location-based permission scoping.

---

## Error Handling in Middleware

All middleware follows this pattern:

```javascript
function middleware(req, res, next) {
  try {
    // Middleware logic
    if (errorCondition) {
      return res.status(403).json({
        success: false,
        message: 'Error message'
      });
    }
    next();
  } catch (error) {
    console.error('Middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error message'
    });
  }
}
```

---

## Related Documentation

- [Authentication API](API_AUTH.md) - Authentication endpoints
- [RBAC API](API_RBAC.md) - Permission system
- [Pages & Features API](API_PAGES_FEATURES.md) - Page/feature middleware
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
