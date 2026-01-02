# Error Codes Reference

## Overview

This document provides a complete reference for all error responses, status codes, and error messages used in the UNITE Backend API.

## HTTP Status Codes

| Status Code | Meaning | Usage |
|-------------|---------|-------|
| `200` | OK | Successful GET, PUT, DELETE requests |
| `201` | Created | Successful POST requests (resource created) |
| `400` | Bad Request | Validation errors, invalid input |
| `401` | Unauthorized | Missing or invalid authentication |
| `403` | Forbidden | Permission denied, insufficient access |
| `404` | Not Found | Resource not found |
| `409` | Conflict | Duplicate resource, constraint violation |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Server errors, database errors |

## Error Response Format

### Standard Error Response

```json
{
  "success": false,
  "message": "Error message",
  "errors": ["Detailed error 1", "Detailed error 2"]
}
```

### Error with Additional Context

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error (development only)",
  "required": { "resource": "event", "action": "create" }
}
```

## Error Categories

### 400 Bad Request

**Validation Errors:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Email is required",
    "Password must be at least 6 characters long",
    "Event Title must be at least 3 characters long"
  ]
}
```

**Invalid ID Format:**
```json
{
  "success": false,
  "message": "Invalid ID format",
  "error": "Cast to ObjectId failed (development only)"
}
```

**Missing Required Fields:**
```json
{
  "success": false,
  "message": "Email and password are required"
}
```

**Invalid Enum Value:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Organization type must be one of: LGU, NGO, Hospital, RedCross, Non-LGU, Other"
  ]
}
```

**Invalid Date Format:**
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Start Date must be in ISO format"
  ]
}
```

**Invalid Action for State:**
```json
{
  "success": false,
  "message": "Action 'accept' is not valid for request in state 'approved'"
}
```

---

### 401 Unauthorized

**No Token:**
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**Invalid Token:**
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

**Authentication Required:**
```json
{
  "success": false,
  "message": "Authentication required"
}
```

**Invalid Credentials:**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

---

### 403 Forbidden

**Permission Denied:**
```json
{
  "success": false,
  "message": "Permission denied: event.create",
  "required": { "resource": "event", "action": "create" }
}
```

**Permission Denied (Multiple):**
```json
{
  "success": false,
  "message": "Permission denied: requires one of the following permissions",
  "required": [
    { "resource": "request", "action": "approve" },
    { "resource": "request", "action": "reject" }
  ]
}
```

**Page Access Denied:**
```json
{
  "success": false,
  "message": "Access denied: Page '/dashboard' is not accessible",
  "page": "/dashboard"
}
```

**Feature Access Denied:**
```json
{
  "success": false,
  "message": "Feature 'create-event' is not available",
  "feature": "create-event"
}
```

**Staff Type Not Allowed:**
```json
{
  "success": false,
  "message": "Cannot create staff of type 'system-admin'. Allowed types: stakeholder, coordinator"
}
```

**Staff Management Denied:**
```json
{
  "success": false,
  "message": "Permission denied: Cannot create staff for staff type 'coordinator'",
  "action": "create",
  "staffType": "coordinator"
}
```

**CORS Error:**
```json
{
  "success": false,
  "message": "CORS: Origin not allowed",
  "error": "Not allowed by CORS (development only)"
}
```

**Action Permission Denied:**
```json
{
  "success": false,
  "message": "User cannot perform accept on request REQ001"
}
```

---

### 404 Not Found

**User Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**Event Not Found:**
```json
{
  "success": false,
  "message": "Event not found"
}
```

**Request Not Found:**
```json
{
  "success": false,
  "message": "Request not found"
}
```

**Role Not Found:**
```json
{
  "success": false,
  "message": "Role not found"
}
```

**Permission Not Found:**
```json
{
  "success": false,
  "message": "Permission not found"
}
```

**Location Not Found:**
```json
{
  "success": false,
  "message": "Location not found"
}
```

**Blood Bag Not Found:**
```json
{
  "success": false,
  "message": "Blood bag not found"
}
```

**Notification Not Found:**
```json
{
  "success": false,
  "message": "Notification not found"
}
```

**Route Not Found:**
```json
{
  "success": false,
  "message": "Route /api/unknown not found",
  "method": "GET"
}
```

**Primary Location Not Found:**
```json
{
  "success": false,
  "message": "No primary location found"
}
```

**Setting Not Found:**
```json
{
  "success": false,
  "message": "Setting not found"
}
```

---

### 409 Conflict

**Duplicate Email:**
```json
{
  "success": false,
  "message": "email already exists"
}
```

**Duplicate Resource ID:**
```json
{
  "success": false,
  "message": "Event_ID already exists"
}
```

**Duplicate Role Code:**
```json
{
  "success": false,
  "message": "code already exists"
}
```

**Duplicate Permission Code:**
```json
{
  "success": false,
  "message": "Permission with this code already exists"
}
```

---

### 429 Too Many Requests

**Rate Limit Exceeded:**
```json
{
  "success": false,
  "message": "Too many login attempts, please try again later"
}
```

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640000000
```

---

### 500 Internal Server Error

**Generic Server Error:**
```json
{
  "success": false,
  "message": "Internal Server Error",
  "error": "Error stack trace (development only)"
}
```

**Database Error:**
```json
{
  "success": false,
  "message": "Failed to retrieve events",
  "error": "Database connection error (development only)"
}
```

**Service Error:**
```json
{
  "success": false,
  "message": "Failed to create user",
  "error": "Service error details (development only)"
}
```

---

## Error Scenarios by Domain

### Authentication Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Missing email/password | 400 | "Email and password are required" |
| Invalid credentials | 401 | "Invalid email or password" |
| No token provided | 401 | "Unauthorized" |
| Expired token | 401 | "Invalid or expired token" |
| Rate limit exceeded | 429 | "Too many login attempts, please try again later" |

---

### User Management Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Email already exists | 400/409 | "Email already exists" |
| Validation error | 400 | "Validation error" with errors array |
| User not found | 404 | "User not found" |
| Staff type not allowed | 403 | "Cannot create staff of type '{type}'. Allowed types: ..." |
| Permission denied | 403 | "Permission denied: staff.create" |

---

### Event Management Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Validation error | 400 | "Validation error" with errors array |
| Event not found | 404 | "Event not found" |
| Duplicate Event_ID | 409 | "Event_ID already exists" |
| Permission denied | 403 | "Permission denied: event.create" |
| Invalid date range | 400 | "End Date must be after Start Date" |

---

### Request Management Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Coordinator ID required | 400 | "Coordinator ID is required" |
| Invalid action for state | 400 | "Action '{action}' is not valid for request in state '{state}'" |
| Permission denied | 403 | "User cannot perform {action} on request {requestId}" |
| Request not found | 404 | "Request not found" |
| Validation error | 400 | "Validation error" with errors array |

---

### RBAC Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Role not found | 404 | "Role not found" |
| Permission not found | 404 | "Permission not found" |
| Duplicate role code | 409 | "Role with this code already exists" |
| Duplicate permission code | 409 | "Permission with this code already exists" |
| Cannot delete system role | 400 | "System roles cannot be deleted" |
| Validation error | 400 | "Validation error" with errors array |

---

### Location Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Location not found | 404 | "Location not found" |
| Validation error | 400 | "Validation error" with errors array |
| Duplicate location code | 409 | "code already exists" |
| Permission denied | 403 | "Permission denied: location.create" |

---

### Chat Errors

| Scenario | Status | Message |
|----------|--------|---------|
| Cannot send to self | 400 | "Cannot send message to yourself" |
| Recipient not allowed | 403 | "Cannot send message to this recipient" |
| Validation error | 400 | "Validation error" with errors array |
| Message not found | 404 | "Message not found" |

---

## Global Error Handler

The global error handler in `server.js` handles:

### CORS Errors
```json
{
  "success": false,
  "message": "CORS: Origin not allowed",
  "error": "Not allowed by CORS (development only)"
}
```

### Validation Errors (Joi)
```json
{
  "success": false,
  "message": "Validation Error",
  "errors": "Validation error details"
}
```

### Mongoose Cast Errors
```json
{
  "success": false,
  "message": "Invalid ID format",
  "error": "Cast to ObjectId failed (development only)"
}
```

### MongoDB Duplicate Key Errors
```json
{
  "success": false,
  "message": "{field} already exists",
  "error": "E11000 duplicate key error (development only)"
}
```

### Default Errors
```json
{
  "success": false,
  "message": "Error message",
  "error": "Error stack trace (development only)"
}
```

---

## Error Handling Best Practices

### Frontend Error Handling

```javascript
const handleApiError = (error) => {
  if (error.response) {
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        // Validation errors
        if (data.errors) {
          data.errors.forEach(err => showError(err));
        } else {
          showError(data.message);
        }
        break;
        
      case 401:
        // Unauthorized - redirect to login
        localStorage.removeItem('token');
        window.location.href = '/login';
        break;
        
      case 403:
        // Permission denied
        showError(data.message || 'Permission denied');
        break;
        
      case 404:
        // Not found
        showError(data.message || 'Resource not found');
        break;
        
      case 409:
        // Conflict
        showError(data.message || 'Resource already exists');
        break;
        
      case 429:
        // Rate limit
        showError('Too many requests. Please try again later.');
        break;
        
      case 500:
        // Server error
        showError('Server error. Please try again later.');
        break;
        
      default:
        showError('An unexpected error occurred');
    }
  } else {
    showError('Network error. Please check your connection.');
  }
};
```

---

## Related Documentation

- [Backend API Documentation](BACKEND_API_DOCUMENTATION.md) - Main API documentation
- [Authentication API](API_AUTH.md) - Authentication errors
- [Users API](API_USERS.md) - User management errors
- [Events API](API_EVENTS.md) - Event management errors
- [Requests API](API_REQUESTS.md) - Request workflow errors

---

**Last Updated:** 2024
