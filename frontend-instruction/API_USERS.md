# User Management API

## Overview

The User Management API provides endpoints for creating, reading, updating, and deleting users. The system uses a unified User model with RBAC (Role-Based Access Control) for permissions and role assignments.

## Base URL

All user endpoints are under `/api/users`:

```
GET    /api/users
GET    /api/users/:userId
POST   /api/users
PUT    /api/users/:userId
DELETE /api/users/:userId
GET    /api/users/check-email/:email
GET    /api/registration-codes/validate
```

## Authentication

All endpoints require authentication except:
- `GET /api/users/check-email/:email` - Public
- `GET /api/registration-codes/validate` - Public

## Authorization

User management requires specific permissions:

- **List/Read Users:** `user.read` permission
- **Create User:** `staff.create` permission (with staff type restrictions)
- **Update User:** `staff.update` permission (with staff type restrictions)
- **Delete User:** `staff.delete` permission

See [API_RBAC.md](API_RBAC.md) for permission details.

## Endpoints

### 1. List Users

Get a paginated list of users with optional filtering.

**Endpoint:** `GET /api/users`

**Access:** Private (requires `user.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| role | string | No | - | Filter by role code (e.g., `coordinator`, `stakeholder`) |
| organizationType | string | No | - | Filter by organization type (`LGU`, `NGO`, `Hospital`, `RedCross`, `Non-LGU`, `Other`) |
| isActive | boolean | No | - | Filter by active status (`true` or `false`) |
| locationId | string | No | - | Filter by location (future implementation) |
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page (max 100) |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601abc1234567890abcdef",
      "email": "user@example.com",
      "firstName": "John",
      "middleName": "Michael",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "organizationType": "LGU",
      "organizationInstitution": "City Health Office",
      "field": "Public Health",
      "isSystemAdmin": false,
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-20T14:45:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/users?role=coordinator&page=1&limit=20" \
  -H "Authorization: Bearer <token>"
```

---

### 2. Get User by ID

Get detailed information about a specific user including roles, permissions, and locations.

**Endpoint:** `GET /api/users/:userId`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User's MongoDB ObjectId or legacy userId |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "601abc1234567890abcdef",
    "userId": "LEGACY123",
    "email": "user@example.com",
    "firstName": "John",
    "middleName": "Michael",
    "lastName": "Doe",
    "phoneNumber": "+1234567890",
    "organizationType": "LGU",
    "organizationInstitution": "City Health Office",
    "field": "Public Health",
    "isSystemAdmin": false,
    "isActive": true,
    "lastLoginAt": "2024-01-20T14:45:00.000Z",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-20T14:45:00.000Z",
    "roles": [
      {
        "_id": "601def1234567890abcdef",
        "code": "coordinator",
        "name": "Coordinator",
        "description": "Event and request coordinator"
      }
    ],
    "permissions": [
      {
        "resource": "event",
        "actions": ["create", "read", "update"]
      },
      {
        "resource": "request",
        "actions": ["create", "read", "review", "approve"]
      }
    ],
    "locations": [
      {
        "_id": "601ghi1234567890abcdef",
        "locationId": "601jkl1234567890abcdef",
        "scope": "exact",
        "isPrimary": true
      }
    ]
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/users/601abc1234567890abcdef" \
  -H "Authorization: Bearer <token>"
```

---

### 3. Create User

Create a new user with optional role and location assignments.

**Endpoint:** `POST /api/users`

**Access:** Private (requires `staff.create` permission with appropriate staff type)

**Request Body:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "firstName": "Jane",
  "middleName": "Marie",
  "lastName": "Smith",
  "phoneNumber": "+1234567890",
  "organizationType": "NGO",
  "organizationInstitution": "Health NGO",
  "field": "Community Health",
  "isSystemAdmin": false,
  "roles": ["coordinator"],
  "locations": [
    {
      "locationId": "601jkl1234567890abcdef",
      "scope": "exact",
      "isPrimary": true
    }
  ]
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email address (must be unique, lowercase) |
| password | string | Yes | Password (min 6, max 128 characters) |
| firstName | string | Yes | User's first name (max 100 characters) |
| middleName | string | No | User's middle name (max 100 characters) |
| lastName | string | Yes | User's last name (max 100 characters) |
| phoneNumber | string | No | Phone number (min 5, max 30 characters) |
| organizationType | string | No | Enum: `LGU`, `NGO`, `Hospital`, `RedCross`, `Non-LGU`, `Other` |
| organizationInstitution | string | No | Organization name (max 200 characters) |
| field | string | No | Field of work (max 100 characters) |
| isSystemAdmin | boolean | No | System administrator flag (default: `false`) |
| roles | array | No | Array of role codes (e.g., `["coordinator", "stakeholder"]`) |
| locations | array | No | Array of location assignments (see below) |

**Location Assignment Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| locationId | string | Yes | Location MongoDB ObjectId |
| scope | string | No | `exact`, `descendants`, `ancestors`, `all` (default: `exact`) |
| isPrimary | boolean | No | Primary location flag (default: `false`) |

**Validation Rules:**
- Email must be valid format and unique
- Password: 6-128 characters
- First name: 1-100 characters
- Last name: 1-100 characters
- Middle name: max 100 characters (optional)
- Phone number: 5-30 characters (optional)
- Organization type must be valid enum value

**Staff Type Restrictions:**
The `staff.create` permission may restrict which staff types can be created. The system checks if the requested role (from `roles` array) is allowed based on the permission's `metadata.allowedStaffTypes`.

**Success Response (201):**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "_id": "601abc1234567890abcdef",
    "email": "newuser@example.com",
    "firstName": "Jane",
    "middleName": "Marie",
    "lastName": "Smith",
    "phoneNumber": "+1234567890",
    "organizationType": "NGO",
    "organizationInstitution": "Health NGO",
    "field": "Community Health",
    "isSystemAdmin": false,
    "isActive": true,
    "createdAt": "2024-01-20T15:00:00.000Z",
    "updatedAt": "2024-01-20T15:00:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Email is required",
    "Password must be at least 6 characters long"
  ]
}
```

**400 Bad Request** - Email already exists
```json
{
  "success": false,
  "message": "Email already exists"
}
```

**403 Forbidden** - Staff type not allowed
```json
{
  "success": false,
  "message": "Cannot create staff of type 'system-admin'. Allowed types: stakeholder, coordinator"
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:3000/api/users" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "password123",
    "firstName": "Jane",
    "lastName": "Smith",
    "roles": ["coordinator"]
  }'
```

---

### 4. Update User

Update an existing user's information.

**Endpoint:** `PUT /api/users/:userId`

**Access:** Private (requires `staff.update` permission with appropriate staff type)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User's MongoDB ObjectId or legacy userId |

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith-Jones",
  "phoneNumber": "+9876543210",
  "organizationType": "Hospital",
  "isActive": true
}
```

**Request Fields:** (All optional, at least one required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| firstName | string | No | User's first name (1-100 characters) |
| middleName | string | No | User's middle name (max 100 characters, can be null) |
| lastName | string | No | User's last name (1-100 characters) |
| phoneNumber | string | No | Phone number (5-30 characters, can be null) |
| organizationType | string | No | Enum: `LGU`, `NGO`, `Hospital`, `RedCross`, `Non-LGU`, `Other` |
| organizationInstitution | string | No | Organization name (max 200 characters) |
| field | string | No | Field of work (max 100 characters) |
| isSystemAdmin | boolean | No | System administrator flag |
| isActive | boolean | No | Account active status |

**Note:** Password updates are handled separately (not included in this endpoint).

**Staff Type Restrictions:**
If updating the user's role (via separate role assignment endpoint), the `staff.update` permission may restrict which staff types can be assigned.

**Success Response (200):**
```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "_id": "601abc1234567890abcdef",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Smith-Jones",
    "phoneNumber": "+9876543210",
    "organizationType": "Hospital",
    "isActive": true,
    "updatedAt": "2024-01-20T16:00:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "First name must be at least 1 character long"
  ]
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**cURL Example:**
```bash
curl -X PUT "http://localhost:3000/api/users/601abc1234567890abcdef" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith-Jones"
  }'
```

---

### 5. Delete User

Soft delete a user (sets `isActive` to `false`).

**Endpoint:** `DELETE /api/users/:userId`

**Access:** Private (requires `staff.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User's MongoDB ObjectId or legacy userId |

**Success Response (200):**
```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**Note:** This is a soft delete. The user record remains in the database with `isActive: false`. To permanently delete, use a separate endpoint (if available).

**cURL Example:**
```bash
curl -X DELETE "http://localhost:3000/api/users/601abc1234567890abcdef" \
  -H "Authorization: Bearer <token>"
```

---

### 6. Check Email Availability

Check if an email address is available for registration.

**Endpoint:** `GET /api/users/check-email/:email`

**Access:** Public

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Email address to check |

**Success Response (200):**
```json
{
  "success": true,
  "available": true
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` |
| available | boolean | `true` if email is available, `false` if already taken |

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/users/check-email/user@example.com"
```

---

### 7. Validate Registration Code

Validate a registration code for user signup.

**Endpoint:** `GET /api/registration-codes/validate`

**Access:** Public

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| code | string | Yes | Registration code to validate |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "Code": "ABC123",
    "coordinatorId": "601abc1234567890abcdef",
    "locationId": "601jkl1234567890abcdef",
    "locationInfo": {
      "name": "Manila",
      "type": "city"
    }
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| data.Code | string | The registration code |
| data.coordinatorId | string | Coordinator ID associated with the code |
| data.locationId | string | Location ID associated with the code |
| data.locationInfo | object | Location information (if available) |

**Error Responses:**

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Code query param is required"
}
```

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Invalid or expired code"
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/registration-codes/validate?code=ABC123"
```

---

## User Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete User model schema.

### Key Fields

- **email** (required, unique) - User's email address
- **password** (required) - Hashed password (never returned in responses)
- **firstName** (required) - User's first name
- **lastName** (required) - User's last name
- **middleName** (optional) - User's middle name
- **phoneNumber** (optional) - User's phone number
- **organizationType** (optional) - Enum: `LGU`, `NGO`, `Hospital`, `RedCross`, `Non-LGU`, `Other`
- **isSystemAdmin** (default: false) - System administrator flag
- **isActive** (default: true) - Account active status
- **userId** (optional, unique) - Legacy user ID for backward compatibility

---

## Staff Type Management

When creating or updating users, the system enforces staff type restrictions based on permissions:

### Checking Allowed Staff Types

```bash
GET /api/rbac/permissions/user/:userId/staff-types/create
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": ["stakeholder", "coordinator"]
}
```

If `data` contains `["*"]`, all staff types are allowed.

### Staff Type Restrictions in Requests

When creating a user, if `roles` array contains a role code, the system checks if that role is in the allowed staff types. If not, the request is rejected with `403 Forbidden`.

---

## Role Assignment

User roles are managed separately via the RBAC API:

- **Assign Role:** `POST /api/users/:userId/roles` (see [API_RBAC.md](API_RBAC.md))
- **Revoke Role:** `DELETE /api/users/:userId/roles/:roleId` (see [API_RBAC.md](API_RBAC.md))
- **Get User Roles:** `GET /api/users/:userId/roles` (see [API_RBAC.md](API_RBAC.md))

---

## Location Assignment

User locations are managed via the Location API:

- **Assign Location:** `POST /api/users/:userId/locations` (see [API_LOCATIONS.md](API_LOCATIONS.md))
- **Get User Locations:** `GET /api/users/:userId/locations` (see [API_LOCATIONS.md](API_LOCATIONS.md))
- **Revoke Location:** `DELETE /api/users/:userId/locations/:locationId` (see [API_LOCATIONS.md](API_LOCATIONS.md))

---

## Business Logic

### User Creation Flow

1. Validate input data (Joi validation)
2. Check if email already exists
3. Hash password with bcrypt (10 salt rounds)
4. Create user record
5. Assign roles if provided (via `permissionService.assignRole`)
6. Assign locations if provided (via `locationService.assignUserToLocation`)
7. Return user data (password excluded)

### User Update Flow

1. Validate input data (Joi validation)
2. Find user by ID (ObjectId or legacy userId)
3. Update user fields
4. Save user
5. Return updated user data (password excluded)

### User Deletion Flow

1. Find user by ID (ObjectId or legacy userId)
2. Set `isActive = false` (soft delete)
3. Save user
4. Return success message

---

## Error Handling

### Common Errors

**400 Bad Request:**
- Validation errors (missing required fields, invalid formats)
- Email already exists
- Invalid enum values

**401 Unauthorized:**
- Missing or invalid authentication token

**403 Forbidden:**
- Insufficient permissions
- Staff type not allowed

**404 Not Found:**
- User not found

**500 Internal Server Error:**
- Database errors
- Server errors

---

## Integration Examples

### Complete User Management Flow

```javascript
class UserService {
  constructor(baseURL, token) {
    this.baseURL = baseURL;
    this.token = token;
  }

  async listUsers(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await fetch(`${this.baseURL}/users?${params}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return await response.json();
  }

  async getUser(userId) {
    const response = await fetch(`${this.baseURL}/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return await response.json();
  }

  async createUser(userData) {
    const response = await fetch(`${this.baseURL}/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    return await response.json();
  }

  async updateUser(userId, updateData) {
    const response = await fetch(`${this.baseURL}/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    return await response.json();
  }

  async deleteUser(userId) {
    const response = await fetch(`${this.baseURL}/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    return await response.json();
  }

  async checkEmail(email) {
    const response = await fetch(`${this.baseURL}/users/check-email/${encodeURIComponent(email)}`);
    return await response.json();
  }

  async validateRegistrationCode(code) {
    const response = await fetch(`${this.baseURL}/registration-codes/validate?code=${code}`);
    return await response.json();
  }
}

// Usage
const userService = new UserService('http://localhost:3000/api', token);

// List users
const users = await userService.listUsers({ role: 'coordinator', page: 1, limit: 20 });

// Create user
const newUser = await userService.createUser({
  email: 'newuser@example.com',
  password: 'password123',
  firstName: 'Jane',
  lastName: 'Smith',
  roles: ['coordinator']
});
```

---

## Related Documentation

- [Authentication API](API_AUTH.md) - Login and authentication
- [RBAC API](API_RBAC.md) - Role and permission management
- [Location API](API_LOCATIONS.md) - Location assignments
- [Models Reference](MODELS_REFERENCE.md) - Complete User model schema
- [Middleware Reference](MIDDLEWARE_REFERENCE.md) - Permission middleware
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
