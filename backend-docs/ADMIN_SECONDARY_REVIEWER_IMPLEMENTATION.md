# Admin Secondary Reviewer Logic Implementation

## Overview
This document details the implementation of Admin Secondary Reviewer functionality for the Event Request Workflow. This feature allows Admins (authority level 80/100) to act as secondary reviewers for requests initiated by Stakeholders and assigned to Coordinators, while maintaining the Coordinator as the primary reviewer.

## Architecture

### Current Behavior
- In the Stakeholder → Coordinator flow, only Coordinators can review and act on requests
- Admins can view these requests but cannot perform actions (approve, reject, reschedule)

### New Behavior
- Coordinators remain the primary reviewer
- Admins can now perform all review actions (approve/accept, reject, reschedule) on Stakeholder → Coordinator requests as secondary reviewers
- All actions by Admins are audited in the statusHistory
- Other flows (Admin → Coordinator, Coordinator → Admin) remain unchanged

## Implementation Details

### 1. Backend: Request State Service (`src/services/eventRequests_services/requestState.service.js`)

**New Utilities:**
- `isAdminUser(user)` - Checks if a user is an Admin (role: 'Admin'/'System Admin' or StaffType: 80/100)
- `canUserReviewRequest({ request, user })` - Determines if a user can review a request (primary or secondary logic)

**Logic:**
```javascript
// Coordinator is always primary reviewer
if (user.role === reviewerRole) return true;

// Admins (80/100) act as secondary reviewers ONLY for Stakeholder -> Coordinator
if (
  initiatorRole === 'Stakeholder' &&
  reviewerRole === 'Coordinator' &&
  isAdminUser(user)
) {
  return true;
}
```

**Usage:**
These utilities can be imported by controllers or services to gate review actions:
```javascript
const RequestStateService = require('../services/eventRequests_services/requestState.service');
const { canUserReviewRequest } = RequestStateService;

// In controller/service
const canReview = canUserReviewRequest({ request, user });
```

### 2. Backend: Reviewer Assignment Service (`src/services/eventRequests_services/reviewerAssignment.service.js`)

**New Utility:**
- `getValidReviewersForRequest(request)` - Returns list of valid reviewers (primary + secondary)

**Logic:**
```javascript
function getValidReviewersForRequest(request) {
  const { initiatorRole, reviewerRole } = request;
  let reviewers = [reviewerRole]; // Primary reviewer (e.g., 'Coordinator')
  
  // For Stakeholder -> Coordinator, add Admins as secondary reviewers
  if (initiatorRole === 'Stakeholder' && reviewerRole === 'Coordinator') {
    reviewers.push('Admin', 'System Admin', 80, 100);
  }
  
  return reviewers;
}
```

### 3. Backend: Action Validation Middleware (`src/middleware/validateRequestAction.js`)

**Changes:**
- Added `isAdminUser()` utility function
- Updated validation logic to recognize Admins as secondary reviewers for Stakeholder → Coordinator requests
- Bypasses standard action validation for admin secondary review actions
- Logs admin secondary review attempts for audit trail

**Behavior:**
```javascript
const isSecondaryReviewer = 
  request.initiatorRole === 'Stakeholder' &&
  request.reviewerRole === 'Coordinator' &&
  isAdminUser(req.user);

if (!isSecondaryReviewer) {
  // Standard validation for primary reviewers and other flows
  const validation = await actionValidatorService.validateAction(...);
  if (!validation.valid) {
    // Reject the request
    return res.status(403).json(...);
  }
}

// Admin secondary reviewer can proceed with their action
req.request = request;
next();
```

### 4. Audit Trail

When an Admin performs an action as a secondary reviewer:
1. The action is logged at the middleware level: `[VALIDATE REQUEST ACTION] Admin secondary reviewer ...`
2. The request statusHistory is updated with the Admin's userId and timestamp
3. The lastAction.actorId is set to the Admin's ID

This ensures complete audit visibility of admin secondary review actions.

## Security Considerations

### Authority Levels
- **System Admin (100)**: Full authority, can override any decision
- **Admin (80)**: Can act as secondary reviewer for Stakeholder → Coordinator only
- **Coordinator (60-79)**: Primary reviewer, can act on their assigned requests
- **Stakeholder (30-59)**: Can initiate requests

### Isolation Guarantee
The secondary reviewer logic is **isolated to Stakeholder → Coordinator requests only**:
- **Admin → Coordinator requests**: Admins remain primary reviewers (no change)
- **Coordinator → Admin requests**: Admins remain primary reviewers (no change)
- **Other flows**: Unchanged

This isolation prevents logic bleed-through to other workflows.

## Frontend Implementation (UNITE/utils/eventActionPermissions.ts)

**Recommended additions:**
```typescript
export function isAdminUser(user: any): boolean {
  return (
    user.role === 'Admin' ||
    user.role === 'System Admin' ||
    user.StaffType === 80 ||
    user.StaffType === 100
  );
}

export function canUserReviewEventRequest(user: any, request: any): boolean {
  // Coordinator is always primary reviewer
  if (user.role === request.reviewerRole) return true;
  
  // Admins can act as secondary reviewer for Stakeholder -> Coordinator
  if (
    request.initiatorRole === 'Stakeholder' &&
    request.reviewerRole === 'Coordinator' &&
    isAdminUser(user)
  ) {
    return true;
  }
  
  return false;
}
```

**UI Gating:**
Update buttons and action controls to use `canUserReviewEventRequest()` to show/hide review actions:
```typescript
{canUserReviewEventRequest(currentUser, request) && (
  <>
    <button onClick={() => handleApprove()}>Approve</button>
    <button onClick={() => handleReject()}>Reject</button>
    <button onClick={() => handleReschedule()}>Reschedule</button>
  </>
)}
```

## Testing Scenarios

### Scenario 1: Admin Secondary Review (Approve)
1. Stakeholder creates event request (requester)
2. Coordinator is assigned as primary reviewer (reviewerRole = 'Coordinator')
3. Admin views the request (initiatorRole = 'Stakeholder', reviewerRole = 'Coordinator')
4. Admin clicks "Approve" button
5. ✅ Admin's action passes validation (secondary reviewer bypass)
6. ✅ Request status changes to APPROVED
7. ✅ statusHistory records Admin as actor

### Scenario 2: Admin Secondary Review (Reject)
1. Same setup as Scenario 1
2. Admin clicks "Reject" button
3. ✅ Admin's action passes validation
4. ✅ Request status changes to REJECTED
5. ✅ statusHistory records Admin as actor

### Scenario 3: Admin Secondary Review (Reschedule)
1. Same setup as Scenario 1
2. Admin clicks "Reschedule" button
3. ✅ Admin's action passes validation
4. ✅ Request status changes to REVIEW_RESCHEDULED
5. ✅ Coordinator becomes active responder (receives reschedule proposal)
6. ✅ statusHistory records Admin as actor

### Scenario 4: Admin Cannot Act (Different Flow)
1. Admin creates event request (requester)
2. Coordinator is assigned as primary reviewer (reviewerRole = 'Coordinator', initiatorRole = 'Admin')
3. Different Admin tries to perform review action
4. ❌ Admin's action BLOCKED (not a secondary reviewer for Admin → Coordinator flow)

### Scenario 5: Coordinator Primary Review (Unchanged)
1. Stakeholder creates event request
2. Coordinator is assigned as primary reviewer
3. Coordinator performs review action (approve/reject/reschedule)
4. ✅ Action passes validation (primary reviewer)
5. ✅ Request status updates
6. ✅ No change to existing behavior

## Database Records

### Request Document Example
```json
{
  "Request_ID": "STK-2024-001",
  "initiatorRole": "Stakeholder",
  "reviewerRole": "Coordinator",
  "requester": {
    "userId": "stakeholder_123",
    "authoritySnapshot": 45
  },
  "reviewer": {
    "userId": "coordinator_456",
    "authoritySnapshot": 75,
    "assignmentRule": "stakeholder-to-coordinator"
  },
  "status": "APPROVED",
  "statusHistory": [
    {
      "status": "PENDING_REVIEW",
      "actorId": "stakeholder_123",
      "actorRole": "Stakeholder",
      "timestamp": "2024-01-20T10:00:00Z"
    },
    {
      "status": "APPROVED",
      "actorId": "admin_789",  // Admin secondary reviewer
      "actorRole": "Admin",
      "timestamp": "2024-01-20T11:00:00Z"
    }
  ]
}
```

## Migration & Rollout

### Step 1: Deploy Backend Changes
- Update `requestState.service.js` with utilities
- Update `reviewerAssignment.service.js` with secondary reviewer list function
- Update `validateRequestAction.js` with admin secondary review bypass
- No database changes required

### Step 2: Deploy Frontend Changes
- Add utility functions to `UNITE/utils/eventActionPermissions.ts`
- Update request detail/list components to gate buttons with `canUserReviewEventRequest()`
- Test UI buttons appear/disappear correctly for Admins on Stakeholder → Coordinator requests

### Step 3: Verification
- Manual testing of all scenarios above
- Verify admin secondary review actions appear in statusHistory
- Verify other workflows (Admin → Coordinator, Coordinator → Admin) unchanged
- Check audit logs for admin secondary review attempts

## Troubleshooting

### Issue: Admin Cannot See Review Buttons
**Solution:** Verify:
1. User's role is set to 'Admin' or 'System Admin'
2. Request has `initiatorRole: 'Stakeholder'` and `reviewerRole: 'Coordinator'`
3. Frontend uses `canUserReviewEventRequest()` to gate buttons
4. Browser cache is cleared

### Issue: Admin Action Validation Fails
**Solution:** Check:
1. Admin's authority level is 80 or 100
2. Request document has both `initiatorRole` and `reviewerRole` fields set
3. No other middleware is blocking the action before `validateRequestAction.js`
4. Check console logs: `[VALIDATE REQUEST ACTION] Admin secondary reviewer ...`

### Issue: statusHistory Not Recording Admin Actor
**Solution:** Verify:
1. Controller is properly capturing `req.user` from JWT token
2. Admin's `_id` or `id` is in the request context
3. Event request service is using `actorId` from `req.user` when updating statusHistory

## Files Modified

1. **src/services/eventRequests_services/requestState.service.js**
   - Added `isAdminUser()` utility
   - Added `canUserReviewRequest()` utility
   - Exported utilities as static methods

2. **src/services/eventRequests_services/reviewerAssignment.service.js**
   - Updated documentation with secondary reviewer info
   - Added `getValidReviewersForRequest()` utility
   - Exported utility for use in other services

3. **src/middleware/validateRequestAction.js**
   - Added `isAdminUser()` utility
   - Updated validation logic to bypass standard checks for admin secondary reviewers
   - Added logging for audit trail

4. **UNITE/utils/eventActionPermissions.ts** (Recommended)
   - Add `isAdminUser()` utility
   - Add `canUserReviewEventRequest()` utility
   - Update component button gating logic

## Future Enhancements

1. **Notification System:** Notify Coordinators when an Admin acts on their assigned request
2. **Permission Control:** Add granular permission `request.review_as_secondary` to fine-tune which Admins can act as secondary reviewers
3. **Audit Dashboard:** Create admin dashboard to view all secondary review actions performed
4. **Role-Based Secondary Review:** Extend secondary reviewer logic to other flows (e.g., Admins as secondary for Coordinator → Admin)

## References

- Backend Documentation: `backend-docs/BACKEND_DOCUMENTATION.md`
- State Machine: `src/services/eventRequests_services/requestState.service.js`
- Reviewer Assignment: `src/services/eventRequests_services/reviewerAssignment.service.js`
- Action Validation: `src/middleware/validateRequestAction.js`
