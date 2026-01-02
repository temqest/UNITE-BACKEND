# Backend API Documentation

## Overview

This is the comprehensive API documentation for the UNITE Backend system. The backend is built with Node.js, Express, MongoDB (Mongoose), and implements a Role-Based Access Control (RBAC) system with flexible permissions.

## Table of Contents

### Domain Documentation
- [Authentication & Authorization](API_AUTH.md) - Login, logout, user authentication
- [User Management](API_USERS.md) - User CRUD operations, registration codes
- [Events Management](API_EVENTS.md) - Event creation, calendar views, statistics
- [Requests Management](API_REQUESTS.md) - Event requests, blood bag requests, workflow
- [Inventory Management](API_INVENTORY.md) - Blood bag inventory operations
- [Chat & Messaging](API_CHAT.md) - Real-time messaging, conversations, presence
- [Location Management](API_LOCATIONS.md) - Hierarchical location system
- [Utility Services](API_UTILITY.md) - Notifications, file uploads, system settings
- [RBAC Management](API_RBAC.md) - Roles, permissions, user role assignments
- [Pages & Features](API_PAGES_FEATURES.md) - Page access and feature permissions

### Reference Documentation
- [Models Reference](MODELS_REFERENCE.md) - Complete data model schemas
- [Middleware Reference](MIDDLEWARE_REFERENCE.md) - Authentication and authorization middleware
- [Error Codes](ERROR_CODES.md) - Error response codes and messages

## Base URL

All API endpoints are prefixed with `/api`:

```
Production: https://api.unite.example.com/api
Development: http://localhost:3000/api
```

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Most endpoints require authentication.

### Authentication Methods

1. **JWT Token (Bearer Token)**
   - Include in `Authorization` header: `Authorization: Bearer <token>`
   - Token is obtained via `/api/auth/login` or `/api/auth/stakeholders/login`
   - Token expires after 12 hours (configurable)

2. **Cookie-based (Fallback)**
   - Cookie name: `unite_user`
   - Contains JSON with user information
   - Used as fallback when Bearer token is not provided

### Getting an Authentication Token

```bash
# Login request
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

# Response
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "role": "coordinator"
  }
}
```

### Using the Token

```bash
# Include in Authorization header
GET /api/users
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Authorization

The system uses Role-Based Access Control (RBAC) with permission-based authorization.

### Permission Format

Permissions follow the format: `resource.action`

Examples:
- `event.create` - Create events
- `request.review` - Review requests
- `user.read` - Read user information
- `staff.create` - Create staff members

### Permission Types

1. **Resource Permissions** (default) - Standard CRUD operations
2. **Page Permissions** - Control page access (`page.dashboard`, `page.events`)
3. **Feature Permissions** - Control feature access (`feature.create-event`, `feature.request-blood`)
4. **Staff Permissions** - Staff management with type restrictions (`staff.create`, `staff.update`)

### Checking Permissions

Most endpoints automatically check permissions via middleware. You can also check permissions programmatically:

```bash
POST /api/permissions/check
Authorization: Bearer <token>
Content-Type: application/json

{
  "resource": "event",
  "action": "create",
  "locationId": "optional-location-id"
}
```

## Common Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional success message"
}
```

### Error Response

```json
{
  "success": false,
  "message": "Error message",
  "errors": ["Detailed error 1", "Detailed error 2"]
}
```

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (permission denied)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

See [ERROR_CODES.md](ERROR_CODES.md) for complete error reference.

## Pagination

Many list endpoints support pagination:

### Query Parameters
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)

### Response Format

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

## Filtering & Sorting

### Common Query Parameters

- `sort` - Sort field (e.g., `sort=createdAt`)
- `order` - Sort order: `asc` or `desc` (default: `desc`)
- `search` - Search term (searches relevant fields)
- `status` - Filter by status
- `locationId` - Filter by location
- `startDate` / `endDate` - Date range filters

### Example

```bash
GET /api/events?status=approved&sort=startDate&order=asc&page=1&limit=20
```

## Data Validation

All input data is validated using Joi schemas. Validation errors return:

```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Email is required",
    "Password must be at least 6 characters"
  ]
}
```

## Location Scoping

Many permissions support location-based scoping. When a `locationId` is provided in the request (body, params, or query), permissions are checked within that location scope.

### Location Scope Types

- `exact` - Only the exact location
- `descendants` - Location and all child locations
- `ancestors` - Location and all parent locations
- `all` - All locations in hierarchy

## Real-time Features

The system uses Socket.IO for real-time features:

- **Chat Messages** - Real-time messaging
- **Notifications** - Push notifications
- **Presence** - User online/offline status
- **Typing Indicators** - Real-time typing status

See [API_CHAT.md](API_CHAT.md) for Socket.IO event documentation.

## Rate Limiting

Some endpoints have rate limiting applied:

- **Authentication endpoints** - Stricter limits to prevent brute force
- **General endpoints** - Standard rate limits

Rate limit headers are included in responses:
- `X-RateLimit-Limit` - Request limit
- `X-RateLimit-Remaining` - Remaining requests
- `X-RateLimit-Reset` - Reset time

## Request Workflow System

The request system uses a state machine pattern:

### States
- `pending-review` - Awaiting reviewer
- `review-accepted` - Accepted by reviewer
- `review-rejected` - Rejected by reviewer
- `review-rescheduled` - Reschedule proposed
- `creator-confirmed` - Confirmed by creator
- `creator-declined` - Declined by creator
- `completed` - Request completed
- `expired-review` - Review expired

See [API_REQUESTS.md](API_REQUESTS.md) for complete workflow documentation.

## Best Practices

1. **Always include Authorization header** for protected endpoints
2. **Handle errors gracefully** - Check `success` field before accessing `data`
3. **Use pagination** for large datasets
4. **Validate input** on frontend before sending requests
5. **Cache permissions** - Query user permissions on login, cache for session
6. **Handle token expiration** - Implement token refresh or re-login flow
7. **Use appropriate HTTP methods** - GET for reads, POST for creates, PUT for updates, DELETE for deletes

## Integration Examples

### JavaScript/TypeScript (Fetch)

```javascript
// Login
const login = async (email, password) => {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (data.success) {
    localStorage.setItem('token', data.token);
  }
  return data;
};

// Authenticated request
const getUsers = async () => {
  const token = localStorage.getItem('token');
  const response = await fetch('http://localhost:3000/api/users', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return await response.json();
};
```

### Axios

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: { 'Content-Type': 'application/json' }
});

// Add token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Login
const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password });
  if (data.success) {
    localStorage.setItem('token', data.token);
  }
  return data;
};
```

## Support

For questions or issues:
- Review domain-specific documentation
- Check [ERROR_CODES.md](ERROR_CODES.md) for error meanings
- Review [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for data structures

---

**Last Updated**: 2024
**API Version**: 1.0
