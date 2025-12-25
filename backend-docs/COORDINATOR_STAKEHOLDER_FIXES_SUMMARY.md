# Coordinator-Stakeholder Visibility Fixes - Summary

## Backend Fixes Implemented

### 1. Simplified Stakeholder Filtering ✅
**File**: `src/controller/users_controller/user.controller.js` (lines 1555-1585)

**What Changed**:
- Removed redundant capability checks (`request.accept`, `request.review`, etc.)
- Now relies solely on `authority < 60` to identify stakeholders
- Added comprehensive diagnostic logging

**Why**: Stakeholders are identified by authority, not by explicit capabilities. The previous code was checking for capabilities that stakeholders might not have, potentially filtering them out incorrectly.

### 2. Fixed getUserAuthority 403 Error ✅
**File**: `src/routes/rbac.routes.js` (line 275)

**What Changed**:
- Added self-read bypass - users can now read their own authority without `user.read` permission
- Compares `req.user.id` with `req.params.userId` to detect self-read

**Why**: Stakeholders need to read their own authority to determine their role, but may not have `user.read` permission.

### 3. Enhanced Diagnostic Logging ✅
**File**: `src/controller/users_controller/user.controller.js`

**What Changed**:
- Added detailed logging at each filtering stage:
  - Before/after explicit filtering
  - Before/after jurisdiction filtering
  - Detailed diagnostics when no stakeholders found
- Logs include:
  - Requester ID and authority
  - Stakeholder IDs being checked
  - Filtering counts at each stage
  - Possible issues when all stakeholders filtered out

**Why**: Helps identify exactly where stakeholders are being filtered out during debugging.

### 4. Improved Stakeholder Self-Inclusion ✅
**File**: `src/controller/users_controller/user.controller.js` (lines 1858-1873)

**What Changed**:
- Moved stakeholder self-inclusion to AFTER all filtering stages
- Ensures stakeholders can see themselves even after jurisdiction filtering

**Why**: Stakeholders querying stakeholders should always see themselves, regardless of filtering.

## Filtering Flow (Current)

For Coordinator querying Stakeholders (`/api/users/by-capability?capability=request.review`):

1. **Capability Resolution** (line 1437-1457):
   - Queries all users with `request.review` permission
   - **Special case**: Also queries all users with `authority < 60` (stakeholders)
   - Merges both result sets into `userIdsSet`

2. **Explicit Filtering** (lines 1503-1608):
   - For stakeholder queries: Verifies `authority < 60` only
   - Updates `userIdsSet` to only include valid stakeholders

3. **Authority Filtering** (lines 1664-1695):
   - Filters out users with equal/higher authority than requester
   - For coordinators: Keeps users with `authority < 60` (stakeholders)
   - Creates `filteredUserIds` from `userIdsSet`

4. **Jurisdiction Filtering** (lines 1712-1782):
   - For coordinators (authority < 80): Filters to stakeholders in same organization + municipality
   - Uses `jurisdictionService.filterUsersByJurisdiction()`
   - Checks:
     - Stakeholder's `organizations[].organizationId` matches coordinator's `organizations[].organizationId`
     - Stakeholder's `locations.municipalityId` is in coordinator's `coverageAreas[].municipalityIds[]`

5. **Role-Type Filtering** (lines 1785-1873):
   - Final verification: Ensures only users with `authority < 60` are included
   - Uses both authority field and role structure

6. **Stakeholder Self-Inclusion** (lines 1858-1873):
   - If requester is stakeholder: Adds self to results after all filtering

## Common Issues and Solutions

### Issue: Coordinator sees "No Stakeholders Found"

**Possible Causes**:
1. **Coordinator has no organizations assigned**
   - Check: `coordinator.organizations[]` should have at least one entry
   - Fix: Assign organization to coordinator

2. **Coordinator has no coverage areas with municipalities**
   - Check: `coordinator.coverageAreas[].municipalityIds[]` should have at least one municipality
   - Fix: Assign coverage area with municipalities to coordinator

3. **Stakeholders have no organizations matching coordinator**
   - Check: Stakeholder's `organizations[].organizationId` should match coordinator's `organizations[].organizationId`
   - Fix: Ensure stakeholders are created with coordinator's organization

4. **Stakeholders have no municipality matching coordinator coverage**
   - Check: Stakeholder's `locations.municipalityId` should be in coordinator's `coverageAreas[].municipalityIds[]`
   - Fix: Ensure stakeholders are created with municipality from coordinator's coverage areas

**Debugging**:
- Check backend logs for `[DIAG] STAKEHOLDERS` entries
- Look for "All filtered out by jurisdiction" message
- Verify organization and municipality IDs match

### Issue: Stakeholder gets 403 on getUserAuthority

**Solution**: ✅ Fixed - Users can now read their own authority

**If still occurs**:
- Verify `req.user.id` matches `req.params.userId`
- Check authentication token is valid
- Verify endpoint is `/api/rbac/authority/user/:userId` (not legacy endpoint)

### Issue: Stakeholder Event Creation modal fields blank

**Solution**: Frontend needs to implement auto-fill logic (see `EVENT_CREATION_MODAL_IMPLEMENTATION.md`)

**Frontend should**:
1. Check user authority on modal open
2. If stakeholder: Call `/api/users/:userId/coordinator` to get coordinator
3. Auto-fill coordinator and stakeholder fields
4. Lock both fields

## Testing the Fixes

### Test 1: Coordinator Can See Stakeholders
```bash
# As Coordinator (authority = 60)
GET /api/users/by-capability?capability=request.review

# Expected: Returns stakeholders in coordinator's jurisdiction
# Check logs for:
# - [DIAG] STAKEHOLDERS - Before jurisdiction filtering
# - [DIAG] STAKEHOLDERS - After jurisdiction filtering
# - Should show stakeholder IDs if they exist
```

### Test 2: Stakeholder Can Read Own Authority
```bash
# As Stakeholder (authority < 60)
GET /api/rbac/authority/user/{stakeholderId}

# Expected: Returns 200 with authority data (no 403)
```

### Test 3: Stakeholder Can Get Coordinator
```bash
# As Stakeholder
GET /api/users/{stakeholderId}/coordinator

# Expected: Returns coordinator who manages this stakeholder
```

## Data Requirements

For Coordinators to see Stakeholders:

**Coordinator must have**:
- `organizations[]` array with at least one entry
- `coverageAreas[]` array with at least one entry
- Each `coverageAreas[].municipalityIds[]` must contain municipality IDs

**Stakeholder must have**:
- `organizations[].organizationId` matching coordinator's `organizations[].organizationId`
- `locations.municipalityId` matching one of coordinator's `coverageAreas[].municipalityIds[]`

**Example**:
```javascript
// Coordinator
{
  organizations: [{
    organizationId: ObjectId("org123"),
    organizationName: "LGU",
    isActive: true
  }],
  coverageAreas: [{
    coverageAreaId: ObjectId("ca123"),
    municipalityIds: [ObjectId("muni1"), ObjectId("muni2")]
  }]
}

// Stakeholder (should be visible to above coordinator)
{
  organizations: [{
    organizationId: ObjectId("org123"), // ✅ Matches coordinator
    isActive: true
  }],
  locations: {
    municipalityId: ObjectId("muni1") // ✅ In coordinator's coverage
  }
}
```

## Next Steps

1. **Backend**: ✅ Complete - All fixes implemented
2. **Frontend**: Needs to be updated (see `EVENT_CREATION_MODAL_IMPLEMENTATION.md`)
3. **Testing**: Test with real coordinator/stakeholder data
4. **Monitoring**: Check logs for diagnostic messages to identify any remaining issues

## Log Messages to Watch For

### Success Indicators:
- `[DIAG] STAKEHOLDERS - After jurisdiction filtering: { afterFiltering: > 0 }`
- `[listUsersByCapability] Added requester (stakeholder) to results after all filtering`

### Problem Indicators:
- `[DIAG] STAKEHOLDERS - All filtered out by jurisdiction`
- `[DIAG] filterUsersByJurisdiction - Creator has no jurisdiction data`
- `[DIAG] isUserInCreatorJurisdiction - Stakeholder EXCLUDED`

### Diagnostic Information:
- `[DIAG] STAKEHOLDERS - Before jurisdiction filtering` - Shows stakeholder IDs before filtering
- `[DIAG] STAKEHOLDERS - After jurisdiction filtering` - Shows remaining stakeholder IDs
- `[listUsersByCapability] Stakeholder explicit filtering summary` - Shows filtering counts

