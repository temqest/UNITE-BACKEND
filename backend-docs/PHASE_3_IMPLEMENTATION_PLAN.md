# Phase 3 Implementation Plan - Testing & Validation

**Status**: 🔄 STARTING NOW  
**Scope**: Backend validation, frontend validation, end-to-end workflow testing  
**Target Completion**: Comprehensive test coverage for all Phase 2 endpoints

---

## Overview

Phase 3 validates that the unified API endpoints work correctly with proper authority hierarchy validation, permission enforcement, and complete workflow scenarios. This includes:

1. **Backend Validation Checks** - Testing authority filtering, permissions, and state transitions
2. **Frontend Validation Checks** - Verifying UI renders correctly based on authority level
3. **E2E Workflow Validation** - Complete end-to-end request/event workflows with all actors

---

## Phase 3 Sub-Steps

### Step 15: Backend Validation Checks

**Objective**: Verify authority-based filtering, permission checks, and state transitions work correctly

#### 15.1: Authority Filtering Tests

Test that different authority levels see only authorized requests:

**Test Setup**:
```javascript
// Create test users with different authorities
const adminUser = { authority: 100, id: "admin-1" };
const coordinatorUser = { authority: 60, id: "coord-1", organizations: ["ORG-A"], coverageAreas: [{ municipalityIds: ["MUN-1"] }] };
const stakeholderUser = { authority: 30, id: "stake-1", organizations: ["ORG-A"] };
const otherStakeholder = { authority: 30, id: "other-stake", organizations: ["ORG-B"] };

// Create test requests
const req1 = { Request_ID: "REQ-001", made_by_id: stakeholderUser.id, organization: "ORG-A" };
const req2 = { Request_ID: "REQ-002", made_by_id: otherStakeholder.id, organization: "ORG-B" };
const req3 = { Request_ID: "REQ-003", made_by_id: coordinatorUser.id, organization: "ORG-A" };
```

**Tests**:
- [ ] Admin (authority 100): Can fetch ALL requests → should get [REQ-001, REQ-002, REQ-003]
- [ ] Coordinator (authority 60, ORG-A): Can fetch scoped requests → should get [REQ-001, REQ-003] (org match)
- [ ] Stakeholder (authority 30, ORG-A): Can fetch own requests → should get [REQ-001] only
- [ ] Other Stakeholder (authority 30, ORG-B): Can fetch own requests → should get [REQ-002] only

**Endpoint**: `GET /api/requests/me`  
**Expected Response**: Filtered list matching authority rules

---

#### 15.2: Permission Check Tests

Test that permission validation blocks unauthorized actions:

**Tests**:
- [ ] User WITHOUT `request.review` permission calls `POST /api/requests/{id}/review-decision`
  - Expected: 403 INSUFFICIENT_PERMISSION
  - Response: `{ success: false, reason: "INSUFFICIENT_PERMISSION", requiredPermission: "request.review" }`

- [ ] User WITHOUT `request.confirm` permission calls `POST /api/requests/{id}/confirm`
  - Expected: 403 INSUFFICIENT_PERMISSION

- [ ] User WITHOUT `event.create` permission calls `POST /api/events`
  - Expected: 403 INSUFFICIENT_PERMISSION

- [ ] User WITHOUT `event.publish` permission calls `POST /api/events/{id}/publish`
  - Expected: 403 INSUFFICIENT_PERMISSION

- [ ] Non-admin calls `POST /api/requests/{id}/assign-coordinator`
  - Expected: 403 ADMIN_ONLY

**Implementation**: Run via API with auth tokens from users with/without specific permissions

---

#### 15.3: Authority Hierarchy Validation Tests

Test that lower-authority reviewers cannot override higher-authority requesters:

**Test Setup**:
```
Requester Authority: 80 (Operational Admin)
Reviewer Authority: 60 (Coordinator)
Action: accept/reject/reschedule
```

**Tests**:
- [ ] Coordinator (60) tries to review request from Operational Admin (80)
  - Expected: 403 AUTHORITY_INSUFFICIENT
  - Response: `{ success: false, reason: "AUTHORITY_INSUFFICIENT", reviewerAuthority: 60, requesterAuthority: 80 }`

- [ ] Admin (100) reviews request from Stakeholder (30)
  - Expected: 200 OK (admin can bypass)

- [ ] System Admin (100) reviews request from Admin (80)
  - Expected: 200 OK (higher authority can bypass)

- [ ] Coordinator (60) reviews request from Stakeholder (30)
  - Expected: 200 OK (authority hierarchy satisfied)

---

#### 15.4: Field Locking Tests

Test that non-admin field restrictions work:

**Test Setup**:
```
User Authority: 60 (Coordinator)
Attempting: POST /api/events with { coordinatorId: "DIFFERENT_USER" }
```

**Tests**:
- [ ] Non-admin sets `coordinatorId = self` (force applied)
  - Expected: 201 Created
  - Response contains: `{ event: { coordinator_id: "non-admin-user-id" } }`

- [ ] Non-admin attempts `coordinatorId = different user`
  - Expected: 201 Created but field forced to self
  - Response contains: `{ event: { coordinator_id: "non-admin-user-id" } }` (not different user)

- [ ] Non-admin selects stakeholder in same org
  - Expected: 201 Created (stakeholder in jurisdiction)

- [ ] Non-admin selects stakeholder outside org + municipality
  - Expected: 400 STAKEHOLDER_OUT_OF_SCOPE
  - Response: `{ success: false, reason: "STAKEHOLDER_OUT_OF_SCOPE" }`

---

#### 15.5: State Transition Tests

Test that request state machine transitions work correctly:

**Test Matrix**:

| Current State | Action | Expected New State | Requester Confirm Required |
|---|---|---|---|
| PENDING_REVIEW | accept | REVIEW_ACCEPTED | Yes |
| PENDING_REVIEW | reject | REJECTED | No |
| PENDING_REVIEW | reschedule | REVIEW_RESCHEDULED | Yes |
| REVIEW_ACCEPTED | confirm | APPROVED | - |
| REVIEW_ACCEPTED | decline | CANCELLED | - |
| REVIEW_RESCHEDULED | confirm | APPROVED | - |
| APPROVED | - | CANNOT transition | - |
| REJECTED | - | CANNOT transition | - |
| CANCELLED | - | CANNOT transition | - |

**Tests**:
- [ ] Create request → status = PENDING_REVIEW
- [ ] POST /review-decision action=accept → status = REVIEW_ACCEPTED
- [ ] POST /confirm action=confirm → status = APPROVED
- [ ] POST /review-decision action=reschedule with proposedDate → status = REVIEW_RESCHEDULED
- [ ] POST /confirm action=decline → status = CANCELLED
- [ ] Cannot transition from APPROVED to any other state (error expected)

---

#### 15.6: Audit Trail Tests

Test that all actions are logged with proper actor snapshots:

**Tests**:
- [ ] POST /review-decision records: `{ action, actor_id, actor_authority, actor_role, timestamp, grant_reason }`
- [ ] POST /confirm records: `{ action, actor_id, actor_authority, requester_check, timestamp }`
- [ ] POST /publish records: `{ action, actor_id, linkedRequest_updated, timestamp }`
- [ ] Audit trail returns in request.statusHistory and request.decisionHistory
- [ ] grant_reason field shows which permission was checked: `"request.review permission granted"`

---

### Step 16: Frontend Validation Checks

**Objective**: Verify frontend UI renders correctly based on authority level and permissions

#### 16.1: Authority-Based Visibility Tests

Test that UI shows/hides content based on authority:

**Test Setup**: 
- Admin user (authority 100)
- Coordinator user (authority 60)
- Stakeholder user (authority 30)
- View campaign page with requests from different organizations

**Tests**:
- [ ] **Admin Views Campaign Page**:
  - Request count shows: 100% (all requests visible)
  - Request list displays: All requests regardless of organization
  - Each request card shows: Full details (requester, coordinator, stakeholder, status)
  - Tab counts: All=100, Approved=X, Pending=Y, Rejected=Z (all accurate)

- [ ] **Coordinator Views Campaign Page**:
  - Request count shows: ~40% (org + municipality filtered)
  - Request list displays: Only requests in their organizations/coverage areas
  - Request cards for other orgs: NOT visible
  - Tab counts: Only include filtered requests

- [ ] **Stakeholder Views Campaign Page**:
  - Request count shows: ~20% (own requests only)
  - Request list displays: Only their own requests
  - Other stakeholders' requests: NOT visible
  - Tab counts: Only include own requests

---

#### 16.2: Permission-Based Action Buttons

Test that action buttons appear only when user has permission:

**Test Scenario**: Coordinator viewing pending request

**Tests**:
- [ ] User HAS `request.review` permission:
  - "Review" button: VISIBLE
  - Button click → opens decision modal

- [ ] User LACKS `request.review` permission:
  - "Review" button: HIDDEN
  - Attempting direct API call → 403 INSUFFICIENT_PERMISSION

- [ ] Request in REVIEW_ACCEPTED state AND user has `request.confirm`:
  - "Confirm" button: VISIBLE (if requester)
  - "Decline" button: VISIBLE (if requester)

- [ ] Request in PENDING_REVIEW state AND user lacks `request.review`:
  - No action buttons visible
  - Empty state message: "You don't have permission to review this request"

---

#### 16.3: Field Restrictions in Form

Test that form fields are disabled/hidden based on authority:

**Test Scenario**: Creating event in event modal

**Tests**:
- [ ] **Non-Admin Coordinator**:
  - Coordinator field: DISABLED, pre-filled with current user
  - User cannot type in coordinator field
  - Stakeholder dropdown: FILTERED to their organizations only

- [ ] **Admin**:
  - Coordinator field: ENABLED, dropdown lists all coordinators
  - Can select any coordinator
  - Stakeholder dropdown: FILTERED but can search/select from full list

---

#### 16.4: Empty State Rendering

Test UI renders correctly when no records match filters:

**Test Scenario**: Stakeholder with no requests

**Tests**:
- [ ] Request list is empty
- [ ] Empty state message displays: "You haven't created any requests yet"
- [ ] Call-to-action button: "Create Request" visible and clickable

---

#### 16.5: Error Handling

Test that error responses are displayed correctly:

**Test Scenario**: User tries action but lacks permission

**Tests**:
- [ ] API returns 403 INSUFFICIENT_PERMISSION
- [ ] Frontend displays error modal with message: "You don't have permission to review requests"
- [ ] Error reason code visible in browser console
- [ ] Modal has "Dismiss" button to close
- [ ] Page state remains intact (no crash)

---

### Step 17: E2E Workflow Validation

**Objective**: Test complete workflows with multiple users across all phases

#### 17.1: Happy Path Workflow (Admin → Coordinator → Stakeholder)

**Scenario**: Admin creates request, Coordinator reviews, Stakeholder confirms, Coordinator publishes event

**Steps**:
```
1. Admin: POST /api/requests (creates request)
   Input: { eventTitle, location, requestedDate, organization, requester }
   Expected: { success: true, data: { Request_ID: "REQ-001", status: "PENDING_REVIEW" } }
   ✓ Verify: request.statusHistory has 1 entry (created)

2. Coordinator: GET /api/requests/me (lists own requests)
   Expected: Filtered list includes REQ-001
   ✓ Verify: grant_reason shows "org_match" or "coverage_match"

3. Coordinator: POST /api/requests/REQ-001/review-decision
   Input: { action: "accept", notes: "Approved" }
   Expected: { success: true, data: { status: "REVIEW_ACCEPTED" } }
   ✓ Verify: request.decisionHistory has 1 entry
   ✓ Verify: audit trail shows coordinator's authority check

4. Stakeholder: GET /api/requests/me (lists own requests)
   Expected: REQ-001 visible with status REVIEW_ACCEPTED
   ✓ Verify: allowedActions includes canConfirm=true

5. Stakeholder: POST /api/requests/REQ-001/confirm
   Input: { action: "confirm" }
   Expected: { success: true, data: { status: "APPROVED" } }
   ✓ Verify: request.statusHistory shows approval timestamp

6. Coordinator: POST /api/events
   Input: { title, location, startDate, category }
   Expected: { success: true, data: { Event_ID: "EVT-001" } }
   ✓ Verify: event linked to REQ-001

7. Coordinator: POST /api/events/EVT-001/publish
   Input: {}
   Expected: { success: true, data: { status: "Completed", linkedRequest: { status: "APPROVED" } } }
   ✓ Verify: Event status = "Completed"
   ✓ Verify: Request status = "APPROVED"
   ✓ Verify: Audit trail shows publication timestamp
```

**Validation Checks**:
- All state transitions occurred correctly
- Audit trail complete with all actions
- Linked request and event both updated
- All timestamps are valid ISO 8601

---

#### 17.2: Reschedule Workflow

**Scenario**: Reviewer reschedules, requester confirms new date

**Steps**:
```
1. Admin: POST /api/requests (creates request for June 15)
   Expected: REQ-002 created, status PENDING_REVIEW

2. Coordinator: POST /api/requests/REQ-002/review-decision
   Input: { action: "reschedule", proposedDate: "2025-07-01", notes: "July 1st available" }
   Expected: status = REVIEW_RESCHEDULED
   ✓ Verify: rescheduleProposal { proposedDate: "2025-07-01", proposedBy: coordinator_id }

3. Stakeholder: GET /api/requests/REQ-002 (fetches details)
   Expected: rescheduleProposal visible in response
   ✓ Verify: allowedActions.canConfirm = true

4. Stakeholder: POST /api/requests/REQ-002/confirm
   Input: { action: "confirm" }
   Expected: status = APPROVED (with rescheduled date)
   ✓ Verify: event.Start_Date updated to July 1st

5. Coordinator: POST /api/events (creates event with rescheduled date)
   Expected: Event created with Start_Date = July 1st
```

**Validation Checks**:
- Reschedule proposal properly captured
- Event created with correct rescheduled date
- All dates are consistent across request and event

---

#### 17.3: Authority Mismatch Scenario

**Scenario**: Low-authority user tries to review high-authority request

**Steps**:
```
1. Operational Admin (authority 80): Creates request
   Expected: REQ-003 created

2. Coordinator (authority 60): Tries POST /api/requests/REQ-003/review-decision
   Input: { action: "accept" }
   Expected: 403 AUTHORITY_INSUFFICIENT
   Response: { reason: "AUTHORITY_INSUFFICIENT", reviewerAuthority: 60, requesterAuthority: 80 }
   ✓ Verify: Request NOT updated
   ✓ Verify: Audit log shows failed attempt

3. System Admin (authority 100): POST /api/requests/REQ-003/review-decision
   Input: { action: "accept" }
   Expected: 200 OK (admin bypasses hierarchy)
   ✓ Verify: Request updated to REVIEW_ACCEPTED
```

---

#### 17.4: Permission Denied Scenario

**Scenario**: User without specific permission tries action

**Steps**:
```
1. User without CAN_REVIEW_REQUESTS permission:
   POST /api/requests/REQ-001/review-decision
   Expected: 403 INSUFFICIENT_PERMISSION
   Response: { reason: "INSUFFICIENT_PERMISSION", requiredPermission: "request.review" }
   ✓ Verify: Request NOT modified
   ✓ Verify: No audit entry created

2. User without CAN_CREATE_EVENT permission:
   POST /api/events
   Expected: 403 INSUFFICIENT_PERMISSION
   ✓ Verify: Event NOT created

3. Non-admin tries POST /api/requests/REQ-001/assign-coordinator:
   Expected: 403 ADMIN_ONLY
   Response: { reason: "ADMIN_ONLY" }
```

---

#### 17.5: Coordinator Selection Scenario

**Scenario**: Admin assigns coordinator from multiple matches

**Steps**:
```
1. Admin: POST /api/requests/REQ-004/assign-coordinator
   Input: {} (no coordinatorId specified)
   
   Case 1: Single matching coordinator
   Expected: 200 OK
   Response: { data: { autoAssigned: true, assignedCoordinator: {...} } }
   ✓ Verify: request.coordinator_id updated
   
   Case 2: Multiple matching coordinators
   Expected: 200 OK
   Response: { data: { requiresSelection: true, coordinators: [list] } }
   ✓ Verify: Sorted by isPrimary DESC, name ASC
   
   Case 3: No matching coordinators
   Expected: 400 NO_COORDINATORS_AVAILABLE
   Response: { reason: "NO_COORDINATORS_AVAILABLE", searched: {...} }
```

---

## Test Execution Plan

### Setup Phase

1. **Create Test Database Seed**:
   - 5 test users with different authorities (100, 80, 60, 30, 20)
   - 3 organizations
   - 5 municipalities with coverage areas
   - 10 test requests in various states

2. **Generate Test Tokens**:
   - JWT tokens for each test user
   - Tokens with proper authority/permission claims
   - Tokens with missing permissions (for permission denial tests)

3. **Setup Test Environment**:
   - Staging database isolated from production
   - Test API endpoint URLs
   - Error logging configured

### Execution Phase

1. **Run Backend Validation Tests** (15.1-15.6)
   - Execute via curl or Postman
   - Verify HTTP status codes
   - Validate response formats
   - Check audit logs

2. **Run Frontend Validation Tests** (16.1-16.5)
   - Manual browser testing with each user role
   - Verify UI rendering
   - Check button visibility
   - Test error messages

3. **Run E2E Workflow Tests** (17.1-17.5)
   - Execute complete workflows
   - Verify all state transitions
   - Check audit trails
   - Validate linked data

---

## Validation Checklist

### Backend Validation ✓
- [ ] All authority filtering rules working
- [ ] All permission checks enforced
- [ ] All authority hierarchy validations pass
- [ ] All field locking rules apply
- [ ] All state transitions correct
- [ ] All audit trails recorded

### Frontend Validation ✓
- [ ] Admin sees 100% of requests
- [ ] Coordinator sees org+coverage filtered requests
- [ ] Stakeholder sees only own requests
- [ ] Action buttons appear based on permissions
- [ ] Form fields locked/unlocked by authority
- [ ] Error messages display correctly

### E2E Validation ✓
- [ ] Happy path workflow completes successfully
- [ ] Reschedule workflow handles date changes
- [ ] Authority mismatch blocks low-auth users
- [ ] Permission denials return proper errors
- [ ] Coordinator selection works with 0/1/multiple matches
- [ ] All audit trails complete and accurate

---

## Success Criteria

✅ **All tests pass**:
- 0 failing tests in backend validation
- 0 failing tests in frontend validation
- 0 failing tests in E2E workflows

✅ **Performance acceptable**:
- API response times < 500ms for list endpoints
- UI renders < 2s for dashboard load
- Permission checks < 50ms per request

✅ **Security verified**:
- No unauthorized access observed
- Permission gates properly enforced
- Authority hierarchy properly validated

✅ **Documentation complete**:
- Test results recorded
- Test cases documented
- Known issues tracked

---

## Known Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Auth token expiration during tests | Medium | Use long-lived test tokens |
| Database state inconsistency | Medium | Use rollback/reset between test runs |
| Timezone differences in date handling | Medium | Use UTC timestamps only |
| Permission caching staleness | Low | Clear cache before test runs |
| Multiple coordinators with same authority | Medium | Implement tiebreaker logic (name ASC) |

---

## Next Steps

1. Prepare test environment and seed data
2. Execute backend validation tests (15.1-15.6)
3. Execute frontend validation tests (16.1-16.5)
4. Execute E2E workflow tests (17.1-17.5)
5. Document results
6. Fix any issues found
7. Proceed to Phase 4 (Frontend Redesign)

