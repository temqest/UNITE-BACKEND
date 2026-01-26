# Refactoring Event Request Workflow to Broadcast Model

## Executive Summary

This document outlines the comprehensive refactoring needed to transition the Event Request Workflow from a **single-assigned-reviewer model** to a **broadcast model** where multiple coordinators matching both **Coverage Area** and **Organization Type** can view and act on requests. This solves two critical issues:

1. **Coordinator Selection Bug**: Manual assignment of a reviewer incorrectly persists the wrong coordinator
2. **Request Visibility**: Requests are currently restricted to a single `reviewer` object, preventing multiple coordinators from seeing requests they should handle

---

## Part 1: Problem Analysis & Current State

### Current Architecture (Single-Reviewer Model)

```
EventRequest Schema:
├── reviewer: { userId, name, roleSnapshot, assignedAt, autoAssigned, overriddenAt, overriddenBy }
├── Request visible to: ONLY reviewer.userId

Access Control (validateRequestAccess.js):
├── Check: user.id === request.reviewer.userId
└── Result: Only the assigned reviewer can see/act on request
```

### Root Causes of Issues

#### Issue #1: Coordinator Selection Bug (Manual Override Persistence)
**Problem**: When selecting Coordinator B to override Coordinator A, the system still shows Coordinator A as assigned.

**Root Cause Analysis**:
- Frontend sends coordinator ID to backend update endpoint
- Backend updates `request.reviewer.userId` to new coordinator
- However, the update logic may not properly replace the entire reviewer object
- Or the frontend doesn't properly re-fetch after update
- The `overriddenBy` and `overriddenAt` fields may not be set correctly

**Current Code Issue** (in reviewerAssignment.service.js):
```javascript
// Current: Returns single reviewer object
return await this._formatReviewer(selectedReviewer, assignmentRule);

// Result: request.reviewer = { userId: X, name: "...", ... }
// If manual override happens: overwrites this, but inconsistency in how update is applied
```

#### Issue #2: Broadcast Visibility Gap
**Problem**: Only the assigned reviewer sees the request. Other qualified coordinators cannot claim it.

**Impact**:
- If assigned coordinator is unavailable, request is stuck
- No failover mechanism
- No collaborative review possible
- Wasteful: perfectly qualified coordinators can't help

---

## Part 2: Desired Broadcast Model Architecture

### New Model Structure

```
EventRequest Schema:
├── reviewer: { userId, ... }  // Kept for BACKWARD COMPATIBILITY (who acted first)
├── validCoordinators: [
│   { userId, name, coverageAreaId, organizationType, isActive },
│   { userId, name, coverageAreaId, organizationType, isActive }
├── latestAction: { action, actor, timestamp }  // Tracks who acted last
└── actionHistory: [ { action, actor, timestamp, result } ]

Access Control (validateRequestAccess.js):
├── Check: user has Coordinator role (authority >= 60) AND
│   (user.coverageArea includes request.Location) AND
│   (user.organizationType matches request.organizationType)
└── Result: All matching coordinators can view & act
```

### Matching Logic: Coverage Area + Organization Type

```javascript
A coordinator is "valid" for a request if:

1. Coordinator Status:
   ✓ Active (isActive: true)
   ✓ Has Coordinator role (authority >= 60)
   
2. Geographic Coverage Match:
   ✓ Coordinator's coverageArea includes request's location
     (Municipality OR District OR Province)
   
3. Organization Type Match:
   ✓ Coordinator's organizationType === request.organizationType
     (e.g., LGU, NGO, Hospital)

Examples:
────────────────────────────────────────────────────────────
Coordinator A: Coverage=[Manila], OrgType=LGU
Request 1: Location=Manila, OrgType=LGU
✓ VISIBLE to Coordinator A

Coordinator B: Coverage=[Quezon City], OrgType=LGU
Request 1: Location=Manila, OrgType=LGU
✗ NOT visible to Coordinator B (different location)

Coordinator C: Coverage=[Manila], OrgType=NGO
Request 1: Location=Manila, OrgType=LGU
✗ NOT visible to Coordinator C (different org type)

Coordinator D: Coverage=[Manila, Quezon City], OrgType=LGU
Request 1: Location=Manila, OrgType=LGU
✓ VISIBLE to Coordinator D
```

### State Machine Behavior: Preventing Duplicate Actions

Once **ANY valid coordinator** acts on a request, the state transitions and other coordinators can no longer act on that same request (unless it reverts to a "claimable" state).

```
Request Lifecycle with Broadcast Model:
────────────────────────────────────────

1. [SUBMITTED] - Visible to all matching coordinators
   Actions: CLAIM (optional) → APPROVE or REJECT

2. [CLAIMED] - Assigned to coordinator who claimed it
   Only that coordinator can act further
   Other coordinators see it as "already being reviewed"

3. [APPROVED/REJECTED/RESCHEDULED] - Final state
   All coordinators can view history
   No further coordinator action available

If first coordinator abandons → reverts to [SUBMITTED]
   Request becomes claimable by other valid coordinators again
```

---

## Part 3: Step-by-Step Implementation Instructions

### Phase 1: Schema Updates (Database Layer)

#### Step 1.1: Update EventRequest Schema

**File**: `src/models/eventRequests_models/eventRequest.model.js`

**Changes**:
1. Keep `reviewer` field for backward compatibility and to track "who acted first"
2. Add `validCoordinators` array to track all matching coordinators
3. Add `latestAction` to track most recent action
4. Add `claimedBy` field to indicate who is currently working on it

```javascript
// Add to eventRequestSchema:

// Track all coordinators who can act on this request
validCoordinators: [{
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  name: String,
  roleSnapshot: String,
  coverageAreaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CoverageArea'
  },
  organizationType: String,
  isActive: { type: Boolean, default: true },
  discoveredAt: { type: Date, default: Date.now }
}],

// Track who is actively reviewing this request
claimedBy: {
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  name: String,
  claimedAt: { type: Date, default: Date.now },
  claimTimeoutAt: { type: Date } // Auto-release after 24 hours if no action
},

// Track latest action for state machine
latestAction: {
  action: String, // APPROVE, REJECT, RESCHEDULE, etc.
  actor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String
  },
  timestamp: { type: Date, default: Date.now }
}
```

### Phase 2: Service Layer Updates

#### Step 2.1: Update reviewerAssignment.service.js

**Objective**: Return a LIST of valid coordinators instead of a single one

**Key Changes**:

```javascript
// NEW METHOD: Find all valid coordinators for a request
async findValidCoordinators(context = {}) {
  /*
  Returns: Array of coordinator objects matching:
  - Geographic coverage
  - Organization type
  - Active status
  
  Used during request creation to populate validCoordinators array
  */
}

// MODIFY: assignReviewer() → assignReviewers()
async assignReviewers(requesterId, context = {}) {
  /*
  Instead of: return ONE reviewer
  Now: return ARRAY of reviewers
  
  This array becomes request.validCoordinators
  */
}

// NEW: First responder logic
async claimRequest(requestId, userId) {
  /*
  When a coordinator wants to act on a request:
  1. Mark them as claimedBy
  2. Update latestAction
  3. Return early if another coordinator already claimed it
  */
}

// NEW: Release claim
async releaseClaimOnRequest(requestId, userId) {
  /*
  If coordinator hasn't completed action within timeout
  Release the claim so others can act
  */
}
```

#### Step 2.2: Update coordinatorResolver.service.js

**Objective**: Enhanced matching logic for broadcast visibility

```javascript
// ENHANCE: isMunicipalityInCoverage()
// - Already exists, ensure it's robust
// - Check: municipality in coverage.geographicUnits

// NEW: matchByOrganizationType()
async matchByOrganizationType(requestOrganizationType, coordinatorOrganizationType) {
  /*
  Ensure organization types match exactly
  Examples:
  - LGU === LGU ✓
  - NGO === NGO ✓
  - Hospital === Hospital ✓
  - LGU !== NGO ✗
  */
}

// ENHANCE: getCoordinatorsForRequest()
async getCoordinatorsForRequest(location, organizationType) {
  /*
  Return: Array of all coordinators matching:
  1. Location in their coverage area
  2. Organization type matches
  3. Active status
  
  Used to populate validCoordinators array
  */
}
```

### Phase 3: Middleware Updates

#### Step 3.1: Update validateRequestAccess.js

**Objective**: Refactor access control from single-reviewer to broadcast matching

**Current Logic** (WRONG):
```javascript
const isReviewer = request.reviewer?.userId?.toString() === userId.toString();
if (!isReviewer) return 403;
```

**New Logic** (CORRECT):
```javascript
// Check if user is a valid coordinator for this request
const user = await User.findById(userId);
const canView = await validateCoordinatorBroadcast(
  user,
  request,
  { location, organizationType }
);

if (!canView) return 403;
```

**Implementation**:

```javascript
const validateRequestAccess = async (req, res, next) => {
  const userId = req.user._id || req.user.id;
  const { requestId } = req.params;
  
  // Get request
  const request = await EventRequest.findOne({ Request_ID: requestId });
  if (!request) return res.status(404).json(...);
  
  // Check permission - three tiers:
  
  // Tier 1: Wildcard permissions (admin users)
  const userPermissions = await permissionService.getUserPermissions(userId);
  const hasWildcard = userPermissions.some(p => 
    (p.resource === '*' || p.resource === 'request') &&
    (p.actions?.includes('*') || p.actions?.includes('read'))
  );
  
  if (hasWildcard) {
    req.request = request;
    return next();
  }
  
  // Tier 2: Requester or claimed by this coordinator
  const isRequester = request.requester?.userId?.toString() === userId.toString();
  const isClaimedBy = request.claimedBy?.userId?.toString() === userId.toString();
  
  if (isRequester || isClaimedBy) {
    req.request = request;
    return next();
  }
  
  // Tier 3: Valid broadcast coordinator
  const user = await User.findById(userId);
  const isValidCoordinator = await checkBroadcastCoordinatorAccess(
    user,
    request
  );
  
  if (!isValidCoordinator) {
    return res.status(403).json({
      success: false,
      message: 'You are not a valid coordinator for this request'
    });
  }
  
  req.request = request;
  next();
};

// Helper function
async function checkBroadcastCoordinatorAccess(user, request) {
  // Check: Is coordinator?
  if ((user.authority || 0) < 60) return false;
  
  // Check: Organization type matches?
  if (user.organizationType !== request.organizationType) return false;
  
  // Check: Location in coverage?
  const locationInCoverage = await checkLocationInCoverage(
    request.municipalityId || request.district,
    user.coverageAreas
  );
  
  return locationInCoverage;
}
```

### Phase 4: Controller Updates

#### Step 4.1: Update eventRequest.controller.js - Manual Override Endpoint

**Fix the Coordinator Selection Bug**

**Current Issue**: When frontend sends a manual override, backend may not properly update the assignment.

**Solution**: Create explicit endpoint for manual override

```javascript
/**
 * Manually override the assigned coordinator
 * @route PUT /api/event-requests/:requestId/override-coordinator
 */
async overrideCoordinator(req, res) {
  try {
    const { requestId } = req.params;
    const { coordinatorId } = req.body;
    const adminId = req.user._id || req.user.id;
    
    // Validate: only admin can override
    if ((req.user.authority || 0) < 80) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can override coordinator assignment'
      });
    }
    
    // Get request
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    // Validate: coordinator is in validCoordinators
    const isValidCoordinator = request.validCoordinators.some(
      vc => vc.userId.toString() === coordinatorId
    );
    
    if (!isValidCoordinator) {
      return res.status(400).json({
        success: false,
        message: 'Coordinator is not valid for this request'
      });
    }
    
    // Get admin details
    const admin = await User.findById(adminId);
    
    // Update assignment
    const coordinator = await User.findById(coordinatorId);
    
    request.reviewer = {
      userId: coordinator._id,
      name: `${coordinator.firstName} ${coordinator.lastName}`,
      roleSnapshot: coordinator.roles?.[0]?.roleName || 'Coordinator',
      assignedAt: new Date(),
      autoAssigned: false,
      assignmentRule: 'manual',
      overriddenAt: new Date(),
      overriddenBy: {
        userId: admin._id,
        name: `${admin.firstName} ${admin.lastName}`,
        roleSnapshot: admin.roles?.[0]?.roleName || 'Admin',
        authoritySnapshot: admin.authority
      }
    };
    
    await request.save();
    
    // Emit notification
    await notificationService.notifyCoordinatorAssignment(
      request,
      coordinator._id,
      'manual_override',
      admin._id
    );
    
    res.status(200).json({
      success: true,
      message: 'Coordinator assignment updated successfully',
      data: { request: await this._formatRequest(request, adminId) }
    });
  } catch (error) {
    console.error('[OVERRIDE COORDINATOR]', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
```

#### Step 4.2: Add Claim/Unclaim Endpoints

```javascript
/**
 * Claim a request for review
 * @route POST /api/event-requests/:requestId/claim
 */
async claimRequest(req, res) {
  try {
    const { requestId } = req.params;
    const coordinatorId = req.user._id || req.user.id;
    
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    // Check: Is valid coordinator?
    const isValid = request.validCoordinators.some(
      vc => vc.userId.toString() === coordinatorId.toString()
    );
    
    if (!isValid) {
      return res.status(403).json({
        success: false,
        message: 'You are not a valid coordinator for this request'
      });
    }
    
    // Check: Already claimed by someone else?
    if (request.claimedBy && request.claimedBy.userId.toString() !== coordinatorId.toString()) {
      return res.status(409).json({
        success: false,
        message: `Already claimed by ${request.claimedBy.name} at ${request.claimedBy.claimedAt}`
      });
    }
    
    // Mark as claimed
    const coordinator = await User.findById(coordinatorId);
    request.claimedBy = {
      userId: coordinator._id,
      name: `${coordinator.firstName} ${coordinator.lastName}`,
      claimedAt: new Date(),
      claimTimeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hour timeout
    };
    
    await request.save();
    
    // Broadcast to other coordinators that this is now claimed
    const io = req.app.get('io');
    io.emit('request_claimed', {
      requestId,
      claimedBy: request.claimedBy.name,
      claimedAt: request.claimedBy.claimedAt
    });
    
    res.status(200).json({
      success: true,
      message: 'Request claimed successfully',
      data: { request }
    });
  } catch (error) {
    console.error('[CLAIM REQUEST]', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Release claim on a request
 * @route POST /api/event-requests/:requestId/release
 */
async releaseRequest(req, res) {
  try {
    const { requestId } = req.params;
    const coordinatorId = req.user._id || req.user.id;
    
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    
    // Check: Only coordinator who claimed it can release
    if (request.claimedBy?.userId?.toString() !== coordinatorId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the coordinator who claimed this request can release it'
      });
    }
    
    // Release claim
    request.claimedBy = null;
    await request.save();
    
    // Broadcast to other coordinators
    const io = req.app.get('io');
    io.emit('request_released', {
      requestId,
      releasedAt: new Date()
    });
    
    res.status(200).json({
      success: true,
      message: 'Request claim released'
    });
  } catch (error) {
    console.error('[RELEASE REQUEST]', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
```

### Phase 5: Notification & Socket.IO Updates

#### Step 5.1: Broadcast Request Creation Notification

**File**: `src/services/utility_services/notification.service.js`

```javascript
/**
 * Notify all valid coordinators of a new request
 */
async notifyValidCoordinators(request, validCoordinators) {
  /*
  Instead of notifying ONE reviewer:
  - Notify ALL valid coordinators
  - Each gets individual notification
  - Or use Socket.IO room-based broadcast
  */
  
  for (const coordinator of validCoordinators) {
    await this.createNotification({
      userId: coordinator.userId,
      type: 'NEW_REQUEST_BROADCAST',
      title: `New Request: ${request.Event_Title}`,
      message: `A new event request matching your coverage area is available for review`,
      data: {
        requestId: request._id,
        Request_ID: request.Request_ID
      }
    });
  }
  
  // Also broadcast via Socket.IO
  const io = global.io || req.app.get('io');
  const coordinatorIds = validCoordinators.map(vc => vc.userId.toString());
  
  io.to('coordinators').emit('new_request_broadcast', {
    requestId: request._id,
    Request_ID: request.Request_ID,
    title: request.Event_Title,
    targetCoordinators: coordinatorIds
  });
}
```

---

## Part 4: Data Migration & Seeding

### Migration Script

**File**: `src/utils/migrateRequestToBroadcastModel.js`

```javascript
/**
 * Migration: Add broadcast fields to existing requests
 * 
 * Steps:
 * 1. For each EventRequest, find all valid coordinators
 * 2. Populate validCoordinators array
 * 3. Set claimedBy to current reviewer (if any)
 * 4. Preserve existing reviewer field
 */

const mongoose = require('mongoose');
const EventRequest = require('../models/eventRequests_models/eventRequest.model');
const User = require('../models/users_models/user.model');
const coordinatorResolver = require('./services/users_services/coordinatorResolver.service');

async function migrateRequestToBroadcast() {
  try {
    const requests = await EventRequest.find({}).lean();
    console.log(`Found ${requests.length} requests to migrate`);
    
    for (const request of requests) {
      // Skip if already migrated
      if (request.validCoordinators && request.validCoordinators.length > 0) {
        console.log(`Skipping ${request.Request_ID} - already migrated`);
        continue;
      }
      
      // Find all matching coordinators
      const validCoordinators = await coordinatorResolver.getCoordinatorsForRequest(
        request.municipalityId || request.district,
        request.organizationType
      );
      
      // Update request
      await EventRequest.updateOne(
        { _id: request._id },
        {
          $set: {
            validCoordinators,
            claimedBy: request.reviewer ? {
              userId: request.reviewer.userId,
              name: request.reviewer.name,
              claimedAt: request.reviewer.assignedAt || new Date()
            } : null
          }
        }
      );
      
      console.log(`✓ Migrated ${request.Request_ID}`);
    }
    
    console.log('✅ Migration complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

module.exports = { migrateRequestToBroadcast };
```

**Run Migration**:
```bash
node src/utils/migrateRequestToBroadcastModel.js
```

---

## Part 5: Testing Strategy

### Test Scenarios

#### Test 1: Coordinator Selection Bug Fix

```javascript
describe('Coordinator Override - Bug Fix', () => {
  it('should correctly update coordinator when manually overridden', async () => {
    // Create request with Coordinator A
    const request = await createRequest(stakeholder, { organizationType: 'LGU' });
    expect(request.reviewer.userId).toBe(coordinatorA._id);
    
    // Admin overrides to Coordinator B
    const updated = await overrideCoordinator(request._id, coordinatorB._id);
    
    // Verify: Coordinator B is now assigned
    expect(updated.reviewer.userId).toEqual(coordinatorB._id);
    
    // Verify: Override metadata
    expect(updated.reviewer.overriddenAt).toBeDefined();
    expect(updated.reviewer.overriddenBy.userId).toBe(admin._id);
  });
});
```

#### Test 2: Broadcast Visibility

```javascript
describe('Broadcast Visibility', () => {
  it('should populate validCoordinators for all matching coordinators', async () => {
    const request = await createRequest(stakeholder, {
      organizationType: 'LGU',
      municipalityId: manila._id
    });
    
    // Should include all coordinators with:
    // - Coverage includes Manila
    // - Organization type = LGU
    expect(request.validCoordinators.length).toBeGreaterThan(0);
    
    request.validCoordinators.forEach(vc => {
      expect(vc.organizationType).toBe('LGU');
      expect(vc.coverageAreaId).toBeDefined();
    });
  });
  
  it('should allow all valid coordinators to view the request', async () => {
    const request = await createRequest(stakeholder);
    
    for (const vc of request.validCoordinators) {
      const coordinator = await User.findById(vc.userId);
      const canView = await checkBroadcastCoordinatorAccess(coordinator, request);
      expect(canView).toBe(true);
    }
  });
});
```

#### Test 3: Claim/Release Mechanism

```javascript
describe('Claim/Release Mechanism', () => {
  it('should prevent other coordinators from acting if claimed', async () => {
    const request = await createRequest(stakeholder);
    
    // Coordinator A claims it
    await claimRequest(request._id, coordinatorA._id);
    
    // Coordinator B tries to approve (should fail)
    const approval = await approveRequest(request._id, coordinatorB._id);
    expect(approval.success).toBe(false);
    expect(approval.message).toContain('claimed');
  });
  
  it('should allow claiming coordinator to approve', async () => {
    const request = await createRequest(stakeholder);
    await claimRequest(request._id, coordinatorA._id);
    
    // Coordinator A approves
    const approval = await approveRequest(request._id, coordinatorA._id);
    expect(approval.success).toBe(true);
    expect(request.status).toBe('APPROVED');
  });
});
```

---

## Part 6: Route Updates

### Add New Routes

**File**: `src/routes/eventRequests.routes.js`

```javascript
// Manual coordinator override
router.put(
  '/:requestId/override-coordinator',
  authenticate,
  requireAdminAuthority,
  eventRequestController.overrideCoordinator
);

// Claim request
router.post(
  '/:requestId/claim',
  authenticate,
  eventRequestController.claimRequest
);

// Release claim
router.post(
  '/:requestId/release',
  authenticate,
  eventRequestController.releaseRequest
);

// Get valid coordinators for a request
router.get(
  '/:requestId/valid-coordinators',
  authenticate,
  eventRequestController.getValidCoordinators
);
```

---

## Part 7: Frontend Integration Points

### Changes Required in Frontend

1. **Request Dashboard Display**:
   - Show "claimed by" status if request is claimed
   - Show all valid coordinators as a team
   - Disable action buttons if claimed by someone else

2. **Manual Override Dialog**:
   - Populate dropdown with `validCoordinators` array
   - Validate selection before sending
   - Show confirmation: "Are you sure? This will update the assignment"

3. **Claim Button**:
   - Add "Claim Request" button on request detail page
   - Only show if NOT already claimed by current user
   - Update UI in real-time via Socket.IO when claimed/released

4. **Socket.IO Listeners**:
   ```typescript
   socket.on('request_claimed', ({ requestId, claimedBy, claimedAt }) => {
     updateRequestUI(requestId, { claimedBy, isClaimedByMe: false });
     disableActionButtons(requestId);
   });
   
   socket.on('request_released', ({ requestId, releasedAt }) => {
     updateRequestUI(requestId, { claimedBy: null });
     enableActionButtons(requestId);
   });
   
   socket.on('new_request_broadcast', ({ requestId, title, targetCoordinators }) => {
     if (currentUser._id in targetCoordinators) {
       addToNotification('New request available for you to claim');
     }
   });
   ```

---

## Part 8: Implementation Checklist

### Schema & Database
- [ ] Add `validCoordinators` array to EventRequest schema
- [ ] Add `claimedBy` object to EventRequest schema
- [ ] Add `latestAction` object to EventRequest schema
- [ ] Create indexes on `validCoordinators.userId` for fast lookups
- [ ] Run migration script to backfill existing requests

### Services
- [ ] Update `reviewerAssignment.service.js` to find all valid coordinators
- [ ] Enhance `coordinatorResolver.service.js` with organization type matching
- [ ] Create `broadcastAccess.service.js` to handle visibility logic
- [ ] Add claim/release methods to event request service

### Middleware
- [ ] Refactor `validateRequestAccess.js` to check broadcast matching
- [ ] Add broadcast coordinator role validation

### Controllers
- [ ] Add `overrideCoordinator()` endpoint
- [ ] Add `claimRequest()` endpoint
- [ ] Add `releaseRequest()` endpoint
- [ ] Update `createEventRequest()` to populate `validCoordinators`
- [ ] Update permission checks in action handlers

### Routes
- [ ] Add routes for override, claim, release endpoints
- [ ] Update GET request filters if needed

### Notifications & Socket.IO
- [ ] Update broadcast notification logic
- [ ] Add Socket.IO room for coordinator notifications
- [ ] Emit events for claim/release/override

### Testing
- [ ] Write tests for coordinator override bug fix
- [ ] Write tests for broadcast visibility
- [ ] Write tests for claim/release mechanism
- [ ] Write integration tests for full workflow

### Documentation
- [ ] Update `STATE_MACHINE_README.md` with new workflow
- [ ] Add broadcast model docs to backend-docs
- [ ] Update API documentation with new endpoints

---

## Part 9: Rollback & Safety

### Backward Compatibility
- Keep `reviewer` field unchanged in API responses
- Frontend can continue using `reviewer.userId` if needed
- New code uses `claimedBy` and `validCoordinators`

### Graceful Degradation
- If `validCoordinators` is empty, fall back to `reviewer.userId`
- If `claimedBy` is not set, treat request as "claimable"
- Existing coordinator assignment logic still works

### Data Integrity
- Always validate that selected coordinator is in `validCoordinators`
- Never allow action if different coordinator has claimed it
- Implement claim timeouts to prevent stuck requests

---

## Summary of Key Changes

| Component | Change | Impact |
|-----------|--------|--------|
| Schema | Add `validCoordinators`, `claimedBy`, `latestAction` | Enables broadcast model |
| reviewerAssignment | Return array instead of single reviewer | Multiple valid coordinators |
| validateRequestAccess | Check broadcast matching | All valid coordinators can view |
| Controllers | Add override, claim, release endpoints | Fixes manual selection bug |
| Notifications | Broadcast to all valid coordinators | All can see new requests |
| State Machine | Prevent duplicate actions via claims | Only claimed coordinator acts |
| Socket.IO | Emit claim/release/override events | Real-time UI updates |

---

## Testing the Complete Flow

### Manual Test Walkthrough

1. **Create Request as Stakeholder**
   - System auto-populates `validCoordinators`
   - Notifications sent to all matching coordinators

2. **Coordinator Sees Request**
   - Can view in dashboard (passes broadcast check)
   - Can see other valid coordinators
   - Can claim request

3. **Coordinator Claims Request**
   - `claimedBy` set to that coordinator
   - Other coordinators see "claimed by X"
   - Their action buttons disabled

4. **Coordinator Approves**
   - State transitions to APPROVED
   - Other coordinators see history
   - Cannot be claimed by others

5. **Admin Overrides (Later)**
   - Can manually reassign to different coordinator
   - Audit trail shows override details
   - New coordinator replaces original

---

## Conclusion

This refactoring transforms the system from a fragile single-assignment model to a robust broadcast model. Key benefits:

✅ **Fixes Manual Selection Bug**: Proper override logic with audit trail
✅ **Enables Collaboration**: Multiple coordinators see requests
✅ **Prevents Failures**: Failover if primary coordinator unavailable
✅ **Maintains Audit Trail**: Know who acted and when
✅ **Backward Compatible**: Existing code continues to work
✅ **Scalable**: Handles hundreds of requests and coordinators

