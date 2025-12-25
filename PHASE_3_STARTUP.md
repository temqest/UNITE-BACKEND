# Phase 3 Startup - Getting Started with Testing

**Status**: 🚀 PHASE 3 LAUNCHED  
**Date**: December 26, 2025  
**Objective**: Validate all Phase 2 endpoints with comprehensive test coverage

---

## Quick Start

### What is Phase 3?

Phase 3 validates that all the new unified API endpoints work correctly with proper:
- **Authority filtering** - Users see only authorized requests
- **Permission enforcement** - Only authorized actions allowed
- **State machine transitions** - Requests follow proper workflow states
- **Field locking** - Non-admins cannot change restricted fields
- **Audit trails** - All actions logged for compliance

### 16 Test Steps (4-6 weeks)

| Step | Name | Focus | Status |
|------|------|-------|--------|
| 15.1 | Authority Filtering | Admin/Coordinator/Stakeholder views | ⏳ Pending |
| 15.2 | Permission Checks | Block unauthorized access | ⏳ Pending |
| 15.3 | Authority Hierarchy | Validate reviewer >= requester | ⏳ Pending |
| 15.4 | Field Locking | Prevent unauthorized modifications | ⏳ Pending |
| 15.5 | State Transitions | Proper workflow state changes | ⏳ Pending |
| 15.6 | Audit Trails | Complete logging | ⏳ Pending |
| 16.1 | Visibility | UI shows correct content | ⏳ Pending |
| 16.2 | Action Buttons | Show/hide based on permissions | ⏳ Pending |
| 16.3 | Form Fields | Lock/unlock by authority | ⏳ Pending |
| 16.4 | Empty States | Proper messages when no data | ⏳ Pending |
| 16.5 | Error Handling | Display errors correctly | ⏳ Pending |
| 17.1 | Happy Path Workflow | Complete create→review→approve→publish | ⏳ Pending |
| 17.2 | Reschedule Workflow | Reschedule with date change | ⏳ Pending |
| 17.3 | Authority Mismatch | Properly reject invalid reviews | ⏳ Pending |
| 17.4 | Permission Denied | Properly block unauthorized actions | ⏳ Pending |
| 17.5 | Coordinator Selection | Auto-assign or list for selection | ⏳ Pending |

---

## What to Do Now

### 1. Review Documentation (1-2 hours)

Read these files in order:

**Start Here**:
1. [PHASE_3_SUMMARY.md](PHASE_3_SUMMARY.md) - Overview (you're reading it)
2. [PHASE_3_IMPLEMENTATION_PLAN.md](PHASE_3_IMPLEMENTATION_PLAN.md) - Detailed test plans
3. [PHASE_3_TEST_SCENARIOS.md](PHASE_3_TEST_SCENARIOS.md) - Specific test cases

**Reference**:
- [PHASE_2_API_REFERENCE.md](PHASE_2_API_REFERENCE.md) - API endpoint specs
- [plan.md](../../plan.md) - Overall project plan

### 2. Prepare Test Environment (2-4 hours)

Create test setup:
```bash
# 1. Create seed data for test users
npm run seed:test-data

# 2. Generate test tokens
export ADMIN_TOKEN=$(node scripts/generate-token.js --user test-admin-001)
export COORDINATOR_TOKEN=$(node scripts/generate-token.js --user test-coord-001)
export STAKEHOLDER_TOKEN=$(node scripts/generate-token.js --user test-stake-001)

# 3. Verify backend is running
curl http://localhost:3000/api/health
```

### 3. Choose Test Approach

**Option A: Manual Testing (Start Here)**
- Follow PHASE_3_TEST_SCENARIOS.md examples
- Use curl to execute requests
- Verify responses manually
- Best for understanding the endpoints

**Option B: Automated Testing**
- Use Postman collection (if available)
- Or create test scripts in Jest/Mocha
- Run all tests at once
- Best for regression testing

**Option C: Hybrid Approach** (Recommended)
- Start with manual tests for understanding
- Then automate key scenarios
- Use both for verification

---

## Test Roadmap

### Phase 3A: Backend Testing (Steps 15.1-15.6)
**Duration**: ~2 weeks  
**Focus**: Core API endpoint validation

These tests verify:
- Authority calculations work correctly
- Permission gates are enforced
- Field locking prevents unauthorized changes
- State transitions follow rules
- Audit trails are complete

**Success**: All 20+ backend tests pass

### Phase 3B: Frontend Testing (Steps 16.1-16.5)
**Duration**: ~1 week  
**Focus**: UI rendering and interaction

These tests verify:
- UI shows/hides content based on authority
- Action buttons appear for authorized users
- Form fields are properly locked/unlocked
- Empty states display correctly
- Error messages are user-friendly

**Success**: All 15+ frontend tests pass

### Phase 3C: E2E Testing (Steps 17.1-17.5)
**Duration**: ~1 week  
**Focus**: Complete workflows

These tests verify:
- Full workflows work end-to-end
- Data stays consistent across request and event
- Edge cases are handled properly
- Error scenarios don't break the system

**Success**: All 10+ E2E tests pass

---

## Key Files for Phase 3

### Documentation
| File | Purpose |
|------|---------|
| PHASE_3_SUMMARY.md | Overview of Phase 3 approach |
| PHASE_3_IMPLEMENTATION_PLAN.md | Detailed test plans and strategies |
| PHASE_3_TEST_SCENARIOS.md | Specific test cases with curl examples |

### Backend Code (from Phase 2)
| File | Endpoint |
|------|----------|
| eventRequest.controller.js | reviewDecision, confirmDecision, createEvent, publishEvent, assignCoordinator |
| requests.routes.js | Routes for request endpoints |
| events.routes.js | Routes for event endpoints |

### Frontend Code
| File | Component |
|------|-----------|
| campaign/page.tsx | Campaign listing page |
| campaign-calendar.tsx | Calendar view |
| event-card.tsx | Request card UI |
| confirm-modal.tsx | Confirmation dialog |

---

## First Test to Run

Let's start with Test Case 15.1.1: **Admin Sees All Requests**

### Step 1: Generate Admin Token
```bash
# Get admin user ID from database or use test user
ADMIN_USER_ID="test-admin-001"

# Generate JWT token
ADMIN_TOKEN=$(node scripts/generate-token.js --user $ADMIN_USER_ID)
echo "ADMIN_TOKEN=$ADMIN_TOKEN"
```

### Step 2: Run the Request
```bash
curl -X GET http://localhost:3000/api/requests/me \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -s | jq .
```

### Step 3: Validate the Response
Check that:
- ✓ HTTP status is 200
- ✓ `success` field is true
- ✓ Response includes 3+ requests
- ✓ `_diagnosticMatchType` is "admin_override"

### Step 4: Document Result
```
✅ PASS - Test Case 15.1.1: Admin Sees All Requests
- Returned 3 requests (expected 3)
- All requests visible regardless of organization
- Diagnostic field shows admin_override
- Response time: 45ms
```

---

## Common Issues & Solutions

### Issue 1: "Authorization header not found"
**Solution**: Verify token is set correctly
```bash
# Check token variable
echo $ADMIN_TOKEN

# If empty, regenerate
unset ADMIN_TOKEN
ADMIN_TOKEN=$(node scripts/generate-token.js --user test-admin-001)
```

### Issue 2: "Unauthorized" response
**Solution**: Token might be expired or invalid
```bash
# Verify token claims
node -e "console.log(JSON.parse(Buffer.from('$ADMIN_TOKEN'.split('.')[1], 'base64').toString()))"

# Regenerate fresh token
npm run generate:test-tokens
```

### Issue 3: "Request not found"
**Solution**: Test data might not be seeded
```bash
# Reseed test data
npm run seed:test-data

# Verify test requests exist
npm run db:query --collection=eventRequests --filter="{ 'Request_ID': /REQ-TEST/ }"
```

### Issue 4: "CORS error"
**Solution**: Backend not accepting requests
```bash
# Verify backend is running
curl http://localhost:3000/api/health

# Check CORS configuration in server.js
# Add your frontend URL to ALLOWED_ORIGINS
```

---

## Testing Best Practices

### 1. Isolate Test Data
- Use distinct Request IDs (REQ-TEST-001, etc.)
- Don't use production data
- Clean up after tests

### 2. Test One Thing at a Time
- Don't mix multiple tests in single request
- Verify preconditions before starting
- Document results immediately

### 3. Verify Complete State
- Check not just HTTP status
- Verify database state after action
- Check audit logs for completeness

### 4. Document Everything
- Record test date and time
- Note environment (local, staging, etc.)
- Document any deviations from expected

### 5. Re-Test After Fixes
- If test fails, don't skip it
- Fix the issue
- Re-run all related tests

---

## Success Metrics

### Phase 3 Complete When

✅ **All 16 test steps pass**
- 6 backend tests (15.1-15.6)
- 5 frontend tests (16.1-16.5)
- 5 E2E workflow tests (17.1-17.5)

✅ **Performance acceptable**
- API responses < 500ms
- Permission checks < 50ms
- Authority filtering < 100ms

✅ **Security verified**
- No unauthorized access possible
- All permission gates enforced
- Authority hierarchy validated

✅ **Documentation complete**
- All test results recorded
- Any issues documented
- Fixes verified

---

## Troubleshooting

### Need Help?

**For test setup issues**: See PHASE_3_IMPLEMENTATION_PLAN.md Setup Phase

**For specific test cases**: See PHASE_3_TEST_SCENARIOS.md for curl examples

**For API endpoint questions**: See PHASE_2_API_REFERENCE.md

**For overall project**: See plan.md

---

## Next Phase (Phase 4)

After Phase 3 testing is complete and all tests pass, Phase 4 will focus on frontend redesign to better utilize the new unified endpoints.

---

## Summary

Phase 3 is the **validation layer** that ensures all the work from Phase 2 is solid and production-ready.

**Your next steps**:
1. ✅ Read PHASE_3_IMPLEMENTATION_PLAN.md
2. ✅ Read PHASE_3_TEST_SCENARIOS.md
3. ✅ Set up test environment
4. ✅ Run first test (TC 15.1.1)
5. ✅ Document results
6. ✅ Continue with remaining tests

**Timeline**: 4-6 weeks for complete Phase 3 testing

**Exit Criteria**: All 16 test steps passing, 0 failing tests, security verified

Good luck! 🚀

