# Diagnostic Logging - Authority & Permission Refactoring

## Overview
Step 6 of the authority-based refactoring adds comprehensive diagnostic logging to track request visibility filtering and authorization decisions across the system. This enables verification that the migration from hard-coded role checks to authority + permission-based filtering is working correctly.

## Logging Points Added

### 1. Service Layer: getCoordinatorRequests()
**Location:** `src/services/request_services/eventRequest.service.js` (lines 3729+)

#### Initialization Logging
```
[getCoordinatorRequests] Fetching scoped requests for coordinator {coordinatorId}
  - coordinatorId: User._id
  - email: User.email
  - authority: User.authority
  - coverageAreas: count
  - municipalityIds: count
  - organizations: count
  - organizationIds: count
```

#### Filter Enablement Logging
```
[getCoordinatorRequests] Coverage filter ENABLED: {count} municipalities
[getCoordinatorRequests] Coverage filter DISABLED: No municipalityIds in coverage areas
[getCoordinatorRequests] Organization filter ENABLED: {count} organizations
[getCoordinatorRequests] Organization filter DISABLED: No organizations assigned
```

#### Result Diagnostic Logging (Per-Request)
Each returned request includes a `_diagnosticMatchType` field showing which filter clause matched:
- `direct_assignment_legacy` - Matched `coordinator_id` field
- `reviewer_assignment_new` - Matched `reviewer.userId` field
- `coverage_area_match_new` - Matched `location.municipality` field
- `coverage_area_match_legacy` - Matched `municipality` field
- `organization_match` - Matched `organizationId` field
- `own_submission_legacy` - Matched `made_by_id` field
- `own_submission_new` - Matched `requester.userId` field
- `unknown_match` - Fallback (should not occur)

```
[getCoordinatorRequests] Result #1: {requestId} matched via {matchType}
  - requestId: ObjectId
  - status: Request.Status
  - matchType: {filter_clause_name}
  - createdAt: Date
```

#### Completion Logging
```
[getCoordinatorRequests] Query complete - Returned {returned} of {total} total matching requests
  - coordinatorId: User._id
  - page: number
  - limit: number
  - total: number
  - pages: number
```

#### Error Logging
```
[getCoordinatorRequests] Error for coordinator {coordinatorId}: {error.message}
```

---

### 2. Service Layer: getRequestsForUser()
**Location:** `src/services/request_services/eventRequest.service.js` (lines 3950+)

#### Routing Decision Logging
```
[getRequestsForUser] Routing request for user {userId} with authority {authority}
  - userId: User._id
  - authority: numeric_value
  - email: User.email
```

#### Authority Tier Match Logging
```
[getRequestsForUser] User has OPERATIONAL_ADMIN authority ({authority} >= 80) - showing all requests
[getRequestsForUser] User has COORDINATOR authority ({authority} >= 60) - showing scoped requests
[getRequestsForUser] User has STAKEHOLDER authority ({authority} >= 30) - showing own requests
[getRequestsForUser] User has insufficient authority ({authority} < 30) - no access
```

#### Error Logging
```
[getRequestsForUser] Error: {error.message}
```

---

### 3. Service Layer: getRequestsByStakeholder()
**Location:** `src/services/request_services/eventRequest.service.js` (lines 4011+)

#### Initialization Logging
```
[getRequestsByStakeholder] Fetching own requests for stakeholder {stakeholderId}
  - userId: User._id
  - email: User.email
  - authority: User.authority
  - legacyId: User.userId
```

#### Query Builder Logging
```
[getRequestsByStakeholder] Query built with 5 $or clauses (supporting legacy + new fields)
  - userId: User._id
  - clauses: [
      'stakeholder_id (legacy string)',
      'stakeholder_id (ObjectId)',
      'made_by_id (legacy string)',
      'made_by_id (ObjectId)',
      'requester.userId (new ObjectId)'
    ]
```

#### Result Diagnostic Logging (Per-Request)
Each returned request includes a `_diagnosticMatchType` field:
- `stakeholder_id_legacy_string` - Matched legacy string ID
- `stakeholder_id_objectid` - Matched ObjectId
- `made_by_id_legacy_string` - Matched legacy made_by_id (string)
- `made_by_id_objectid` - Matched made_by_id (ObjectId)
- `requester_userid_new` - Matched new requester.userId field
- `unknown_match` - Fallback

#### Completion Logging
```
[getRequestsByStakeholder] Query complete - Returned {returned} of {total} total own requests
  - stakeholderId: User._id
  - page: number
  - limit: number
  - total: number
  - pages: number
```

#### Error Logging
```
[getRequestsByStakeholder] Error for stakeholder {stakeholderId}: {error.message}
```

---

### 4. Controller Layer: createImmediateEvent()
**Location:** `src/controller/request_controller/eventRequest.controller.js` (lines 102+)

#### Authority Validation Logging
```
[createImmediateEvent] Authority validation for creator {creatorId}
  - email: User.email
  - authority: numeric_value
  - isSystemAdmin: boolean
  - isCoordinator: boolean
  - coordinatorThreshold: 60
  - adminThreshold: 80
```

#### Authorization Decision Logging
```
[createImmediateEvent] DENIED - Insufficient authority ({authority} < 60)
  - creatorId: User._id
  - requestedCoordinator: body.coordinator_id
```

#### Field Locking Decision Logging (Coordinator)
```
[createImmediateEvent] LOCK applied - Coordinator (authority {authority}) restricted to self
  - creatorId: User._id
  - requestedCoordinator: body.coordinator_id
  - actualCoordinator: creatorId
```

#### Field Freedom Decision Logging (System Admin)
```
[createImmediateEvent] UNLOCK - System Admin (authority {authority}) can select any coordinator
  - creatorId: User._id
  - selectedCoordinator: body.coordinator_id
```

#### Stakeholder Restriction Logging (Coordinator)
```
[createImmediateEvent] RESTRICTION applied - Stakeholder selection scoped to coordinator jurisdiction
  - coordinatorId: creatorId
  - requestedStakeholder: body.stakeholder_id
  - coverageAreas: count
  - municipalities: [array]
  - organizations: count
```

#### Stakeholder Freedom Logging (System Admin)
```
[createImmediateEvent] NO RESTRICTION - System Admin can select any stakeholder
  - creatorId: User._id
  - selectedStakeholder: body.stakeholder_id
```

#### Service Call Logging
```
[createImmediateEvent] Calling service to create immediate event
  - creatorId: string
  - creatorRole: string
  - authority: numeric_value
  - eventFields: [array of first 5 fields]
```

#### Result Logging
```
[createImmediateEvent] Service returned result
  - success: boolean
  - hasRequest: boolean
  - hasEvent: boolean
  - warnings: count
```

#### Error Logging
```
[createImmediateEvent] Error: {error.message}
```

---

### 5. Service Layer: createImmediateEvent()
**Location:** `src/services/request_services/eventRequest.service.js` (lines 1538+)

#### Request Received Logging
```
[createImmediateEvent] Service received request from creator {creatorId}
  - email: User.email
  - authority: numeric_value
  - creatorRole: string
  - isSystemAdmin: boolean
  - isCoordinator: boolean
```

#### Authorization Decision Logging
```
[createImmediateEvent] AUTHORIZATION DENIED - Authority {authority} insufficient
  - creatorId: string
  - required: 60
  - hasAuthority: false
```

#### Coordinator Selection Logging (System Admin)
```
[createImmediateEvent] System Admin (authority {authority}) must provide coordinator_id
```

```
[createImmediateEvent] System Admin (authority {authority}) selected coordinator
  - creatorId: string
  - selectedCoordinatorId: string
```

#### Coordinator Self-Locking Logging
```
[createImmediateEvent] Coordinator (authority {authority}) forced to self
  - creatorId: string
  - coordinatorId: string
```

#### Stakeholder Scope Validation Logging
```
[createImmediateEvent] Validating stakeholder scope for coordinator
  - creatorId: string
  - stakeholderId: string
  - municipalitiesAvailable: [array]
  - organizationsAvailable: [array]
  - message: 'Coordinator can only select stakeholders within their jurisdiction (TODO: validate stakeholder location)'
```

#### Service Call Logging
```
[createImmediateEvent] Calling createEventRequest with enriched data
  - creatorId: string
  - coordinatorId: string
  - hasStakeholder: boolean
  - hasCoordinatorRestrictions: boolean
```

#### Error Logging
```
[createImmediateEvent] Error creating event: {error.message}
```

---

## Debugging Authority-Based Filtering

### Checking Request Visibility

When debugging why a specific request appears/doesn't appear for a user, follow these steps:

1. **Enable DEBUG logging** in your environment to see all log lines
2. **Reproduce the user action** that fetches requests (e.g., `/api/requests/my-requests`)
3. **Look for the routing log:**
   ```
   [getRequestsForUser] Routing request for user {userId} with authority {authority}
   ```
   This tells you which tier the user matched (ADMIN/COORDINATOR/STAKEHOLDER/DENIED)

4. **Based on authority tier, look for the appropriate filter logs:**
   - **Admin (≥80):** Should see `User has OPERATIONAL_ADMIN authority... showing all requests`
   - **Coordinator (≥60):** Should see filter clauses logged and per-result `_diagnosticMatchType` values
   - **Stakeholder (≥30):** Should see `Query built with 5 $or clauses` log
   - **Other (<30):** Should see `User has insufficient authority... no access`

5. **Check per-request diagnostic info** in results:
   - For Coordinators: Look at `_diagnosticMatchType` for each request to understand which filter matched
   - For Stakeholders: Look at `_diagnosticMatchType` to confirm legacy/new field usage

### Checking Event Creation Authorization

When debugging event creation issues:

1. **Check Authority Validation log:**
   ```
   [createImmediateEvent] Authority validation for creator {creatorId}
   ```
   - Verify `authority` is >= 60 to create events
   - Verify `isCoordinator` and `isSystemAdmin` flags are correct

2. **Check Authorization Decision:**
   - If DENIED: authority is < 60, user cannot create events
   - If ALLOWED: authority is >= 60, proceed to coordinator selection

3. **Check Field Locking:**
   - **Coordinator (<80):** Should see `LOCK applied` log, coordinatorId locked to self
   - **System Admin (≥80):** Should see `UNLOCK` log, can select any coordinator

4. **Check Stakeholder Restriction:**
   - **Coordinator (<80):** Should see `RESTRICTION applied` log with jurisdiction details
   - **System Admin (≥80):** Should see `NO RESTRICTION` log

---

## Data Flow Diagram: Request Visibility

```
User makes GET /api/requests/my-requests
    ↓
getMyRequests() controller calls getRequestsForUser()
    ↓
[getRequestsForUser] Logs: User {userId} with authority {authority}
    ↓
    ├─ Authority >= 80 (System Admin)
    │  └─ getAllRequests()
    │     └─ Return ALL requests
    │
    ├─ Authority 60-79 (Coordinator)
    │  └─ getCoordinatorRequests()
    │     └─ [getCoordinatorRequests] Build $or query with 7 clauses:
    │        1. coordinator_id match
    │        2. reviewer.userId match
    │        3. location.municipality in coverage
    │        4. municipality in coverage (legacy)
    │        5. organizationId in organizations
    │        6. made_by_id match
    │        7. requester.userId match
    │     └─ Aggregate pipeline adds _diagnosticMatchType
    │     └─ For each result:
    │        [getCoordinatorRequests] Result #{n}: {requestId} matched via {matchType}
    │     └─ Return matching requests
    │
    ├─ Authority 30-59 (Stakeholder)
    │  └─ getRequestsByStakeholder()
    │     └─ [getRequestsByStakeholder] Build $or query with 5 clauses:
    │        1. stakeholder_id (legacy string)
    │        2. stakeholder_id (ObjectId)
    │        3. made_by_id (legacy string)
    │        4. made_by_id (ObjectId)
    │        5. requester.userId
    │     └─ Aggregate pipeline adds _diagnosticMatchType
    │     └─ For each result:
    │        [getRequestsByStakeholder] Result #{n}: {requestId} matched via {matchType}
    │     └─ Return own requests only
    │
    └─ Authority < 30 (No Access)
       └─ Return empty list
           [getRequestsForUser] User has insufficient authority... no access
```

---

## Data Flow Diagram: Event Creation

```
User makes POST /api/events/direct with event data
    ↓
createImmediateEvent() controller
    ↓
[createImmediateEvent] Authority validation for creator {creatorId}
    ↓
    ├─ Authority < 60 (Insufficient)
    │  └─ [createImmediateEvent] DENIED - Insufficient authority
    │  └─ Return 403 Forbidden
    │
    └─ Authority >= 60 (Authorized)
       └─ Check isSystemAdmin (>= 80) vs isCoordinator (>= 60)
          ├─ If Coordinator (60-79)
          │  └─ [createImmediateEvent] LOCK applied - restricted to self
          │  └─ Force coordinatorId = creatorId
          │  └─ If has stakeholder_id:
          │     └─ [createImmediateEvent] RESTRICTION applied - stakeholder scoped
          │     └─ Store coverage context for validation
          │
          └─ If System Admin (>= 80)
             └─ [createImmediateEvent] UNLOCK - System Admin can select any coordinator
             └─ Allow custom coordinatorId
             └─ If has stakeholder_id:
                └─ [createImmediateEvent] NO RESTRICTION - System Admin can select any
    ↓
[createImmediateEvent] Calling service to create immediate event
    ↓
createImmediateEvent() service
    ↓
[createImmediateEvent] Service received request from creator {creatorId}
    ↓
Validate creator authority >= 60
    ├─ If invalid: [createImmediateEvent] AUTHORIZATION DENIED
    └─ If valid: Proceed to createEventRequest()
       └─ [createImmediateEvent] Calling createEventRequest with enriched data
       └─ [createImmediateEvent] Service returned result
```

---

## Toggling Diagnostic Output

The diagnostic fields (`_diagnosticMatchType`) are added to results in development but should be removed before shipping to production.

To disable in production:
1. Remove the `$addFields` stages that add `_diagnosticMatchType` from pipelines
2. Keep `console.log()` statements for server-side logging (useful for debugging)
3. Or wrap console logs with environment check: `if (process.env.NODE_ENV !== 'production')`

---

## Integration Testing Checklist

Use these logs to verify correct behavior:

- [ ] Authority tier 20 (Basic User) → "insufficient authority" log
- [ ] Authority tier 30 (Stakeholder) → "own requests" filtered correctly
- [ ] Authority tier 60 (Coordinator) → "scoped requests" with municipality matching
- [ ] Authority tier 80+ (Admin) → "all requests" returned
- [ ] Coordinator creating event → "LOCK applied" with coordinatorId forced to self
- [ ] System Admin creating event → "UNLOCK" with custom coordinatorId allowed
- [ ] Coordinator with stakeholder_id → "RESTRICTION applied" log
- [ ] System Admin with stakeholder_id → "NO RESTRICTION" log
- [ ] Event creation permission check → route middleware blocks unauthorized users
- [ ] Request returned with `_diagnosticMatchType` field showing which filter matched

---

## Sample Log Output

```
[getRequestsForUser] Routing request for user 60f7d5b9c1a2b3c4d5e6f7a8 with authority 60
  userId: 60f7d5b9c1a2b3c4d5e6f7a8
  authority: 60
  email: coordinator@hospital.gov.ph
[getRequestsForUser] User has COORDINATOR authority (60 >= 60) - showing scoped requests

[getCoordinatorRequests] Fetching scoped requests for coordinator 60f7d5b9c1a2b3c4d5e6f7a8
  coordinatorId: 60f7d5b9c1a2b3c4d5e6f7a8
  email: coordinator@hospital.gov.ph
  authority: 60
  coverageAreas: 2
  municipalityIds: 4
  organizations: 1
  organizationIds: 1
[getCoordinatorRequests] Coverage filter ENABLED: 4 municipalities
[getCoordinatorRequests] Organization filter ENABLED: 1 organizations

[getCoordinatorRequests] Result #1: 5f9e2d7b6c1a0d4e9f2a1b5c matched via coverage_area_match_new
  requestId: 5f9e2d7b6c1a0d4e9f2a1b5c
  status: Pending
  matchType: coverage_area_match_new
  createdAt: 2024-01-15T10:30:00.000Z
[getCoordinatorRequests] Result #2: 5f9e2d7b6c1a0d4e9f2a1b5d matched via organization_match
  requestId: 5f9e2d7b6c1a0d4e9f2a1b5d
  status: Approved
  matchType: organization_match
  createdAt: 2024-01-14T14:45:00.000Z

[getCoordinatorRequests] Query complete - Returned 2 of 5 total matching requests
  coordinatorId: 60f7d5b9c1a2b3c4d5e6f7a8
  page: 1
  limit: 10
  total: 5
  pages: 1
```

---

## Next Steps

After verifying diagnostic logs, proceed to:
1. **Integration testing** (Todo 2) - Create test cases using these logs for verification
2. **Event creation endpoint security testing** (Todo 3) - Test permission middleware
3. **Performance optimization** (Todo 4) - If needed, flatten denormalized fields
