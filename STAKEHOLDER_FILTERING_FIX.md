# Stakeholder Filtering Fix - Implementation & Testing Guide

## Overview

This document outlines the fix for inconsistent stakeholder filtering between admin and non-admin users when selecting a coordinator. The issue was that admin users would see all stakeholders regardless of coordinator's coverage area, while non-admin coordinators would correctly see only stakeholders within their coverage.

## Problem Statement

**Original Behavior:**
- **Non-admin coordinators**: Selecting a coordinator correctly filters stakeholders by that coordinator's coverage area
- **Admin users**: Selecting a coordinator returns ALL stakeholders, ignoring geographic constraints

**Root Cause:**
- Frontend was passing `coordinatorId` query parameter to backend
- Backend endpoint (`/api/users/by-capability`) was accepting but **ignoring** this parameter
- No coverage area filtering logic existed for admin-selected coordinators

## Solution Overview

### New Components

1. **StakeholderFilteringService** (`src/services/users_services/stakeholderFiltering.service.js`)
   - New service responsible for filtering stakeholders by coordinator's coverage area
   - Implements the same matching logic as `CoordinatorResolverService`
   - Filters by:
     - Geographic coverage (municipality/district)
     - Organization type matching
   - Returns only valid stakeholder IDs

2. **Updated User Controller** (`src/controller/users_controller/user.controller.js`)
   - Added `coordinatorId` parameter extraction from query string
   - Added coordinator-based coverage area filtering logic
   - Integrates new service into the `listUsersByCapability` endpoint
   - Applies filtering only for `request.review` capability queries

### Frontend - No Changes Required

The frontend in `UNITE/hooks/useEventUserData.ts` is already correctly:
- Passing `coordinatorId` parameter when admin selects a coordinator
- Processing the filtered stakeholder list returned from the API

## Implementation Details

### StakeholderFilteringService Methods

```javascript
async filterStakeholdersByCoverageArea(coordinatorId, stakeholderIds)
```

**Parameters:**
- `coordinatorId`: The selected coordinator's user ID
- `stakeholderIds`: Array of all stakeholder IDs to filter

**Returns:**
- Array of stakeholder IDs that match the coordinator's coverage area

**Logic Flow:**
1. Fetch coordinator's coverage areas and organization types
2. Extract all municipality/district IDs from coordinator's coverage
3. For each stakeholder:
   - Check if stakeholder's municipality is within coordinator's coverage
   - Check if stakeholder's organization type matches coordinator's organization type
4. Return only valid stakeholder IDs

### User Controller Integration

**Query Parameter:**
```
GET /api/users/by-capability?capability=request.review&coordinatorId=<id>
```

**Filtering Sequence:**
1. Get users with `request.review` capability (baseline)
2. Filter by authority (stakeholders only)
3. Filter by jurisdiction (requester's scope)
4. **NEW:** Filter by coordinator's coverage area (if coordinatorId provided)
5. Return paginated results

## Testing Scenarios

### Test Setup

Create test data:
```javascript
// Coordinator A - covers District 1 (Municipality 1A, 1B)
const coordinatorA = {
  _id: new ObjectId(),
  fullName: "Coordinator A",
  authority: 70,
  coverageAreas: [{
    coverageAreaId: <CoverageAreaID>,
    coverageAreaName: "District 1"
  }],
  organizationTypes: ["RedCross", "NGO"]
};

// Stakeholder 1 - in District 1, RedCross
const stakeholder1 = {
  _id: new ObjectId(),
  fullName: "Stakeholder 1",
  authority: 30,
  organizationTypes: ["RedCross"],
  locations: {
    municipalityId: <Municipality1A_ID>,
    municipalityName: "Municipality 1A"
  }
};

// Stakeholder 2 - in District 2, RedCross (different district)
const stakeholder2 = {
  _id: new ObjectId(),
  fullName: "Stakeholder 2",
  authority: 30,
  organizationTypes: ["RedCross"],
  locations: {
    municipalityId: <Municipality2A_ID>,
    municipalityName: "Municipality 2A"
  }
};

// Stakeholder 3 - in District 1, but different org type
const stakeholder3 = {
  _id: new ObjectId(),
  fullName: "Stakeholder 3",
  authority: 30,
  organizationTypes: ["Hospital"],
  locations: {
    municipalityId: <Municipality1A_ID>,
    municipalityName: "Municipality 1A"
  }
};
```

### Test Case 1: Admin Selects Coordinator with Multiple Valid Stakeholders

**Setup:** Admin user selects Coordinator A

**Expected Behavior:**
- Query: `GET /api/users/by-capability?capability=request.review&coordinatorId=<CoordinatorA_ID>`
- Should return: Stakeholder 1 (✓ matches District 1 AND RedCross)
- Should NOT return: Stakeholder 2 (✗ different district), Stakeholder 3 (✗ different org type)

**Verification:**
```bash
curl -H "Authorization: Bearer <admin_token>" \
  "http://localhost:5000/api/users/by-capability?capability=request.review&coordinatorId=<CoordinatorA_ID>"

# Expected response:
{
  "success": true,
  "data": [
    {
      "_id": "<Stakeholder1_ID>",
      "fullName": "Stakeholder 1",
      "locations": { "municipalityName": "Municipality 1A" }
    }
  ]
}
```

### Test Case 2: Non-Admin Coordinator Selects Themselves

**Setup:** Coordinator A user opens event creation modal

**Expected Behavior:**
- Frontend calls API without `coordinatorId` (uses default coordinator)
- Should auto-select Coordinator A
- When fetching stakeholders, should show only stakeholders in District 1

**Verification:** Check logs for:
```
[useEventUserData] Coordinator state: {
  coordinatorOptionsCount: 1,
  coordinatorOptions: [{key: '<CoordinatorA_ID>', label: 'Coordinator A - District 1'}],
  coordinator: '<CoordinatorA_ID>'
}
```

### Test Case 3: Admin with No Coverage Area Selected

**Setup:** Admin opens event creation modal, no coordinator selected yet

**Expected Behavior:**
- Query without `coordinatorId`: `GET /api/users/by-capability?capability=request.review`
- Should return all stakeholders (no filtering)
- Coordination selection should show all possible coordinators

**Verification:**
```bash
curl -H "Authorization: Bearer <admin_token>" \
  "http://localhost:5000/api/users/by-capability?capability=request.review"

# Should return all stakeholders
```

### Test Case 4: Coordinator with Overlapping Coverage Areas

**Setup:** Coordinator B covers multiple districts/municipalities

**Expected Behavior:**
- When stakeholder's municipality is in any of coordinator's coverage areas
- Stakeholder should appear in filtered list

**Verification:** Check coordinator's coverage:
```javascript
// Coordinator B covers both District 1 AND District 2
coordinatorB.coverageAreas = [
  { coverageAreaName: "District 1", districtIds: [...] },
  { coverageAreaName: "District 2", districtIds: [...] }
];

// Query should return stakeholders in EITHER district
// GET /api/users/by-capability?capability=request.review&coordinatorId=<CoordinatorB_ID>
```

## Debug Logging

The implementation includes comprehensive logging to help diagnose issues:

```javascript
// Service level
[filterStakeholdersByCoverageArea] Coordinator found
[filterStakeholdersByCoverageArea] Coordinator coverage extracted
[filterStakeholdersByCoverageArea] Stakeholders to filter
[filterStakeholdersByCoverageArea] Filtering complete

// Controller level
[listUsersByCapability] Applying coordinator coverage filtering
[listUsersByCapability] Coordinator coverage filtering applied
```

### Common Issues & Resolution

**Issue: "No stakeholders returned when coordinatorId is provided"**
- Check coordinator has coverage areas assigned
- Verify stakeholder's municipality is in coordinator's coverage
- Check organization type matches

**Issue: "All stakeholders returned (filtering not applied)"**
- Verify `coordinatorId` parameter is in query string
- Check service is being called (look for log: `Applying coordinator coverage filtering`)
- Verify coordinator exists and has valid coverage areas

**Issue: "Error during coverage area filtering"**
- Check coordinator ID is valid
- Verify CoverageArea documents exist
- Check database connection

## Performance Considerations

1. **Query Optimization:**
   - Uses `.lean()` for read-only operations
   - Minimal database queries (1-2 per coordinator coverage check)

2. **Scaling:**
   - For large coverage areas: Consider indexing on `CoverageArea.geographicUnits`
   - For many stakeholders: Pagination handled by existing limit/skip logic

3. **Caching Opportunities:**
   - Could cache coordinator coverage area data if many stakeholders query same coordinator
   - Current implementation re-fetches coverage on each query (acceptable for most use cases)

## Backward Compatibility

- ✅ **Frontend Changes:** NONE - existing code already passes coordinatorId
- ✅ **API Changes:** Backward compatible - coordinatorId is optional query parameter
- ✅ **Default Behavior:** Without coordinatorId, endpoint behaves exactly as before
- ✅ **Non-Stakeholder Queries:** No impact on coordinator/staff queries

## Integration Checklist

- [x] Create StakeholderFilteringService
- [x] Update User Controller to extract coordinatorId
- [x] Add filtering logic to listUsersByCapability
- [x] Add comprehensive logging
- [x] Verify no breaking changes
- [ ] Test in development environment
- [ ] Test in staging environment
- [ ] Verify with QA team using test scenarios above
- [ ] Deploy to production

## Rollback Plan

If issues arise:

1. **Revert Changes:**
   ```bash
   git revert <commit_hash>
   ```

2. **Immediate Effect:**
   - Admin users will see all stakeholders again (original behavior)
   - No data is lost or corrupted

3. **Short-term Workaround:**
   - Disable coordinatorId filtering by commenting out controller code (lines 2267-2295)

## Related Files

- [StakeholderFilteringService](src/services/users_services/stakeholderFiltering.service.js) - NEW
- [User Controller](src/controller/users_controller/user.controller.js) - UPDATED
- [Frontend Hook](UNITE/hooks/useEventUserData.ts) - NO CHANGES
- [Coordinator Resolver](src/services/users_services/coordinatorResolver.service.js) - Reference implementation

## Questions & Support

For issues or questions:
1. Check debug logs for `[filterStakeholdersByCoverageArea]` entries
2. Verify coordinator coverage areas are set up correctly
3. Test with cURL commands from Test Cases above
4. Review this guide's "Common Issues" section
