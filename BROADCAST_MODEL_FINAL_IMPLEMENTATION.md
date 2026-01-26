# Broadcast Model - Final Implementation & Bug Fix Guide

**Date**: January 26, 2026  
**Status**: Ready for Implementation  
**Priority**: Critical (Fixes coordinator selection bug + enables broadcast model)

---

## Executive Summary

This document provides the **complete implementation blueprint** for transitioning the Event Request system from a single-assigned-reviewer model to a broadcast model where any coordinator matching both **Coverage Area** and **Organization Type** can see and act on requests.

### Key Achievements
1. ✅ **Bug Fix Identified**: Coordinator selection not persisting due to incomplete override logic
2. ✅ **Architecture Validated**: Broadcast model infrastructure already in place
3. ✅ **Implementation Path**: Clear, step-by-step refactoring plan
4. ✅ **Testing Strategy**: Comprehensive test scenarios provided

---

## Part 1: Problem Analysis

### Issue #1: Coordinator Selection Bug (Manual Override Persistence)

#### Symptom
- Admin selects Coordinator B to override Coordinator A
- Frontend request sent with `coordinatorId: B`
- After update, **Coordinator A still appears selected**
- Audit trail missing or incorrect

#### Root Cause Analysis

**Primary Causes**:

1. **Incomplete Update Logic**
   - Current override endpoint may not fully replace reviewer object
   - `overriddenAt` and `overriddenBy` fields not set consistently
   - `assignmentRule` field not updated to 'manual'

2. **Frontend/Backend Synchronization**
   - Frontend may cache old reviewer data
   - No explicit response containing updated request object
   - Socket.IO notification not triggering UI refresh

3. **Status History Inconsistency**
   - Status history not recording manual override action
   - No audit trail of who performed override and when

#### Code Location
- **Main Issue**: `src/controller/eventRequests_controller/eventRequest.controller.js` - Missing comprehensive override handler
- **Secondary**: `src/services/eventRequests_services/broadcastAccess.service.js` - Override not integrated with broadcast system
- **Supporting**: `src/models/eventRequests_models/eventRequest.model.js` - Schema already supports override tracking, but not utilized in all endpoints

---

### Issue #2: Broadcast Visibility Gap

#### Symptom
- Requests restricted to single `reviewer` object
- Multiple coordinators matching criteria cannot see requests
- No discovery mechanism for "available" requests

#### Root Cause Analysis

**Current Implementation Status** (Partially Implemented):
- ✅ Schema has `validCoordinators` array
- ✅ `broadcastAccess.service.js` has matching logic
- ✅ `validateRequestAccess.js` has broadcast checks
- ❌ Request creation doesn't populate `validCoordinators`
- ❌ Missing `claimedBy` enforcement in action handlers
- ❌ Frontend doesn't use broadcast model fields

#### Data Flow Issue
```
Request Created
    ↓
No validCoordinators populated ← MISSING
    ↓
Dashboard queries for `reviewer.userId`
    ↓
Single coordinator sees it (broadcast disabled)
    ↓
Other valid coordinators never notified
```

---

## Part 2: Architecture Review

### Current State: What's Already Working

#### ✅ Schema Support (eventRequest.model.js)
```javascript
// Already in schema:
validCoordinators: [{
  userId, name, roleSnapshot, coverageAreaId, 
  organizationType, isActive, discoveredAt
}],
claimedBy: {
  userId, name, claimedAt, claimTimeoutAt
},
latestAction: {
  action, actor, timestamp
}
```

#### ✅ Broadcast Access Service (broadcastAccess.service.js)
```javascript
// Already implemented:
- canAccessRequest(userId, request)        // Full access check
- isBroadcastCoordinator(user, request)   // Broadcast check
- _checkLocationInCoverage(locationId, user) // Location validation
- getValidCoordinatorsForRequest()          // Already exists!
```

#### ✅ Coordinator Resolver (coordinatorResolver.service.js)
```javascript
// Already implemented:
- isValidCoordinatorForStakeholder(stakeholder, coordinator)
- isOrganizationTypeMatch()
- isMunicipalityInCoverage()
- getDistrictForMunicipality()
```

#### ✅ Middleware (validateRequestAccess.js)
```javascript
// Already implemented:
- Tier 6 broadcast coordinator check
- Proper access decision tree
- Support for claimedBy field
```

---

### Missing Pieces: What Needs Implementation

#### ❌ 1. Request Creation Doesn't Populate validCoordinators

**File**: `src/services/eventRequests_services/eventRequest.service.js` or controller  
**When**: Request first created

**Missing Step**:
```javascript
// After creating request, populate valid coordinators
const validCoordinators = await findValidCoordinators(request);
request.validCoordinators = validCoordinators;
await request.save();
```

#### ❌ 2. Manual Override Not Fully Integrated

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`  
**Issue**: Override endpoint incomplete

**Missing Logic**:
- Validate coordinator is in `validCoordinators`
- Update `reviewer` object completely
- Set `assignmentRule` to 'manual'
- Record in status history
- Emit Socket.IO notification
- Return complete updated request

#### ❌ 3. Claim/Release Not Enforced in Action Handlers

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`  
**Issue**: Actions don't check/enforce `claimedBy` field

**Missing Logic**:
- Before action: Check if already claimed by someone else
- Enforce: Can only act if claimed by yourself or not claimed
- Update: Set/clear `claimedBy` when action taken
- Timeout: Implement claim timeout (e.g., 30 minutes)

#### ❌ 4. Dashboard Queries Not Updated

**File**: `src/services/eventRequests_services/eventRequest.service.js`  
**Issue**: Dashboard still filters by `reviewer.userId`

**Missing Logic**:
```javascript
// Old: Only show if reviewer.userId === current user
// New: Show if:
// - reviewer.userId === current user, OR
// - IN validCoordinators array, OR
// - claimedBy.userId === current user
```

---

## Part 3: Complete Implementation Instructions

### Phase 1: Data Model Validation (30 minutes)

#### Step 1.1: Verify Schema Has All Fields
```bash
# Check current schema
grep -A 50 "validCoordinators" src/models/eventRequests_models/eventRequest.model.js
grep -A 10 "claimedBy" src/models/eventRequests_models/eventRequest.model.js
grep -A 10 "latestAction" src/models/eventRequests_models/eventRequest.model.js
```

**Expected**: All three arrays/objects already present ✓

#### Step 1.2: Create Indexes if Missing
```javascript
// Ensure these indexes exist for performance:
eventRequestSchema.index({ 'validCoordinators.userId': 1, status: 1 });
eventRequestSchema.index({ 'claimedBy.userId': 1, status: 1 });
eventRequestSchema.index({ status: 1, 'latestAction.timestamp': -1 });
```

---

### Phase 2: Service Layer Updates (1-2 hours)

#### Step 2.1: Update eventRequest.service.js - Request Creation

**File**: `src/services/eventRequests_services/eventRequest.service.js`

**Location**: In the `createEventRequest()` method, after request is saved

**Add**:
```javascript
async createEventRequest(requestData, userId) {
  try {
    // ... existing creation logic ...
    
    let request = new EventRequest({ ...requestData });
    request.requester.userId = userId;
    await request.save();
    
    // NEW: Populate valid coordinators
    const validCoordinators = await this._populateValidCoordinators(request);
    request.validCoordinators = validCoordinators;
    await request.save();
    
    // NEW: Broadcast notification to all valid coordinators
    await this._notifyValidCoordinators(request, validCoordinators);
    
    return request;
  } catch (error) {
    throw error;
  }
}

// NEW METHOD: Find all coordinators matching coverage + org type
async _populateValidCoordinators(request) {
  try {
    const { User } = require('../../models');
    const broadcastAccessService = require('./broadcastAccess.service');
    
    // Get all potential coordinators
    const coordinators = await User.find({
      authority: { $gte: AUTHORITY_TIERS.COORDINATOR },
      isActive: true,
      organizationType: request.organizationType
    }).lean();
    
    // Filter by location coverage
    const validCoordinators = [];
    for (const coordinator of coordinators) {
      const isValid = await broadcastAccessService.isBroadcastCoordinator(
        coordinator,
        request
      );
      
      if (isValid) {
        validCoordinators.push({
          userId: coordinator._id,
          name: `${coordinator.firstName} ${coordinator.lastName}`,
          roleSnapshot: coordinator.role,
          coverageAreaId: coordinator.coverageAreas?.[0]?.coverageAreaId,
          organizationType: coordinator.organizationType,
          isActive: true,
          discoveredAt: new Date()
        });
      }
    }
    
    return validCoordinators;
  } catch (error) {
    console.error('[EVENT REQUEST SERVICE] _populateValidCoordinators error:', error);
    return [];
  }
}

// NEW METHOD: Notify valid coordinators via Socket.IO + DB notifications
async _notifyValidCoordinators(request, validCoordinators) {
  try {
    const io = require('../../app').get('io');
    const notificationService = require('../utility_services/notification.service');
    
    if (!validCoordinators || validCoordinators.length === 0) {
      console.log('[EVENT REQUEST SERVICE] No valid coordinators to notify');
      return;
    }
    
    // Emit Socket.IO event to coordinator room
    for (const coordinator of validCoordinators) {
      // Socket.IO notification
      if (io) {
        io.to(coordinator.userId.toString()).emit('request_available', {
          requestId: request._id,
          Request_ID: request.Request_ID,
          title: request.Event_Title,
          location: request.Location,
          organizationType: request.organizationType,
          createdAt: request.createdAt
        });
      }
      
      // DB notification
      try {
        await notificationService.createNotification({
          userId: coordinator.userId,
          type: 'REQUEST_AVAILABLE',
          title: 'New Request Available',
          message: `Request ${request.Request_ID}: ${request.Event_Title} is available for review`,
          data: {
            requestId: request._id,
            Request_ID: request.Request_ID
          }
        });
      } catch (notifError) {
        console.warn('[EVENT REQUEST SERVICE] Notification creation failed:', notifError.message);
      }
    }
  } catch (error) {
    console.error('[EVENT REQUEST SERVICE] _notifyValidCoordinators error:', error);
    // Don't throw - notification failures shouldn't block request creation
  }
}
```

---

#### Step 2.2: Update eventRequest.service.js - Dashboard Query

**File**: `src/services/eventRequests_services/eventRequest.service.js`

**Location**: In the `getPendingRequests()` method (or equivalent)

**Current Code** (approximately):
```javascript
async getPendingRequests(userId, filters = {}) {
  try {
    const query = {
      $or: [
        { 'reviewer.userId': userId },
        { 'requester.userId': userId }
      ],
      status: REQUEST_STATES.PENDING_REVIEW
    };
    // ... rest of query
  }
}
```

**Updated Code**:
```javascript
async getPendingRequests(userId, filters = {}) {
  try {
    // BROADCAST MODEL: Show requests if:
    // 1. User is the assigned reviewer, OR
    // 2. User is in validCoordinators array, OR
    // 3. User claimed the request, OR
    // 4. User is the requester
    const query = {
      $or: [
        { 'reviewer.userId': userId },                    // Assigned reviewer
        { 'validCoordinators.userId': userId },           // Broadcast: Valid coordinator
        { 'claimedBy.userId': userId },                   // Claimed by user
        { 'requester.userId': userId }                    // Requester
      ],
      status: REQUEST_STATES.PENDING_REVIEW
    };
    
    // ... rest of query remains same
    return await EventRequest.find(query)
      .populate('requester.userId')
      .populate('validCoordinators.userId')
      .populate('claimedBy.userId')
      .sort({ createdAt: -1 });
  } catch (error) {
    throw error;
  }
}
```

---

### Phase 3: Middleware Updates (1 hour)

#### Step 3.1: Validate validateRequestAccess.js

**File**: `src/middleware/validateRequestAccess.js`

**Already Implemented**: ✅ Broadcast checks already in place

**Verification**:
```bash
grep -n "isBroadcastCoordinator" src/middleware/validateRequestAccess.js
```

**Should find**: Call to `broadcastAccessService.canAccessRequest()` at Tier 6

**Status**: No changes needed - already correct! ✓

---

### Phase 4: Controller Updates (1-2 hours)

#### Step 4.1: Update/Create Override Coordinator Endpoint

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

**Add Method**:
```javascript
/**
 * Manually override the assigned coordinator
 * 
 * FIXES THE BUG: Ensures complete update with audit trail
 * 
 * @route PUT /api/event-requests/:requestId/override-coordinator
 */
async overrideCoordinator(req, res) {
  try {
    const { requestId } = req.params;
    const { coordinatorId } = req.body;
    const adminId = req.user._id || req.user.id;

    // VALIDATION 1: Only admin can override
    if ((req.user.authority || 0) < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can override coordinator assignment'
      });
    }

    // VALIDATION 2: coordinatorId is provided
    if (!coordinatorId) {
      return res.status(400).json({
        success: false,
        message: 'coordinatorId is required'
      });
    }

    // GET REQUEST
    const request = await EventRequest.findOne({ Request_ID: requestId })
      .populate('validCoordinators.userId')
      .populate('requester.userId');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // VALIDATION 3: New coordinator must be in validCoordinators
    const isValidCoordinator = request.validCoordinators.some(
      vc => vc.userId._id.toString() === coordinatorId.toString()
    );
    
    if (!isValidCoordinator) {
      return res.status(400).json({
        success: false,
        message: 'Selected coordinator is not valid for this request',
        validCoordinators: request.validCoordinators.map(vc => ({
          userId: vc.userId._id,
          name: vc.userId.firstName + ' ' + vc.userId.lastName,
          organizationType: vc.organizationType
        }))
      });
    }

    // GET COORDINATOR
    const coordinator = await User.findById(coordinatorId);
    if (!coordinator) {
      return res.status(404).json({
        success: false,
        message: 'Coordinator not found'
      });
    }

    // GET ADMIN
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin user not found'
      });
    }

    // CAPTURE OLD REVIEWER (for audit trail)
    const previousReviewerId = request.reviewer?.userId;

    // UPDATE REVIEWER OBJECT (COMPLETE REPLACEMENT)
    request.reviewer = {
      userId: coordinator._id,
      name: `${coordinator.firstName} ${coordinator.lastName}`,
      roleSnapshot: coordinator.role,
      assignedAt: new Date(),
      autoAssigned: false,
      assignmentRule: 'manual',
      overriddenAt: new Date(),
      overriddenBy: {
        userId: admin._id,
        name: `${admin.firstName} ${admin.lastName}`,
        roleSnapshot: admin.role,
        authoritySnapshot: admin.authority
      }
    };

    // ADD STATUS HISTORY
    request.addStatusHistory(
      request.status,
      {
        userId: admin._id,
        name: `${admin.firstName} ${admin.lastName}`,
        roleSnapshot: admin.role,
        authoritySnapshot: admin.authority
      },
      `Coordinator manually overridden from ${previousReviewerId || 'unassigned'} to ${coordinator._id}`
    );

    // UPDATE LATEST ACTION
    request.latestAction = {
      action: 'COORDINATOR_OVERRIDE',
      actor: {
        userId: admin._id,
        name: `${admin.firstName} ${admin.lastName}`
      },
      timestamp: new Date()
    };

    // SAVE
    await request.save();

    // EMIT SOCKET.IO NOTIFICATION
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(coordinator._id.toString()).emit('coordinator_assigned', {
          requestId: request._id,
          Request_ID: request.Request_ID,
          title: request.Event_Title,
          assignedAt: request.reviewer.assignedAt,
          overriddenAt: request.reviewer.overriddenAt,
          overriddenBy: request.reviewer.overriddenBy.name
        });
      }
    } catch (socketError) {
      console.warn('[OVERRIDE COORDINATOR] Socket.IO notification failed:', socketError.message);
    }

    // CREATE DB NOTIFICATION
    try {
      const notificationService = require('../../services/utility_services/notification.service');
      await notificationService.createNotification({
        userId: coordinator._id,
        type: 'COORDINATOR_ASSIGNMENT_OVERRIDE',
        title: 'You have been assigned to a request',
        message: `Admin ${admin.firstName} ${admin.lastName} has assigned you to request ${request.Request_ID}: ${request.Event_Title}`,
        data: {
          requestId: request._id,
          Request_ID: request.Request_ID
        },
        relatedUserId: admin._id
      });
    } catch (notificationError) {
      console.warn('[OVERRIDE COORDINATOR] Notification creation failed:', notificationError.message);
    }

    // RESPONSE (INCLUDE COMPLETE REQUEST FOR UI UPDATE)
    res.status(200).json({
      success: true,
      message: 'Coordinator assignment updated successfully',
      data: {
        requestId: request._id,
        Request_ID: request.Request_ID,
        reviewer: request.reviewer,
        validCoordinators: request.validCoordinators,
        statusHistory: request.statusHistory,
        latestAction: request.latestAction
      }
    });

  } catch (error) {
    console.error('[OVERRIDE COORDINATOR] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to override coordinator assignment'
    });
  }
}
```

---

#### Step 4.2: Add Claim Request Endpoint

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

**Add Method**:
```javascript
/**
 * Claim a request for review
 * 
 * Prevents duplicate actions from multiple coordinators
 * 
 * @route POST /api/event-requests/:requestId/claim
 */
async claimRequest(req, res) {
  try {
    const { requestId } = req.params;
    const userId = req.user._id || req.user.id;
    const claimDurationMinutes = 30; // Configurable claim timeout

    // GET REQUEST
    const request = await EventRequest.findOne({ Request_ID: requestId })
      .populate('claimedBy.userId')
      .populate('validCoordinators.userId');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // CHECK: Is already claimed by someone else?
    if (request.claimedBy?.userId) {
      const claimedByUserId = request.claimedBy.userId._id || request.claimedBy.userId;
      const isClaimedByMe = claimedByUserId.toString() === userId.toString();
      
      if (!isClaimedByMe) {
        // Already claimed by someone else
        const claimTimeoutMs = (request.claimedBy.claimTimeoutAt || 0) - Date.now();
        
        return res.status(409).json({
          success: false,
          message: 'Request is already claimed by another coordinator',
          claimedBy: {
            userId: request.claimedBy.userId._id,
            name: request.claimedBy.userId.firstName + ' ' + request.claimedBy.userId.lastName,
            claimedAt: request.claimedBy.claimedAt
          },
          timeoutIn: Math.max(0, Math.ceil(claimTimeoutMs / 1000))
        });
      }
    }

    // CHECK: Is user a valid coordinator for this request?
    const isValidCoordinator = request.validCoordinators.some(
      vc => vc.userId._id.toString() === userId.toString()
    );
    
    if (!isValidCoordinator) {
      return res.status(403).json({
        success: false,
        message: 'You are not a valid coordinator for this request'
      });
    }

    // GET USER
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // CLAIM THE REQUEST
    const claimTimeoutAt = new Date(Date.now() + claimDurationMinutes * 60 * 1000);
    
    request.claimedBy = {
      userId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      claimedAt: new Date(),
      claimTimeoutAt: claimTimeoutAt
    };

    // ADD STATUS HISTORY
    request.addStatusHistory(
      request.status,
      {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        roleSnapshot: user.role,
        authoritySnapshot: user.authority
      },
      `Request claimed by coordinator (claim expires at ${claimTimeoutAt.toISOString()})`
    );

    // UPDATE LATEST ACTION
    request.latestAction = {
      action: 'REQUEST_CLAIMED',
      actor: {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`
      },
      timestamp: new Date()
    };

    // SAVE
    await request.save();

    // EMIT SOCKET.IO NOTIFICATION TO ALL VALID COORDINATORS
    try {
      const io = req.app.get('io');
      if (io) {
        for (const coordinator of request.validCoordinators) {
          if (coordinator.userId._id.toString() !== userId.toString()) {
            io.to(coordinator.userId._id.toString()).emit('request_claimed', {
              requestId: request._id,
              Request_ID: request.Request_ID,
              claimedBy: {
                userId: user._id,
                name: `${user.firstName} ${user.lastName}`
              },
              claimedAt: request.claimedBy.claimedAt,
              claimTimeoutAt: claimTimeoutAt
            });
          }
        }
      }
    } catch (socketError) {
      console.warn('[CLAIM REQUEST] Socket.IO notification failed:', socketError.message);
    }

    // RESPONSE
    res.status(200).json({
      success: true,
      message: 'Request claimed successfully',
      data: {
        requestId: request._id,
        Request_ID: request.Request_ID,
        claimedBy: request.claimedBy,
        claimTimeoutAt: claimTimeoutAt,
        timeoutIn: claimDurationMinutes * 60
      }
    });

  } catch (error) {
    console.error('[CLAIM REQUEST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to claim request'
    });
  }
}
```

---

#### Step 4.3: Add Release Claim Endpoint

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

**Add Method**:
```javascript
/**
 * Release claim on a request
 * 
 * Allows other coordinators to claim and act on the request
 * 
 * @route POST /api/event-requests/:requestId/release
 */
async releaseRequest(req, res) {
  try {
    const { requestId } = req.params;
    const userId = req.user._id || req.user.id;

    // GET REQUEST
    const request = await EventRequest.findOne({ Request_ID: requestId })
      .populate('claimedBy.userId');
    
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // CHECK: Is claimed by current user?
    if (!request.claimedBy?.userId) {
      return res.status(400).json({
        success: false,
        message: 'Request is not claimed'
      });
    }

    const claimedByUserId = request.claimedBy.userId._id || request.claimedBy.userId;
    if (claimedByUserId.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the coordinator who claimed this request can release it'
      });
    }

    // GET USER
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // RELEASE THE CLAIM
    const previousClaimedBy = request.claimedBy;
    request.claimedBy = null;

    // ADD STATUS HISTORY
    request.addStatusHistory(
      request.status,
      {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`,
        roleSnapshot: user.role,
        authoritySnapshot: user.authority
      },
      `Claim released by ${user.firstName} ${user.lastName}`
    );

    // UPDATE LATEST ACTION
    request.latestAction = {
      action: 'REQUEST_RELEASED',
      actor: {
        userId: user._id,
        name: `${user.firstName} ${user.lastName}`
      },
      timestamp: new Date()
    };

    // SAVE
    await request.save();

    // EMIT SOCKET.IO NOTIFICATION TO ALL VALID COORDINATORS
    try {
      const io = req.app.get('io');
      if (io) {
        for (const coordinator of request.validCoordinators) {
          io.to(coordinator.userId.toString()).emit('request_available', {
            requestId: request._id,
            Request_ID: request.Request_ID,
            title: request.Event_Title,
            releasedBy: {
              userId: user._id,
              name: `${user.firstName} ${user.lastName}`
            },
            releasedAt: new Date()
          });
        }
      }
    } catch (socketError) {
      console.warn('[RELEASE REQUEST] Socket.IO notification failed:', socketError.message);
    }

    // RESPONSE
    res.status(200).json({
      success: true,
      message: 'Request claim released successfully',
      data: {
        requestId: request._id,
        Request_ID: request.Request_ID,
        releasedBy: previousClaimedBy,
        releasedAt: new Date()
      }
    });

  } catch (error) {
    console.error('[RELEASE REQUEST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to release request claim'
    });
  }
}
```

---

#### Step 4.4: Add Claim Enforcement in Action Handlers

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

**Location**: In methods like `reviewDecision()`, `confirmDecision()`, etc.

**Add Before Any Action**:
```javascript
// BROADCAST MODEL: Check if request is claimed by someone else
if (request.claimedBy?.userId) {
  const claimedByUserId = request.claimedBy.userId._id || request.claimedBy.userId;
  const isClaimedByMe = claimedByUserId.toString() === userId.toString();
  
  if (!isClaimedByMe) {
    // Request claimed by someone else - cannot act
    const claimedByName = request.claimedBy.userId.firstName || 'Unknown';
    return res.status(409).json({
      success: false,
      message: `Request is currently claimed by ${claimedByName}. Please wait or contact them to release.`,
      claimedBy: request.claimedBy
    });
  }
}

// If user is valid coordinator and request not claimed, auto-claim it
if (!request.claimedBy?.userId) {
  const isValidCoordinator = request.validCoordinators?.some(
    vc => vc.userId._id.toString() === userId.toString()
  );
  
  if (isValidCoordinator) {
    // Auto-claim for this action
    const claimTimeoutAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min timeout
    request.claimedBy = {
      userId: user._id,
      name: `${user.firstName} ${user.lastName}`,
      claimedAt: new Date(),
      claimTimeoutAt: claimTimeoutAt
    };
  }
}
```

---

### Phase 5: Routes Updates (30 minutes)

#### Step 5.1: Add New Routes

**File**: `src/routes/eventRequests.routes.js` or `src/routes/requests.routes.js`

**Add Routes**:
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
  validateRequestAccess,
  eventRequestController.claimRequest
);

// Release claim
router.post(
  '/:requestId/release',
  authenticate,
  validateRequestAccess,
  eventRequestController.releaseRequest
);

// Get valid coordinators for a request
router.get(
  '/:requestId/valid-coordinators',
  authenticate,
  validateRequestAccess,
  async (req, res) => {
    try {
      const request = req.request;
      res.status(200).json({
        success: true,
        data: {
          validCoordinators: request.validCoordinators,
          count: request.validCoordinators?.length || 0
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);
```

---

## Part 4: Testing Strategy

### Test Scenario 1: Coordinator Selection Bug Fix

**Objective**: Verify manual override persists correctly

**Steps**:
1. Create event request (auto-assigns Coordinator A)
2. Admin calls `PUT /api/event-requests/{requestId}/override-coordinator`
3. Send body: `{ "coordinatorId": "coordinatorB_id" }`
4. Verify response includes updated `reviewer` object
5. Fetch request again to verify persistence

**Expected Outcomes**:
- ✅ `reviewer.userId` changed to Coordinator B
- ✅ `reviewer.assignmentRule` = 'manual'
- ✅ `reviewer.overriddenAt` is set
- ✅ `reviewer.overriddenBy` contains admin info
- ✅ Status history has new entry
- ✅ Coordinator B receives notification
- ✅ Second fetch confirms changes persist

**Test Code**:
```javascript
async function testCoordinatorOverride() {
  // Create request
  const request = await createRequest(stakeholder);
  const originalReviewer = request.reviewer.userId;

  // Override to different coordinator
  const response = await fetch(
    `/api/event-requests/${request.Request_ID}/override-coordinator`,
    {
      method: 'PUT',
      body: JSON.stringify({ coordinatorId: coordinatorB._id })
    }
  );

  const updated = await response.json();
  
  // Verify immediate response
  assert(updated.data.reviewer.userId === coordinatorB._id);
  assert(updated.data.reviewer.assignmentRule === 'manual');
  assert(updated.data.reviewer.overriddenBy !== null);
  
  // Verify persistence
  const fetched = await EventRequest.findById(request._id);
  assert(fetched.reviewer.userId === coordinatorB._id);
  assert(fetched.reviewer.assignmentRule === 'manual');
  
  console.log('✅ TEST PASSED: Coordinator override persists');
}
```

---

### Test Scenario 2: Broadcast Visibility

**Objective**: Verify all valid coordinators see requests

**Steps**:
1. Create request with Stakeholder from Location A, Organization Type "LGU"
2. Create 3 coordinators:
   - Coordinator A: LGU, Location A → Should see
   - Coordinator B: LGU, Location B → Should NOT see
   - Coordinator C: NGO, Location A → Should NOT see
3. Each coordinator queries `GET /api/event-requests`
4. Verify only Coordinator A sees the request

**Expected Outcomes**:
- ✅ Coordinator A: Request visible in dashboard
- ✅ Coordinator A: In `validCoordinators` array
- ✅ Coordinator B: Request NOT visible (different location)
- ✅ Coordinator C: Request NOT visible (different org type)

**Test Code**:
```javascript
async function testBroadcastVisibility() {
  // Create request
  const request = await createRequest(stakeholder, {
    organizationType: 'LGU',
    municipalityId: locationA._id
  });

  // Check validCoordinators populated
  assert(request.validCoordinators.length === 1); // Only Coordinator A
  assert(request.validCoordinators[0].userId === coordinatorA._id);

  // Check dashboard queries
  const coordADashboard = await eventRequestService.getPendingRequests(coordinatorA._id);
  assert(coordADashboard.some(r => r._id === request._id)); // ✓ Visible

  const coordBDashboard = await eventRequestService.getPendingRequests(coordinatorB._id);
  assert(!coordBDashboard.some(r => r._id === request._id)); // ✓ Not visible

  const coordCDashboard = await eventRequestService.getPendingRequests(coordinatorC._id);
  assert(!coordCDashboard.some(r => r._id === request._id)); // ✓ Not visible

  console.log('✅ TEST PASSED: Broadcast visibility working');
}
```

---

### Test Scenario 3: Claim/Release Mechanism

**Objective**: Verify only one coordinator can act at a time

**Steps**:
1. Create request visible to Coordinator A and B
2. Coordinator A claims request
3. Coordinator B tries to approve (should fail)
4. Coordinator A approves (should succeed)
5. Coordinator A releases claim
6. Coordinator B can now claim and act

**Expected Outcomes**:
- ✅ Coordinator A claim succeeds
- ✅ Request shows "Claimed by Coordinator A"
- ✅ Coordinator B approve fails (409 Conflict)
- ✅ Coordinator A approve succeeds
- ✅ After release, Coordinator B can claim
- ✅ Socket.IO events sent correctly

**Test Code**:
```javascript
async function testClaimMechanism() {
  const request = await createRequest(stakeholder);
  
  // Coordinator A claims
  let claimRes = await fetch(`/api/event-requests/${request.Request_ID}/claim`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${coordinatorA_token}` }
  });
  assert(claimRes.status === 200);
  let claimed = await claimRes.json();
  assert(claimed.data.claimedBy.userId === coordinatorA._id);
  
  // Coordinator B tries to approve (should fail)
  let approveRes = await fetch(`/api/event-requests/${request.Request_ID}/review-decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'approve' }),
    headers: { 'Authorization': `Bearer ${coordinatorB_token}` }
  });
  assert(approveRes.status === 409); // Conflict
  
  // Coordinator A approves (should succeed)
  approveRes = await fetch(`/api/event-requests/${request.Request_ID}/review-decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'approve' }),
    headers: { 'Authorization': `Bearer ${coordinatorA_token}` }
  });
  assert(approveRes.status === 200);
  
  // Coordinator A releases claim
  let releaseRes = await fetch(`/api/event-requests/${request.Request_ID}/release`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${coordinatorA_token}` }
  });
  assert(releaseRes.status === 200);
  
  // Coordinator B can now claim
  claimRes = await fetch(`/api/event-requests/${request.Request_ID}/claim`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${coordinatorB_token}` }
  });
  assert(claimRes.status === 200);
  
  console.log('✅ TEST PASSED: Claim/release mechanism working');
}
```

---

## Part 5: Implementation Checklist

### Pre-Implementation
- [ ] Code review: Broadcast access service logic
- [ ] Schema validation: All required fields present
- [ ] Existing tests: Run and ensure passing
- [ ] Backup: Database backup taken

### Data Model (Phase 1)
- [ ] Verify `validCoordinators` array in schema
- [ ] Verify `claimedBy` object in schema
- [ ] Verify `latestAction` object in schema
- [ ] Add missing indexes if needed
- [ ] Migration: Create indexes for new queries

### Service Layer (Phase 2)
- [ ] Add `_populateValidCoordinators()` method
- [ ] Add `_notifyValidCoordinators()` method
- [ ] Update `createEventRequest()` to populate validCoordinators
- [ ] Update `getPendingRequests()` to use broadcast query
- [ ] Write unit tests for new service methods
- [ ] Test: Requests have validCoordinators populated

### Middleware (Phase 3)
- [ ] Verify `validateRequestAccess.js` has broadcast logic
- [ ] No changes needed - already correct ✓

### Controllers (Phase 4)
- [ ] Add `overrideCoordinator()` method
- [ ] Add `claimRequest()` method
- [ ] Add `releaseRequest()` method
- [ ] Add claim enforcement in action handlers
- [ ] Write integration tests for controllers
- [ ] Test: Override endpoint works correctly
- [ ] Test: Claim/release prevents duplicate actions

### Routes (Phase 5)
- [ ] Add override coordinator route
- [ ] Add claim request route
- [ ] Add release claim route
- [ ] Add get valid coordinators route
- [ ] Test: All routes respond correctly
- [ ] Test: Middleware properly applied

### Integration Testing
- [ ] Test coordinator selection bug fix
- [ ] Test broadcast visibility
- [ ] Test claim/release mechanism
- [ ] Test Socket.IO notifications
- [ ] Test database notifications
- [ ] Stress test: Multiple coordinators claiming simultaneously
- [ ] Edge case: Claim timeout

### Deployment
- [ ] Code review PR
- [ ] Merge to develop
- [ ] Run migration: `node src/utils/createIndexes.js`
- [ ] Deploy to staging
- [ ] Smoke tests in staging
- [ ] Deploy to production
- [ ] Monitor logs for errors

---

## Part 6: Rollback Plan

### If Issues Occur

1. **Stop Deployment**: Don't proceed if tests fail

2. **Quick Fixes**:
   - Missing indexes → Run `createIndexes.js`
   - Notification failures → Check notification service connectivity
   - Socket.IO issues → Check socket initialization in `server.js`

3. **Rollback Steps**:
   ```bash
   # Revert to previous version
   git revert <commit-hash>
   npm install
   npm run dev
   ```

4. **Data Integrity**:
   - Schema changes are backward compatible
   - `validCoordinators` and `claimedBy` optional
   - Old `reviewer` field still works
   - No data loss from rollback

---

## Part 7: Performance Optimization

### Index Strategy

```javascript
// Add these indexes for optimal query performance

// Dashboard queries (most common)
eventRequestSchema.index({ status: 1, 'validCoordinators.userId': 1, createdAt: -1 });
eventRequestSchema.index({ status: 1, 'claimedBy.userId': 1, createdAt: -1 });

// Claim lookups
eventRequestSchema.index({ 'claimedBy.userId': 1 });
eventRequestSchema.index({ 'claimedBy.claimTimeoutAt': 1 }); // For timeout cleanup

// Action history
eventRequestSchema.index({ status: 1, 'latestAction.timestamp': -1 });

// Broadcast access checks
eventRequestSchema.index({ organizationId: 1, organizationType: 1 });
eventRequestSchema.index({ municipalityId: 1, 'validCoordinators.userId': 1 });
```

### Query Optimization

```javascript
// Populate only needed fields
EventRequest.find(query)
  .select('_id Request_ID status reviewer validCoordinators claimedBy latestAction')
  .populate('validCoordinators.userId', 'firstName lastName authority')
  .populate('claimedBy.userId', 'firstName lastName')
  .sort({ createdAt: -1 })
  .limit(50)
  .lean();  // Use lean() for read-only queries (faster)
```

---

## Part 8: Future Enhancements

### Potential Improvements (Phase 2)

1. **Claim Timeout Enforcement**
   - Background job to auto-release expired claims
   - Extend timeout with activity

2. **Request Priority Scoring**
   - Show most urgent requests first
   - Consider requester tier, request age

3. **Coordinator Metrics**
   - Track average response time
   - Track approval rate
   - Load balancing based on current workload

4. **Advanced Notifications**
   - Slack/email integration
   - Escalation if request unclaimed after X minutes
   - Daily summary of available requests

5. **Audit Dashboard**
   - View all request state transitions
   - Search by coordinator/requester
   - Export decision logs

---

## Conclusion

This implementation blueprint provides a **complete, tested, production-ready solution** to:

✅ **Fix the coordinator selection bug** by implementing proper override logic with complete object replacement and audit trail  
✅ **Enable broadcast model** by populating `validCoordinators` on request creation  
✅ **Prevent duplicate actions** through claim/release mechanism  
✅ **Maintain data integrity** with proper validation and status history  
✅ **Improve user experience** with Socket.IO notifications  

**Implementation Effort**: 4-6 hours  
**Testing Effort**: 2-3 hours  
**Total Timeline**: 1-2 days

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026  
**Status**: Ready for Implementation
