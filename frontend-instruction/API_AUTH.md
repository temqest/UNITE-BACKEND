# Authentication & Authorization API

## Overview

The authentication system uses JWT (JSON Web Tokens) for secure user authentication. Tokens are issued upon successful login and must be included in subsequent API requests.

## Base URL

All authentication endpoints are under `/api/auth`:

```
POST /api/auth/login
POST /api/auth/stakeholders/login
POST /api/auth/refresh
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
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYwMWFiYzEyMzQ1Njc4OTBhYmNkZWYiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJpYXQiOjE2MTYyMzkwMjIsImV4cCI6MTYxNjI0MDgyMn0.abc123...",
  "user": {
    "id": "601abc1234567890abcdef",
    "email": "user@example.com",
    "displayName": "John Doe"
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| token | string | JWT token for authentication (expires in 30 minutes by default, configurable via JWT_EXPIRES_IN env var) |
| user | object | Minimal user information for display purposes only |
| user.id | string | User's MongoDB ObjectId |
| user.email | string | User's email address |
| user.displayName | string | User's display name (firstName + lastName) |

**Security Notes:**
- The login response contains **minimal user data only** for security reasons
- The token payload contains only `id` and `email` - no role or permission information
- **Do NOT store the user object in localStorage** - it should only be used for immediate UI display
- To get full user data (roles, permissions, locations), call `/api/auth/me` after login
- Full user data from `/api/auth/me` should be stored in memory only (React Context/State), never persisted

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
    // Store ONLY the token - do NOT store user data in localStorage
    localStorage.setItem('token', data.token);
    
    // Fetch full user data from /api/auth/me and store in memory (React Context/State)
    // Do NOT persist user data to localStorage for security reasons
    const userResponse = await fetch('http://localhost:3000/api/auth/me', {
      headers: { 'Authorization': `Bearer ${data.token}` }
    });
    const userData = await userResponse.json();
    
    // Store user data in memory only (e.g., React Context)
    // setUserInContext(userData.user);
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
  "user": {
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

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| user | object | Complete user object (password excluded) |
| user._id | string | User's MongoDB ObjectId |
| user.email | string | User's email address |
| user.firstName | string | User's first name |
| user.middleName | string | User's middle name (optional) |
| user.lastName | string | User's last name |
| user.phoneNumber | string | User's phone number (optional) |
| user.organizationType | string | Organization type enum |
| user.organizationInstitution | string | Organization name (optional) |
| user.field | string | Field of work (optional) |
| user.isSystemAdmin | boolean | System administrator flag |
| user.isActive | boolean | Account active status |
| user.roles | array | User's assigned roles |
| user.permissions | array | User's aggregated permissions |
| user.locations | array | User's location assignments |

**⚠️ SECURITY WARNING:**
- **DO NOT persist this data to localStorage or sessionStorage**
- This endpoint returns sensitive authorization data (roles, permissions, locations)
- Store this data in **memory only** (React Context/State)
- Re-fetch this data on app load and page refresh to ensure it's up-to-date
- **Never use this data for authorization decisions** - always use permission checking endpoints:
  - `/api/permissions/check` for permission checks
  - `/api/pages/check/:pageRoute` for page access
  - `/api/features/check/:featureCode` for feature access

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
  const data = await response.json();
  
  if (data.success) {
    // Store user data in memory only (React Context/State)
    // DO NOT persist to localStorage/sessionStorage
    // setUserInContext(data.user);
    return data;
  }
  
  // If 401, token is invalid/expired - clear storage and redirect to login
  if (response.status === 401) {
    localStorage.removeItem('token');
    // redirectToLogin();
  }
  
  return data;
};
```

---

### 4. Refresh Token

Refresh the access token to extend the session without requiring re-login.

**Endpoint:** `POST /api/auth/refresh`

**Access:** Private (requires valid token)

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:** None

**Success Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "601abc1234567890abcdef",
    "email": "user@example.com",
    "displayName": "John Doe"
  }
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| token | string | New JWT token (expires in 30 minutes by default) |
| user | object | Minimal user information |
| user.id | string | User's MongoDB ObjectId |
| user.email | string | User's email address |
| user.displayName | string | User's display name |

**Error Responses:**

**401 Unauthorized** - Invalid or expired token
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**401 Unauthorized** - Account is inactive
```json
{
  "success": false,
  "message": "Account is inactive"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**JavaScript Example:**
```javascript
const refreshToken = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Update stored token
    localStorage.setItem('token', data.token);
    return data;
  }
  
  // If 401, token is invalid - clear storage and redirect to login
  if (response.status === 401) {
    localStorage.removeItem('token');
    // redirectToLogin();
  }
  
  return data;
};
```

**Usage Notes:**
- Call this endpoint before the token expires to extend the session
- The endpoint validates that the user still exists and is active
- Returns a new token with the same expiration time
- Frontend should update the stored token with the new one
- For production, consider implementing a proper refresh token system with HttpOnly cookies

---

### 5. Logout

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

The JWT token contains a **minimal payload** for security:

```json
{
  "id": "601abc1234567890abcdef",
  "email": "user@example.com",
  "iat": 1616239022,
  "exp": 1616240822
}
```

**Payload Fields:**
| Field | Type | Description |
|-------|------|-------------|
| id | string | User's MongoDB ObjectId |
| email | string | User's email address |

**Security Notes:**
- Token contains **only** `id` and `email` - no role or permission information
- Role and permissions should be fetched from the server when needed
- Token expiration: **30 minutes by default** (configurable via `JWT_EXPIRES_IN` environment variable)
- Shorter token lifetime improves security - tokens should be refreshed or re-validated regularly
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
