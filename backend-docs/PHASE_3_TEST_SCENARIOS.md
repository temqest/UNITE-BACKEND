# Phase 3 Test Scenarios - Detailed Test Cases

**Status**: 🔄 IN PROGRESS  
**Purpose**: Detailed test cases and expected outcomes for Phase 3 validation  
**Format**: API request examples + expected responses

---

## Test Environment Setup

### Test Users

```javascript
const testUsers = {
  admin: {
    id: "test-admin-001",
    email: "admin@test.local",
    authority: 100,
    role: "System Admin",
    permissions: ["*"], // All permissions
    organizations: ["ORG-A", "ORG-B", "ORG-C"],
    coverageAreas: [
      { municipality: "MUN-1", municipalityIds: ["MUN-1"] },
      { municipality: "MUN-2", municipalityIds: ["MUN-2"] }
    ]
  },
  
  opAdmin: {
    id: "test-op-admin-001",
    email: "opadmin@test.local",
    authority: 80,
    role: "Operational Admin",
    permissions: ["request.create", "request.read", "request.review", "request.approve", "event.create", "event.publish"],
    organizations: ["ORG-A"],
    coverageAreas: [{ municipality: "MUN-1", municipalityIds: ["MUN-1"] }]
  },
  
  coordinator: {
    id: "test-coord-001",
    email: "coordinator@test.local",
    authority: 60,
    role: "Coordinator",
    permissions: ["request.create", "request.read", "request.review", "event.create", "event.publish"],
    organizations: ["ORG-A"],
    coverageAreas: [{ municipality: "MUN-1", municipalityIds: ["MUN-1"] }]
  },
  
  stakeholder: {
    id: "test-stake-001",
    email: "stakeholder@test.local",
    authority: 30,
    role: "Stakeholder",
    permissions: ["request.create", "request.read", "request.confirm"],
    organizations: ["ORG-A"],
    coverageAreas: []
  },
  
  otherStakeholder: {
    id: "test-stake-002",
    email: "other@test.local",
    authority: 30,
    role: "Stakeholder",
    permissions: ["request.create", "request.read", "request.confirm"],
    organizations: ["ORG-B"],
    coverageAreas: []
  }
};
```

### Test Requests (Pre-created)

```javascript
const testRequests = {
  req1: {
    Request_ID: "REQ-TEST-001",
    Event_Title: "Blood Donation Drive",
    made_by_id: testUsers.stakeholder.id,
    organizationId: "ORG-A",
    municipality: "MUN-1",
    Status: "PENDING_REVIEW",
    coordinator_id: null,
    made_by_authority: 30
  },
  
  req2: {
    Request_ID: "REQ-TEST-002",
    Event_Title: "Health Awareness",
    made_by_id: testUsers.otherStakeholder.id,
    organizationId: "ORG-B",
    municipality: "MUN-2",
    Status: "PENDING_REVIEW",
    coordinator_id: null,
    made_by_authority: 30
  },
  
  req3: {
    Request_ID: "REQ-TEST-003",
    Event_Title: "Training Session",
    made_by_id: testUsers.opAdmin.id,
    organizationId: "ORG-A",
    municipality: "MUN-1",
    Status: "PENDING_REVIEW",
    coordinator_id: null,
    made_by_authority: 80
  }
};
```

---

## Test Case 15.1: Authority Filtering

### TC 15.1.1: Admin Sees All Requests

**Precondition**: Authenticated as admin user

**Request**:
```bash
curl -X GET http://localhost:3000/api/requests/me \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json"
```

**Expected Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "Request_ID": "REQ-TEST-001",
      "Event_Title": "Blood Donation Drive",
      "Status": "PENDING_REVIEW",
      "made_by_id": "test-stake-001",
      "_diagnosticMatchType": "admin_override"
    },
    {
      "Request_ID": "REQ-TEST-002",
      "Event_Title": "Health Awareness",
      "Status": "PENDING_REVIEW",
      "made_by_id": "test-stake-002",
      "_diagnosticMatchType": "admin_override"
    },
    {
      "Request_ID": "REQ-TEST-003",
      "Event_Title": "Training Session",
      "Status": "PENDING_REVIEW",
      "made_by_id": "test-op-admin-001",
      "_diagnosticMatchType": "admin_override"
    }
  ],
  "pagination": { "total": 3, "page": 1, "pages": 1 }
}
```

**Validation**:
- ✓ All 3 requests returned
- ✓ Requests from different orgs included
- ✓ `_diagnosticMatchType` = "admin_override"

---

### TC 15.1.2: Coordinator Sees Organization-Filtered Requests

**Precondition**: Authenticated as coordinator (ORG-A, MUN-1)

**Request**:
```bash
curl -X GET http://localhost:3000/api/requests/me \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -H "Content-Type: application/json"
```

**Expected Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "Request_ID": "REQ-TEST-001",
      "Event_Title": "Blood Donation Drive",
      "Status": "PENDING_REVIEW",
      "made_by_id": "test-stake-001",
      "_diagnosticMatchType": "org_match"
    },
    {
      "Request_ID": "REQ-TEST-003",
      "Event_Title": "Training Session",
      "Status": "PENDING_REVIEW",
      "made_by_id": "test-op-admin-001",
      "_diagnosticMatchType": "org_match"
    }
  ],
  "pagination": { "total": 2, "page": 1, "pages": 1 }
}
```

**Validation**:
- ✓ Only 2 requests returned (REQ-001, REQ-003 in ORG-A)
- ✓ REQ-002 (ORG-B) NOT included
- ✓ `_diagnosticMatchType` = "org_match"

---

### TC 15.1.3: Stakeholder Sees Only Own Requests

**Precondition**: Authenticated as stakeholder (test-stake-001)

**Request**:
```bash
curl -X GET http://localhost:3000/api/requests/me \
  -H "Authorization: Bearer <STAKEHOLDER_TOKEN>" \
  -H "Content-Type: application/json"
```

**Expected Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "Request_ID": "REQ-TEST-001",
      "Event_Title": "Blood Donation Drive",
      "Status": "PENDING_REVIEW",
      "made_by_id": "test-stake-001",
      "_diagnosticMatchType": "direct_creator"
    }
  ],
  "pagination": { "total": 1, "page": 1, "pages": 1 }
}
```

**Validation**:
- ✓ Only 1 request returned (own request)
- ✓ REQ-002, REQ-003 NOT included
- ✓ `_diagnosticMatchType` = "direct_creator"

---

## Test Case 15.2: Permission Checks

### TC 15.2.1: User Without Review Permission Denied

**Precondition**: User lacks `request.review` permission

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/review-decision \
  -H "Authorization: Bearer <NO_REVIEW_PERM_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "notes": "Looks good"
  }'
```

**Expected Response** (403):
```json
{
  "success": false,
  "message": "Insufficient permissions for action: review",
  "reason": "INSUFFICIENT_PERMISSION",
  "requiredPermission": "request.review"
}
```

**Validation**:
- ✓ HTTP 403 returned
- ✓ reason = "INSUFFICIENT_PERMISSION"
- ✓ requiredPermission field shows exact permission needed
- ✓ Request NOT updated (verify status still PENDING_REVIEW)

---

### TC 15.2.2: User With Permission Can Review

**Precondition**: User HAS `request.review` permission

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/review-decision \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "notes": "Approved"
  }'
```

**Expected Response** (200):
```json
{
  "success": true,
  "message": "Request accept completed successfully",
  "data": {
    "request": {
      "Request_ID": "REQ-TEST-001",
      "Status": "REVIEW_ACCEPTED"
    }
  }
}
```

**Validation**:
- ✓ HTTP 200 returned
- ✓ Request status changed to REVIEW_ACCEPTED

---

## Test Case 15.3: Authority Hierarchy

### TC 15.3.1: Lower Authority Cannot Review Higher Authority

**Precondition**: 
- Requester authority: 80 (Operational Admin)
- Reviewer authority: 60 (Coordinator)

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-003/review-decision \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "notes": "Accepted"
  }'
```

**Expected Response** (403):
```json
{
  "success": false,
  "message": "Cannot accept request from higher-authority requester",
  "reason": "AUTHORITY_INSUFFICIENT",
  "reviewerAuthority": 60,
  "requesterAuthority": 80
}
```

**Validation**:
- ✓ HTTP 403 returned
- ✓ reason = "AUTHORITY_INSUFFICIENT"
- ✓ Both authority levels shown
- ✓ Request NOT updated

---

### TC 15.3.2: Higher Authority Can Review Lower Authority

**Precondition**:
- Requester authority: 30 (Stakeholder)
- Reviewer authority: 60 (Coordinator)

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/review-decision \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "notes": "Approved"
  }'
```

**Expected Response** (200):
```json
{
  "success": true,
  "message": "Request accept completed successfully",
  "data": {
    "request": {
      "Request_ID": "REQ-TEST-001",
      "Status": "REVIEW_ACCEPTED"
    }
  }
}
```

**Validation**:
- ✓ HTTP 200 returned
- ✓ Request accepted successfully
- ✓ Authority hierarchy satisfied (60 >= 30)

---

### TC 15.3.3: Admin Can Bypass Authority Hierarchy

**Precondition**:
- Requester authority: 80
- Reviewer authority: 100 (Admin)

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-003/review-decision \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "accept",
    "notes": "Admin override"
  }'
```

**Expected Response** (200):
```json
{
  "success": true,
  "message": "Request accept completed successfully",
  "data": {
    "request": {
      "Request_ID": "REQ-TEST-003",
      "Status": "REVIEW_ACCEPTED"
    }
  }
}
```

**Validation**:
- ✓ HTTP 200 returned (admin bypasses hierarchy)
- ✓ Request accepted successfully
- ✓ No AUTHORITY_INSUFFICIENT error

---

## Test Case 15.4: Field Locking

### TC 15.4.1: Non-Admin Locked to Self as Coordinator

**Precondition**: Authenticated as coordinator (authority 60)

**Request**:
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Blood Drive",
    "location": "Community Center",
    "startDate": "2025-06-15",
    "category": "blood_donation",
    "coordinatorId": "different-user-id"
  }'
```

**Expected Response** (201):
```json
{
  "success": true,
  "message": "Event created successfully",
  "data": {
    "Event_ID": "EVT-001",
    "event": {
      "coordinator_id": "test-coord-001",
      "Event_Title": "Blood Drive",
      "Location": "Community Center"
    }
  }
}
```

**Validation**:
- ✓ HTTP 201 returned
- ✓ Event created
- ✓ **`coordinator_id` = "test-coord-001"** (self, NOT "different-user-id")
- ✓ Field forced regardless of input

---

### TC 15.4.2: Non-Admin Restricted to Organization Stakeholders

**Precondition**: 
- Coordinator in ORG-A
- Attempting to assign stakeholder from ORG-B

**Request**:
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Blood Drive",
    "location": "Community Center",
    "startDate": "2025-06-15",
    "category": "blood_donation",
    "stakeholderId": "test-stake-002"
  }'
```

**Expected Response** (400):
```json
{
  "success": false,
  "message": "Stakeholder not in authorized scope",
  "reason": "STAKEHOLDER_OUT_OF_SCOPE"
}
```

**Validation**:
- ✓ HTTP 400 returned
- ✓ reason = "STAKEHOLDER_OUT_OF_SCOPE"
- ✓ Event NOT created

---

### TC 15.4.3: Admin Can Set Both Fields Freely

**Precondition**: Authenticated as admin

**Request**:
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Blood Drive",
    "location": "Community Center",
    "startDate": "2025-06-15",
    "category": "blood_donation",
    "coordinatorId": "test-coord-001",
    "stakeholderId": "test-stake-002"
  }'
```

**Expected Response** (201):
```json
{
  "success": true,
  "message": "Event created successfully",
  "data": {
    "Event_ID": "EVT-002",
    "event": {
      "coordinator_id": "test-coord-001",
      "stakeholder_id": "test-stake-002"
    }
  }
}
```

**Validation**:
- ✓ HTTP 201 returned
- ✓ coordinator_id = specified value (not forced)
- ✓ stakeholder_id = specified value (no scope restriction)
- ✓ Admin has full control

---

## Test Case 15.5: State Transitions

### TC 15.5.1: Pending → Accepted Transition

**Initial State**: REQ-TEST-001, Status = PENDING_REVIEW

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/review-decision \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -d '{ "action": "accept", "notes": "Approved" }'
```

**Expected State Change**:
```
PENDING_REVIEW → REVIEW_ACCEPTED
```

**Validation**:
- ✓ Status field updated
- ✓ statusHistory entry added
- ✓ decisionHistory entry created

---

### TC 15.5.2: Accepted → Approved Transition

**Initial State**: REQ-TEST-001, Status = REVIEW_ACCEPTED

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/confirm \
  -H "Authorization: Bearer <STAKEHOLDER_TOKEN>" \
  -d '{ "action": "confirm" }'
```

**Expected State Change**:
```
REVIEW_ACCEPTED → APPROVED
```

**Validation**:
- ✓ Status changed to APPROVED
- ✓ statusHistory updated
- ✓ Event can now be created/published

---

### TC 15.5.3: Cannot Transition from Terminal State

**Initial State**: REQ-TEST-001, Status = APPROVED

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/review-decision \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -d '{ "action": "accept" }'
```

**Expected Response** (400):
```json
{
  "success": false,
  "message": "Cannot review request in APPROVED state"
}
```

**Validation**:
- ✓ HTTP 400 returned
- ✓ State NOT changed (remains APPROVED)

---

## Test Case 15.6: Audit Trail

### TC 15.6.1: Decision Logged in decisionHistory

**Action**: Coordinator accepts request

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/review-decision \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -d '{ "action": "accept", "notes": "Approved for June 15" }'
```

**Verify in Database** (GET request details):
```json
{
  "decisionHistory": [
    {
      "action": "accept",
      "actor": {
        "id": "test-coord-001",
        "role": "Coordinator",
        "authority": 60
      },
      "timestamp": "2025-06-10T14:30:00Z",
      "notes": "Approved for June 15",
      "grant_reason": "request.review permission granted"
    }
  ]
}
```

**Validation**:
- ✓ action recorded correctly
- ✓ actor details stored (id, role, authority)
- ✓ timestamp is valid ISO 8601
- ✓ grant_reason shows permission used

---

### TC 15.6.2: Reschedule Includes Proposed Date

**Action**: Coordinator reschedules request

**Request**:
```bash
curl -X POST http://localhost:3000/api/requests/REQ-TEST-001/review-decision \
  -H "Authorization: Bearer <COORDINATOR_TOKEN>" \
  -d '{
    "action": "reschedule",
    "proposedDate": "2025-07-01",
    "notes": "July 1st available"
  }'
```

**Verify in Database**:
```json
{
  "rescheduleProposal": {
    "proposedDate": "2025-07-01",
    "proposedBy": "test-coord-001",
    "proposedAt": "2025-06-10T14:30:00Z",
    "notes": "July 1st available"
  },
  "decisionHistory": [
    {
      "action": "reschedule",
      "proposedDate": "2025-07-01"
    }
  ]
}
```

**Validation**:
- ✓ proposedDate stored in rescheduleProposal
- ✓ proposedBy identifies reviewer
- ✓ decisionHistory includes proposed date

---

## Test Execution Instructions

### Setup
```bash
# 1. Load test seed data
npm run seed:test-data

# 2. Generate test tokens
export ADMIN_TOKEN=$(node generate-token.js --user test-admin-001)
export COORDINATOR_TOKEN=$(node generate-token.js --user test-coord-001)
export STAKEHOLDER_TOKEN=$(node generate-token.js --user test-stake-001)
```

### Run Tests
```bash
# Option 1: Manual via curl
./test-scripts/run-tc-15.1.sh

# Option 2: Automated via test runner
npm run test:phase-3

# Option 3: Postman collection
postman/PHASE_3_TEST_COLLECTION.json
```

### Validation
```bash
# Check database state after each test
npm run verify:request-state REQ-TEST-001

# Review audit logs
npm run logs:audit --request REQ-TEST-001
```

---

## Success Criteria

All test cases must pass:
- ✅ Authority filtering returns correct subsets
- ✅ Permission checks block unauthorized access
- ✅ Authority hierarchy validates correctly
- ✅ Field locking prevents unauthorized changes
- ✅ State transitions follow allowed paths
- ✅ Audit trails record all changes

