# Page & Feature Permissions API

## Overview

The Pages & Features API provides endpoints for checking and managing page access permissions and feature availability. This system allows fine-grained control over which pages users can access and which features they can use.

## Base URL

All page and feature endpoints are under `/api/pages` and `/api/features`:

```
GET /api/pages/accessible
GET /api/pages/check/:pageRoute
GET /api/features/available
GET /api/features/check/:featureCode
GET /api/rbac/permissions/user/:userId/pages
GET /api/rbac/permissions/user/:userId/features
GET /api/rbac/permissions/user/:userId/staff-types/:action
```

## Authentication

All endpoints require authentication.

## Authorization

Page and feature access checking requires `user.read` permission for user-specific queries.

## Permission Types

### Page Permissions

Control access to specific pages/routes:
- **Format:** `page.route` (e.g., `page.dashboard`, `page.events`)
- **Type:** `page`
- **Usage:** Frontend navigation, route guards

### Feature Permissions

Control access to specific features:
- **Format:** `feature.feature-code` (e.g., `feature.create-event`, `feature.request-blood`)
- **Type:** `feature`
- **Usage:** Feature toggles, action buttons

### Staff Permissions

Staff management with type restrictions:
- **Format:** `staff.action` (e.g., `staff.create`, `staff.update`)
- **Type:** `staff`
- **Metadata:** `{ allowedStaffTypes: ['coordinator', 'stakeholder'] }`
- **Usage:** Staff management UI, role assignment

## Endpoints

### 1. Get Accessible Pages

Get all pages the current user can access.

**Endpoint:** `GET /api/pages/accessible`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    "dashboard",
    "events",
    "requests",
    "users"
  ]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| data | array | Array of page route strings |

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/pages/accessible?locationId=601abc1234567890abcdef" \
  -H "Authorization: Bearer <token>"
```

---

### 2. Check Page Access

Check if the current user can access a specific page.

**Endpoint:** `GET /api/pages/check/:pageRoute`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| pageRoute | string | Yes | Page route (e.g., `dashboard`, `events`) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "canAccess": true,
  "page": "dashboard"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| canAccess | boolean | `true` if user can access the page |
| page | string | The page route that was checked |

**Error Responses:**

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/pages/check/dashboard" \
  -H "Authorization: Bearer <token>"
```

---

### 3. Get Available Features

Get all features the current user can use.

**Endpoint:** `GET /api/features/available`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    "create-event",
    "request-blood",
    "export-data",
    "manage-inventory"
  ]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| data | array | Array of feature code strings |

---

### 4. Check Feature Access

Check if the current user can use a specific feature.

**Endpoint:** `GET /api/features/check/:featureCode`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| featureCode | string | Yes | Feature code (e.g., `create-event`, `request-blood`) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "canUse": true,
  "feature": "create-event"
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| canUse | boolean | `true` if user can use the feature |
| feature | string | The feature code that was checked |

---

### 5. Get User Pages (Admin)

Get all pages a specific user can access (admin endpoint).

**Endpoint:** `GET /api/rbac/permissions/user/:userId/pages`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID (ObjectId or legacy userId) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    "dashboard",
    "events",
    "requests"
  ]
}
```

---

### 6. Get User Features (Admin)

Get all features a specific user can use (admin endpoint).

**Endpoint:** `GET /api/rbac/permissions/user/:userId/features`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID (ObjectId or legacy userId) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    "create-event",
    "request-blood"
  ]
}
```

---

### 7. Get Allowed Staff Types

Get allowed staff types for a user performing a staff management action.

**Endpoint:** `GET /api/rbac/permissions/user/:userId/staff-types/:action`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID (ObjectId or legacy userId) |
| action | string | Yes | Staff action: `create`, `update`, `delete` |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "data": ["stakeholder", "coordinator"]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| data | array | Array of allowed staff type codes (or `["*"]` for all types) |

**Special Values:**
- `["*"]` - User can manage all staff types
- `[]` - User cannot perform this action
- `["stakeholder", "coordinator"]` - User can only manage these specific types

---

## Middleware

### requirePageAccess

Middleware to protect routes based on page access permissions.

**Usage:**
```javascript
const { requirePageAccess } = require('../middleware/requirePageAccess');

router.get('/dashboard', authenticate, requirePageAccess('/dashboard'), (req, res) => {
  // Route handler
});
```

**Location:** `src/middleware/requirePageAccess.js`

**Behavior:**
- Checks if user can access the specified page route
- Returns `403 Forbidden` if access denied
- Supports location scoping via request parameters

---

### requireFeature

Middleware to protect routes based on feature access permissions.

**Usage:**
```javascript
const { requireFeature } = require('../middleware/requireFeature');

router.post('/events', authenticate, requireFeature('create-event'), (req, res) => {
  // Route handler
});
```

**Location:** `src/middleware/requireFeature.js`

**Behavior:**
- Checks if user can use the specified feature
- Returns `403 Forbidden` if access denied
- Supports location scoping via request parameters

---

### requireStaffManagement

Middleware to protect staff management routes with type restrictions.

**Usage:**
```javascript
const { requireStaffManagement } = require('../middleware/requireStaffManagement');

router.post('/users', authenticate, requireStaffManagement('create', 'staffType'), (req, res) => {
  // Route handler
  // req.allowedStaffTypes contains allowed types
});
```

**Location:** `src/middleware/requireStaffManagement.js`

**Parameters:**
- `action` (string) - Staff action: `create`, `update`, `delete`
- `staffTypeParam` (string, default: `staffType`) - Request parameter name containing staff type

**Behavior:**
- Checks if user can perform the staff management action
- Validates staff type if provided in request
- Attaches `req.allowedStaffTypes` array for use in controllers
- Returns `403 Forbidden` if access denied

---

## Permission Service Methods

The permission service provides the following methods for page/feature checking:

### canAccessPage(userId, pageRoute, context)

Check if user can access a page.

**Parameters:**
- `userId` (string|ObjectId) - User ID
- `pageRoute` (string) - Page route (e.g., `dashboard`)
- `context` (object) - Optional context: `{ locationId: ObjectId }`

**Returns:** `Promise<boolean>`

---

### canUseFeature(userId, featureCode, context)

Check if user can use a feature.

**Parameters:**
- `userId` (string|ObjectId) - User ID
- `featureCode` (string) - Feature code (e.g., `create-event`)
- `context` (object) - Optional context: `{ locationId: ObjectId }`

**Returns:** `Promise<boolean>`

---

### canManageStaff(userId, action, staffType, context)

Check if user can manage staff of a specific type.

**Parameters:**
- `userId` (string|ObjectId) - User ID
- `action` (string) - Action: `create`, `update`, `delete`
- `staffType` (string|null) - Staff type to check (null checks if any type allowed)
- `context` (object) - Optional context: `{ locationId: ObjectId }`

**Returns:** `Promise<boolean>`

---

### getAccessiblePages(userId, context)

Get all pages user can access.

**Parameters:**
- `userId` (string|ObjectId) - User ID
- `context` (object) - Optional context: `{ locationId: ObjectId }`

**Returns:** `Promise<Array<string>>` - Array of page route strings

---

### getAvailableFeatures(userId, context)

Get all features user can use.

**Parameters:**
- `userId` (string|ObjectId) - User ID
- `context` (object) - Optional context: `{ locationId: ObjectId }`

**Returns:** `Promise<Array<string>>` - Array of feature code strings

---

### getAllowedStaffTypes(userId, action, context)

Get allowed staff types for an action.

**Parameters:**
- `userId` (string|ObjectId) - User ID
- `action` (string) - Action: `create`, `update`, `delete`
- `context` (object) - Optional context: `{ locationId: ObjectId }`

**Returns:** `Promise<Array<string>>` - Array of allowed staff type codes (or `["*"]` for all)

---

## Permission Examples

### Page Permission Example

**Permission:**
```json
{
  "code": "page.dashboard",
  "name": "Access Dashboard",
  "resource": "page",
  "action": "dashboard",
  "type": "page",
  "description": "Access to dashboard page"
}
```

**Usage:**
- Frontend checks: `GET /api/pages/check/dashboard`
- Middleware: `requirePageAccess('/dashboard')`
- Result: User can access dashboard if they have this permission

---

### Feature Permission Example

**Permission:**
```json
{
  "code": "feature.create-event",
  "name": "Create Event Feature",
  "resource": "feature",
  "action": "create-event",
  "type": "feature",
  "description": "Ability to create events"
}
```

**Usage:**
- Frontend checks: `GET /api/features/check/create-event`
- Middleware: `requireFeature('create-event')`
- Result: User can use create event feature if they have this permission

---

### Staff Permission Example

**Permission:**
```json
{
  "code": "staff.create",
  "name": "Create Staff",
  "resource": "staff",
  "action": "create",
  "type": "staff",
  "description": "Create staff members",
  "metadata": {
    "allowedStaffTypes": ["stakeholder", "coordinator"]
  }
}
```

**Usage:**
- Frontend checks: `GET /api/rbac/permissions/user/:userId/staff-types/create`
- Middleware: `requireStaffManagement('create', 'staffType')`
- Result: User can create staff of types `stakeholder` and `coordinator` only

---

## Frontend Integration Examples

### Check Page Access on Route Change

```javascript
// React Router example
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function ProtectedRoute({ children, pageRoute }) {
  const [canAccess, setCanAccess] = useState(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  useEffect(() => {
    const checkAccess = async () => {
      const response = await fetch(
        `http://localhost:3000/api/pages/check/${pageRoute}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();
      
      if (data.success && data.canAccess) {
        setCanAccess(true);
      } else {
        setCanAccess(false);
        navigate('/unauthorized');
      }
    };

    checkAccess();
  }, [pageRoute, navigate, token]);

  if (canAccess === null) return <Loading />;
  if (!canAccess) return null;
  
  return children;
}
```

---

### Load Accessible Pages on Login

```javascript
// Load user's accessible pages after login
const loadUserPages = async (token) => {
  const response = await fetch('http://localhost:3000/api/pages/accessible', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  
  if (data.success) {
    // Store in state/context for navigation
    setAccessiblePages(data.data);
    // Build navigation menu based on accessible pages
    buildNavigationMenu(data.data);
  }
};
```

---

### Check Feature Before Showing Button

```javascript
// Check feature access before showing action button
const [canCreateEvent, setCanCreateEvent] = useState(false);

useEffect(() => {
  const checkFeature = async () => {
    const response = await fetch(
      'http://localhost:3000/api/features/check/create-event',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();
    setCanCreateEvent(data.success && data.canUse);
  };
  
  checkFeature();
}, [token]);

// In render
{canCreateEvent && (
  <button onClick={handleCreateEvent}>Create Event</button>
)}
```

---

### Check Allowed Staff Types Before User Creation

```javascript
// Check allowed staff types before showing user creation form
const [allowedStaffTypes, setAllowedStaffTypes] = useState([]);

useEffect(() => {
  const checkStaffTypes = async () => {
    const response = await fetch(
      `http://localhost:3000/api/rbac/permissions/user/${userId}/staff-types/create`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const data = await response.json();
    
    if (data.success) {
      setAllowedStaffTypes(data.data);
      // If ["*"], show all staff types
      // Otherwise, filter staff type options
    }
  };
  
  checkStaffTypes();
}, [userId, token]);

// In user creation form
<select name="staffType">
  {allowedStaffTypes.includes('*') ? (
    // Show all staff types
    <>
      <option value="coordinator">Coordinator</option>
      <option value="stakeholder">Stakeholder</option>
      <option value="system-admin">System Admin</option>
    </>
  ) : (
    // Show only allowed types
    allowedStaffTypes.map(type => (
      <option key={type} value={type}>{type}</option>
    ))
  )}
</select>
```

---

## Business Logic

### Page Access Checking

1. Get all active roles for user
2. Filter by location scope if provided
3. Aggregate permissions from all roles
4. Filter permissions by type `page`
5. Check if page route matches any permission's action
6. Return boolean result

### Feature Access Checking

1. Get all active roles for user
2. Filter by location scope if provided
3. Aggregate permissions from all roles
4. Filter permissions by type `feature`
5. Check if feature code matches any permission's action
6. Return boolean result

### Staff Type Checking

1. Get all active roles for user
2. Filter by location scope if provided
3. Aggregate permissions from all roles
4. Filter permissions by type `staff` and matching action
5. Extract `allowedStaffTypes` from metadata
6. Merge arrays (handle wildcard `*`)
7. Return array of allowed types

---

## Related Documentation

- [RBAC API](API_RBAC.md) - Role and permission management
- [Users API](API_USERS.md) - User management with staff type restrictions
- [Middleware Reference](MIDDLEWARE_REFERENCE.md) - Middleware details
- [Models Reference](MODELS_REFERENCE.md) - Permission model schema
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
