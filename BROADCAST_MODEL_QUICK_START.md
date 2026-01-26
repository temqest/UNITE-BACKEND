# Quick Start: Broadcast Model Refactoring

## 📋 Overview

This document provides a quick-start guide for implementing the broadcast model refactoring in your UNITE backend system.

**What's Being Fixed**:
1. ✅ Coordinator selection bug (wrong coordinator remains selected after manual override)
2. ✅ Single-reviewer limitation (only one coordinator can see requests)
3. ✅ Broadcast visibility (multiple coordinators matching location + org type can now see requests)

## 🚀 Implementation Timeline

### Day 1: Code Deployment
**Duration**: 30 minutes to 1 hour

```bash
# 1. Review all code changes
# Files created/modified:
# - src/models/eventRequests_models/eventRequest.model.js (MODIFIED)
# - src/services/eventRequests_services/broadcastAccess.service.js (NEW)
# - src/middleware/validateRequestAccess.js (MODIFIED)
# - src/services/users_services/coordinatorResolver.service.js (ENHANCED)
# - src/controller/eventRequests_controller/broadcastRequest.controller.js (NEW)
# - src/utils/migrateRequestToBroadcastModel.js (NEW)

# 2. Deploy to staging/dev environment
git add .
git commit -m "feat: broadcast model for event request visibility"
git push

# 3. Verify no compilation errors
npm run dev
# Should see no errors related to schema or services
```

### Day 2: Integration & Testing
**Duration**: 1-2 hours

```bash
# 1. Add routes (if not auto-imported)
# Edit: src/routes/eventRequests.routes.js
# Add broadcast controller methods

# 2. Run migration in dry-run mode
node src/utils/migrateRequestToBroadcastModel.js --dry-run --verbose

# Expected output:
# ✅ Connected to MongoDB
# 📊 Found X event requests to process
# [1/X] Processing REQ-123...
#    Found Y valid coordinators
# ...
# ═══════════════════════════════════════════════════
# 📊 MIGRATION SUMMARY
# ✅ Successfully processed: X
# ⏭️  Skipped (already migrated): 0
# ❌ Errors: 0
# 📈 Total: X/X
# ═══════════════════════════════════════════════════
```

### Day 3: Data Migration
**Duration**: 15-30 minutes (depending on request volume)

```bash
# 1. Backup database (IMPORTANT!)
# Use MongoDB Atlas backup or your backup process

# 2. Run actual migration
node src/utils/migrateRequestToBroadcastModel.js --verbose

# Monitor output - should see "✅ Updated" messages
# If errors occur, check logs

# 3. Verify migration
# In MongoDB:
# db.eventrequests.findOne({ Request_ID: "REQ-..." })
# Should have: validCoordinators: [ ... ], claimedBy: null or { ... }
```

### Day 4: Testing & Validation
**Duration**: 2-3 hours

```bash
# 1. Run test suite
npm test

# 2. Manual testing checklist:
# ✅ Create new request - should populate validCoordinators
# ✅ View request as valid coordinator - should be visible
# ✅ View request as invalid coordinator - should be denied
# ✅ Admin manually override coordinator - should update correctly
# ✅ Claim request - should prevent other coordinators from acting
# ✅ Release claim - should make available to others
```

### Day 5: Production Deployment
**Duration**: 30 minutes to 1 hour

```bash
# 1. Final verification on staging
# - All tests pass
# - No errors in logs
# - Requests are visible to correct coordinators

# 2. Deploy to production
git push production main
# Production restart handles by CI/CD

# 3. Monitor logs
# Watch for any broadcast access errors

# 4. If issues occur:
# Rollback is safe - can revert without data loss
git revert <commit>
```

---

## 🔧 Integration Checklist

### Before Migration

- [ ] Review all code changes
- [ ] Test in local environment
- [ ] Test in staging environment  
- [ ] Backup production database
- [ ] Plan maintenance window (if needed)
- [ ] Communicate changes to team

### During Migration

- [ ] Run dry-run migration
- [ ] Review dry-run output
- [ ] Run actual migration
- [ ] Monitor logs for errors
- [ ] Verify sample requests in database

### After Migration

- [ ] Test request visibility
- [ ] Test coordinator override
- [ ] Test claim/release
- [ ] Monitor logs for 24 hours
- [ ] Update documentation
- [ ] Notify stakeholders

---

## 📝 Code Integration Points

### 1. Add Routes (Required)

**File**: `src/routes/eventRequests.routes.js`

```javascript
const broadcastController = require('../controller/eventRequests_controller/broadcastRequest.controller');

// Add these routes:
router.put('/:requestId/override-coordinator', authenticate, requireAdminAuthority, broadcastController.overrideCoordinator);
router.post('/:requestId/claim', authenticate, broadcastController.claimRequest);
router.post('/:requestId/release', authenticate, broadcastController.releaseRequest);
router.get('/:requestId/valid-coordinators', authenticate, broadcastController.getValidCoordinators);
```

### 2. Update Request Creation (Recommended)

**File**: `src/services/eventRequests_services/eventRequest.service.js`

In `createRequest()` method, add after creating request:

```javascript
// Populate valid coordinators for broadcast model
const coordinatorResolver = require('../users_services/coordinatorResolver.service');
const validCoordinators = await coordinatorResolver.findValidCoordinatorsForRequest(
  request.municipalityId || request.district,
  request.organizationType
);
request.validCoordinators = validCoordinators;
await request.save();
```

### 3. Update Notifications (Recommended)

**File**: `src/services/utility_services/notification.service.js`

Instead of notifying only assigned reviewer, notify all valid coordinators:

```javascript
async notifyValidCoordinators(request, validCoordinators) {
  for (const vc of validCoordinators) {
    await this.createNotification({
      userId: vc.userId,
      type: 'NEW_REQUEST',
      title: `New Request: ${request.Event_Title}`,
      // ... other fields
    });
  }
}
```

---

## 🧪 Testing Guide

### Test 1: Coordinator Selection Bug Fix

```
Scenario: Admin manually overrides coordinator
Steps:
1. Create request (auto-assigns Coordinator A)
2. Admin clicks "Override Coordinator"
3. Admin selects Coordinator B
4. Click "Save Override"

Expected:
✅ Request reviewer changes to Coordinator B
✅ Coordinator B's name appears as assigned
✅ Override shows in audit trail
✅ Coordinator B gets notification
```

### Test 2: Broadcast Visibility

```
Scenario: Multiple coordinators see new request
Steps:
1. Create new request with Location=Manila, OrgType=LGU
2. Check as Coordinator A (Coverage=Manila, OrgType=LGU) - SHOULD SEE
3. Check as Coordinator B (Coverage=Quezon City, OrgType=LGU) - SHOULD NOT SEE
4. Check as Coordinator C (Coverage=Manila, OrgType=NGO) - SHOULD NOT SEE

Expected:
✅ Only Coordinator A sees request in dashboard
✅ Request shows in "Available Requests" not "My Requests"
✅ Coordinator A can claim it
```

### Test 3: Claim Mechanism

```
Scenario: Prevent duplicate actions via claims
Steps:
1. Create request (shows as available to multiple coordinators)
2. Coordinator A clicks "Claim Request"
3. Coordinator B tries to approve (while A is reviewing)
4. Coordinator A completes action

Expected:
✅ Coordinator A sees "CLAIMED BY YOU"
✅ Coordinator B sees "CLAIMED BY Coordinator A"
✅ Coordinator B's approve button is DISABLED
✅ Only A can act on request while claimed
```

### Test 4: Release & Reclaim

```
Scenario: Claim can be released for others to act
Steps:
1. Coordinator A claims request
2. Coordinator A clicks "Release Claim"
3. Coordinator B can now claim and act

Expected:
✅ Request shows as "Available" again
✅ Coordinator B can now claim
✅ Other valid coordinators notified it's available
```

---

## 🔍 Monitoring & Troubleshooting

### Monitor These Logs

```bash
# Watch for broadcast access validation
[BROADCAST ACCESS] 
[VALIDATE REQUEST ACCESS]
[OVERRIDE COORDINATOR]
[CLAIM REQUEST]
[RELEASE REQUEST]

# Should see logs like:
# [BROADCAST ACCESS] canAccessRequest: user 507f1f77bcf86cd799439011 ✓
# [CLAIM REQUEST] Request claimed: REQ-123...
```

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Not a valid coordinator for this request" | Location/org type mismatch | Check coordinator coverage area setup |
| Request not visible to some coordinators | Migration incomplete | Re-run migration script |
| Override fails | Coordinator not in validCoordinators | Update validCoordinators array or run migration |
| Can't claim request | Already claimed by someone else | Release claim first or wait 24h timeout |

---

## 📊 Success Metrics

### Before Implementation
- ❌ Wrong coordinator stays selected after manual override
- ❌ Only 1 coordinator can see requests
- ❌ No failover if assigned coordinator unavailable
- ❌ No visibility into request queue

### After Implementation
- ✅ Manual override correctly updates assignment
- ✅ All matching coordinators see requests
- ✅ Any coordinator can pick up request if others unavailable
- ✅ Clear view of who's working on what (claimed by field)

---

## 🎯 Success Criteria Checklist

- [ ] All code deploys without errors
- [ ] Migration completes successfully
- [ ] Requests have validCoordinators populated
- [ ] Coordinators can see matching requests
- [ ] Override correctly updates reviewer
- [ ] Claim prevents duplicate actions
- [ ] No errors in logs after 24 hours
- [ ] Existing functionality unchanged
- [ ] Frontend updates complete

---

## 📞 Support Resources

1. **Architecture Deep Dive**: See `BROADCAST_MODEL_REFACTORING_GUIDE.md`
2. **Implementation Details**: See `BROADCAST_MODEL_IMPLEMENTATION_SUMMARY.md`
3. **API Reference**: See endpoint documentation in summary
4. **Code Comments**: All service methods have detailed JSDoc comments

---

## 🔄 Rollback Procedure (If Needed)

**Safe to rollback because**:
- Existing `reviewer` field preserved
- No data deleted
- New fields can be safely ignored

**To rollback**:
```bash
# Revert the code changes
git revert <commit-hash>

# Restart server
npm run dev

# Old access control still works (checks reviewer.userId)
# No data migration needed - broadcast fields just unused
```

---

## 📅 Post-Deployment Checklist

After going live:

- [ ] Monitor logs for 24 hours
- [ ] Check request visibility for sample coordinators
- [ ] Verify override functionality works
- [ ] Test claim/release in production
- [ ] Get feedback from coordinators
- [ ] Document any issues found
- [ ] Plan follow-up improvements (if needed)

---

## 🚀 Quick Commands Reference

```bash
# Development
npm run dev              # Start dev server with nodemon

# Testing
npm test                # Run test suite

# Migration
node src/utils/migrateRequestToBroadcastModel.js --dry-run    # Test migration
node src/utils/migrateRequestToBroadcastModel.js              # Run migration
node src/utils/migrateRequestToBroadcastModel.js --verbose    # With logging

# Database
# Check request has new fields:
# db.eventrequests.findOne({ Request_ID: "REQ-..." })
```

---

## 📞 Contact & Questions

If you have questions or encounter issues:
1. Check logs for error details
2. Review architecture guide for context
3. Check code comments for specific implementation details
4. Verify database state with MongoDB queries

---

**Version**: 1.0  
**Last Updated**: January 26, 2026  
**Status**: Ready for Deployment

