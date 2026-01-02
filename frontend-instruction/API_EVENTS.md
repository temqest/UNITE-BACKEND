# Events Management API

## Overview

The Events Management API provides endpoints for creating, reading, updating, and managing events. Events can be of different types: Blood Drives, Advocacy Events, and Training Events. The system supports calendar views, event statistics, and detailed event information.

## Base URL

All event endpoints are under `/api/events` and `/api/calendar`:

```
GET  /api/public/events
GET  /api/calendar/month
GET  /api/calendar/week
GET  /api/calendar/day
GET  /api/events
GET  /api/events/:eventId
POST /api/events/direct
GET  /api/events/statistics
```

## Authentication

Most endpoints require authentication except:
- `GET /api/public/events` - Public (for public calendar display)

## Authorization

Event management requires specific permissions:

- **Read Events:** `event.read` permission
- **Create Events:** `event.create` permission
- **Update Events:** `event.update` permission
- **Delete Events:** `event.delete` permission
- **Approve Events:** `event.approve` permission (for direct creation)

## Endpoints

### 1. Get Public Events

Get all approved events for public display (e.g., public calendar).

**Endpoint:** `GET /api/public/events`

**Access:** Public

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter by status (default: `Approved`) |
| date_from | string | No | Filter events from date (ISO format) |
| date_to | string | No | Filter events to date (ISO format) |
| category | string | No | Filter by category (`BloodDrive`, `Advocacy`, `Training`) |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "Event_ID": "EVT001",
      "Event_Title": "Community Blood Drive",
      "Location": "City Hall",
      "Start_Date": "2024-02-15T09:00:00.000Z",
      "End_Date": "2024-02-15T17:00:00.000Z",
      "Category": "BloodDrive",
      "Status": "Approved"
    }
  ]
}
```

---

### 2. Get Month View

Get all events in a specific month organized by day.

**Endpoint:** `GET /api/calendar/month`

**Access:** Private (requires `event.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| year | number | No | Current year | Year (e.g., 2024) |
| month | number | No | Current month | Month (1-12) |
| status | string | No | - | Filter by status |
| coordinator_id | string | No | - | Filter by coordinator |
| category | string | No | - | Filter by category |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "year": 2024,
    "month": 2,
    "days": {
      "1": [/* events on day 1 */],
      "15": [/* events on day 15 */]
    }
  }
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/calendar/month?year=2024&month=2" \
  -H "Authorization: Bearer <token>"
```

---

### 3. Get Week View

Get all events in a specific week.

**Endpoint:** `GET /api/calendar/week`

**Access:** Private (requires `event.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| date | string | No | Today | Week start date (ISO format) |
| status | string | No | - | Filter by status |
| coordinator_id | string | No | - | Filter by coordinator |
| category | string | No | - | Filter by category |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "weekStart": "2024-02-12T00:00:00.000Z",
    "events": [
      {
        "Event_ID": "EVT001",
        "Event_Title": "Community Blood Drive",
        "Start_Date": "2024-02-15T09:00:00.000Z",
        "End_Date": "2024-02-15T17:00:00.000Z"
      }
    ]
  }
}
```

---

### 4. Get Day View

Get all events on a specific day.

**Endpoint:** `GET /api/calendar/day`

**Access:** Private (requires `event.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| date | string | No | Today | Date (ISO format) |
| status | string | No | - | Filter by status |
| coordinator_id | string | No | - | Filter by coordinator |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "date": "2024-02-15T00:00:00.000Z",
    "events": [/* events for this day */]
  }
}
```

---

### 5. List All Events

Get all events with filtering, sorting, and pagination.

**Endpoint:** `GET /api/events`

**Access:** Private (requires `event.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| status | string | No | - | Filter by status (`Pending`, `Approved`, `Rescheduled`, `Rejected`, `Completed`, `Cancelled`) |
| coordinator_id | string | No | - | Filter by coordinator ID |
| location | string | No | - | Filter by location |
| search | string | No | - | Search in title, description |
| date_from | string | No | - | Filter events from date |
| date_to | string | No | - | Filter events to date |
| page | number | No | 1 | Page number |
| limit | number | No | 20 | Items per page |
| sortBy | string | No | `Start_Date` | Sort field |
| sortOrder | string | No | `desc` | Sort order (`asc` or `desc`) |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* array of events */],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  },
  "filters": {
    "status": "Approved",
    "date_from": "2024-01-01"
  }
}
```

---

### 6. Get Event Details

Get complete event details including category-specific data.

**Endpoint:** `GET /api/events/:eventId`

**Access:** Private (requires `event.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| eventId | string | Yes | Event ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "Event_ID": "EVT001",
    "Event_Title": "Community Blood Drive",
    "Location": "City Hall",
    "Start_Date": "2024-02-15T09:00:00.000Z",
    "End_Date": "2024-02-15T17:00:00.000Z",
    "Category": "BloodDrive",
    "Status": "Approved",
    "coordinator_id": "COORD001",
    "Email": "coordinator@example.com",
    "Phone_Number": "+1234567890",
    "Event_Description": "Community blood drive event",
    "categoryData": {
      "BloodDrive_ID": "BD001",
      "Target_Donation": 100,
      "VenueType": "Indoor"
    }
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "message": "Event not found"
}
```

---

### 7. Get Events Batch

Get multiple events by IDs in a single request.

**Endpoint:** `POST /api/events/batch`

**Access:** Private/Public (depends on authentication)

**Request Body:**
```json
{
  "ids": ["EVT001", "EVT002", "EVT003"]
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| ids | array | Yes | Array of event IDs |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* array of event objects */]
}
```

---

### 8. Get Event Category

Get event category type and category-specific data.

**Endpoint:** `GET /api/events/:eventId/category`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| eventId | string | Yes | Event ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "type": "BloodDrive",
    "data": {
      "BloodDrive_ID": "BD001",
      "Target_Donation": 100,
      "VenueType": "Indoor"
    }
  }
}
```

---

### 9. Get Event Statistics

Get comprehensive event statistics.

**Endpoint:** `GET /api/events/statistics`

**Access:** Private (requires `event.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| date_from | string | No | Filter from date |
| date_to | string | No | Filter to date |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "total_events": 150,
    "by_status": {
      "Approved": 120,
      "Pending": 20,
      "Rejected": 10
    },
    "by_category": {
      "BloodDrive": 80,
      "Advocacy": 40,
      "Training": 30
    }
  }
}
```

---

### 10. Get Events by Status

Get events grouped by status.

**Endpoint:** `GET /api/events/by-status`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| coordinator_id | string | No | Filter by coordinator |
| date_from | string | No | Filter from date |
| date_to | string | No | Filter to date |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "Approved": [/* approved events */],
    "Pending": [/* pending events */],
    "Rejected": [/* rejected events */]
  },
  "counts": {
    "Approved": 120,
    "Pending": 20,
    "Rejected": 10
  }
}
```

---

### 11. Get Upcoming Events

Get upcoming events.

**Endpoint:** `GET /api/events/upcoming`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| limit | number | No | 10 | Number of events to return |
| coordinator_id | string | No | - | Filter by coordinator |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* upcoming events */],
  "total": 25
}
```

---

### 12. Get Recent Events

Get recently completed events.

**Endpoint:** `GET /api/events/recent`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| limit | number | No | 10 | Number of events to return |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* recent events */]
}
```

---

### 13. Search Events

Search events by various criteria.

**Endpoint:** `GET /api/events/search`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| q | string | No | Search query |
| status | string | No | Filter by status |
| category | string | No | Filter by category |
| date_from | string | No | Filter from date |
| date_to | string | No | Filter to date |

**Success Response (200):**
```json
{
  "success": true,
  "data": [/* matching events */]
}
```

---

### 14. Get Event Statistics by Category

Get events grouped by category.

**Endpoint:** `GET /api/events/statistics/by-category`

**Access:** Private

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| date_from | string | No | Filter from date |
| date_to | string | No | Filter to date |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "BloodDrive": 80,
    "Advocacy": 40,
    "Training": 30
  }
}
```

---

### 15. Get Coordinator Information

Get coordinator information for an event.

**Endpoint:** `GET /api/events/coordinators/:coordinatorId`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| coordinatorId | string | Yes | Coordinator ID (ObjectId or legacy ID) |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "601abc1234567890abcdef",
    "firstName": "John",
    "lastName": "Doe",
    "email": "coordinator@example.com",
    "phoneNumber": "+1234567890"
  }
}
```

---

### 16. Get Event Statistics (Specific Event)

Get statistics for a specific event.

**Endpoint:** `GET /api/events/:eventId/statistics`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| eventId | string | Yes | Event ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "eventId": "EVT001",
    "totalParticipants": 50,
    "totalDonations": 45,
    "attendanceRate": 0.9
  }
}
```

---

### 17. Check Event Completeness

Check if event has all required data.

**Endpoint:** `GET /api/events/:eventId/completeness`

**Access:** Private

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| eventId | string | Yes | Event ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "isComplete": true,
    "missingFields": [],
    "completenessScore": 100
  }
}
```

---

### 18. Create and Publish Event Directly

Create an event and publish it immediately (bypasses request workflow).

**Endpoint:** `POST /api/events/direct`

**Access:** Private (requires `event.create` AND `event.approve` permissions)

**Request Body:**
```json
{
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
  }
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Event_ID | string | Yes | Unique event identifier |
| Event_Title | string | Yes | Event title (3-200 characters) |
| Location | string | Yes | Event location (3-500 characters) |
| Start_Date | date | Yes | Event start date (ISO format) |
| End_Date | date | No | Event end date (must be after Start_Date) |
| Category | string | No | Event category (`BloodDrive`, `Advocacy`, `Training`) |
| Email | string | Yes | Contact email (valid email format) |
| Phone_Number | string | Yes | Contact phone (10-20 characters) |
| Event_Description | string | No | Event description |
| categoryData | object | No | Category-specific data (see below) |

**Category-Specific Data:**

**BloodDrive:**
```json
{
  "Target_Donation": 100,
  "VenueType": "Indoor"
}
```

**Advocacy:**
```json
{
  "Topic": "Blood Donation Awareness",
  "TargetAudience": "General Public",
  "ExpectedAudienceSize": 200,
  "PartnerOrganization": "Red Cross"
}
```

**Training:**
```json
{
  "TrainingType": "First Aid",
  "MaxParticipants": 30
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Event created and published successfully",
  "data": {
    "request": null,
    "event": {/* event object */},
    "category": {/* category data */}
  },
  "warnings": []
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "Event Title is required",
    "Start Date must be a valid date"
  ]
}
```

**403 Forbidden** - Insufficient permissions
```json
{
  "success": false,
  "message": "Permission denied: requires event.create and event.approve"
}
```

---

## Event Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete Event model schema.

### Key Fields

- **Event_ID** (required, unique) - Unique event identifier
- **Event_Title** (required) - Event title
- **Location** (required) - Event location
- **Start_Date** (required) - Event start date
- **End_Date** (optional) - Event end date
- **Category** (optional) - Event category (`BloodDrive`, `Advocacy`, `Training`)
- **Status** (required, default: `Pending`) - Event status enum
- **coordinator_id** (required) - Coordinator ID
- **Email** (required) - Contact email
- **Phone_Number** (required) - Contact phone

### Event Status Values

- `Pending` - Awaiting approval
- `Approved` - Approved and published
- `Rescheduled` - Rescheduled
- `Rejected` - Rejected
- `Completed` - Event completed
- `Cancelled` - Event cancelled

### Event Categories

1. **BloodDrive** - Blood donation events
   - Requires: `Target_Donation`, `VenueType`
   - Model: `BloodDrive`

2. **Advocacy** - Advocacy/awareness events
   - Requires: `Topic`, `TargetAudience`, `ExpectedAudienceSize`
   - Model: `Advocacy`

3. **Training** - Training events
   - Requires: `TrainingType`, `MaxParticipants`
   - Model: `Training`

---

## Business Logic

### Event Creation Flow

1. Validate input data (Joi validation)
2. Check for duplicate Event_ID
3. Create event record
4. Create category-specific record (if Category provided)
5. Link category record to event
6. Return event data with category information

### Event Approval Flow

Events are typically created through the request workflow (see [API_REQUESTS.md](API_REQUESTS.md)). Direct creation requires both `event.create` and `event.approve` permissions.

---

## Related Documentation

- [Requests API](API_REQUESTS.md) - Event request workflow
- [Models Reference](MODELS_REFERENCE.md) - Event, BloodDrive, Advocacy, Training models
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
