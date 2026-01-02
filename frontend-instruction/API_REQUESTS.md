# Event & Blood Bag Requests API

## Overview

The Requests API manages event requests and blood bag requests. Event requests use a state machine-based workflow system that supports role-agnostic processing with permission-based authorization. The system supports actions like accept, reject, reschedule, cancel, and confirm.

## Base URL

All request endpoints are under `/api/requests`:

```
POST   /api/requests
GET    /api/requests
GET    /api/requests/:requestId
PUT    /api/requests/:requestId
DELETE /api/requests/:requestId
POST   /api/requests/:requestId/actions
GET    /api/requests/:requestId/actions
POST   /api/requests/blood
GET    /api/requests/blood
```

## Authentication

All endpoints require authentication.

## Authorization

Request management requires specific permissions:

- **Create Request:** `request.create` permission
- **Read Request:** `request.read` permission
- **Update Request:** `request.update` permission
- **Delete Request:** `request.delete` permission
- **Review Request:** `request.review` permission
- **Approve Request:** `request.approve` permission
- **Reject Request:** `request.reject` permission
- **Reschedule Request:** `request.reschedule` permission
- **Cancel Request:** `request.cancel` permission
- **Confirm Request:** `request.confirm` permission
- **Decline Request:** `request.decline` permission

## Request State Machine

The request workflow uses a state machine pattern. See [STATE_MACHINE_README.md](src/services/request_services/STATE_MACHINE_README.md) for complete documentation.

### States

| State | Description |
|-------|-------------|
| `pending-review` | Initial state, awaiting reviewer |
| `review-accepted` | Reviewer has accepted |
| `review-rejected` | Reviewer has rejected |
| `review-rescheduled` | Reviewer has proposed reschedule |
| `awaiting-confirmation` | Waiting for requester confirmation |
| `approved` | Request approved, event published |
| `rejected` | Request finally rejected |
| `cancelled` | Request cancelled |
| `closed` | Request closed (deleted) |

### State Transitions

```
pending-review
  ├─ accept → review-accepted
  ├─ reject → review-rejected
  └─ reschedule → review-rescheduled

review-accepted
  └─ confirm → approved

review-rejected
  └─ confirm → rejected

review-rescheduled
  ├─ accept → review-accepted
  ├─ reject → review-rejected
  ├─ confirm → approved (requester confirms)
  └─ reschedule → review-rescheduled (loop)

approved
  ├─ reschedule → review-rescheduled
  └─ cancel → cancelled
```

## Endpoints

### 1. Create Event Request

Create a new event request (goes through approval workflow).

**Endpoint:** `POST /api/requests`

**Access:** Private (requires `request.create` permission)

**Request Body:**
```json
{
  "Request_ID": "REQ001",
  "Event_ID": "EVT001",
  "Event_Title": "Community Blood Drive",
  "Location": "City Hall",
  "Start_Date": "2024-02-15T09:00:00.000Z",
  "End_Date": "2024-02-15T17:00:00.000Z",
  "Category": "BloodDrive",
  "Email": "coordinator@example.com",
  "Phone_Number": "+1234567890",
  "Event_Description": "Community blood drive event",
  "categoryData": {
    "Target_Donation": 100,
    "VenueType": "Indoor"
  },
  "location": {
    "province": "601abc1234567890abcdef",
    "district": "601def1234567890abcdef",
    "municipality": "601ghi1234567890abcdef"
  }
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Request_ID | string | Yes | Unique request identifier |
| Event_ID | string | Yes | Event ID |
| Event_Title | string | Yes | Event title |
| Location | string | Yes | Event location |
| Start_Date | date | Yes | Event start date (ISO format) |
| End_Date | date | No | Event end date |
| Category | string | No | Event category (`BloodDrive`, `Advocacy`, `Training`) |
| Email | string | Yes | Contact email |
| Phone_Number | string | Yes | Contact phone |
| Event_Description | string | No | Event description |
| categoryData | object | No | Category-specific data |
| location | object | No | Location references |
| coordinatorId | string | No | Coordinator ID (auto-detected from auth if missing) |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Event request created successfully",
  "data": {
    "request": {/* request object */},
    "event": {/* event object */},
    "category": {/* category data */}
  },
  "warnings": []
}
```

**Error Responses:**

**400 Bad Request** - Validation error or missing coordinator
```json
{
  "success": false,
  "message": "Coordinator ID is required"
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:3000/api/requests" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "Request_ID": "REQ001",
    "Event_ID": "EVT001",
    "Event_Title": "Community Blood Drive",
    "Location": "City Hall",
    "Start_Date": "2024-02-15T09:00:00.000Z",
    "Email": "coordinator@example.com",
    "Phone_Number": "+1234567890"
  }'
```

---

### 2. Get All Requests

Get all requests with filtering and pagination.

**Endpoint:** `GET /api/requests/all`

**Access:** Private (requires `request.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status |
| coordinator_id | string | No | Filter by coordinator |
| stakeholder_id | string | No | Filter by stakeholder |
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* array of requests */],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

---

### 3. Get Pending Requests

Get all pending requests.

**Endpoint:** `GET /api/requests/pending`

**Access:** Private (requires `request.read` permission)

**Query Parameters:** Same as Get All Requests

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* array of pending requests */]
}
```

---

### 4. Get My Requests

Get requests for the authenticated user (role-aware).

**Endpoint:** `GET /api/requests/me`

**Access:** Private (requires `request.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status |
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* user's requests */]
}
```

---

### 5. Get Request by ID

Get detailed information about a specific request.

**Endpoint:** `GET /api/requests/:requestId`

**Access:** Private (requires `request.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "Request_ID": "REQ001",
    "Event_ID": "EVT001",
    "Status": "pending-review",
    "requester": {
      "userId": "601abc1234567890abcdef",
      "roleSnapshot": "coordinator",
      "name": "John Doe"
    },
    "reviewer": {
      "userId": "601def1234567890abcdef",
      "roleSnapshot": "system-admin",
      "name": "Jane Smith",
      "assignedAt": "2024-01-20T10:00:00.000Z"
    },
    "event": {/* event object */},
    "category": {/* category data */}
  }
}
```

---

### 6. Update Request

Update a pending event request.

**Endpoint:** `PUT /api/requests/:requestId`

**Access:** Private (requires `request.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Request Body:**
```json
{
  "Event_Title": "Updated Event Title",
  "Location": "New Location",
  "Start_Date": "2024-02-20T09:00:00.000Z",
  "Event_Description": "Updated description"
}
```

**Request Fields:** (All optional, at least one required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Event_Title | string | No | Event title |
| Location | string | No | Event location |
| Start_Date | date | No | Event start date |
| End_Date | date | No | Event end date |
| Event_Description | string | No | Event description |
| categoryData | object | No | Category-specific data |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Request updated successfully",
  "data": {
    "request": {/* updated request */},
    "event": {/* updated event */},
    "category": {/* category data */}
  },
  "updatedFields": ["Event_Title", "Location"]
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": ["Event Title must be at least 3 characters long"]
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Request not found"
}
```

---

### 7. Execute Request Action

Execute a unified action on a request (accept, reject, reschedule, cancel, delete, confirm, decline).

**Endpoint:** `POST /api/requests/:requestId/actions`

**Access:** Private (permission-based, see action permissions below)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Request Body:**
```json
{
  "action": "accept",
  "data": {
    "notes": "Approved for scheduling"
  }
}
```

**For Reschedule Action:**
```json
{
  "action": "reschedule",
  "data": {
    "proposedDate": "2024-02-20T00:00:00.000Z",
    "proposedStartTime": "10:00",
    "proposedEndTime": "18:00",
    "notes": "Please reschedule to accommodate venue availability"
  }
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | Action: `accept`, `reject`, `reschedule`, `cancel`, `delete`, `confirm`, `decline`, `edit`, `view` |
| data | object | No | Action-specific data (see below) |

**Action Data Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| notes | string | No | Notes for the action (max 1000 characters) |
| proposedDate | date | Yes (for reschedule) | Proposed new date (ISO format) |
| proposedStartTime | string | No | Proposed start time (HH:MM format) |
| proposedEndTime | string | No | Proposed end time (HH:MM format) |
| reason | string | No | Reason for action (max 500 characters) |

**Action Permissions:**

| Action | Required Permission | Notes |
|--------|---------------------|-------|
| `accept` | `request.approve` | Reviewer can accept |
| `reject` | `request.reject` | Reviewer can reject |
| `reschedule` | `request.reschedule` | Reviewer can reschedule |
| `cancel` | `request.cancel` | Requester can cancel their own requests |
| `delete` | `request.delete` | Admin can delete |
| `confirm` | `request.confirm` | Requester can confirm reviewer decisions |
| `decline` | `request.decline` | Requester can decline reviewer decisions |
| `edit` | `request.update` | Can edit pending requests |
| `view` | `request.read` | Can view request |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Action executed successfully",
  "data": {
    "request": {/* updated request object */},
    "newStatus": "review-accepted",
    "action": "accept"
  }
}
```

**Error Responses:**

**400 Bad Request** - Invalid action or state
```json
{
  "success": false,
  "message": "Action 'accept' is not valid for request in state 'approved'"
}
```

**403 Forbidden** - Insufficient permissions
```json
{
  "success": false,
  "message": "User cannot perform accept on request REQ001"
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:3000/api/requests/REQ001/actions" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "data": {
      "notes": "Approved for scheduling"
    }
  }'
```

---

### 8. Get Available Actions

Get all actions available to the current user for a request.

**Endpoint:** `GET /api/requests/:requestId/actions`

**Access:** Private (requires `request.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": ["view", "accept", "reject", "reschedule"]
}
```

**Response Fields:**
| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Always `true` on success |
| data | array | Array of available action names |

---

### 9. Cancel Request

Cancel a pending or approved request.

**Endpoint:** `DELETE /api/requests/:requestId`

**Access:** Private (requires `request.cancel` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Request cancelled successfully"
}
```

**Note:** This is a soft cancel. The request status changes to `cancelled`.

---

### 10. Delete Request

Permanently delete a cancelled or rejected request.

**Endpoint:** `DELETE /api/requests/:requestId/delete`

**Access:** Private (requires `request.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Request deleted successfully"
}
```

---

### 11. Assign Staff to Event

Assign staff members to an event (after approval).

**Endpoint:** `POST /api/requests/:requestId/staff`

**Access:** Private (requires `event.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Request Body:**
```json
{
  "eventId": "EVT001",
  "staffMembers": [
    {
      "userId": "601abc1234567890abcdef",
      "role": "nurse",
      "assignedAt": "2024-02-15T09:00:00.000Z"
    }
  ]
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| eventId | string | Yes | Event ID |
| staffMembers | array | Yes | Array of staff assignment objects |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Staff assigned successfully",
  "data": {
    "event": {/* event object */},
    "staff": [/* staff assignments */]
  }
}
```

---

### 12. Check Coordinator Overlap

Check if coordinator has overlapping requests.

**Endpoint:** `GET /api/requests/check-overlap`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| coordinatorId | string | Yes | Coordinator ID |
| startDate | string | Yes | Start date (ISO format) |
| endDate | string | Yes | End date (ISO format) |

**Success Response (200):**
```json
{
  "success": true,
  "hasOverlap": false,
  "overlappingRequests": []
}
```

---

### 13. Check Double Booking

Check if date/location has double booking.

**Endpoint:** `GET /api/requests/check-double-booking`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| date | string | Yes | Date to check (ISO format) |
| location | string | No | Location to check |

**Success Response (200):**
```json
{
  "success": true,
  "hasDoubleBooking": false,
  "conflictingEvents": []
}
```

---

### 14. Validate Scheduling Rules

Validate all scheduling rules for an event request.

**Endpoint:** `POST /api/requests/validate`

**Access:** Private

**Request Body:**
```json
{
  "eventDate": "2024-02-15T09:00:00.000Z",
  "coordinatorId": "COORD001",
  "location": "City Hall"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "valid": true,
  "violations": []
}
```

---

### 15. Get Total Blood Bags for Date

Get total blood bags requested for a specific date.

**Endpoint:** `GET /api/requests/blood-bags/:date`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| date | string | Yes | Date (ISO format: YYYY-MM-DD) |

**Success Response (200):**
```json
{
  "success": true,
  "date": "2024-02-15",
  "totalBloodBags": 150
}
```

---

## Blood Bag Requests

### 16. Create Blood Bag Request

Create a blood bag request.

**Endpoint:** `POST /api/requests/blood`

**Access:** Private (requires `request.create` permission)

**Request Body:**
```json
{
  "Request_ID": "BBR001",
  "Requester_ID": "601abc1234567890abcdef",
  "Requestee_ID": "601def1234567890abcdef",
  "RequestedItems": [
    {
      "BloodType": "O+",
      "Amount": 5
    },
    {
      "BloodType": "A+",
      "Amount": 3
    }
  ],
  "RequestedForAt": "2024-02-15T00:00:00.000Z",
  "Urgency": "high",
  "Notes": "Urgent request for emergency surgery"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Request_ID | string | Yes | Unique request identifier |
| Requester_ID | string | Yes | Requester user ID |
| Requestee_ID | string | Yes | Requestee user ID |
| RequestedItems | array | Yes | Array of blood bag items (see below) |
| RequestedForAt | date | No | Date when blood bags are needed |
| Urgency | string | No | `low`, `medium`, `high` (default: `medium`) |
| Notes | string | No | Additional notes |

**RequestedItem Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| BloodType | string | Yes | Blood type: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` |
| Amount | number | Yes | Number of bags (min: 1) |

**Success Response (201):**
```json
{
  "success": true,
  "message": "Blood bag request created successfully",
  "data": {/* request object */}
}
```

---

### 17. List Blood Bag Requests

Get all blood bag requests with filtering and pagination.

**Endpoint:** `GET /api/requests/blood`

**Access:** Private (requires `request.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requesterId | string | No | Filter by requester ID |
| requesteeId | string | No | Filter by requestee ID |
| urgency | string | No | Filter by urgency (`low`, `medium`, `high`) |
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page |
| sortBy | string | No | `createdAt` | Sort field |
| sortOrder | string | No | `desc` | Sort order |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* array of blood bag requests */],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

---

### 18. Get Blood Bag Request by ID

Get detailed information about a blood bag request.

**Endpoint:** `GET /api/requests/blood/:requestId`

**Access:** Private (requires `request.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "Request_ID": "BBR001",
    "Requester_ID": "601abc1234567890abcdef",
    "Requestee_ID": "601def1234567890abcdef",
    "RequestedItems": [
      {
        "BloodType": "O+",
        "Amount": 5
      }
    ],
    "RequestedForAt": "2024-02-15T00:00:00.000Z",
    "Urgency": "high",
    "Notes": "Urgent request",
    "createdAt": "2024-01-20T10:00:00.000Z"
  }
}
```

---

### 19. Update Blood Bag Request

Update a blood bag request.

**Endpoint:** `PUT /api/requests/blood/:requestId`

**Access:** Private (requires `request.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Request Body:**
```json
{
  "RequestedItems": [
    {
      "BloodType": "O+",
      "Amount": 10
    }
  ],
  "Urgency": "medium",
  "Notes": "Updated request"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Blood bag request updated successfully",
  "data": {/* updated request */}
}
```

---

### 20. Delete Blood Bag Request

Delete a blood bag request.

**Endpoint:** `DELETE /api/requests/blood/:requestId`

**Access:** Private (requires `request.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| requestId | string | Yes | Request ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Blood bag request deleted successfully"
}
```

---

## System Settings

### 21. Get System Settings

Get all system settings.

**Endpoint:** `GET /api/settings`

**Access:** Private

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "notificationsEnabled": true,
    "maxBloodBagsPerDay": 200,
    "maxEventsPerDay": 3,
    "allowWeekendEvents": false,
    "advanceBookingDays": 30,
    "maxPendingRequests": 1,
    "preventOverlappingRequests": true,
    "preventDoubleBooking": false,
    "allowCoordinatorStaffAssignment": false,
    "requireStaffAssignment": false,
    "blockedWeekdays": [0, 6],
    "blockedDates": [],
    "reviewAutoExpireHours": 72,
    "reviewConfirmationWindowHours": 48
  }
}
```

---

### 22. Update System Settings

Update system settings.

**Endpoint:** `POST /api/settings`

**Access:** Private (requires `system.settings` permission)

**Request Body:**
```json
{
  "maxBloodBagsPerDay": 250,
  "allowWeekendEvents": true,
  "advanceBookingDays": 45
}
```

**Request Fields:** (All optional)

| Field | Type | Description |
|-------|------|-------------|
| notificationsEnabled | boolean | Enable/disable notifications |
| maxBloodBagsPerDay | number | Maximum blood bags per day |
| maxEventsPerDay | number | Maximum events per day |
| allowWeekendEvents | boolean | Allow weekend events |
| advanceBookingDays | number | Days in advance for booking |
| maxPendingRequests | number | Maximum pending requests per user |
| preventOverlappingRequests | boolean | Prevent overlapping requests |
| preventDoubleBooking | boolean | Prevent double booking |
| allowCoordinatorStaffAssignment | boolean | Allow coordinators to assign staff |
| requireStaffAssignment | boolean | Require staff assignment |
| blockedWeekdays | array | Blocked weekdays (0-6, Sun-Sat) |
| blockedDates | array | Blocked dates (ISO format) |
| reviewAutoExpireHours | number | Hours before review expires |
| reviewConfirmationWindowHours | number | Hours for confirmation window |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Settings updated successfully",
  "data": {/* updated settings */}
}
```

---

### 23. Get Specific Setting

Get a specific setting value.

**Endpoint:** `GET /api/settings/:settingKey`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| settingKey | string | Yes | Setting key (e.g., `maxBloodBagsPerDay`) |

**Success Response (200):**
```json
{
  "success": true,
  "settingKey": "maxBloodBagsPerDay",
  "value": 200
}
```

---

### 24. Validate Advance Booking

Validate advance booking rules for a date.

**Endpoint:** `POST /api/settings/validate-advance-booking`

**Access:** Private

**Request Body:**
```json
{
  "eventDate": "2024-02-15T00:00:00.000Z"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "validation": {
    "valid": true,
    "minDate": "2024-01-16T00:00:00.000Z",
    "maxDate": "2024-03-16T00:00:00.000Z",
    "message": "Date is within advance booking window"
  }
}
```

---

### 25. Validate Weekend Restriction

Validate weekend restriction for a date.

**Endpoint:** `POST /api/settings/validate-weekend`

**Access:** Private

**Request Body:**
```json
{
  "eventDate": "2024-02-17T00:00:00.000Z"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "validation": {
    "valid": false,
    "isWeekend": true,
    "message": "Weekend events are not allowed"
  }
}
```

---

### 26. Validate Pending Requests Limit

Validate pending requests limit.

**Endpoint:** `POST /api/settings/validate-pending-requests`

**Access:** Private

**Request Body:**
```json
{
  "pendingCount": 2
}
```

**Success Response (200):**
```json
{
  "success": true,
  "validation": {
    "valid": false,
    "currentCount": 2,
    "maxAllowed": 1,
    "message": "Maximum pending requests limit exceeded"
  }
}
```

---

### 27. Get Minimum Booking Date

Get the minimum allowed booking date.

**Endpoint:** `GET /api/settings/min-booking-date`

**Access:** Private

**Success Response (200):**
```json
{
  "success": true,
  "minDate": "2024-01-16T00:00:00.000Z"
}
```

---

### 28. Get Maximum Booking Date

Get the maximum allowed booking date.

**Endpoint:** `GET /api/settings/max-booking-date`

**Access:** Private

**Success Response (200):**
```json
{
  "success": true,
  "maxDate": "2024-03-16T00:00:00.000Z"
}
```

---

### 29. Check Staff Assignment Required

Check if staff assignment is required.

**Endpoint:** `GET /api/settings/staff-assignment-required`

**Access:** Private

**Success Response (200):**
```json
{
  "success": true,
  "required": true
}
```

---

### 30. Check Coordinator Can Assign Staff

Check if coordinators can assign staff.

**Endpoint:** `GET /api/settings/coordinator-can-assign-staff`

**Access:** Private

**Success Response (200):**
```json
{
  "success": true,
  "allowed": false
}
```

---

### 31. Validate All Rules

Validate all scheduling rules for an event request.

**Endpoint:** `POST /api/settings/validate-all-rules`

**Access:** Private

**Request Body:**
```json
{
  "eventDate": "2024-02-15T09:00:00.000Z",
  "coordinatorId": "COORD001",
  "location": "City Hall"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "valid": true,
  "violations": [],
  "warnings": []
}
```

---

## Request Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete EventRequest model schema.

### Key Fields

- **Request_ID** (required, unique) - Unique request identifier
- **Event_ID** (required) - Associated event ID
- **Status** (required) - Request status (state machine state)
- **requester** (object) - Requester information with role snapshot
- **reviewer** (object) - Reviewer information with role snapshot
- **location** (object) - Location references
- **auditTrail** (array) - Action history

---

## Business Logic

### Request Creation Flow

1. Validate input data (Joi validation)
2. Create event record
3. Create category-specific record (if Category provided)
4. Create request record with `pending-review` status
5. Assign reviewer based on requester role (via `reviewerAssignment.service`)
6. Set requester and reviewer objects with role snapshots
7. Return request data

### Reviewer Assignment

Reviewers are assigned automatically based on requester role:

- **System Admin creates request** → Coordinator becomes reviewer
- **Coordinator creates request** → System Admin becomes reviewer
- **Stakeholder creates request** → Coordinator becomes reviewer (Admin can override)

### Action Execution Flow

1. Verify user has permission for the action
2. Validate action is allowed in current state (state machine)
3. Execute state transition
4. Update request status
5. Add audit trail entry
6. Send notifications (if applicable)
7. Return updated request

---

## Related Documentation

- [Events API](API_EVENTS.md) - Event management
- [State Machine README](src/services/request_services/STATE_MACHINE_README.md) - Complete state machine documentation
- [Models Reference](MODELS_REFERENCE.md) - EventRequest, BloodBagRequest models
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
