# Utility Services API

## Overview

The Utility API provides endpoints for notifications, file uploads, system settings, and other utility services.

## Base URL

Utility endpoints are under various paths:

```
GET    /api/notifications
POST   /api/notifications
PUT    /api/notifications/:notificationId/read
GET    /api/files/presign
POST   /api/signup-requests
```

## Authentication

Most endpoints require authentication. Some notification endpoints may be public.

## Authorization

Utility services require specific permissions:

- **Notifications:** Varies by endpoint
- **File Upload:** Authentication required
- **System Settings:** `system.settings` permission
- **Signup Requests:** `user.create` permission for approval

## Endpoints

### Notifications

### 1. Create Notification

Create a new notification.

**Endpoint:** `POST /api/notifications`

**Access:** Private

**Request Body:**
```json
{
  "Recipient_ID": "601abc1234567890abcdef",
  "RecipientType": "Coordinator",
  "Request_ID": "REQ001",
  "Event_ID": "EVT001",
  "Title": "New Request",
  "Message": "You have a new event request",
  "NotificationType": "NewRequest"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Recipient_ID | string | Yes | Recipient user ID |
| RecipientType | string | Yes | Enum: `Admin`, `Coordinator`, `Stakeholder` |
| Request_ID | string | Yes | Associated request ID |
| Event_ID | string | No | Associated event ID |
| Title | string | Yes | Notification title |
| Message | string | Yes | Notification message |
| NotificationType | string | Yes | Notification type enum (see below) |

**Notification Types:**
- `NewRequest` - New request created
- `AdminAccepted` - Admin accepted request
- `AdminRescheduled` - Admin rescheduled request
- `AdminRejected` - Admin rejected request
- `AdminCancelled` - Admin cancelled request
- `CoordinatorApproved` - Coordinator approved
- `RequestCompleted` - Request completed
- `RequestRejected` - Request rejected
- `RequestCancelled` - Request cancelled
- `RequestDeleted` - Request deleted
- `NewSignupRequest` - New signup request
- `SignupRequestApproved` - Signup approved
- `SignupRequestRejected` - Signup rejected
- `NewMessage` - New chat message
- `MessageRead` - Message read

**Success Response (201):**
```json
{
  "success": true,
  "message": "Notification created successfully",
  "data": {/* notification object */}
}
```

---

### 2. Get Notifications

Get notifications for a user.

**Endpoint:** `GET /api/notifications`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| recipientId | string | Yes | Recipient user ID |
| recipientType | string | Yes | Recipient type: `Admin`, `Coordinator`, `Stakeholder` |
| isRead | boolean | No | Filter by read status |
| type | string | No | Filter by notification type |
| date_from | string | No | Filter from date |
| date_to | string | No | Filter to date |
| request_id | string | No | Filter by request ID |
| event_id | string | No | Filter by event ID |
| page | number | No | 1 | Page number |
| limit | number | No | 20 | Items per page |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* array of notifications */],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "pages": 3
  }
}
```

---

### 3. Get Unread Count

Get unread notifications count for a user.

**Endpoint:** `GET /api/notifications/unread-count`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| recipientId | string | Yes | Recipient user ID |
| recipientType | string | Yes | Recipient type |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

---

### 4. Mark Notification as Read

Mark a notification as read.

**Endpoint:** `PUT /api/notifications/:notificationId/read`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| notificationId | string | Yes | Notification ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {/* notification object */}
}
```

---

### 5. Mark Multiple as Read

Mark multiple notifications as read.

**Endpoint:** `PUT /api/notifications/mark-multiple-read`

**Access:** Private

**Request Body:**
```json
{
  "notificationIds": ["NOTIF001", "NOTIF002", "NOTIF003"]
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Notifications marked as read",
  "count": 3
}
```

---

### 6. Mark All as Read

Mark all notifications as read for a user.

**Endpoint:** `PUT /api/notifications/mark-all-read`

**Access:** Private

**Success Response (200):**
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

### 7. Get Notification by ID

Get detailed information about a notification.

**Endpoint:** `GET /api/notifications/:notificationId`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| notificationId | string | Yes | Notification ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "Notification_ID": "NOTIF001",
    "Recipient_ID": "601abc1234567890abcdef",
    "RecipientType": "Coordinator",
    "Title": "New Request",
    "Message": "You have a new event request",
    "NotificationType": "NewRequest",
    "IsRead": false,
    "createdAt": "2024-01-20T15:00:00.000Z"
  }
}
```

---

### 8. Delete Notification

Delete a notification.

**Endpoint:** `DELETE /api/notifications/:notificationId`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| notificationId | string | Yes | Notification ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

---

### 9. Get Notification Statistics

Get notification statistics for a user.

**Endpoint:** `GET /api/notifications/statistics`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| recipientId | string | Yes | Recipient user ID |
| recipientType | string | Yes | Recipient type |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 50,
    "unread": 5,
    "byType": {
      "NewRequest": 20,
      "RequestCompleted": 15
    }
  }
}
```

---

### 10. Get Latest Notifications

Get latest notifications (for dashboard/inbox preview).

**Endpoint:** `GET /api/notifications/latest`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| recipientId | string | Yes | - | Recipient user ID |
| recipientType | string | Yes | - | Recipient type |
| limit | number | No | 10 | Number of notifications |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* latest notifications */]
}
```

---

## File Upload

### 11. Get Presigned URL

Get a presigned URL for uploading files to S3.

**Endpoint:** `POST /api/files/presign`

**Access:** Private

**Request Body:**
```json
{
  "filename": "document.pdf",
  "contentType": "application/pdf",
  "key": "uploads/document.pdf",
  "expires": 300
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| filename | string | Yes | File name |
| contentType | string | Yes | MIME type (e.g., `image/jpeg`, `application/pdf`) |
| key | string | No | S3 object key (auto-generated if not provided) |
| expires | number | No | URL expiration in seconds (default: 300) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/bucket/uploads/document.pdf?X-Amz-Algorithm=...",
    "key": "uploads/document.pdf",
    "publicUrl": "https://bucket.s3.amazonaws.com/uploads/document.pdf"
  }
}
```

**Usage Flow:**
1. Request presigned URL from this endpoint
2. Upload file directly to S3 using the `uploadUrl`
3. Use the `key` or `publicUrl` in your application

**cURL Example:**
```bash
# 1. Get presigned URL
curl -X POST "http://localhost:3000/api/files/presign" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "image.jpg",
    "contentType": "image/jpeg"
  }'

# 2. Upload file using presigned URL
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@image.jpg"
```

---

### 12. Get Signed URL

Get a signed URL for downloading a file from S3.

**Endpoint:** `GET /api/files/signed-url`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | Yes | S3 object key |
| expires | number | No | URL expiration in seconds (default: 60) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "url": "https://s3.amazonaws.com/bucket/uploads/document.pdf?X-Amz-Algorithm=..."
  }
}
```

---

## Signup Requests

### 13. Submit Signup Request

Submit a public signup request.

**Endpoint:** `POST /api/signup-requests`

**Access:** Public

**Request Body:**
```json
{
  "firstName": "John",
  "middleName": "Michael",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "+1234567890",
  "password": "password123",
  "organization": "Health NGO",
  "province": "601abc1234567890abcdef",
  "district": "601def1234567890abcdef",
  "municipality": "601ghi1234567890abcdef"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| firstName | string | Yes | First name |
| middleName | string | No | Middle name |
| lastName | string | Yes | Last name |
| email | string | Yes | Email address |
| phoneNumber | string | No | Phone number |
| password | string | Yes | Password (min 6 characters) |
| organization | string | No | Organization name |
| province | string | Yes | Province location ID |
| district | string | Yes | District location ID |
| municipality | string | Yes | Municipality location ID |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Signup request submitted successfully",
  "data": {/* signup request object */}
}
```

---

### 14. Get Signup Requests

Get all signup requests.

**Endpoint:** `GET /api/signup-requests`

**Access:** Private (requires `user.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status (`pending`, `approved`, `rejected`) |
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* array of signup requests */]
}
```

---

### 15. Approve Signup Request

Approve a signup request (creates user account).

**Endpoint:** `PUT /api/signup-requests/:id/approve`

**Access:** Private (requires `user.create` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Signup request ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Signup request approved and user created",
  "data": {/* created user object */}
}
```

---

### 16. Reject Signup Request

Reject a signup request.

**Endpoint:** `PUT /api/signup-requests/:id/reject`

**Access:** Private (requires `user.create` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Signup request ID |

**Request Body:**
```json
{
  "reason": "Incomplete information"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Signup request rejected"
}
```

---

### 17. Verify Email

Verify email via token (for signup requests).

**Endpoint:** `GET /api/signup-requests/verify-email`

**Access:** Public

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Email verification token |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

---

## Related Documentation

- [Requests API](API_REQUESTS.md) - System settings endpoints
- [Users API](API_USERS.md) - Registration code validation
- [Chat API](API_CHAT.md) - File attachments in messages
- [Models Reference](MODELS_REFERENCE.md) - Notification, SystemSettings, RegistrationCode, SignUpRequest models
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
