# Role-Based Access Control (RBAC) API

## Overview

The RBAC API provides endpoints for managing roles, permissions, and user role assignments. The system supports flexible permission-based authorization with location scoping and staff type restrictions.

## Base URL

All RBAC endpoints are under `/api/rbac` or `/api`:

```
GET    /api/roles
POST   /api/roles
GET    /api/roles/:roleId
PUT    /api/roles/:roleId
DELETE /api/roles/:roleId
GET    /api/permissions
POST   /api/permissions
GET    /api/permissions/:id
PUT    /api/permissions/:id
DELETE /api/permissions/:id
GET    /api/users/:userId/roles
POST   /api/users/:userId/roles
DELETE /api/users/:userId/roles/:roleId
GET    /api/users/:userId/permissions
POST   /api/permissions/check
```

## Authentication

All endpoints require authentication.

## Authorization

RBAC management requires specific permissions:

- **Read Roles/Permissions:** `role.read` permission
- **Create Role/Permission:** `role.create` permission
- **Update Role/Permission:** `role.update` permission
- **Delete Role/Permission:** `role.delete` permission
- **Read User Roles/Permissions:** `user.read` permission
- **Manage User Roles:** `user.manage-roles` permission

## Endpoints

### Roles

### 1. Get All Roles

Get all roles in the system.

**Endpoint:** `GET /api/roles`

**Access:** Private (requires `role.read` permission)

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601abc1234567890abcdef",
      "code": "system-admin",
      "name": "System Administrator",
      "description": "Full system access with all permissions",
      "isSystemRole": true,
      "permissions": [
        {
          "resource": "*",
          "actions": ["*"],
          "metadata": {}
        }
      ],
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

---

### 2. Get Role by ID

Get detailed information about a specific role.

**Endpoint:** `GET /api/roles/:roleId`

**Access:** Private (requires `role.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| roleId | string | Yes | Role MongoDB ObjectId |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
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
}
```

---

### 3. Create Role

Create a new role with permissions.

**Endpoint:** `POST /api/roles`

**Access:** Private (requires `role.create` permission)

**Request Body:**
```json
{
  "code": "custom-role",
  "name": "Custom Role",
  "description": "Custom role with specific permissions",
  "isSystemRole": false,
  "permissions": [
    {
      "resource": "event",
      "actions": ["create", "read"],
      "metadata": {}
    },
    {
      "resource": "staff",
      "actions": ["create", "update"],
      "metadata": {
        "allowedStaffTypes": ["stakeholder", "coordinator"]
      }
    }
  ]
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | Role code (lowercase, alphanumeric + hyphens, 2-50 chars, unique) |
| name | string | Yes | Role name (2-100 characters) |
| description | string | No | Role description (max 500 characters) |
| isSystemRole | boolean | No | System role flag (default: `false`) |
| permissions | array | Yes | Array of permission objects (min 1) |

**Permission Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resource | string | Yes | Resource name (e.g., `event`, `request`, `user`, `*`) |
| actions | array | Yes | Array of action strings (e.g., `["create", "read"]`, `["*"]`) |
| metadata | object | No | Permission metadata (e.g., `{ allowedStaffTypes: ["stakeholder"] }`) |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Role created successfully",
  "data": {/* role object */}
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Role code is required",
    "At least one permission must be specified"
  ]
}
```

**409 Conflict** - Duplicate code
```json
{
  "success": false,
  "message": "Role with this code already exists"
}
```

---

### 4. Update Role

Update an existing role.

**Endpoint:** `PUT /api/roles/:roleId`

**Access:** Private (requires `role.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| roleId | string | Yes | Role MongoDB ObjectId |

**Request Body:**
```json
{
  "name": "Updated Role Name",
  "description": "Updated description",
  "permissions": [
    {
      "resource": "event",
      "actions": ["create", "read", "update"],
      "metadata": {}
    }
  ]
}
```

**Request Fields:** (All optional, at least one required)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Role name (2-100 characters) |
| description | string | Role description (max 500 characters) |
| isSystemRole | boolean | System role flag |
| permissions | array | Array of permission objects |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Role updated successfully",
  "data": {/* updated role object */}
}
```

---

### 5. Delete Role

Delete a role (system roles cannot be deleted).

**Endpoint:** `DELETE /api/roles/:roleId`

**Access:** Private (requires `role.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| roleId | string | Yes | Role MongoDB ObjectId |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Role deleted successfully"
}
```

**Error Responses:**

**400 Bad Request** - Cannot delete system role
```json
{
  "success": false,
  "message": "System roles cannot be deleted"
}
```

---

### Permissions

### 6. Get All Permissions

Get all permissions in the system.

**Endpoint:** `GET /api/permissions`

**Access:** Private (requires `role.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | string | No | Filter by permission type: `resource`, `page`, `feature`, `staff` |
| resource | string | No | Filter by resource name |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601abc1234567890abcdef",
      "code": "event.create",
      "name": "Create Event",
      "resource": "event",
      "action": "create",
      "type": "resource",
      "description": "Create new events",
      "metadata": {},
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

---

### 7. Get Permission by ID

Get detailed information about a specific permission.

**Endpoint:** `GET /api/permissions/:id`

**Access:** Private (requires `role.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Permission MongoDB ObjectId |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
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
}
```

---

### 8. Create Permission

Create a new permission.

**Endpoint:** `POST /api/permissions`

**Access:** Private (requires `role.create` permission)

**Request Body:**
```json
{
  "code": "page.custom-page",
  "name": "Access Custom Page",
  "resource": "page",
  "action": "custom-page",
  "type": "page",
  "description": "Access custom page",
  "metadata": {}
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | Permission code (lowercase, alphanumeric + dots/hyphens, 3-100 chars, unique) |
| name | string | Yes | Permission name (2-100 characters) |
| resource | string | Yes | Resource name (2-50 characters) |
| action | string | Yes | Action name (2-50 characters) |
| type | string | No | Permission type: `resource`, `page`, `feature`, `staff` (default: `resource`) |
| description | string | No | Permission description (max 500 characters) |
| metadata | object | No | Permission metadata (e.g., `{ allowedStaffTypes: ["stakeholder"] }`) |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Permission created successfully",
  "data": {/* permission object */}
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Permission code is required",
    "Resource is required"
  ]
}
```

**409 Conflict** - Duplicate code
```json
{
  "success": false,
  "message": "Permission with this code already exists"
}
```

---

### 9. Update Permission

Update an existing permission.

**Endpoint:** `PUT /api/permissions/:id`

**Access:** Private (requires `role.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Permission MongoDB ObjectId |

**Request Body:**
```json
{
  "name": "Updated Permission Name",
  "description": "Updated description",
  "metadata": {
    "allowedStaffTypes": ["stakeholder"]
  }
}
```

**Request Fields:** (All optional, at least one required)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Permission name (2-100 characters) |
| description | string | Permission description (max 500 characters) |
| type | string | Permission type enum |
| metadata | object | Permission metadata |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Permission updated successfully",
  "data": {/* updated permission object */}
}
```

---

### 10. Delete Permission

Delete a permission.

**Endpoint:** `DELETE /api/permissions/:id`

**Access:** Private (requires `role.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Permission MongoDB ObjectId |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Permission deleted successfully"
}
```

---

### User Role Assignments

### 11. Get User Roles

Get all roles assigned to a user.

**Endpoint:** `GET /api/users/:userId/roles`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID (ObjectId or legacy userId) |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601abc1234567890abcdef",
      "code": "coordinator",
      "name": "Coordinator",
      "description": "Event and request coordinator"
    }
  ]
}
```

---

### 12. Assign Role to User

Assign a role to a user with optional location scope.

**Endpoint:** `POST /api/users/:userId/roles`

**Access:** Private (requires `user.manage-roles` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID (ObjectId or legacy userId) |

**Request Body:**
```json
{
  "roleId": "601abc1234567890abcdef",
  "locationScope": ["601def1234567890abcdef"],
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roleId | string | Yes | Role MongoDB ObjectId |
| locationScope | array | No | Array of location IDs for scope restriction |
| expiresAt | date | No | Role expiration date (ISO format) |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Role assigned successfully",
  "data": {
    "_id": "601xyz1234567890abcdef",
    "userId": "601abc1234567890abcdef",
    "roleId": "601def1234567890abcdef",
    "assignedAt": "2024-01-20T15:00:00.000Z",
    "expiresAt": "2024-12-31T23:59:59.000Z",
    "isActive": true,
    "context": {
      "locationScope": ["601def1234567890abcdef"]
    }
  }
}
```

---

### 13. Revoke Role from User

Revoke a role from a user.

**Endpoint:** `DELETE /api/users/:userId/roles/:roleId`

**Access:** Private (requires `user.manage-roles` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID (ObjectId or legacy userId) |
| roleId | string | Yes | Role MongoDB ObjectId |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Role revoked successfully"
}
```

---

### 14. Get User Permissions

Get all permissions for a user (aggregated from all roles).

**Endpoint:** `GET /api/users/:userId/permissions`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID (ObjectId or legacy userId) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationScope | string | No | Location ID to filter permissions by scope |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "userId": "601abc1234567890abcdef",
    "permissions": [
      {
        "resource": "event",
        "actions": ["create", "read", "update"],
        "metadata": {}
      },
      {
        "resource": "request",
        "actions": ["create", "read", "review", "approve"],
        "metadata": {}
      }
    ],
    "locationScope": null
  }
}
```

---

### 15. Check Permission

Check if user has a specific permission.

**Endpoint:** `POST /api/permissions/check`

**Access:** Private

**Request Body:**
```json
{
  "resource": "event",
  "action": "create",
  "locationId": "601def1234567890abcdef"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resource | string | Yes | Resource name |
| action | string | Yes | Action name |
| locationId | string | No | Location ID for scope checking |

**Success Response (200):**
```json
{
  "success": true,
  "hasPermission": true,
  "resource": "event",
  "action": "create"
}
```

---

## Permission Types

### Resource Permissions (Default)

Standard CRUD permissions for resources:
- Format: `resource.action` (e.g., `event.create`, `request.review`)
- Examples: `event.create`, `request.approve`, `user.read`

### Page Permissions

Control access to specific pages:
- Format: `page.route` (e.g., `page.dashboard`, `page.events`)
- Examples: `page.dashboard`, `page.users`, `page.reports`

### Feature Permissions

Control access to specific features:
- Format: `feature.feature-code` (e.g., `feature.create-event`, `feature.request-blood`)
- Examples: `feature.create-event`, `feature.export-data`

### Staff Permissions

Staff management with type restrictions:
- Format: `staff.action` (e.g., `staff.create`, `staff.update`)
- Metadata: `{ allowedStaffTypes: ['coordinator', 'stakeholder'] }`
- Examples: `staff.create` (with metadata), `staff.delete`

---

## Role Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete Role model schema.

### Key Fields

- **code** (required, unique) - Role code (lowercase, unique)
- **name** (required) - Role name
- **description** (optional) - Role description
- **isSystemRole** (default: `false`) - System role flag
- **permissions** (array) - Array of permission objects with metadata

---

## Permission Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete Permission model schema.

### Key Fields

- **code** (required, unique) - Permission code (lowercase, unique)
- **name** (required) - Permission name
- **resource** (required) - Resource name
- **action** (required) - Action name
- **type** (default: `resource`) - Permission type enum
- **metadata** (object) - Additional constraints (e.g., `allowedStaffTypes`)

---

## UserRole Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete UserRole model schema.

### Key Fields

- **userId** (required) - User reference (ObjectId)
- **roleId** (required) - Role reference (ObjectId)
- **assignedAt** (default: now) - Assignment timestamp
- **assignedBy** (optional) - User who assigned the role
- **expiresAt** (optional) - Role expiration date
- **isActive** (default: `true`) - Active status
- **context.locationScope** (array) - Location scope restrictions

---

## Business Logic

### Permission Checking Flow

1. Get all active roles for user (not expired)
2. Filter by location scope if provided
3. Aggregate permissions from all roles
4. Check if permission exists (with wildcard support)
5. Check metadata constraints (e.g., staff types)

### Role Assignment Flow

1. Verify role exists
2. Check if user already has this role (update if exists)
3. Create UserRole record with location scope
4. Set expiration if provided
5. Return UserRole document

### Permission Aggregation

Permissions are aggregated from all user roles:
- Same resource permissions are merged (actions combined)
- Metadata is merged (e.g., `allowedStaffTypes` arrays combined)
- Wildcard permissions (`*`) grant full access

---

## Related Documentation

- [Users API](API_USERS.md) - User management
- [Pages & Features API](API_PAGES_FEATURES.md) - Page and feature permissions
- [Models Reference](MODELS_REFERENCE.md) - Role, Permission, UserRole models
- [Middleware Reference](MIDDLEWARE_REFERENCE.md) - Permission middleware
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
