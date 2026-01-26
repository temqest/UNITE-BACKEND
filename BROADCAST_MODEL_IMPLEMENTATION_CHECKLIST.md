# Broadcast Model Implementation Checklist & Migration Guide

**Date**: January 26, 2026  
**Status**: Ready for Implementation  
**Estimated Time**: 4-6 hours development + 2-3 hours testing  

---

## Pre-Implementation Checklist

### Code Review & Preparation
- [ ] Review BROADCAST_MODEL_FINAL_IMPLEMENTATION.md (architecture overview)
- [ ] Review BROADCAST_MODEL_CONTROLLER_METHODS.js (controller code)
- [ ] Review BROADCAST_MODEL_SERVICE_METHODS.js (service code)
- [ ] Review BROADCAST_MODEL_ROUTES.js (route definitions)
- [ ] Review BROADCAST_MODEL_TESTS.js (test scenarios)
- [ ] Code review with team lead
- [ ] Set up feature branch: `git checkout -b broadcast-model-implementation`

### Environment & Database
- [ ] MongoDB instance running and accessible
- [ ] Database backed up: `mongodump --uri="mongodb://..." --out backup/`
- [ ] Connection string in `.env` file
- [ ] Test environment data available

### Dependencies
- [ ] All npm packages up to date: `npm install`
- [ ] Socket.IO initialized in `server.js`
- [ ] Notification service available
- [ ] Permission service working

---

## Phase 1: Data Model Validation (30 minutes)

### Step 1.1: Verify Schema Fields
```bash
# Check if schema has all required fields
grep -A 5 "validCoordinators:" src/models/eventRequests_models/eventRequest.model.js
grep -A 5 "claimedBy:" src/models/eventRequests_models/eventRequest.model.js
grep -A 5 "latestAction:" src/models/eventRequests_models/eventRequest.model.js
```

**Expected Output**: All three fields present in schema

**Status**: ✅ Already implemented  
**Action**: None needed - schema already correct

### Step 1.2: Create Required Indexes

**File**: `src/utils/createIndexes.js`

**Add these indexes**:
```javascript
// Add to existing index creation script
db.eventRequests.createIndex({ 'validCoordinators.userId': 1, status: 1 });
db.eventRequests.createIndex({ 'claimedBy.userId': 1, status: 1 });
db.eventRequests.createIndex({ status: 1, 'latestAction.timestamp': -1 });
db.eventRequests.createIndex({ status: 1, 'validCoordinators.userId': 1, createdAt: -1 });
```

**Checklist**:
- [ ] Add indexes to `createIndexes.js`
- [ ] Run: `node src/utils/createIndexes.js`
- [ ] Verify: `mongosh → db.eventRequests.getIndexes()`

---

## Phase 2: Service Layer Updates (1-2 hours)

### Step 2.1: Update eventRequest.service.js

**File**: `src/services/eventRequests_services/eventRequest.service.js`

**Tasks**:
- [ ] Add `_populateValidCoordinators()` method
  - Copy from BROADCAST_MODEL_SERVICE_METHODS.js
  - Location: In class after `_getUser()` method
- [ ] Add `_notifyValidCoordinators()` method
  - Copy from BROADCAST_MODEL_SERVICE_METHODS.js
  - Location: In class after `_populateValidCoordinators()` method
- [ ] Add `_determineUserRole()` helper method
- [ ] Add `getPendingRequestsByRole()` method

### Step 2.2: Update createEventRequest() Method

**File**: `src/services/eventRequests_services/eventRequest.service.js`

**Location**: In `createEventRequest()` method

**After**: `await request.save();` (initial save)

**Add**:
```javascript
// Populate valid coordinators (BROADCAST MODEL)
try {
  const validCoordinators = await this._populateValidCoordinators(request);
  request.validCoordinators = validCoordinators;
  await request.save();
} catch (coordError) {
  console.warn('[CREATE EVENT REQUEST] Error populating coordinators:', coordError.message);
}

// Notify valid coordinators
try {
  await this._notifyValidCoordinators(request, request.validCoordinators);
} catch (notifyError) {
  console.warn('[CREATE EVENT REQUEST] Error notifying coordinators:', notifyError.message);
}
```

**Checklist**:
- [ ] Add `_populateValidCoordinators()` method
- [ ] Add `_notifyValidCoordinators()` method
- [ ] Update `createEventRequest()` to call both
- [ ] Test: Create request and verify validCoordinators populated
- [ ] Test: Verify notifications sent

### Step 2.3: Update getPendingRequests() Method

**File**: `src/services/eventRequests_services/eventRequest.service.js`

**Current Query**:
```javascript
const query = {
  $or: [
    { 'reviewer.userId': userId },
    { 'requester.userId': userId }
  ]
};
```

**Updated Query**:
```javascript
const query = {
  $or: [
    { 'reviewer.userId': userId },              // Assigned reviewer
    { 'validCoordinators.userId': userId },     // Broadcast valid
    { 'claimedBy.userId': userId },             // Claimed by user
    { 'requester.userId': userId }              // Requester
  ],
  status: filters.status || 'PENDING_REVIEW'
};
```

**Checklist**:
- [ ] Update query to include `validCoordinators` and `claimedBy`
- [ ] Populate `validCoordinators.userId` in find query
- [ ] Populate `claimedBy.userId` in find query
- [ ] Test: Verify dashboard shows all broadcast requests

---

## Phase 3: Middleware Validation (15 minutes)

### Step 3.1: Verify validateRequestAccess.js

**File**: `src/middleware/validateRequestAccess.js`

**Check**:
```bash
grep -n "isBroadcastCoordinator" src/middleware/validateRequestAccess.js
grep -n "broadcastAccessService" src/middleware/validateRequestAccess.js
```

**Expected**: Broadcast checks already present

**Status**: ✅ Already implemented  
**Action**: No changes needed

**Checklist**:
- [ ] Verify broadcast access checks present
- [ ] Verify `claimedBy` check present
- [ ] Test: Middleware allows valid coordinators through

---

## Phase 4: Controller Implementation (1-2 hours)

### Step 4.1: Add Override Coordinator Method

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

**Location**: Add to EventRequestController class

**Steps**:
1. Copy `overrideCoordinator()` from BROADCAST_MODEL_CONTROLLER_METHODS.js
2. Paste into controller class
3. Verify method signature and indentation
4. Import required modules at top of file

**Checklist**:
- [ ] Copy method to controller
- [ ] Verify imports: User, EventRequest, AUTHORITY_TIERS
- [ ] Test: Can override coordinator
- [ ] Test: Cannot override to invalid coordinator
- [ ] Test: Audit trail recorded
- [ ] Test: Socket.IO notification sent

### Step 4.2: Add Claim Request Method

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

**Steps**:
1. Copy `claimRequest()` from BROADCAST_MODEL_CONTROLLER_METHODS.js
2. Paste into controller class
3. Verify method signature and indentation

**Checklist**:
- [ ] Copy method to controller
- [ ] Test: Can claim available request
- [ ] Test: Cannot claim already-claimed request
- [ ] Test: Non-valid coordinators cannot claim
- [ ] Test: Claim timeout set correctly

### Step 4.3: Add Release Request Method

**File**: `src/controller/eventRequests_controller/eventRequest.controller.js`

**Steps**:
1. Copy `releaseRequest()` from BROADCAST_MODEL_CONTROLLER_METHODS.js
2. Paste into controller class
3. Verify method signature and indentation

**Checklist**:
- [ ] Copy method to controller
- [ ] Test: Can release owned claim
- [ ] Test: Cannot release other's claim
- [ ] Test: Non-claimed request cannot be released
- [ ] Test: Other coordinators notified after release

### Step 4.4: Add Claim Enforcement to Action Handlers

**Files**: 
- `src/controller/eventRequests_controller/eventRequest.controller.js`
- Methods: `reviewDecision()`, `confirmDecision()`, `approveRequest()`, `rejectRequest()`, etc.

**For each action handler**:
1. Find method definition
2. After request retrieval and before action logic, add:

```javascript
// BROADCAST MODEL: Check claim enforcement
if (request.claimedBy?.userId) {
  const claimedByUserId = request.claimedBy.userId._id || request.claimedBy.userId;
  const isClaimedByMe = claimedByUserId.toString() === userId.toString();
  
  if (!isClaimedByMe) {
    // Claimed by someone else - cannot act
    const claimedByName = request.claimedBy.userId.firstName || 'Unknown';
    return res.status(409).json({
      success: false,
      message: `Request is currently claimed by ${claimedByName}. Please wait or contact them to release.`,
      claimedBy: {
        userId: request.claimedBy.userId._id,
        name: claimedByName
      }
    });
  }
}
```

**Checklist**:
- [ ] Add to `reviewDecision()`
- [ ] Add to `confirmDecision()`
- [ ] Add to `approveRequest()`
- [ ] Add to `rejectRequest()`
- [ ] Add to `rescheduleRequest()`
- [ ] Add to any other action methods
- [ ] Test: Cannot act if claimed by other
- [ ] Test: Can act if claimed by self or not claimed

---

## Phase 5: Routes Implementation (30 minutes)

### Step 5.1: Add Override Coordinator Route

**File**: `src/routes/eventRequests.routes.js` or `src/routes/requests.routes.js`

**Add Route**:
```javascript
router.put(
  '/:requestId/override-coordinator',
  authenticate,
  requireAdminAuthority,
  requirePermission('request', 'assign_coordinator'),
  eventRequestController.overrideCoordinator
);
```

**Checklist**:
- [ ] Add route to routes file
- [ ] Test: POST request accepted
- [ ] Test: Middleware properly applied
- [ ] Test: Response format correct

### Step 5.2: Add Claim Request Route

**File**: `src/routes/eventRequests.routes.js` or `src/routes/requests.routes.js`

**Add Route**:
```javascript
router.post(
  '/:requestId/claim',
  authenticate,
  validateRequestAccess,
  eventRequestController.claimRequest
);
```

**Checklist**:
- [ ] Add route to routes file
- [ ] Test: POST request accepted
- [ ] Test: Middleware properly applied

### Step 5.3: Add Release Claim Route

**File**: `src/routes/eventRequests.routes.js` or `src/routes/requests.routes.js`

**Add Route**:
```javascript
router.post(
  '/:requestId/release',
  authenticate,
  validateRequestAccess,
  eventRequestController.releaseRequest
);
```

**Checklist**:
- [ ] Add route to routes file
- [ ] Test: POST request accepted

### Step 5.4: Add Get Valid Coordinators Route

**File**: `src/routes/eventRequests.routes.js` or `src/routes/requests.routes.js`

**Add Route**:
```javascript
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
          validCoordinators: request.validCoordinators || [],
          count: request.validCoordinators?.length || 0,
          claimedBy: request.claimedBy || null
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

**Checklist**:
- [ ] Add route to routes file
- [ ] Test: GET request returns valid coordinators

---

## Phase 6: Integration Testing (2-3 hours)

### Step 6.1: Unit Tests

**File**: `BROADCAST_MODEL_TESTS.js` (provided)

**Run**:
```bash
npm test -- BROADCAST_MODEL_TESTS.js
```

**Tests Run**:
- [ ] Test 1: Coordinator Override Bug Fix
- [ ] Test 2: Broadcast Visibility
- [ ] Test 3: Claim/Release Mechanism
- [ ] Test 4: Edge Cases

**Expected**: All tests pass

**Checklist**:
- [ ] Run full test suite
- [ ] All tests pass
- [ ] No console errors

### Step 6.2: Manual Smoke Tests

**Setup**:
1. Start dev server: `npm run dev`
2. Open Postman or similar API client

**Test 1: Create Request**
```
POST /api/event-requests
{
  "Event_Title": "Blood Drive",
  "Location": "City Hall",
  "Category": "BloodDrive",
  "organizationType": "LGU",
  "municipalityId": "...",
  "description": "Test"
}
```

Expected:
- [ ] Request created with `validCoordinators` populated
- [ ] Notifications sent to valid coordinators
- [ ] Status 201 returned

**Test 2: Override Coordinator**
```
PUT /api/event-requests/REQ-001/override-coordinator
{
  "coordinatorId": "60f7b1c4e4b0e8c0b0e0e0e1"
}
```

Expected:
- [ ] Reviewer changed
- [ ] `assignmentRule` = "manual"
- [ ] `overriddenAt` and `overriddenBy` set
- [ ] Status history updated
- [ ] Socket.IO notification sent

**Test 3: Claim Request**
```
POST /api/event-requests/REQ-001/claim
```

Expected:
- [ ] `claimedBy` set
- [ ] Status 200 returned
- [ ] Other coordinators notified

**Test 4: Dashboard Query**
```
GET /api/event-requests/pending?status=PENDING_REVIEW
```

Expected:
- [ ] Returns requests from `reviewer`, `validCoordinators`, `claimedBy`, `requester`
- [ ] All broadcast requests visible

### Step 6.3: Integration Tests

**Test**: Full request workflow

```
1. Admin creates request
2. System populates validCoordinators (2 coordinators)
3. Coordinator A claims request
4. Coordinator B tries to approve → FAILS (409)
5. Coordinator A approves → SUCCESS
6. Request moves to next state
7. Coordinator A releases claim
8. Coordinator B can now claim
```

**Checklist**:
- [ ] Full workflow functions correctly
- [ ] No database errors
- [ ] No Socket.IO errors
- [ ] Notifications delivered
- [ ] Audit trail complete

---

## Phase 7: Production Deployment

### Step 7.1: Code Review & Approval

**Checklist**:
- [ ] Create Pull Request with all changes
- [ ] Add description of changes
- [ ] Link to related issues
- [ ] Request code review from lead developer
- [ ] Address review comments
- [ ] Get approval from team lead

### Step 7.2: Pre-Deployment Checklist

- [ ] All tests passing (local + CI/CD)
- [ ] No console errors or warnings
- [ ] No performance regressions
- [ ] Database backed up
- [ ] Rollback plan documented
- [ ] Deployment window scheduled
- [ ] Stakeholders notified

### Step 7.3: Deployment to Staging

```bash
# Merge to develop
git checkout develop
git pull origin develop
git merge --no-ff broadcast-model-implementation

# Install dependencies
npm install

# Create indexes
node src/utils/createIndexes.js

# Start server
npm start

# Verify
curl http://localhost:3000/api/health
```

**Checklist**:
- [ ] No startup errors
- [ ] API health check passes
- [ ] All routes respond
- [ ] Database operations work

### Step 7.4: Staging Testing

- [ ] Run full test suite in staging
- [ ] Create test requests
- [ ] Test override functionality
- [ ] Test claim/release
- [ ] Test dashboard queries
- [ ] Monitor logs for errors
- [ ] Check performance metrics

**Duration**: 30 minutes minimum observation

### Step 7.5: Production Deployment

```bash
# On production server
git checkout main
git pull origin develop  # or merge from develop

npm install
node src/utils/createIndexes.js

# Restart service
systemctl restart unite-backend
# or
pm2 restart app
```

**Checklist**:
- [ ] Service started successfully
- [ ] No startup errors in logs
- [ ] Health check passes
- [ ] Monitor error logs for 24 hours
- [ ] Check database performance

### Step 7.6: Post-Deployment Verification

- [ ] Monitor error logs
- [ ] Check database query performance
- [ ] Verify Socket.IO working
- [ ] Verify notifications sent
- [ ] Check coordinator dashboards
- [ ] Verify override functionality works
- [ ] Confirm user reports indicate improvement

**Duration**: 24-48 hour monitoring period

---

## Rollback Plan

### If Critical Issues Occur

**Step 1: Stop Services**
```bash
systemctl stop unite-backend
# or
pm2 stop app
```

**Step 2: Revert Code**
```bash
git revert <commit-hash>  # or git reset --hard <previous-commit>
npm install
```

**Step 3: Restart Services**
```bash
systemctl start unite-backend
# or
pm2 start app
```

**Step 4: Verify**
```bash
curl http://localhost:3000/api/health
```

### Data Integrity

**Good News**: 
- Schema changes are backward compatible
- `validCoordinators` and `claimedBy` fields are optional
- Old `reviewer` field still works
- No data loss from rollback

**If Migration Issues**:
1. Restore from backup: `mongorestore --uri="mongodb://..." backup/`
2. Revert code
3. Restart service

---

## Monitoring & Maintenance

### Key Metrics to Monitor

1. **Error Rates**:
   - 5xx errors in coordinator override
   - 5xx errors in claim/release
   - 4xx errors (access denied)

2. **Performance**:
   - Dashboard query response time (should be < 500ms)
   - Override coordinator response time (should be < 200ms)
   - Claim request response time (should be < 200ms)

3. **Data Quality**:
   - All requests have `validCoordinators` populated
   - No requests with invalid `claimedBy` values
   - Status history populated correctly

### Monitoring Setup

```javascript
// Add to monitoring/logging system
app.get('/metrics/broadcast', (req, res) => {
  const stats = {
    requestsWithValidCoordinators: db.eventRequests.countDocuments({ 'validCoordinators': { $exists: true, $ne: [] } }),
    requestsClaimed: db.eventRequests.countDocuments({ 'claimedBy': { $exists: true, $ne: null } }),
    overridesSinceStartup: overrideCounter,
    avgDashboardQueryTime: avgQueryTime,
    socketIoConnections: io.engine.clientsCount
  };
  res.json(stats);
});
```

---

## Success Criteria

### Must-Have
- ✅ Coordinator selection bug fixed
- ✅ validCoordinators populated on request creation
- ✅ Broadcast visibility working (all matching coordinators see requests)
- ✅ Claim/release prevents duplicate actions
- ✅ All tests passing
- ✅ No regressions in existing functionality

### Nice-To-Have
- ✅ Socket.IO notifications working
- ✅ Performance acceptable
- ✅ Audit trail complete and searchable
- ✅ Dashboard shows clear claim status

---

## Timeline

| Phase | Task | Duration | Notes |
|-------|------|----------|-------|
| Phase 1 | Data Model | 30 min | Validate schema & create indexes |
| Phase 2 | Service Layer | 1-2 hr | Add methods & update queries |
| Phase 3 | Middleware | 15 min | Validation only - already done |
| Phase 4 | Controllers | 1-2 hr | Add methods & enforcement |
| Phase 5 | Routes | 30 min | Add new routes |
| Phase 6 | Testing | 2-3 hr | Unit + integration tests |
| Phase 7 | Deployment | 1-2 hr | Staging + production |
| **TOTAL** | | **6-10 hours** | Plus 24hr monitoring |

---

## Support & Troubleshooting

### Common Issues

**Issue**: validCoordinators empty after request creation
- [ ] Check broadcastAccess service
- [ ] Verify coordinator coverage areas populated
- [ ] Check organization type matching
- [ ] Review logs for `_populateValidCoordinators` errors

**Issue**: Claim not preventing duplicate actions
- [ ] Verify claim enforcement added to action handlers
- [ ] Check middleware applied correctly
- [ ] Review error responses

**Issue**: Socket.IO notifications not working
- [ ] Verify `app.set('io', io)` in server.js
- [ ] Check Socket.IO connection working
- [ ] Review notification service logs

### Debug Commands

```bash
# Check request with valid coordinators
db.eventRequests.findOne({ 'validCoordinators': { $ne: [] } })

# Check claimed requests
db.eventRequests.findOne({ 'claimedBy': { $ne: null } })

# Check override history
db.eventRequests.findOne({ 'reviewer.overriddenAt': { $exists: true } })

# Count by status
db.eventRequests.aggregate([
  { $group: { _id: '$status', count: { $sum: 1 } } }
])
```

---

## Documentation Updates

After deployment, update:
- [ ] `STATE_MACHINE_README.md` - Add broadcast model workflow
- [ ] `BACKEND_DOCUMENTATION.md` - Add broadcast model section
- [ ] Frontend API docs - Document new endpoints
- [ ] Team wiki - Add claim/release behavior explanation

---

**Implementation Ready!** ✅

All code, tests, and documentation prepared. Follow this checklist systematically for smooth deployment.

Questions? Review BROADCAST_MODEL_FINAL_IMPLEMENTATION.md for detailed explanations.
