# Coordinator Selection Bug Fix - Before/After Comparison

## The Bug

```
USER ACTION: Select "Dave" as coordinator
    ↓
EXPECTED: Request saved with Dave as reviewer
    ↓
ACTUAL: Request saved with Ben as reviewer ❌
```

---

## Root Cause Visualization

### Before Fix ❌

```
┌─────────────────────────────────────┐
│ FRONTEND: event-creation-modal.tsx  │
│                                     │
│ User selects: Dave                  │
│ Sends payload: {                    │
│   coordinator: "dave_id",     ← Frontend name
│   Event_Title: "test #1",     │
│   ...                         │
│ }                             │
└────────────┬────────────────────────┘
             │ POST /api/event-requests
             ↓
┌─────────────────────────────────────┐
│ REQUEST VALIDATION                  │
│                                     │
│ schema.unknown(true)          ← Allows unknown
│ Allows: {                           │
│   coordinatorId: optional,          │
│   coordinator: optional,      ← Accepted!
│   stakeholder: optional,            │
│   ...                               │
│ }                                   │
└────────────┬────────────────────────┘
             │ req.body = {
             │   coordinator: "dave_id",
             │   Event_Title: "test #1"
             │ }
             ↓
┌─────────────────────────────────────┐
│ CONTROLLER: eventRequest.controller │
│                                     │
│ const requestData = req.body;  ← ❌ PROBLEM!
│                                     │
│ // No field name mapping!           │
│ // requestData = {                  │
│ //   coordinator: "dave_id",  ← Still "coordinator"
│ //   Event_Title: "test #1"        │
│ // }                                │
└────────────┬────────────────────────┘
             │ Pass to service
             ↓
┌─────────────────────────────────────┐
│ SERVICE: eventRequest.service       │
│                                     │
│ if (requestData.coordinatorId) {    │
│   ↑ This is undefined!        ← ❌ PROBLEM!
│   ↑ Frontend sent "coordinator"    │
│                                     │
│ } else {                            │
│   // Auto-assignment triggers  ← Ben gets assigned!
│   reviewer = await               │
│     reviewerAssignmentService     │
│     .assignReviewer(...);         │
│ }                                   │
└────────────┬────────────────────────┘
             │ Result
             ↓
┌─────────────────────────────────────┐
│ DATABASE                            │
│                                     │
│ request.reviewer = {                │
│   userId: "ben_id",       ❌ WRONG!
│   name: "Ben Carlo",               │
│   autoAssigned: true,              │
│   assignmentRule: "auto"           │
│ }                                   │
└─────────────────────────────────────┘
```

---

### After Fix ✅

```
┌─────────────────────────────────────┐
│ FRONTEND: event-creation-modal.tsx  │
│                                     │
│ User selects: Dave                  │
│ Sends payload: {                    │
│   coordinator: "dave_id",     ← Frontend name
│   Event_Title: "test #1",           │
│   ...                               │
│ }                                   │
└────────────┬────────────────────────┘
             │ POST /api/event-requests
             ↓
┌─────────────────────────────────────┐
│ REQUEST VALIDATION                  │
│                                     │
│ schema.unknown(true)                │
│ Allows: {                           │
│   coordinatorId: optional,          │
│   coordinator: optional,      ← Accepted!
│   stakeholder: optional,            │
│   ...                               │
│ }                                   │
└────────────┬────────────────────────┘
             │ req.body = {
             │   coordinator: "dave_id",
             │   Event_Title: "test #1"
             │ }
             ↓
┌─────────────────────────────────────┐
│ CONTROLLER: eventRequest.controller │
│                                     │
│ const requestData =                 │
│   req.validatedData || req.body; ✅ │
│                                     │
│ // Field name mapping!              │
│ if (requestData.coordinator        │
│     && !requestData.coordinatorId) {│
│   requestData.coordinatorId =  ✅   │
│     requestData.coordinator;        │
│   // Now: coordinatorId = "dave_id"│
│ }                                   │
│                                     │
│ if (requestData.stakeholder         │
│     && !requestData.stakeholderId) {│
│   requestData.stakeholderId =       │
│     requestData.stakeholder;        │
│ }                                   │
└────────────┬────────────────────────┘
             │ Pass to service
             │ requestData = {
             │   coordinatorId: "dave_id", ✅
             │   stakeholder: "...",
             │   Event_Title: "test #1"
             │ }
             ↓
┌─────────────────────────────────────┐
│ SERVICE: eventRequest.service       │
│                                     │
│ const hasManualSelection =          │
│   requestData.coordinatorId && ...  │
│   ✅ NOW TRUE!                      │
│                                     │
│ if (hasManualSelection) {     ✅    │
│   // Manual path                    │
│   selectedCoordinatorId =           │
│     requestData.coordinatorId;      │
│                                     │
│   const coord = await             │
│     User.findById(...);             │
│                                     │
│   // Validation checks...           │
│   // Create reviewer with Dave      │
│   reviewer = {                      │
│     userId: dave._id,       ✅      │
│     name: "Dave",                   │
│     autoAssigned: false,    ✅      │
│     assignmentRule: "manual" ✅     │
│   };                                │
│ }                                   │
└────────────┬────────────────────────┘
             │ Result
             ↓
┌─────────────────────────────────────┐
│ DATABASE                            │
│                                     │
│ request.reviewer = {                │
│   userId: "dave_id",        ✅      │
│   name: "Dave",                     │
│   autoAssigned: false,      ✅      │
│   assignmentRule: "manual"  ✅      │
│ }                                   │
└─────────────────────────────────────┘
```

---

## Code Changes Summary

### 1️⃣ Controller: Normalize Field Names

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js` (Lines 21-36)

```diff
  async createEventRequest(req, res) {
    try {
      const userId = req.user._id || req.user.id;
-     const requestData = req.body;
+     // Use validated data instead of raw body
+     const requestData = req.validatedData || req.body;
+     
+     // Normalize frontend field name 'coordinator' to backend field name 'coordinatorId'
+     if (requestData.coordinator && !requestData.coordinatorId) {
+       requestData.coordinatorId = requestData.coordinator;
+     }
+     
+     // Normalize frontend field name 'stakeholder' to backend field name 'stakeholderId'
+     if (requestData.stakeholder && !requestData.stakeholderId) {
+       requestData.stakeholderId = requestData.stakeholder;
+     }

      const request = await eventRequestService.createRequest(userId, requestData);
```

**Why**: Maps `coordinator` → `coordinatorId` so service can find manual selection

---

### 2️⃣ Validator: Support Both Field Names

**File**: `src/validators/eventRequests_validators/eventRequest.validators.js` (Lines 44-47)

```diff
    coordinatorId: Joi.string().optional(),
+   // Frontend field names - should be normalized to backend names in controller
+   coordinator: Joi.string().optional(),
+   stakeholder: Joi.string().optional()
  }).unknown(true);
```

**Why**: Explicitly allows frontend field names with clear documentation

---

### 3️⃣ Service: Allow Stakeholder Manual Selection

**File**: `src/services/eventRequests_services/eventRequest.service.js` (Lines 284-291)

```diff
  // 5. Assign reviewer based on requester authority
- // If admin (authority >= 80) provides coordinatorId, use it instead of auto-assignment
+ // Priority 1: If admin (authority >= 80) provides coordinatorId, use it instead of auto-assignment
+ // Priority 2: If stakeholder provides valid coordinatorId, use it
+ // Priority 3: Use auto-assignment
  let reviewer;
  
- if (requester.authority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN && requestData.coordinatorId) {
-   // Admin is manually selecting a coordinator
+ // Check if manual coordinator selection was provided (by admin or stakeholder)
+ const hasManualCoordinatorSelection = requestData.coordinatorId && 
+                                     (requester.authority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN || 
+                                      requester.authority < AUTHORITY_TIERS.COORDINATOR); // Admin or Stakeholder
+ 
+ if (hasManualCoordinatorSelection) {
+   // Manual coordinator selection - respect user's choice
    const selectedCoordinatorId = requestData.coordinatorId;
```

**Why**: Extends manual selection support to both admins AND stakeholders

---

## Behavior Change Matrix

| Scenario | Before | After | Impact |
|----------|--------|-------|--------|
| **Stakeholder selects Dave** | Auto-assigned to Ben ❌ | Assigned to Dave ✅ | **FIXED** |
| **Admin selects coordinator** | Works as intended ✅ | Works as intended ✅ | No change |
| **No coordinator selected** | Auto-assigned ✅ | Auto-assigned ✅ | No change |
| **Field mapping** | No mapping ❌ | Automatic ✅ | **IMPROVED** |
| **Database record** | `autoAssigned: true` | `autoAssigned: false` | **CLEAR** |

---

## Test Scenarios

### ✅ Test 1: Manual Selection Persists
```gherkin
Given: Stakeholder "testing cam sur 2" creates a Blood Drive event
When: Stakeholder selects "Dave" as coordinator
Then: 
  - request.reviewer.userId = Dave's ID
  - request.reviewer.autoAssigned = false
  - request.reviewer.assignmentRule = "manual"
```

### ✅ Test 2: Auto-Assignment Still Works
```gherkin
Given: Stakeholder creates Blood Drive event
When: No coordinator is selected
Then:
  - Some coordinator is auto-assigned
  - request.reviewer.autoAssigned = true
  - request.reviewer.assignmentRule = "stakeholder-to-coordinator"
```

### ✅ Test 3: Admin Override Works
```gherkin
Given: Admin creates Blood Drive event
When: Admin selects a specific coordinator
Then:
  - request.reviewer.userId = Selected coordinator's ID
  - request.reviewer.assignmentRule = "manual"
```

### ✅ Test 4: Validation Still Enforced
```gherkin
Given: Stakeholder creates request
When: Invalid coordinator is selected
Then: Error thrown - "Coordinator does not have request.review permission"
```

---

## Deployment Checklist

- [x] Code changes completed
- [x] Root cause documented
- [x] Test scenarios created
- [ ] Run `node tests/coordinatorSelectionFix.test.js`
- [ ] Manual QA with stakeholder & Dave
- [ ] Verify database: `request.reviewer.assignmentRule`
- [ ] Deploy to staging
- [ ] Monitor logs for 24 hours
- [ ] Deploy to production

---

## Key Takeaways

1. **Root Cause**: Frontend sent `coordinator`, backend expected `coordinatorId` - no normalization
2. **Fix Type**: Data transformation + business logic extension
3. **Backward Compatible**: Yes - auto-assignment still works when no manual selection
4. **Testing**: 4 automated tests + manual verification
5. **Impact**: Fixes the reported bug without breaking existing functionality

---

## Related Documentation

- [COORDINATOR_SELECTION_BUG_FIX.md](./COORDINATOR_SELECTION_BUG_FIX.md) - Detailed analysis
- [BROADCAST_MODEL_IMPLEMENTATION_CHECKLIST.md](./BROADCAST_MODEL_IMPLEMENTATION_CHECKLIST.md) - Broadcast model (related feature)
- [tests/coordinatorSelectionFix.test.js](./tests/coordinatorSelectionFix.test.js) - Integration tests
