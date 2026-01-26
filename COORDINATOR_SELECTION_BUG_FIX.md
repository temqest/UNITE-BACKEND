# Coordinator Selection Bug Fix - Root Cause Analysis & Solution

## Problem Statement
**User Issue**: "I am selecting Dave as the coordinator, but Ben Carlo Valiente is being assigned instead"

**Scope**: When creating a Blood Drive event request, the manually selected coordinator is being ignored and auto-assigned to a different coordinator (Ben instead of Dave).

---

## Root Cause Analysis

### The Bug Flow

```
FRONTEND (event-creation-modal.tsx)
  ↓ sends {coordinator: "dave_id", ...other_fields}
  ↓
REQUEST BODY
  {coordinator: "dave_id", Event_Title: "...", ...}
  ↓
VALIDATOR (eventRequest.validators.js)
  ✓ Accepts 'coordinator' field (unknown(true))
  ✓ BUT expects 'coordinatorId' for business logic
  ✓ Field name NOT normalized
  ↓
CONTROLLER (eventRequest.controller.js) - PROBLEM HERE
  ❌ Uses req.body instead of req.validatedData
  ❌ Never checks if 'coordinator' → 'coordinatorId' mapping happened
  ↓
SERVICE (eventRequest.service.js)
  ❌ Checks for requestData.coordinatorId
  ❌ Finds nothing (because frontend sent 'coordinator')
  ❌ Falls through to auto-assignment logic
  ↓
RESULT: Auto-assigned coordinator (Ben) instead of manually selected one (Dave)
```

### Why This Happened

1. **Frontend sends**: `coordinator: "dave_id"` (JavaScript naming convention)
2. **Backend expects**: `coordinatorId` (database convention)
3. **No normalization**: Controller doesn't map frontend → backend field names
4. **Auto-assignment triggers**: Service sees no coordinatorId, uses auto-assignment fallback

### Code Evidence

**Frontend sends** (line 154 in event-creation-modal.tsx):
```typescript
const eventData: TrainingEventData = {
  eventTitle,
  coordinator,      // ← Frontend field name
  stakeholder,
  // ...
};
```

**Validator allows it** (line 44 in eventRequest.validators.js):
```javascript
coordinator: Joi.string().optional() // ← Frontend field name
// .unknown(true) means extra fields pass through without validation
```

**Controller doesn't normalize** (line 28 in eventRequest.controller.js - BEFORE FIX):
```javascript
const requestData = req.body; // ← Raw data, not validated
// No normalization from 'coordinator' → 'coordinatorId'
```

**Service checks wrong field** (line 286 in eventRequest.service.js):
```javascript
if (requester.authority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN && requestData.coordinatorId) {
  // ← Checks for 'coordinatorId', but frontend sent 'coordinator'
  // ← This condition is FALSE, so manual selection is ignored
}
// Falls through to auto-assignment:
else {
  reviewer = await reviewerAssignmentService.assignReviewer(...);
  // ← Auto-assigns Ben instead
}
```

---

## The Fix

### Part 1: Controller - Normalize Field Names

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

```javascript
async createEventRequest(req, res) {
  try {
    const userId = req.user._id || req.user.id;
    // Use validated data instead of raw body
    const requestData = req.validatedData || req.body;
    
    // Normalize frontend field names to backend field names
    if (requestData.coordinator && !requestData.coordinatorId) {
      requestData.coordinatorId = requestData.coordinator;
    }
    
    if (requestData.stakeholder && !requestData.stakeholderId) {
      requestData.stakeholderId = requestData.stakeholder;
    }

    const request = await eventRequestService.createRequest(userId, requestData);
    // ...
  }
}
```

**What this does**:
- ✅ Uses `req.validatedData` (from middleware) instead of raw `req.body`
- ✅ Maps `coordinator` → `coordinatorId` if provided
- ✅ Maps `stakeholder` → `stakeholderId` if provided
- ✅ Ensures backend service receives expected field names

### Part 2: Validator - Explicit Support for Frontend Fields

**File**: `src/validators/eventRequests_validators/eventRequest.validators.js`

```javascript
const schema = Joi.object({
  // ... existing fields ...
  coordinatorId: Joi.string().optional(),
  // Frontend field names - should be normalized to backend names in controller
  coordinator: Joi.string().optional(),
  stakeholder: Joi.string().optional()
}).unknown(true);
```

**What this does**:
- ✅ Explicitly declares that both `coordinator` (frontend) and `coordinatorId` (backend) are valid
- ✅ Provides clear documentation of field mapping
- ✅ Allows graceful handling of either naming convention

### Part 3: Service - Support Both Admin & Stakeholder Manual Selection

**File**: `src/services/eventRequests_services/eventRequest.service.js`

```javascript
// Check if manual coordinator selection was provided (by admin or stakeholder)
const hasManualCoordinatorSelection = requestData.coordinatorId && 
                                    (requester.authority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN || 
                                     requester.authority < AUTHORITY_TIERS.COORDINATOR); // Admin or Stakeholder

if (hasManualCoordinatorSelection) {
  // Manual coordinator selection - respect user's choice
  const selectedCoordinatorId = requestData.coordinatorId;
  // ... validation and assignment logic ...
} else {
  // Use auto-assignment when no manual selection provided
  reviewer = await reviewerAssignmentService.assignReviewer(...);
}
```

**What this does**:
- ✅ Checks for manual coordinator selection from BOTH admins AND stakeholders
- ✅ Respects user's manual selection when provided
- ✅ Still falls back to auto-assignment when no manual selection
- ✅ Validates the selected coordinator is valid for the location/district

---

## Business Logic Clarification

Based on your requirements, the coordinator assignment should work as follows:

### Tier 1: Admin (Authority ≥ 80)
- **Coordinator selection**: Can select ANY valid coordinator
- **Stakeholder selection**: Can select ANY stakeholder from that coordinator's org
- **Implementation**: Manual selection is ALWAYS respected when provided

### Tier 2: Coordinator (60 ≤ Authority < 80)
- **Coordinator field**: LOCKED to themselves
- **Stakeholder selection**: Can select ANY stakeholder under their org + coverage area
- **Request visibility**: Only sees their own requests (not broadcast yet)
- **Implementation**: Manual coordinator selection NOT applicable (they can't change it)

### Tier 3: Stakeholder (Authority < 60)
- **Coordinator field**: Can select from valid coordinators in their area
- **Stakeholder field**: LOCKED to themselves
- **Request visibility**: Sees request assigned to their chosen coordinator + broadcast coordinators
- **Implementation**: Manual selection SHOULD be respected (the fix allows this)

**Key Change in Fix**: Stakeholders can now manually select a coordinator, and that selection will be respected instead of auto-assigned.

---

## Testing the Fix

### Test 1: Stakeholder Selects a Specific Coordinator
```
1. Log in as stakeholder "testing cam sur 2"
2. Create a new Blood Drive event
3. Select "Dave" as coordinator
4. Submit form
5. Check database: request.reviewer should be Dave
   - reviewer.userId = Dave's ID
   - reviewer.autoAssigned = false
   - reviewer.assignmentRule = "manual"
```

**Result**: ✅ Dave should be assigned (not Ben)

### Test 2: Admin Manually Selects Coordinator
```
1. Log in as admin
2. Create a new Blood Drive event
3. Select any coordinator
4. Submit form
5. Check database: request.reviewer should be selected coordinator
   - reviewer.autoAssigned = false
   - reviewer.assignmentRule = "manual"
```

**Result**: ✅ Selected coordinator should be assigned

### Test 3: Auto-Assignment Still Works
```
1. Delete all coordinatorId selection from frontend form
2. Stakeholder creates request
3. Check database: request.reviewer should be auto-assigned
   - reviewer.autoAssigned = true
   - reviewer.assignmentRule = "stakeholder-to-coordinator" or similar
```

**Result**: ✅ Auto-assignment should still work when no manual selection

### Automated Test
```bash
node tests/coordinatorSelectionFix.test.js
```

This runs 4 comprehensive tests covering all scenarios.

---

## Files Changed

### 1. `src/controller/eventRequests_controller/eventRequest.controller.js`
- **Change**: Lines 21-36
- **Lines added**: 8 lines
- **Purpose**: Normalize frontend field names and use validated data

### 2. `src/validators/eventRequests_validators/eventRequest.validators.js`
- **Change**: Lines 44-47
- **Lines added**: 3 lines
- **Purpose**: Explicitly support frontend field names

### 3. `src/services/eventRequests_services/eventRequest.service.js`
- **Change**: Lines 284-291
- **Lines modified**: 8 lines
- **Purpose**: Allow both admins and stakeholders to make manual selections

### 4. `tests/coordinatorSelectionFix.test.js` (NEW)
- **Purpose**: Comprehensive integration tests for the fix
- **Tests**: 4 scenarios covering all use cases

---

## Verification Checklist

- [ ] Code changes deployed to backend
- [ ] Run automated test: `node tests/coordinatorSelectionFix.test.js`
- [ ] Manual test with stakeholder selecting Dave → verify Dave is assigned
- [ ] Manual test with admin selecting specific coordinator → verify assignment
- [ ] Verify auto-assignment still works when no coordinator selected
- [ ] Check database: request.reviewer.assignmentRule = "manual" for manual selections
- [ ] Check database: request.reviewer.autoAssigned = false for manual selections
- [ ] Verify broadcast model still works (validCoordinators array populated)

---

## Impact Analysis

### ✅ Fixed
- Stakeholder manual coordinator selection now persists
- Admin manual coordinator selection now persists
- Field name mapping (frontend → backend) now automatic

### ✅ Preserved
- Auto-assignment still works when no coordinator selected
- Broadcast visibility still works (separate feature)
- Permission validation still enforced
- All existing workflows unaffected

### ℹ️ Notes
- Coordinator (Tier 2 users) cannot change their coordinator field (as designed)
- The fix respects the 3-tier user hierarchy
- No database migrations needed
- Backward compatible with existing requests

---

## Next Steps

1. **Deploy the fix** to development environment
2. **Run the test suite** to validate all scenarios
3. **Manual testing** with actual users (Dave and Ben)
4. **Verify in database** that correct coordinators are assigned
5. **Deploy to staging** and monitor for 24 hours
6. **Deploy to production** with confidence

---

## Questions & Clarifications

### Q: What if stakeholder selects an invalid coordinator?
**A**: Service validates:
- Coordinator must have authority between 60-79 (must be coordinator)
- Coordinator must have request.review permission
- Error thrown if validation fails

### Q: Does this break auto-assignment?
**A**: No. Auto-assignment only runs if NO `coordinatorId` is provided.
The logic is:
```javascript
if (hasManualCoordinatorSelection) {
  // Manual path
} else {
  // Auto-assignment path (existing logic)
}
```

### Q: What about the broadcast model?
**A**: Broadcast model (validCoordinators) is separate and still works:
- Still populates all valid coordinators
- Manual reviewer selection is independent
- Both can coexist

### Q: Why not just fix the frontend field name?
**A**: Good question! We could, but this way:
- ✅ Maintains frontend naming conventions (camelCase)
- ✅ Supports both field names (backward compatible)
- ✅ Controller is responsible for API adaptation
- ✅ Better abstraction between frontend and backend

