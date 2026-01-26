# Broadcast Model Implementation Summary

## Files Modified / Created

### 1. **Schema Changes**
- ✅ `src/models/eventRequests_models/eventRequest.model.js`
  - Added `validCoordinators` array (tracks all matching coordinators)
  - Added `claimedBy` object (tracks who is actively reviewing)
  - Added `latestAction` object (tracks most recent action)
  - Added indexes for performance optimization

### 2. **Service Layer**
- ✅ `src/services/eventRequests_services/broadcastAccess.service.js` (NEW)
  - Validates coordinator access based on location + org type
  - Implements broadcast matching logic
  - Provides methods for claiming/releasing requests
  - Determines visibility for coordinators

- ✅ `src/services/users_services/coordinatorResolver.service.js` (ENHANCED)
  - Added `findValidCoordinatorsForRequest()` method
  - Finds ALL matching coordinators for a request (not just one)
  - Used during request creation to populate `validCoordinators` array

### 3. **Middleware**
- ✅ `src/middleware/validateRequestAccess.js` (REFACTORED)
  - Changed from single-reviewer check to broadcast visibility
  - Now validates: admin status, requester, claimed by, or valid coordinator
  - Uses `broadcastAccessService.canAccessRequest()`

### 4. **Controllers**
- ✅ `src/controller/eventRequests_controller/broadcastRequest.controller.js` (NEW)
  - `overrideCoordinator()` - Fixes the manual selection bug
  - `claimRequest()` - Claim a request to prevent other coordinators acting
  - `releaseRequest()` - Release claim back to other coordinators
  - `getValidCoordinators()` - Get all valid coordinators for a request

### 5. **Utilities & Migration**
- ✅ `src/utils/migrateRequestToBroadcastModel.js` (NEW)
  - Backfill script for existing requests
  - Finds valid coordinators for each request
  - Usage: `node src/utils/migrateRequestToBroadcastModel.js [--dry-run]`

---

## Integration Checklist

### Phase 1: Deploy Schema Changes ✅
- [x] Updated EventRequest schema
- [x] Added broadcast fields (validCoordinators, claimedBy, latestAction)
- [x] Added indexes for performance

**Next Step**: Deploy to dev/staging, test schema changes

### Phase 2: Deploy Services ✅
- [x] Created broadcastAccess.service.js
- [x] Enhanced coordinatorResolver.service.js
- [x] Both services ready for use

**Next Step**: Deploy to dev/staging

### Phase 3: Deploy Middleware ✅
- [x] Refactored validateRequestAccess.js
- [x] Implements broadcast visibility logic
- [x] Backward compatible with existing code

**Next Step**: Deploy to dev/staging, test visibility

### Phase 4: Deploy Controllers ✅
- [x] Created broadcastRequest.controller.js with 4 endpoints
- [x] Endpoints: override, claim, release, list valid coordinators
- [x] Includes proper error handling and auditing

**Next Step**: Add routes, test endpoints

### Phase 5: Data Migration ✅
- [x] Created migration script
- [x] Supports dry-run mode for safety
- [x] Verbose logging for verification

**Next Step**: Run migration script before going live

---

## How to Integrate into Existing Code

### Step 1: Add Routes

**File**: `src/routes/eventRequests.routes.js`

```javascript
const broadcastController = require('../controller/eventRequests_controller/broadcastRequest.controller');

// Manual coordinator override (admin only)
router.put(
  '/:requestId/override-coordinator',
  authenticate,
  requireAdminAuthority,
  broadcastController.overrideCoordinator
);

// Claim request
router.post(
  '/:requestId/claim',
  authenticate,
  broadcastController.claimRequest
);

// Release claim
router.post(
  '/:requestId/release',
  authenticate,
  broadcastController.releaseRequest
);

// Get valid coordinators
router.get(
  '/:requestId/valid-coordinators',
  authenticate,
  broadcastController.getValidCoordinators
);
```

### Step 2: Update Request Creation Logic

**File**: `src/services/eventRequests_services/eventRequest.service.js`

In the `createRequest()` method, after creating the request, add:

```javascript
// BROADCAST MODEL: Find and populate valid coordinators
const coordinatorResolver = require('../users_services/coordinatorResolver.service');

const validCoordinators = await coordinatorResolver.findValidCoordinatorsForRequest(
  request.municipalityId || request.district,
  request.organizationType
);

request.validCoordinators = validCoordinators;
await request.save();

log(`[CREATE REQUEST] Found ${validCoordinators.length} valid coordinators`);

// Broadcast notification to all valid coordinators
const notificationService = require('../utility_services/notification.service');
await notificationService.notifyValidCoordinators(request, validCoordinators);
```

### Step 3: Update Request Action Logic

Before allowing a coordinator to act on a request, add validation:

```javascript
// Check if coordinator can act
const broadcastAccessService = require('../services/eventRequests_services/broadcastAccess.service');
const actionResult = await broadcastAccessService.canActOnRequest(userId, request);

if (!actionResult.canAct) {
  return res.status(409).json({
    success: false,
    message: actionResult.reason
  });
}

// If not claimed, auto-claim on first action
if (!request.claimedBy) {
  const coordinator = await User.findById(userId);
  request.claimedBy = {
    userId: coordinator._id,
    name: `${coordinator.firstName} ${coordinator.lastName}`,
    claimedAt: new Date()
  };
  await request.save();
}
```

### Step 4: Update Notification Logic

**File**: `src/services/utility_services/notification.service.js`

Add method to notify all valid coordinators:

```javascript
/**
 * Notify all valid coordinators of a new request
 */
async notifyValidCoordinators(request, validCoordinators) {
  for (const coordinator of validCoordinators) {
    await this.createNotification({
      userId: coordinator.userId,
      type: 'NEW_REQUEST_BROADCAST',
      title: `New Request: ${request.Event_Title}`,
      message: `A new event request matching your coverage area is available for review`,
      data: {
        requestId: request._id,
        Request_ID: request.Request_ID,
        validCoordinators: validCoordinators.length
      }
    });
  }
  
  // Emit Socket.IO event
  const io = global.io;
  if (io) {
    io.emit('new_request_broadcast', {
      Request_ID: request.Request_ID,
      title: request.Event_Title,
      targetCoordinators: validCoordinators.map(vc => vc.userId.toString())
    });
  }
}
```

### Step 5: Run Migration Script

```bash
# Dry run first (no changes made)
node src/utils/migrateRequestToBroadcastModel.js --dry-run --verbose

# If successful, run actual migration
node src/utils/migrateRequestToBroadcastModel.js --verbose
```

---

## Testing the Implementation

### Test 1: Coordinator Selection Bug Fix

```javascript
// Create request with Coordinator A
const request = await createRequest(stakeholder);
expect(request.reviewer.userId).toBe(coordinatorA._id);

// Admin manually selects Coordinator B
await overrideCoordinator(request._id, coordinatorB._id);

// Verify Coordinator B is now assigned
const updated = await EventRequest.findById(request._id);
expect(updated.reviewer.userId).toEqual(coordinatorB._id);
expect(updated.reviewer.overriddenBy.userId).toBe(admin._id);
```

### Test 2: Broadcast Visibility

```javascript
// Create request
const request = await createRequest(stakeholder);

// Should have multiple valid coordinators
expect(request.validCoordinators.length).toBeGreaterThan(0);

// All coordinators should be able to view it
for (const vc of request.validCoordinators) {
  const canAccess = await broadcastAccessService.canAccessRequest(vc.userId, request);
  expect(canAccess).toBe(true);
}
```

### Test 3: Claim Mechanism

```javascript
// Create request
const request = await createRequest(stakeholder);

// Coordinator A claims it
await claimRequest(request._id, coordinatorA._id);

// Coordinator B tries to claim (should fail)
const claimResult = await broadcastAccessService.canClaimRequest(coordinatorB._id, request);
expect(claimResult.canClaim).toBe(false);

// Coordinator A can approve (they claimed it)
const approveResult = await broadcastAccessService.canActOnRequest(coordinatorA._id, request);
expect(approveResult.canAct).toBe(true);
```

### Test 4: Manual Override

```javascript
// Create request with auto-assigned coordinator
const request = await createRequest(stakeholder);
const originalReviewer = request.reviewer.userId;

// Admin overrides with different coordinator
const overrideResult = await overrideCoordinator(request._id, coordinatorB._id);

// Verify audit trail
expect(overrideResult.reviewer.userId).toEqual(coordinatorB._id);
expect(overrideResult.reviewer.overriddenBy.userId).toBe(admin._id);
expect(overrideResult.reviewer.overriddenAt).toBeDefined();
```

---

## Frontend Integration Points

### 1. Request Dashboard

```typescript
// Show if request is claimed
const claimedStatus = request.claimedBy ? `Claimed by ${request.claimedBy.name}` : 'Available';

// Show all valid coordinators
const validCoordinators = request.validCoordinators;
const isCurrentUserValid = validCoordinators.some(vc => vc.userId === currentUser._id);
```

### 2. Coordinator Selection Dialog

```typescript
// Populate dropdown with valid coordinators
<select value={selectedCoordinator} onChange={(e) => setSelectedCoordinator(e.target.value)}>
  {request.validCoordinators.map(vc => (
    <option key={vc.userId} value={vc.userId}>
      {vc.name} - {vc.organizationType}
    </option>
  ))}
</select>

// Send override request
const response = await fetch(`/api/event-requests/${requestId}/override-coordinator`, {
  method: 'PUT',
  body: JSON.stringify({ coordinatorId: selectedCoordinator })
});
```

### 3. Claim/Release Buttons

```typescript
// Show claim button if not claimed by current user
{!request.claimedBy && isCurrentUserValid && (
  <button onClick={() => claimRequest(requestId)}>
    Claim Request
  </button>
)}

// Show release button if claimed by current user
{request.claimedBy?.userId === currentUser._id && (
  <button onClick={() => releaseRequest(requestId)}>
    Release Claim
  </button>
)}
```

### 4. Socket.IO Listeners

```typescript
socket.on('request_claimed', ({ requestId, claimedBy, claimedAt }) => {
  updateRequest(requestId, { claimedBy, isClaimedByMe: claimedBy === currentUser.name });
  disableActionButtons(requestId);
});

socket.on('request_released', ({ requestId, releasedAt }) => {
  updateRequest(requestId, { claimedBy: null });
  enableActionButtons(requestId);
});

socket.on('coordinator_assigned', ({ requestId, assignedAt, overriddenBy }) => {
  showNotification(`You have been assigned to request by ${overriddenBy}`);
  refreshRequest(requestId);
});
```

---

## API Endpoint Reference

### Override Coordinator (FIXES BUG)

```
PUT /api/event-requests/:requestId/override-coordinator
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "coordinatorId": "507f1f77bcf86cd799439011"
}

Response:
{
  "success": true,
  "message": "Coordinator assignment updated successfully",
  "data": {
    "request": {
      "_id": "...",
      "Request_ID": "REQ-123...",
      "reviewer": {
        "userId": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "assignedAt": "2026-01-26T...",
        "overriddenAt": "2026-01-26T...",
        "overriddenBy": { ... }
      },
      "validCoordinators": [ ... ]
    }
  }
}
```

### Claim Request

```
POST /api/event-requests/:requestId/claim
Authorization: Bearer <coordinator_token>

Response:
{
  "success": true,
  "message": "Request claimed successfully",
  "data": {
    "claimedBy": {
      "userId": "507f1f77bcf86cd799439011",
      "name": "Jane Doe",
      "claimedAt": "2026-01-26T...",
      "claimTimeoutAt": "2026-01-27T..."
    }
  }
}
```

### Release Request

```
POST /api/event-requests/:requestId/release
Authorization: Bearer <coordinator_token>

Response:
{
  "success": true,
  "message": "Request claim released"
}
```

### Get Valid Coordinators

```
GET /api/event-requests/:requestId/valid-coordinators
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "validCoordinators": [
      {
        "userId": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "roleSnapshot": "Coordinator",
        "organizationType": "LGU",
        "discoveredAt": "2026-01-26T..."
      },
      ...
    ],
    "claimedBy": null,
    "count": 3
  }
}
```

---

## Performance Optimization Notes

1. **Indexing**: Added indexes on `validCoordinators.userId` for fast lookups
2. **Lean Queries**: Used `.lean()` in migrations and bulk operations
3. **Caching**: Consider caching coverage area hierarchies for coordinators
4. **Bulk Operations**: For large migrations, consider processing in batches

---

## Backward Compatibility

✅ **Fully Backward Compatible**:
- Existing `reviewer` field is preserved
- Code can still check `request.reviewer.userId`
- Old access control logic still works for admins
- New broadcast logic is additive, not replacing

---

## Rollback Plan

If issues occur:

1. **Revert Schema Changes**: Keep old `reviewer` field, it's still populated
2. **Revert Middleware**: Restore `validateRequestAccess.js` to check only `reviewer.userId`
3. **Revert Routes**: Remove new endpoints from routing
4. **Data**: No data loss, broadcast fields can be deleted safely

---

## Next Steps

1. ✅ Deploy all code changes
2. ⏳ Run migration script in staging
3. ⏳ Test all broadcast functionality in staging
4. ⏳ Update frontend integration
5. ⏳ Run migration script in production
6. ⏳ Deploy to production
7. ⏳ Monitor logs for broadcast access errors

---

## Support & Troubleshooting

### Issue: "Coordinator is not valid for this request"

**Cause**: Coordinator's coverage area doesn't include request location or org type doesn't match

**Solution**: 
- Verify coordinator has correct coverage area setup
- Verify coordinator's organization type matches request

### Issue: Request stuck in claimed state

**Cause**: Coordinator claimed but didn't finish action

**Solution**:
- Admin can override coordinator assignment
- Claim automatically expires after 24 hours

### Issue: validCoordinators array is empty

**Cause**: No coordinators match the location + org type criteria

**Solution**:
- Create additional coordinators with matching coverage
- Update existing coordinator coverage areas

---

## Questions?

Refer to `BROADCAST_MODEL_REFACTORING_GUIDE.md` for detailed architecture documentation.

