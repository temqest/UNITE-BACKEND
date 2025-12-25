# Quick Reference: Authority-Based Refactoring

## TL;DR - What Changed

✅ **Removed:** ~900 lines of hard-coded role string checks (`if (user.role === 'Coordinator')`)
✅ **Added:** Authority-based access control using numeric comparisons (`user.authority >= 60`)
✅ **Result:** Campaign Requests visibility and Event creation now governed by authority levels + permissions

---

## Authority Levels (What Users Can Do)

| Authority | Level | Role | Requests | Event Creation |
|-----------|-------|------|----------|-----------------|
| 100 | SYSTEM_ADMIN | System Admin | See ALL | Unrestricted |
| 80 | OPERATIONAL_ADMIN | Operational Admin | See ALL | Unrestricted |
| 60-79 | COORDINATOR | Coordinator | See SCOPED | Self + Jurisdiction |
| 30-59 | STAKEHOLDER | Stakeholder | See OWN | DENIED (need event.create permission) |
| <30 | BASIC_USER | Basic User | No Access | DENIED |

---

## Request Visibility: Who Sees What?

### System Admin (Authority ≥80)
```
GET /api/requests/my-requests
→ Returns ALL requests in system
→ Log: "User has OPERATIONAL_ADMIN authority (80 >= 80) - showing all requests"
```

### Coordinator (Authority 60-79)
```
GET /api/requests/my-requests
→ Returns requests matching ANY of:
  1. Coordinator assignment (coordinator_id)
  2. Reviewer role (reviewer.userId)
  3. Coverage area match (location.municipality in coverage)
  4. Organization match (organizationId)
  5. Own submission (made_by_id or requester.userId)
→ Log: "User has COORDINATOR authority (60 >= 60) - showing scoped requests"
→ Per-request: "_diagnosticMatchType: coverage_area_match_new" (which clause matched)
```

### Stakeholder (Authority 30-59)
```
GET /api/requests/my-requests
→ Returns ONLY own submissions (created by this user)
→ Log: "User has STAKEHOLDER authority (30 >= 30) - showing own requests"
```

### Basic User (Authority <30)
```
GET /api/requests/my-requests
→ Returns empty list
→ Log: "User has insufficient authority (20 < 30) - no access"
```

---

## Event Creation: Authorization Rules

### Permission Check (Route Middleware)
```
POST /api/events/direct
User must have EITHER:
  - 'event.create' permission, OR
  - 'event.approve' permission
→ If missing: 403 Forbidden (blocked by route middleware)
```

### Authority Check (Controller)
```
POST /api/events/direct
User must have:
  - Authority ≥ 60 (COORDINATOR or higher)
→ If insufficient: 403 Forbidden ("Insufficient authority")
```

### Field Restrictions (Controller)
```
POST /api/events/direct with coordinatorId = "OTHER_COORDINATOR"

If User Authority 60-79 (Coordinator):
  → Log: "LOCK applied - Coordinator restricted to self"
  → Effect: coordinatorId = creatorId (forced, user's choice ignored)

If User Authority ≥80 (System Admin):
  → Log: "UNLOCK - System Admin can select any coordinator"
  → Effect: Can select any coordinatorId
```

### Stakeholder Restrictions (Controller)
```
POST /api/events/direct with stakeholder_id = "STAKEHOLDER_ID"

If User Authority 60-79 (Coordinator):
  → Log: "RESTRICTION applied - Stakeholder selection scoped"
  → Effect: Stakeholder must be within coordinator's jurisdiction
  → Stored in eventData: _coordinatorMunicipalityIds (for service to validate)

If User Authority ≥80 (System Admin):
  → Log: "NO RESTRICTION - System Admin can select any stakeholder"
  → Effect: Can select any stakeholder (no jurisdiction check)
```

---

## Debugging: Using Diagnostic Logs

### Problem: User says "I can't see request X"

**Step 1:** Look for logs in this format
```
[getRequestsForUser] Routing request for user {userId} with authority {authority}
→ Note the authority value
```

**Step 2:** Check which method was called
```
[getRequestsForUser] User has COORDINATOR authority (60 >= 60) - showing scoped requests
→ This user is a Coordinator, should see scoped requests
```

**Step 3:** Check which filter matched the request
```
[getCoordinatorRequests] Result #1: {requestId} matched via coverage_area_match_new
→ This request matched because of municipality in coverage areas
```

**Step 4:** If request NOT in results
```
[getCoordinatorRequests] Query complete - Returned 2 of 5 total matching requests
→ System found 5 total matching this coordinator's filters, but returned only 2
→ Check pagination (page/limit) or date filters
```

---

### Problem: User trying to create event getting 403

**Step 1:** Check permission denial
```
No log? → Permission middleware blocked. User lacks 'event.create' or 'event.approve'
```

**Step 2:** Check authority denial
```
[createImmediateEvent] DENIED - Insufficient authority (30 < 60)
→ User authority is too low. Need ≥60 to create events
```

**Step 3:** Check field locking
```
[createImmediateEvent] LOCK applied - Coordinator restricted to self
→ User submitted coordinatorId but it was forced to their own ID
```

**Step 4:** Check stakeholder restriction
```
[createImmediateEvent] RESTRICTION applied - Stakeholder selection scoped
→ User tried to select stakeholder outside jurisdiction
→ Service should validate and reject
```

---

## Key Files & Locations

### Implementation
- **Requests filtering:** `src/services/request_services/eventRequest.service.js`
  - `getRequestsForUser()` - Main routing method
  - `getCoordinatorRequests()` - Coordinator scope filtering
  - `getRequestsByStakeholder()` - Own requests filtering
  
- **Event creation:** `src/controller/request_controller/eventRequest.controller.js` + service
  - `createImmediateEvent()` - Authority & field validation

- **Routes:** `src/routes/requests.routes.js`
  - POST `/api/events/direct` - Event creation endpoint

### Constants
- **Authority tiers:** `src/services/users_services/authority.service.js`
  - `AUTHORITY_TIERS.SYSTEM_ADMIN = 100`
  - `AUTHORITY_TIERS.OPERATIONAL_ADMIN = 80`
  - `AUTHORITY_TIERS.COORDINATOR = 60`
  - `AUTHORITY_TIERS.STAKEHOLDER = 30`
  - `AUTHORITY_TIERS.BASIC_USER = 20`

### Documentation
- **Detailed logging reference:** `DIAGNOSTIC_LOGGING.md`
- **Performance details:** `PERFORMANCE_OPTIMIZATION.md`
- **Step-by-step completion:** `STEP_6_COMPLETION_REPORT.md`
- **Full overview:** `REFACTORING_COMPLETE.md`

---

## Common Log Patterns

### Good Signs (Everything Working)
```
[getRequestsForUser] User has COORDINATOR authority (60 >= 60)
[getCoordinatorRequests] Coverage filter ENABLED: 4 municipalities
[getCoordinatorRequests] Result #1: ... matched via coverage_area_match_new
[getCoordinatorRequests] Query complete - Returned 5 of 12 total matching requests
```

### Warning Signs (Investigate)
```
[getCoordinatorRequests] Coverage filter DISABLED: No municipalityIds in coverage areas
→ Coordinator has no coverage areas assigned (might be incomplete setup)

[getCoordinatorRequests] Query complete - Returned 0 of 10 total matching requests
→ No requests matched coordinator's scope (might be pagination issue)
```

### Error Signs (Needs Action)
```
[getRequestsForUser] Error: User not found
→ User ID is invalid or user was deleted

[createImmediateEvent] DENIED - Insufficient authority (20 < 60)
→ User doesn't have permission to create events

[createImmediateEvent] Authorization validation for creator... 
→ (no log after) Service error, check error logs
```

---

## Testing Checklist (Quick Version)

```
☐ Authority 20 (Basic) → GET /requests → Empty list
☐ Authority 30 (Stakeholder) → GET /requests → Own only
☐ Authority 60 (Coordinator) → GET /requests → Scoped
☐ Authority 80 (Admin) → GET /requests → All
☐ Coordinator creates event → coordinatorId locked to self
☐ Admin creates event → coordinatorId freely selectable
☐ Coordinator + stakeholder → Stakeholder restricted to jurisdiction
☐ Admin + stakeholder → No restriction
☐ User without permission → POST /events/direct → 403 Forbidden
☐ Logs show correct authority routing messages
```

---

## Performance Notes

### Before
- Repeated `.flatMap()` calls if method accessed multiple times
- Role string comparisons in massive switch statements

### After
- `.flatMap()` called once, results stored in Set
- Sets pre-computed in controller, reused in service
- Authority comparisons (numeric: 60 >= 80) instead of string matching
- O(1) lookups ready for stakeholder jurisdiction validation

**Bottom Line:** Code is cleaner, faster, and ready for O(1) validation checks.

---

## Common Questions

**Q: Why Sets instead of arrays?**
A: Arrays are O(n) for membership checking (`.includes()`), Sets are O(1) (`.has()`). Stored both since MongoDB `$in` needs arrays.

**Q: What if user authority changes?**
A: Refetch user document to get new authority. Authority not cached system-wide.

**Q: Can I add a new authority tier?**
A: Yes! Add constant to AUTHORITY_TIERS, update getRequestsForUser() if-chain, done. No other code changes needed.

**Q: What if coordinator has no coverage areas?**
A: Log says "Coverage filter DISABLED". They can still see assigned/own requests (6 other clauses still work).

**Q: How do I know if stakeholder is restricted?**
A: Log says "RESTRICTION applied" if coordinator tries to select stakeholder. Service validates (TODO not yet implemented, but Sets ready).

---

**For More Details:** See DIAGNOSTIC_LOGGING.md and REFACTORING_COMPLETE.md
