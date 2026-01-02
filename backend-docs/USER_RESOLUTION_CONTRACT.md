# User Resolution Contract

This document defines the authoritative contract for how user data is stored, resolved, and what is required for each user type in the UNITE backend system.

## Purpose

This contract prevents:
- Future AI confusion about user data structure
- Future partial-user bugs
- Future "user exists but not found" errors
- Inconsistent data resolution across different endpoints

## Data Storage Architecture

### Collections Involved

User data is stored across multiple MongoDB collections:

1. **`users`** - Core user information
   - Fields: `_id`, `email`, `firstName`, `lastName`, `password`, `isActive`, `isSystemAdmin`
   - Optional: `organizationId` (legacy field, for backward compatibility)
   - **Note**: `organizationId` on User is legacy. New assignments use `UserOrganization` collection.

2. **`userroles`** - Role assignments
   - Links users to roles via `userId` and `roleId`
   - Fields: `userId`, `roleId`, `isActive`, `expiresAt`, `assignedAt`, `assignedBy`
   - Context: `locationScope`, `coverageAreaScope`, `organizationScope` (optional)

3. **`userorganizations`** - Organization assignments (NEW STANDARD)
   - Links users to organizations via `userId` and `organizationId`
   - Fields: `userId`, `organizationId`, `roleInOrg`, `isPrimary`, `isActive`, `expiresAt`, `assignedAt`, `assignedBy`
   - **This is the primary source for organization membership**

4. **`usercoverageassignments`** - Coverage area assignments (for coordinators)
   - Links users to coverage areas via `userId` and `coverageAreaId`
   - Fields: `userId`, `coverageAreaId`, `isPrimary`, `autoCoverDescendants`, `isActive`, `expiresAt`, `assignedAt`, `assignedBy`
   - **This is the primary source for coordinator coverage**

5. **`userlocations`** - Direct location assignments (for stakeholders/legacy)
   - Links users to locations via `userId` and `locationId`
   - Fields: `userId`, `locationId`, `scope`, `isPrimary`, `isActive`, `expiresAt`, `assignedAt`, `assignedBy`
   - **Used primarily for stakeholders**

## Authority Resolution

### How Authority is Computed

Authority is derived from **permissions**, which come from **roles**:

```
User → UserRole → Role → Permissions → Authority Tier
```

**Authority Tiers:**
- `100` - SYSTEM_ADMIN: Has `*.*` permission or `isSystemAdmin: true`
- `80` - OPERATIONAL_ADMIN: Can manage all staff types
- `60` - COORDINATOR: Has operational capabilities (request.create, event.create, staff.create)
- `30` - STAKEHOLDER: Has review-only capabilities (request.review)
- `20` - BASIC_USER: Minimal permissions

**Calculation Flow:**
1. Check `User.isSystemAdmin` flag → if true, return 100
2. Get all active `UserRole` assignments for user
3. Populate `Role` documents
4. Aggregate permissions from all roles
5. Determine authority tier based on permission patterns

**Fallback:** If no permissions found, system attempts to infer authority from role codes (coordinator → 60, stakeholder → 30).

## Organization Resolution

### Priority Order

When resolving organizations for a user, check in this order:

1. **`UserOrganization` collection** (NEW STANDARD)
   - Query: `UserOrganization.find({ userId, isActive: true, expiresAt: { $gt: Date.now() } })`
   - This is the primary source for organization membership
   - Supports multiple organizations per user
   - Supports `isPrimary` flag

2. **`User.organizationId` field** (LEGACY/BACKWARD COMPATIBILITY)
   - Only checked if `UserOrganization` returns no results
   - Single organization per user
   - Maintained for backward compatibility

**Important:** Always check BOTH sources. Do not rely solely on `User.organizationId`.

### Query Pattern

```javascript
// Correct pattern (checks both sources)
const organizations = [];

// Check UserOrganization (new standard)
const userOrgAssignments = await UserOrganization.find({
  userId: userId,
  isActive: true,
  $or: [
    { expiresAt: { $exists: false } },
    { expiresAt: null },
    { expiresAt: { $gt: new Date() } }
  ]
}).populate('organizationId');

// Check User.organizationId (legacy)
const user = await User.findById(userId);
if (user && user.organizationId) {
  const org = await Organization.findById(user.organizationId);
  if (org && org.isActive) {
    organizations.push(org);
  }
}
```

## Coverage Resolution

### For Coordinators

Coordinators use **`UserCoverageAssignment`** collection:

1. Query: `UserCoverageAssignment.find({ userId, isActive: true })`
2. Populate `coverageAreaId` to get `CoverageArea` documents
3. Extract `geographicUnits` from coverage areas
4. Derive municipalities from geographic units (districts/provinces)

### For Stakeholders

Stakeholders use **`UserLocation`** collection:

1. Query: `UserLocation.find({ userId, isActive: true })`
2. Populate `locationId` to get `Location` documents
3. Direct municipality/barangay assignments

### Municipality Derivation (Coordinators)

For coordinators, municipalities are derived from coverage areas:

1. Get user's coverage area assignments
2. For each coverage area, get `geographicUnits`
3. For each geographic unit:
   - If type is `district` or `city`: add to district list
   - If type is `province`: get all districts under it
4. Get all municipalities where `parent` is in district list

## Required Fields by User Type

### System Admin

**Required:**
- User document with `isSystemAdmin: true` OR role with `*.*` permission

**Optional:**
- Organizations (can access all)
- Coverage areas (can access all)
- Locations (can access all)

### Coordinator

**Required:**
- At least one active `UserRole` assignment with role that has operational permissions
- At least one active `UserCoverageAssignment` (coverage area)
- At least one active `UserOrganization` assignment (organization)

**Authority:** Must be ≥ 60 (COORDINATOR tier)

**Validation:**
- Role assignment must succeed
- Coverage assignment must succeed
- Organization assignment must succeed
- All must be created atomically (transaction)

### Stakeholder

**Required:**
- At least one active `UserRole` assignment with role that has review permissions
- At least one active `UserLocation` assignment (municipality)

**Authority:** Must be ≥ 30 (STAKEHOLDER tier)

**Optional:**
- Organization assignment (via `UserOrganization`)
- Barangay location assignment

## Unified Context Resolution

### CoordinatorContextService

**Use this service for all coordinator context resolution:**

```javascript
const coordinatorContextService = require('./coordinatorContext.service');

const context = await coordinatorContextService.getCoordinatorContext(userId);
// Returns: { user, roles, authority, organizations[], coverageAreas[], municipalities[], isValid, issues[] }
```

**Benefits:**
- Single source of truth
- Consistent data resolution
- Automatic validation
- Structured logging with `[CTX]` prefix

## Query Patterns

### DO: Use Unified Resolver

```javascript
// ✅ CORRECT: Use unified resolver
const context = await coordinatorContextService.getCoordinatorContext(userId);
const organizations = context.organizations;
const municipalities = context.municipalities;
```

### DON'T: Query Collections Directly

```javascript
// ❌ WRONG: Only checking User.organizationId
const user = await User.findById(userId);
const org = await Organization.findById(user.organizationId);
```

### DO: Check Both Sources

```javascript
// ✅ CORRECT: Check both UserOrganization and User.organizationId
const organizations = await _resolveOrganizations(userId);
```

### DO: Derive Municipalities from Coverage Areas (Coordinators)

```javascript
// ✅ CORRECT: For coordinators, derive from coverage areas
const coverageAssignments = await userCoverageAssignmentService.getUserCoverageAreas(userId);
// Extract districts from geographicUnits
// Get municipalities under those districts
```

### DON'T: Assume Direct Location Assignments (Coordinators)

```javascript
// ❌ WRONG: Coordinators don't have direct location assignments
const locations = await locationService.getUserLocations(userId);
```

## Validation at Creation

### Coordinator Creation

All assignments must succeed atomically:

1. **User creation** → Validate user exists
2. **Role assignment** → Validate `UserRole.find({ userId, isActive: true })` returns results
3. **Coverage assignment** → Validate `UserCoverageAssignment.find({ userId, isActive: true })` returns results
4. **Organization assignment** → Validate `UserOrganization.find({ userId, isActive: true })` returns results

**Transaction:** All steps must be in a single MongoDB transaction. If any step fails, rollback all.

### Error Handling

If validation fails:
- Abort transaction
- Return error with specific message
- Log with `[CTX]` prefix for debugging

## Logging Standards

### Structured Logging Prefix

Use `[CTX]` prefix for all context resolution logs:

```javascript
console.log('[CTX] User found:', !!user);
console.log('[CTX] Role assignments found:', userRoles.length);
console.log('[CTX] Recognized authority:', authority);
console.log('[CTX] Organizations resolved:', organizations.length);
console.log('[CTX] Coverage resolved:', coverageAreas.length);
console.log('[CTX] Municipalities resolved:', municipalities.length);
```

### Diagnostic Information

Always log:
- Query parameters (userId, type)
- Query results (count, IDs)
- Resolution steps (which source was used)
- Validation results (isValid, issues)

## Common Pitfalls

### 1. Only Checking User.organizationId

**Problem:** New coordinators have organizations in `UserOrganization`, not `User.organizationId`.

**Solution:** Always check both sources.

### 2. Using UserLocation for Coordinators

**Problem:** Coordinators use `UserCoverageAssignment`, not `UserLocation`.

**Solution:** Derive municipalities from coverage areas for coordinators.

### 3. Not Validating After Assignment

**Problem:** Assignment appears to succeed but data isn't actually saved.

**Solution:** Always validate assignments by querying the collection after creation.

### 4. Inconsistent Lookup Functions

**Problem:** Different functions check different sources, leading to inconsistent results.

**Solution:** Use `CoordinatorContextService` for all coordinator context resolution.

## Migration Notes

### Legacy Data

- Old users may have `User.organizationId` set
- Old users may have `UserLocation` assignments instead of `UserCoverageAssignment`
- System checks both sources for backward compatibility

### New Data

- All new coordinators should have:
  - `UserOrganization` assignments (not just `User.organizationId`)
  - `UserCoverageAssignment` assignments (not `UserLocation`)
  - Active `UserRole` assignments

## Testing

### Validation Checklist

When creating a coordinator, verify:
- [ ] User document exists
- [ ] At least one active `UserRole` exists
- [ ] At least one active `UserCoverageAssignment` exists
- [ ] At least one active `UserOrganization` exists
- [ ] Authority ≥ 60
- [ ] Organizations resolvable via `getAllowedOrganizations()`
- [ ] Municipalities resolvable via `getMunicipalitiesForStakeholderCreation()`

### Diagnostic Scripts

Use these scripts to verify user completeness:
- `node src/utils/diagnoseUser.js <userId|email>`
- `node src/utils/diagnose-coordinator.js <userId|email>`

## Summary

**Key Principles:**
1. **Single Source of Truth:** Use `CoordinatorContextService` for all coordinator context
2. **Check Both Sources:** Always check `UserOrganization` AND `User.organizationId` for organizations
3. **Derive from Coverage:** For coordinators, derive municipalities from coverage areas, not direct locations
4. **Validate Atomically:** All assignments must succeed in a transaction
5. **Log Consistently:** Use `[CTX]` prefix for all context resolution logs

**Required for Coordinators:**
- Role (UserRole)
- Organization (UserOrganization)
- Coverage (UserCoverageAssignment)
- Authority ≥ 60

**Required for Stakeholders:**
- Role (UserRole)
- Municipality (UserLocation)
- Authority ≥ 30

