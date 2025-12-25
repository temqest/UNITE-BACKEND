# PHASE 2: Backend API Endpoints - Implementation Plan

**Status**: Starting Implementation

---

## Step-by-Step Implementation Strategy

### Step 6: Standardize Request Endpoints with Authority Filtering

#### 6.1: GET `/api/requests/me` - VERIFY & ENHANCE ✅
**Status**: Exists, needs review
- File: `src/controller/request_controller/eventRequest.controller.js:868`
- Route: `src/routes/requests.routes.js:60`
- Action: Verify uses authority filtering, add `_diagnosticMatchType` field to response

#### 6.2: GET `/api/requests` (Admin Only) - CREATE
**Status**: Needs creation
- Endpoint: GET `/api/requests`
- Permissions: `requirePermission('request', 'read')` + `authority >= 80`
- Response: All requests with pagination
- File to create method in: `eventRequest.controller.js`
- File to add route in: `requests.routes.js`

#### 6.3: POST `/api/requests/{id}/review-decision` - CREATE
**Status**: Similar to `coordinatorAcceptRequest` - may need consolidation
- Endpoint: POST `/api/requests/{id}/review-decision`
- Permissions: `requirePermission('request', 'review')` + `authority >= requester.authority`
- Payload: `{action: 'accept'|'reject'|'reschedule', notes, proposedDate, proposedStartTime}`
- Call: `eventRequestService.processRequestActionWithStateMachine()`

#### 6.4: POST `/api/requests/{id}/confirm` - CREATE
**Status**: Exists as `coordinatorConfirmRequest` - may need universal version
- Endpoint: POST `/api/requests/{id}/confirm`
- Permissions: `requirePermission('request', 'confirm')` + `isRequester`
- Logic: Transition REVIEW_RESCHEDULED or REVIEW_ACCEPTED to APPROVED

---

### Step 7: Decouple Event Creation from Request

#### 7.1: POST `/api/events` - CREATE
**Status**: Partially exists as `createImmediateEvent`
- Endpoint: POST `/api/events`
- Permissions: `requirePermission('event', 'create')`
- Authority Locking: If `authority < 80`: force `coordinatorId = self`
- Validation: Stakeholder scoped to coordinator's orgs/coverage
- File: `eventRequest.controller.js` or `events_controller` (TBD based on organization)

#### 7.2: POST `/api/events/{id}/publish` - CREATE
**Status**: Needs creation
- Endpoint: POST `/api/events/{id}/publish`
- Permissions: `requirePermission('event', 'publish')` OR `requirePermission('request', 'approve')`
- Logic: Fetch linked request, verify status eligible, set `event.Status = 'Completed'`
- File: `events_controller` (eventDetails or similar)

---

### Step 8: Add Permission Gates to Routes

**Files to Modify**:
- `src/routes/requests.routes.js`
- `src/routes/events.routes.js`

**Action**: Wrap POST endpoints with `requirePermission()` middleware
- Return `403 Forbidden` with `{reason: 'INSUFFICIENT_PERMISSION', requiredPermission: '...'}`

---

### Step 9: Implement Coordinator Selection Logic

#### Endpoint: POST `/api/requests/{id}/assign-coordinator`
**Status**: Needs creation
- Endpoint: POST `/api/requests/{id}/assign-coordinator`
- Permissions: Admin only (`authority >= 80`)
- Logic:
  1. List coordinators in `organization ∩ municipality ∩ coverage`
  2. If multiple: return list with `isPrimary` flag
  3. If single: auto-assign
  4. Validate: `coordinator.authority >= requester.authority`
- File: `eventRequest.controller.js`

---

## Implementation Order

1. ✅ Step 6.1 - Verify GET /api/requests/me (quick review)
2. 🔄 Step 6.2 - Create GET /api/requests (admin endpoint)
3. 🔄 Step 6.3 - Create POST /api/requests/{id}/review-decision
4. 🔄 Step 6.4 - Create POST /api/requests/{id}/confirm
5. 🔄 Step 7.1 - Create/Enhance POST /api/events
6. 🔄 Step 7.2 - Create POST /api/events/{id}/publish
7. 🔄 Step 8 - Add permission gates to routes
8. 🔄 Step 9 - Create coordinator selection endpoint

---

## Key Patterns to Follow

### Permission Checking
```javascript
// Single permission
const hasPermission = await permissionService.checkPermission(userId, 'request', 'review', {locationId});
if (!hasPermission) return res.status(403).json({...});

// OR Multiple permissions
const hasReview = await permissionService.checkPermission(userId, 'request', 'review', context);
const hasApprove = await permissionService.checkPermission(userId, 'request', 'approve', context);
if (!hasReview && !hasApprove) return res.status(403).json({...});
```

### Authority Checking
```javascript
// Get user and requester
const user = await User.findById(userId).select('authority');
const requester = await User.findById(request.made_by_id).select('authority');

// Validate hierarchy
if (user.authority < requester.authority && user.authority < 100) {
  return res.status(403).json({reason: 'AUTHORITY_INSUFFICIENT'});
}
```

### State Machine Calls
```javascript
// Process action
const result = await eventRequestService.processRequestActionWithStateMachine(
  requestId,
  actorId,
  'accept', // or 'reject', 'reschedule', 'confirm', 'decline'
  {
    notes: req.body.notes,
    proposedDate: req.body.proposedDate,
    proposedStartTime: req.body.proposedStartTime
  }
);
```

### Response Format
```javascript
return res.status(200).json({
  success: true,
  message: 'Action completed successfully',
  data: {
    request: result.request,
    event: result.event || null,
    action: 'accept'
  }
});
```

---

## Potential Challenges & Solutions

### Challenge 1: Existing Similar Endpoints
- `coordinatorAcceptRequest` vs `reviewerAcceptRequest` vs new unified `POST /api/requests/{id}/review-decision`
- **Solution**: Create new unified endpoint, deprecate old ones with redirects

### Challenge 2: Role-Specific Confirmation
- Coordinator vs Stakeholder confirmation differ slightly
- **Solution**: Use single `POST /api/requests/{id}/confirm` endpoint, determine role from requester field in database

### Challenge 3: Event Creation Decoupling
- Currently event creation tightly coupled to request workflow
- **Solution**: Create separate `POST /api/events` endpoint, allow direct event creation without request

### Challenge 4: Coordinator Selection at Scale
- If 100+ coordinators in one municipality
- **Solution**: Return paginated list, require explicit selection (don't auto-assign if >1)

---

## Testing Scenarios

### Scenario 1: Normal Request Flow
1. Stakeholder creates request (authority 30)
2. Coordinator reviews/accepts (authority 60, >= 30) ✅
3. Stakeholder confirms (is requester) ✅
4. Event published ✅

### Scenario 2: Authority Mismatch
1. Coordinator creates request with admin stakeholder requester (authority 100)
2. Coordinator tries to approve (authority 60 < 100) ❌ DENIED

### Scenario 3: Direct Event Creation
1. Admin creates event via POST /api/events
2. Can select any coordinator
3. Stakeholder not scoped ✅

### Scenario 4: Coordinator Restricted Event Creation
1. Coordinator creates event via POST /api/events
2. coordinatorId forced to self
3. Stakeholder scoped to their organizations ✅

---

## Files to Modify

| File | Changes | Status |
|------|---------|--------|
| `src/controller/request_controller/eventRequest.controller.js` | Add new methods: getAllRequests, reviewDecision, confirm, publishEvent, assignCoordinator | TBD |
| `src/routes/requests.routes.js` | Add routes for new endpoints + permission gates | TBD |
| `src/routes/events.routes.js` | Add routes for event endpoints + permission gates | TBD |
| `src/services/request_services/eventRequest.service.js` | Verify processRequestActionWithStateMachine, add publishEvent logic | TBD |
| `src/services/event_services/` (if exists) | Create event publish logic | TBD |

