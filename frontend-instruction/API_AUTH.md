# Authentication & Authorization API

## Overview

The authentication system uses JWT (JSON Web Tokens) for secure user authentication. Tokens are issued upon successful login and must be included in subsequent API requests.

## Base URL

All authentication endpoints are under `/api/auth`:

```
POST /api/auth/login
POST /api/auth/stakeholders/login
GET  /api/auth/me
POST /api/auth/logout
```

## Endpoints

### 1. User Login

Authenticate a user with email and password.

**Endpoint:** `POST /api/auth/login`

**Access:** Public

**Rate Limiting:** Applied (stricter limits to prevent brute force)

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Request Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email address (case-insensitive) |
| password | string | Yes | User's password (plain text) |

**Success Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYwMWFiYzEyMzQ1Njc4OTBhYmNkZWYiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJyb2xlIjoiY29vcmRpbmF0b3IiLCJpYXQiOjE2MTYyMzkwMjIsImV4cCI6MTYxNjI4MjIyMn0.abc123...",
  "user": {
    "id": "601abc1234567890abcdef",
    "email": "user@example.com",
    "role": "coordinator",
    "StaffType": "Coordinator",
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| token | string | JWT token for authentication (expires in 12 hours) |
| user | object | User information (password excluded) |
| user.id | string | User's MongoDB ObjectId |
| user.email | string | User's email address |
| user.role | string | User's primary role code |
| user.StaffType | string | User's staff type (for compatibility) |

**Error Responses:**

**400 Bad Request** - Missing credentials
```json
{
  "success": false,
  "message": "Email and password are required"
}
```

**401 Unauthorized** - Invalid credentials
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**429 Too Many Requests** - Rate limit exceeded
```json
{
  "success": false,
  "message": "Too many login attempts, please try again later"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

**JavaScript Example:**
```javascript
const login = async (email, password) => {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  
  if (data.success) {
    // Store token for future requests
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  }
  
  return data;
};
```

---

### 2. Stakeholder Login

Authenticate a stakeholder with email and password.

**Endpoint:** `POST /api/auth/stakeholders/login`

**Access:** Public

**Rate Limiting:** Applied

**Request Body:**
```json
{
  "email": "stakeholder@example.com",
  "password": "password123"
}
```

**Request Fields:**
Same as User Login

**Success Response (200):**
Same format as User Login

**Error Responses:**
Same as User Login

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/auth/stakeholders/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "stakeholder@example.com",
    "password": "password123"
  }'
```

---

### 3. Get Current User

Get information about the currently authenticated user.

**Endpoint:** `GET /api/auth/me`

**Access:** Private (requires authentication)

**Headers:**
```
Authorization: Bearer <token>
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
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
    ]
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| data | object | Complete user object (password excluded) |
| data._id | string | User's MongoDB ObjectId |
| data.email | string | User's email address |
| data.firstName | string | User's first name |
| data.middleName | string | User's middle name (optional) |
| data.lastName | string | User's last name |
| data.phoneNumber | string | User's phone number (optional) |
| data.organizationType | string | Organization type enum |
| data.organizationInstitution | string | Organization name (optional) |
| data.field | string | Field of work (optional) |
| data.isSystemAdmin | boolean | System administrator flag |
| data.isActive | boolean | Account active status |
| data.roles | array | User's assigned roles |
| data.permissions | array | User's aggregated permissions |

**Error Responses:**

**401 Unauthorized** - No token or invalid token
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**cURL Example:**
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**JavaScript Example:**
```javascript
const getCurrentUser = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('http://localhost:3000/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
};
```

---

### 4. Logout

Logout the current user by clearing authentication cookies.

**Endpoint:** `POST /api/auth/logout`

**Access:** Public (works with cookie-based sessions)

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out"
}
```

**Note:** This endpoint clears server-side cookies. For JWT tokens, the client should simply discard the token. The token will expire naturally after 12 hours.

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/auth/logout
```

**JavaScript Example:**
```javascript
const logout = async () => {
  await fetch('http://localhost:3000/api/auth/logout', {
    method: 'POST'
  });
  
  // Clear client-side token
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
```

---

## JWT Token Structure

### Token Payload

The JWT token contains the following payload:

```json
{
  "id": "601abc1234567890abcdef",
  "email": "user@example.com",
  "role": "coordinator",
  "StaffType": "Coordinator",
  "iat": 1616239022,
  "exp": 1616282222
}
```

**Payload Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | string | User's MongoDB ObjectId |
| email | string | User's email address |
| role | string | User's primary role code |
| StaffType | string | User's staff type (legacy compatibility) |
| iat | number | Token issued at (Unix timestamp) |
| exp | number | Token expiration (Unix timestamp) |

### Token Expiration

- **Default:** 12 hours
- **Configurable:** Via `JWT_SECRET` and token options
- **Expired tokens:** Return `401 Unauthorized` with message "Invalid or expired token"

### Token Usage

Include the token in the `Authorization` header:

```
Authorization: Bearer <token>
```

---

## Authentication Middleware

The `authenticate` middleware is used to protect routes. It:

1. Checks for JWT token in `Authorization: Bearer <token>` header
2. Falls back to `unite_user` cookie if no Bearer token
3. Sets `req.user` with user information on success
4. Returns `401 Unauthorized` if authentication fails

**Middleware Location:** `src/middleware/authenticate.js`

**Request Object Modification:**
After successful authentication, `req.user` contains:
```javascript
{
  id: "601abc1234567890abcdef",
  email: "user@example.com",
  role: "coordinator",
  StaffType: "Coordinator"
}
```

---

## Cookie-Based Authentication (Fallback)

The system supports cookie-based authentication as a fallback:

**Cookie Name:** `unite_user`

**Cookie Format:** JSON string containing:
```json
{
  "id": "601abc1234567890abcdef",
  "email": "user@example.com",
  "role": "coordinator",
  "StaffType": "Coordinator",
  "isAdmin": false
}
```

**Usage:** The `authenticate` middleware automatically checks for this cookie if no Bearer token is provided.

---

## Password Requirements

Passwords must meet the following criteria:

- **Minimum length:** 6 characters
- **Maximum length:** 128 characters
- **Storage:** Passwords are hashed using bcrypt (10 salt rounds)
- **Never returned:** Passwords are never included in API responses

---

## Security Considerations

1. **HTTPS Required:** Always use HTTPS in production
2. **Token Storage:** Store tokens securely (httpOnly cookies recommended for web apps)
3. **Token Expiration:** Tokens expire after 12 hours - implement refresh or re-login
4. **Rate Limiting:** Login endpoints have rate limiting to prevent brute force attacks
5. **Password Hashing:** Passwords are hashed with bcrypt before storage
6. **Token Validation:** Always validate tokens on the server side

---

## Error Handling

### Common Errors

**401 Unauthorized:**
- No token provided
- Invalid token format
- Expired token
- Invalid token signature

**400 Bad Request:**
- Missing email or password
- Invalid email format

**429 Too Many Requests:**
- Rate limit exceeded on login attempts

**500 Internal Server Error:**
- Database connection issues
- Server errors during authentication

---

## Integration Examples

### Complete Authentication Flow

```javascript
class AuthService {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async login(email, password) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.success) {
      this.setToken(data.token);
      this.setUser(data.user);
      return data;
    } else {
      throw new Error(data.message);
    }
  }

  async getCurrentUser() {
    const token = this.getToken();
    if (!token) throw new Error('Not authenticated');
    
    const response = await fetch(`${this.baseURL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const data = await response.json();
    if (data.success) {
      this.setUser(data.data);
      return data.data;
    } else {
      throw new Error(data.message);
    }
  }

  logout() {
    this.removeToken();
    this.removeUser();
    fetch(`${this.baseURL}/auth/logout`, { method: 'POST' });
  }

  setToken(token) {
    localStorage.setItem('token', token);
  }

  getToken() {
    return localStorage.getItem('token');
  }

  removeToken() {
    localStorage.removeItem('token');
  }

  setUser(user) {
    localStorage.setItem('user', JSON.stringify(user));
  }

  getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }

  removeUser() {
    localStorage.removeItem('user');
  }

  isAuthenticated() {
    return !!this.getToken();
  }
}

// Usage
const auth = new AuthService('http://localhost:3000/api');

// Login
await auth.login('user@example.com', 'password123');

// Get current user
const user = await auth.getCurrentUser();

// Logout
auth.logout();
```

### Axios Interceptor Example

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api'
});

// Add token to all requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiration
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Login
const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password });
  if (data.success) {
    localStorage.setItem('token', data.token);
  }
  return data;
};
```

---

## Related Documentation

- [User Management API](API_USERS.md) - User CRUD operations
- [RBAC API](API_RBAC.md) - Role and permission management
- [Middleware Reference](MIDDLEWARE_REFERENCE.md) - Authentication middleware details
- [Error Codes](ERROR_CODES.md) - Complete error reference

---

**Last Updated:** 2024
