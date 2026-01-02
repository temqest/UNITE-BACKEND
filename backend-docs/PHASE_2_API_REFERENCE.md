# Phase 2 API Reference - Unified Request & Event Endpoints

**Status**: ✅ COMPLETE  
**Date**: 2025  
**Scope**: All new unified API endpoints (request review/confirm/assign, event create/publish)

---

## Overview

Phase 2 introduces **unified, permission-driven API endpoints** that consolidate the request and event workflows previously split by role (coordinator vs. stakeholder). All endpoints enforce:

1. **Authority hierarchy validation** (reviewer.authority >= requester.authority)
2. **Permission-based access control** (`CAN_REVIEW_REQUESTS`, `CAN_CREATE_EVENT`, etc.)
3. **Field-level restrictions** (e.g., non-admins cannot change coordinator field)
4. **Consistent error responses** with reason codes (INSUFFICIENT_PERMISSION, AUTHORITY_INSUFFICIENT, etc.)

---

## Request Endpoints

### 1. POST /api/requests/:requestId/review-decision

**Purpose**: Unified endpoint for reviewers (coordinator/admin) to review and decide on requests

**Permissions Required**:
- `request.review` permission
- `actor.authority >= requester.authority` (authority hierarchy check)

**Request Body**:
```json
{
  "action": "accept|reject|reschedule",
  "notes": "optional decision notes",
  "proposedDate": "2025-06-15 (required if action=reschedule)",
  "proposedStartTime": "09:00 (optional)"
}
```

**Validation Rules**:
- `action` must be one of: `accept`, `reject`, `reschedule`
- If `action` is `reschedule`, `proposedDate` is required
- System admins (authority >= 100) bypass authority hierarchy check

**Success Response** (200):
```json
{
  "success": true,
  "message": "Request accept|reject|reschedule completed successfully",
  "data": {
    "request": {
      "Request_ID": "REQ-001",
      "Status": "REVIEW_ACCEPTED|REJECTED|REVIEW_RESCHEDULED",
      "decisionHistory": [
        {
          "action": "accept|reject|reschedule",
          "actor": { "id": "...", "role": "coordinator", "authority": 60 },
          "timestamp": "2025-06-10T14:30:00Z",
          "notes": "...",
          "grant_reason": "request.review permission granted"
        }
      ]
    },
    "event": null,
    "action": "accept|reject|reschedule"
  }
}
```

**Error Responses**:
- **401 Unauthorized**: `{ success: false, message: "Authentication required" }`
- **400 Bad Request**: `{ success: false, message: "Invalid action. Must be one of..." }`
- **403 Forbidden (Permission)**: 
  ```json
  {
    "success": false,
    "message": "Insufficient permissions for action: review",
    "reason": "INSUFFICIENT_PERMISSION",
    "requiredPermission": "request.review"
  }
  ```
- **403 Forbidden (Authority)**:
  ```json
  {
    "success": false,
    "message": "Cannot [action] request from higher-authority requester",
    "reason": "AUTHORITY_INSUFFICIENT",
    "reviewerAuthority": 60,
    "requesterAuthority": 80
  }
  ```
- **404 Not Found**: `{ success: false, message: "Request not found" }`

**State Transitions Triggered**:
- `PENDING_REVIEW` → `REVIEW_ACCEPTED` (action=accept)
- `PENDING_REVIEW` → `REJECTED` (action=reject)
- `PENDING_REVIEW` → `REVIEW_RESCHEDULED` (action=reschedule)

**Example Usage**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-001/review-decision \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "notes": "Approved for June 15 event"
  }'
```

---

### 2. POST /api/requests/:requestId/confirm

**Purpose**: Unified endpoint for requesters to confirm reviewer's decision or propose revisions

**Permissions Required**:
- `request.confirm` permission
- Must be the original requester OR system admin (authority >= 100)

**Request Body**:
```json
{
  "action": "confirm|decline|revise",
  "notes": "optional confirmation notes"
}
```

**Validation Rules**:
- `action` must be one of: `confirm`, `decline`, `revise`
- Requester is verified via `request.made_by_id === user.id`
- Only valid in `REVIEW_ACCEPTED` or `REVIEW_RESCHEDULED` states

**Success Response** (200):
```json
{
  "success": true,
  "message": "Request confirm|decline|revise'd successfully",
  "data": {
    "request": {
      "Request_ID": "REQ-001",
      "Status": "APPROVED|CANCELLED|PENDING_REVISION",
      "statusHistory": [
        {
          "status": "APPROVED|CANCELLED|PENDING_REVISION",
          "timestamp": "2025-06-10T15:00:00Z",
          "actor": { "id": "...", "role": "stakeholder", "authority": 30 },
          "reason": "Requester confirmed reviewer decision"
        }
      ]
    },
    "event": null,
    "action": "confirm|decline|revise"
  }
}
```

**Error Responses**:
- **401 Unauthorized**: `{ success: false, message: "Authentication required" }`
- **400 Bad Request**: `{ success: false, message: "Invalid action. Must be one of..." }`
- **403 Forbidden (Not Requester)**:
  ```json
  {
    "success": false,
    "message": "Only the requester can confirm this decision",
    "reason": "NOT_REQUESTER"
  }
  ```
- **403 Forbidden (Permission)**:
  ```json
  {
    "success": false,
    "message": "Insufficient permissions to confirm this decision",
    "reason": "INSUFFICIENT_PERMISSION",
    "requiredPermission": "request.confirm"
  }
  ```
- **404 Not Found**: `{ success: false, message: "Request not found" }`

**State Transitions Triggered**:
- `REVIEW_ACCEPTED` → `APPROVED` (action=confirm)
- `REVIEW_RESCHEDULED` → `APPROVED` (action=confirm with proposed date accepted)
- `REVIEW_ACCEPTED` → `CANCELLED` (action=decline)
- `REVIEW_ACCEPTED` → `PENDING_REVISION` (action=revise)

**Example Usage**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-001/confirm \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "confirm",
    "notes": "Great! June 15 works perfectly"
  }'
```

---

### 3. POST /api/requests/:requestId/assign-coordinator

**Purpose**: Admin endpoint to list or assign a coordinator to a request

**Permissions Required**:
- `request.assign_coordinator` permission
- `authority >= 100` (system admin only)

**Request Body**:
```json
{
  "coordinatorId": "USER_ID (optional, required if multiple matches)"
}
```

**Validation Rules**:
- Searches coordinators with `authority >= 60` (coordinator tier)
- Must be in same organization as requester
- Must have coverage in same municipality as requester
- If only one match: auto-assign
- If multiple matches: return list for selection
- Coordinator's authority must be >= requester's authority (if applicable)

**Success Response (Auto-Assign)** (200):
```json
{
  "success": true,
  "message": "Coordinator auto-assigned",
  "data": {
    "request": {
      "Request_ID": "REQ-001",
      "coordinator_id": "USER_ID",
      "Status": "PENDING_ASSIGNMENT"
    },
    "assignedCoordinator": {
      "id": "USER_ID",
      "name": "John Doe",
      "email": "john@example.com",
      "authority": 60,
      "organizations": ["ORG_ID_1"],
      "authorityQualified": true,
      "isPrimary": true
    },
    "autoAssigned": true
  }
}
```

**Success Response (Selection Required)** (200):
```json
{
  "success": true,
  "message": "Multiple coordinators available - please select",
  "data": {
    "coordinators": [
      {
        "id": "USER_ID_1",
        "name": "John Doe",
        "email": "john@example.com",
        "authority": 60,
        "organizations": ["ORG_ID_1"],
        "authorityQualified": true,
        "isPrimary": true
      },
      {
        "id": "USER_ID_2",
        "name": "Jane Smith",
        "email": "jane@example.com",
        "authority": 60,
        "organizations": ["ORG_ID_1", "ORG_ID_2"],
        "authorityQualified": true,
        "isPrimary": false
      }
    ],
    "requiresSelection": true,
    "hint": "Coordinators marked isPrimary=true are recommended"
  }
}
```

**Error Responses**:
- **401 Unauthorized**: `{ success: false, message: "Authentication required" }`
- **403 Forbidden (Admin Only)**:
  ```json
  {
    "success": false,
    "message": "Only system admins can assign coordinators",
    "reason": "ADMIN_ONLY"
  }
  ```
- **404 Not Found**: `{ success: false, message: "Request not found" }`
- **400 Bad Request (No Coordinators)**:
  ```json
  {
    "success": false,
    "message": "No qualified coordinators found for this request",
    "reason": "NO_COORDINATORS_AVAILABLE",
    "searched": {
      "organization": "ORG_ID",
      "municipality": "MUNICIPALITY_ID",
      "requiredAuthority": ">= 30"
    }
  }
  ```

**Example Usage**:
```bash
# List available coordinators
curl -X POST http://localhost:3000/api/requests/REQ-001/assign-coordinator \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'

# Auto-assign or select from list
curl -X POST http://localhost:3000/api/requests/REQ-001/assign-coordinator \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "coordinatorId": "USER_ID_1"
  }'
```

---

## Event Endpoints

### 1. POST /api/events

**Purpose**: Create an event directly (decoupled from request workflow)

**Permissions Required**:
- `event.create` permission

**Request Body**:
```json
{
  "title": "string (required)",
  "location": "string (required)",
  "startDate": "2025-06-15 (required, ISO 8601 format)",
  "endDate": "2025-06-16 (optional, ISO 8601 format)",
  "category": "string (required, e.g., 'blood_donation', 'seminar')",
  "coordinatorId": "string (optional, overridden for non-admins)",
  "stakeholderId": "string (optional, restricted for non-admins)"
}
```

**Validation Rules**:
- All required fields must be provided
- `startDate` must be valid ISO 8601 date
- Non-admins (authority < 80):
  - Cannot change `coordinatorId` (forced to `req.user.id`)
  - Cannot assign stakeholders outside their jurisdiction (organization + municipality)
- Admins can freely set both coordinator and stakeholder

**Authority-Based Field Locking**:
- **Non-Admin** (authority < 80): `coordinatorId = req.user.id` (cannot change)
- **Non-Admin**: Stakeholder scope restricted to:
  - Same organization OR
  - Same municipality coverage area
- **Admin** (authority >= 80): Full control over all fields

**Success Response** (201):
```json
{
  "success": true,
  "message": "Event created successfully",
  "data": {
    "Event_ID": "EVT-001",
    "Request_ID": "REQ-002",
    "event": {
      "Event_ID": "EVT-001",
      "Event_Title": "Blood Donation Drive",
      "Location": "Community Center",
      "Start_Date": "2025-06-15T09:00:00Z",
      "End_Date": "2025-06-16T17:00:00Z",
      "Category": "blood_donation",
      "coordinator_id": "USER_ID",
      "stakeholder_id": "USER_ID",
      "made_by_id": "REQ_USER_ID",
      "Status": "Pending"
    }
  }
}
```

**Error Responses**:
- **401 Unauthorized**: `{ success: false, message: "Authentication required" }`
- **400 Bad Request (Missing Fields)**:
  ```json
  {
    "success": false,
    "message": "Missing required fields: title, location, startDate, category"
  }
  ```
- **403 Forbidden (Permission)**:
  ```json
  {
    "success": false,
    "message": "Insufficient permissions to create events",
    "reason": "INSUFFICIENT_PERMISSION",
    "requiredPermission": "event.create"
  }
  ```
- **400 Bad Request (Out of Scope)**:
  ```json
  {
    "success": false,
    "message": "Stakeholder not in authorized scope",
    "reason": "STAKEHOLDER_OUT_OF_SCOPE"
  }
  ```

**Example Usage**:
```bash
# Coordinator creating event (automatically self-assigned)
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Blood Donation Drive",
    "location": "Community Center",
    "startDate": "2025-06-15",
    "category": "blood_donation"
  }'

# Admin creating event with specific coordinator and stakeholder
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Health Awareness Seminar",
    "location": "City Hall",
    "startDate": "2025-07-01",
    "endDate": "2025-07-02",
    "category": "seminar",
    "coordinatorId": "COORD_USER_ID",
    "stakeholderId": "STAKEHOLDER_USER_ID"
  }'
```

---

### 2. POST /api/events/:eventId/publish

**Purpose**: Publish/complete an event that has been approved

**Permissions Required**:
- `event.publish` permission OR `request.approve` permission

**Request Body**:
```json
{}
```

**Validation Rules**:
- Event must have all required fields (title, location, startDate)
- Updates event Status to "Completed"
- If linked request exists, updates to "APPROVED"
- Includes audit trail logging

**Success Response** (200):
```json
{
  "success": true,
  "message": "Event published successfully",
  "data": {
    "Event_ID": "EVT-001",
    "Status": "Completed",
    "linkedRequest": {
      "Request_ID": "REQ-001",
      "Status": "APPROVED"
    }
  }
}
```

**Error Responses**:
- **401 Unauthorized**: `{ success: false, message: "Authentication required" }`
- **403 Forbidden (Permission)**:
  ```json
  {
    "success": false,
    "message": "Insufficient permissions to publish events",
    "reason": "INSUFFICIENT_PERMISSION",
    "requiredPermission": "event.publish OR request.approve"
  }
  ```
- **404 Not Found**: `{ success: false, message: "Event not found" }`
- **400 Bad Request (Incomplete)**:
  ```json
  {
    "success": false,
    "message": "Event missing required fields for publishing",
    "reason": "EVENT_INCOMPLETE",
    "missingFields": ["title", "location"]
  }
  ```

**Example Usage**:
```bash
curl -X POST http://localhost:3000/api/events/EVT-001/publish \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Backward Compatibility

**Legacy Endpoints Still Supported**:
- `POST /api/requests/:id/coordinator-action` → Use `POST /api/requests/:id/review-decision` instead
- `POST /api/requests/:id/coordinator-confirm` → Use `POST /api/requests/:id/confirm` instead
- `POST /api/requests/:id/stakeholder-action` → Use `POST /api/requests/:id/review-decision` instead
- `POST /api/events/direct` → Use `POST /api/events` instead

**Migration Path**:
1. Both old and new endpoints are available during transition period
2. New endpoints recommended for all new feature development
3. Old endpoints will be deprecated in Phase 3
4. See PHASE_2_MIGRATION_GUIDE.md for detailed migration steps

---

## Permission Reference

**Request Permissions**:
- `request.create` - Create new request
- `request.read` - Read requests (authority-aware filtering applies)
- `request.review` - Review/decide on requests
- `request.confirm` - Confirm reviewer's decision (requester only)
- `request.approve` - Full request approval authority
- `request.reject` - Reject requests
- `request.reschedule` - Reschedule requests
- `request.assign_coordinator` - Assign coordinators (admin only)

**Event Permissions**:
- `event.create` - Create new event
- `event.read` - Read event details
- `event.update` - Update event
- `event.approve` - Approve events for publishing
- `event.publish` - Publish/complete events
- `event.delete` - Delete events

---

## Error Code Reference

| Code | HTTP | Meaning |
|------|------|---------|
| `INSUFFICIENT_PERMISSION` | 403 | User lacks required permission |
| `AUTHORITY_INSUFFICIENT` | 403 | User's authority tier too low |
| `NOT_REQUESTER` | 403 | Only requester can perform action |
| `ADMIN_ONLY` | 403 | Action restricted to system admins |
| `STAKEHOLDER_OUT_OF_SCOPE` | 400 | Stakeholder not in user's jurisdiction |
| `NO_COORDINATORS_AVAILABLE` | 400 | No qualified coordinators found |
| `EVENT_INCOMPLETE` | 400 | Event missing required fields |

---

## Authority Hierarchy

```
100 - System Admin (full access)
80  - Operational Admin (manage events/requests)
60  - Coordinator (review requests, manage within scope)
30  - Stakeholder (create requests, confirm decisions)
20  - Default/Basic (minimal access)
```

**Reviewer Authority Validation**: `reviewer.authority >= requester.authority` (enforced in `/review-decision`)

---

## Example Workflows

### Complete Request Workflow (New)

```
1. Stakeholder: POST /api/requests (creates request, status=PENDING_REVIEW)
2. Coordinator: POST /api/requests/{id}/review-decision (action=accept, status=REVIEW_ACCEPTED)
3. Stakeholder: POST /api/requests/{id}/confirm (action=confirm, status=APPROVED)
4. Coordinator: POST /api/events (creates linked event)
5. Coordinator: POST /api/events/{eventId}/publish (event status=Completed, request=APPROVED)
```

### Complete Request Workflow with Reschedule

```
1. Stakeholder: POST /api/requests (status=PENDING_REVIEW)
2. Coordinator: POST /api/requests/{id}/review-decision 
   (action=reschedule, proposedDate=2025-07-01, status=REVIEW_RESCHEDULED)
3. Stakeholder: POST /api/requests/{id}/confirm 
   (action=confirm, status=APPROVED with new date)
4. Coordinator: POST /api/events (creates event with rescheduled date)
5. Coordinator: POST /api/events/{eventId}/publish
```

### Direct Event Creation (Admin)

```
1. Admin: POST /api/events (creates event, can set coordinator and stakeholder)
2. Coordinator: POST /api/events/{eventId}/publish (publishes event)
```

---

## Implementation Notes

- All timestamps in ISO 8601 format (UTC)
- All IDs are MongoDB ObjectIds (returned as strings)
- Pagination supported on read endpoints (see list endpoints docs)
- Audit logging automatically recorded for all actions
- Authority changes tracked with `authority_changed_at` and `authority_changed_by`

