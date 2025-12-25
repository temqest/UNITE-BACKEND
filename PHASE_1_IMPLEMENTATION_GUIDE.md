# Phase 1: Backend Foundation Implementation Guide

## Status: IN PROGRESS ✓

### Completed Steps

✅ **Step 1.1: Add Audit Fields to User Model**
- Added `authority_changed_at` (Date) field
- Added `authority_changed_by` (ref: User) field  
- Added pre-save hook to track authority changes automatically
- File: `src/models/users_models/user.model.js`

✅ **Step 1.2 & Step 2: Authority Persistence & getRequestsForUser**
- User model already persists `authority` field with proper indexing
- `getRequestsForUser()` already implements authority-based routing:
  - authority >= 80: Returns ALL requests
  - authority >= 60: Calls `getCoordinatorRequests()` with coverage/org filtering
  - authority >= 30: Returns own requests only
- Diagnostic logging already implemented via `_diagnosticMatchType` field in aggregation
- File: `src/services/request_services/eventRequest.service.js` (lines 3968-4020)

### Current Work: Step 3 - Replace Role String Checks

**Target**: Replace role-based conditionals with authority comparisons

**Files to Update**:
1. `src/services/request_services/eventRequest.service.js`
   - `_normalizeRole()` - Mark as DEPRECATED, add notice
   - `_buildActorSnapshot()` - Replace role-based conditional with authority lookup
   - `_assignReviewerContext()` - Replace role-based reviewer assignment logic
   - `computeAllowedActions()` - Replace role string checks with authority comparisons

**Strategy**:
- When reading user, always fetch `authority` field
- Replace: `if (user.role === 'coordinator')` → `if (user.authority >= 60)`
- Replace: `if (user.role === 'stakeholder')` → `if (user.authority >= 30 && user.authority < 60)`
- Replace: `if (user.role === 'admin')` → `if (user.authority >= 80)`
- For legacy role detection from actor snapshots, use authorityFromRole lookup

**Legacy Role to Authority Mapping**:
```javascript
const AUTHORITY_MAPPING = {
  'system-admin': 100,
  'admin': 100,
  'operational-admin': 80,
  'coordinator': 60,
  'stakeholder': 30,
  'default': 20
};
```

### Next Steps

**Step 4**: Enforce Authority Hierarchy in Workflows
- Validate `actor.authority >= requester.authority` in all approval/rejection/reschedule actions
- Add permission gate: `CAN_REVIEW_REQUESTS`, `CAN_APPROVE_REQUESTS`, `CAN_CONFIRM_REQUESTS`
- Log audit trail with authority comparison result

**Step 5**: Lock Event Creation Fields by Authority
- Event controller validation: if `authority < 80`, force `coordinatorId = user.id`
- Restrict stakeholder dropdown to user's orgs/coverage only
- Add validation error message for out-of-scope assignments

---

## Implementation Checklist

- [x] Add audit logging fields to User model
- [x] Verify authority persistence in User model
- [x] Verify getRequestsForUser routing by authority
- [ ] Replace _normalizeRole() usages with authority comparisons
- [ ] Update _buildActorSnapshot() to use authority
- [ ] Update _assignReviewerContext() fallback logic
- [ ] Update computeAllowedActions() state→action matrix
- [ ] Add authority hierarchy validation in workflows
- [ ] Lock event creation fields by authority in controller

---

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| User Model | - | Authority field + audit hooks |
| eventRequest.service.js | 3968-4020 | getRequestsForUser() routing |
| eventRequest.service.js | 3775-3960 | getCoordinatorRequests() filtering |
| eventRequest.controller.js | 868-970 | getMyRequests() endpoint |
| events.controller.js | - | Event creation validation |
| event.routes.js | - | Route permission gates |
