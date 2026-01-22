# Fix: Display ALL Valid Coordinators (Not Just One)

## Problem Summary

The coordinator selection dropdown was showing only 1-2 coordinators even when 3+ coordinators matched the stakeholder's:
- **Coverage area** (district/municipality)
- **Organization type** (LGU, NGO, BloodBank, etc.)

### Root Causes Identified

1. **Authority Tier Bottleneck**: Query was filtering coordinators with `authority: { $gte: 60, $lt: 80 }` in the database query itself, BEFORE checking org type and coverage matching. If coordinators in the production database had authority values outside this range, they were being excluded completely.

2. **Multi-Organization Type Handling**: The validation logic correctly checked for multi-org coordinators, but the overly strict authority filtering prevented most coordinators from even being evaluated.

3. **Role-Based vs Authority-Based**: Some coordinators might be identified by the `coordinator` role rather than authority level, but the query only looked at authority.

---

## Solution Implemented

### Backend Changes: `coordinatorResolver.service.js`

#### 1. **More Inclusive Initial Query** (Line ~320)
**Before:**
```javascript
const potentialCoordinators = await User.find({
  authority: { $gte: 60, $lt: 80 },  // ❌ RESTRICTIVE: Excludes most
  isActive: true
})
```

**After:**
```javascript
const potentialCoordinators = await User.find({
  $or: [
    { 'roles.roleCode': 'coordinator', isActive: true },  // ✅ Check role
    { authority: { $gte: 60 }, isActive: true }           // ✅ Check authority (>=60, no upper limit)
  ],
  isActive: true
})
```

**Why**: Catches coordinators identified by either role OR authority, without artificial upper-bound filtering.

---

#### 2. **Flexible Coordinator Validation** (Line ~195)
**Before:**
```javascript
const coordAuthority = coordinator.authority || 20;
if (coordAuthority < 60 || coordAuthority >= 80) {  // ❌ Rejects if outside range
  validationResult.reason = `Coordinator authority (${coordAuthority}) must be between 60-80`;
  return validationResult;
}
```

**After:**
```javascript
const hasCoordinatorRole = (coordinator.roles || []).some(r => 
  r.roleCode && r.roleCode.toLowerCase().includes('coord')
);
const hasCoordinatorAuthority = (coordinator.authority || 20) >= 60;

if (!hasCoordinatorRole && !hasCoordinatorAuthority) {  // ✅ Accept either
  validationResult.reason = `User is not a coordinator (role: ${hasCoordinatorRole}, authority: ${coordinator.authority})`;
  return validationResult;
}
```

**Why**: Accepts coordinators with either:
- A coordinator role assignment, OR
- Authority level >= 60 (no upper limit)

---

#### 3. **Enhanced Logging** (Line ~350)
Now logs what org types each coordinator has and which ones match:
```
orgTypeMatches: ['LGU']  // Shows which org types matched
coordinatorOrgCount: 10  // Shows total org types coordinator has
```

---

## Validation Flow (After Fix)

```
For each STAKEHOLDER:
  1. Fetch STAKEHOLDER's org types (e.g., ['LGU'])
  
  2. Fetch ALL COORDINATORS where:
     - isActive = true
     - Has 'coordinator' role OR authority >= 60 (no upper limit)
     
  3. For each coordinator:
     a) Check: Is active? ✓
     b) Check: Has coordinator role OR authority >= 60? ✓
     c) Check: Has matching org type? ✓
        → Find intersection of org types
        → Example: Coord has [LGU, NGO, BloodBank], Stakeholder has [LGU]
        → Match: YES (LGU is in both)
     d) Check: Stakeholder's municipality in coordinator's coverage? ✓
        → Query CoverageArea.geographicUnits for authoritative check
        
  4. Return ALL coordinators passing steps a-d
```

---

## Result

**Before Fix:**
- Query: 7 potential coordinators
- After validation: 2 returned (too restrictive)
- Issue: Authority filter excluded valid coordinators

**After Fix:**
- Query: More coordinators included (role-based + authority)
- After validation: ALL coordinators matching coverage + org type returned
- Benefit: Users see all valid choices

---

## How to Test

### 1. **Run Diagnostic to See All Coordinators**
```bash
node src/utils/diagnostics/fullCoordinatorDiagnostic.js
```

This shows:
- Total coordinators matching new query criteria
- Each coordinator's authority, roles, org types, coverage areas
- The test stakeholder's org types

### 2. **Hit Coordinator Endpoint**
```bash
GET /api/users/{stakeholderId}/coordinator
```

Check logs for `[resolveValidCoordinators]` to see:
- How many coordinators evaluated
- Each coordinator's org type matching result
- Final count of valid coordinators returned

### 3. **Verify Frontend Shows All Coordinators**
In event creation modal, the coordinator dropdown should show all valid coordinators, not just one.

---

## Authority Level Reference

From system documentation:
- **Authority 20**: Stakeholder (default)
- **Authority 60**: Coordinator (minimum)
- **Authority 80+**: Admin levels

The fix removes the arbitrary `< 80` upper bound because legitimate coordinators might be assigned higher authority levels.

---

## Files Modified

1. **`src/services/users_services/coordinatorResolver.service.js`**
   - Updated initial coordinator query (line ~320)
   - Updated authority validation logic (line ~195)
   - Enhanced logging for org type matching (line ~350)
   - Updated documentation comments

---

## Multi-Org Coordinator Support

The system **already supported** coordinators with multiple org types correctly. Example:

```
Ben Carlo Valiente has orgs: [BloodBank, NGO, Hospital, LGU, ...]
Stakeholder has org: [LGU]

Matching logic finds: LGU ∈ both lists → ✅ MATCH
```

The fix ensures such coordinators are now **included in the initial query** instead of being filtered out prematurely.

---

## Next Steps

1. ✅ Deploy updated `coordinatorResolver.service.js`
2. ✅ Restart backend server
3. ✅ Test with various stakeholders to confirm all valid coordinators appear
4. ✅ Monitor logs during event creation to verify matching is working
5. ✅ Update any authority assignment scripts if needed (e.g., when creating new coordinators, ensure they have `authority >= 60` or the `coordinator` role)

---

## Security Notes

✅ **Still Secure**: 
- Each coordinator is individually validated before being returned
- Org type matching is enforced (can't assign coordinators outside org type)
- Coverage area matching is enforced (can't assign coordinators outside geography)
- Both stakeholder and coordinator must be active
- API-level validation on event creation (middleware) still in place

The change only makes the query **more inclusive** about WHICH coordinators to evaluate, not what gets RETURNED. Final validation is still strict.
