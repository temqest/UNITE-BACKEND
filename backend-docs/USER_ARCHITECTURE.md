# User Architecture Documentation

## Overview

The UNITE system uses a **denormalized, embedded data model** for user information to eliminate silent failures and ensure reliable querying. This document explains how users, roles, organizations, and locations are structured and managed.

## Core Principles

1. **Explicit Persisted State**: Authority, roles, organizations, and coverage are stored directly in the User document, not inferred at runtime
2. **Single Query Access**: All user data can be retrieved with a single database query
3. **Atomic Validation**: Users cannot be created without required data (enforced at schema level)
4. **No Silent Failures**: Missing data is detected immediately, not during runtime queries

## User Model Schema

### Core Fields

```javascript
{
  _id: ObjectId,
  email: String (unique, indexed),
  password: String,
  firstName: String,
  lastName: String,
  
  // AUTHORITY: Explicit, persisted, never inferred
  authority: Number (20-100, required, indexed),
  
  // ROLES: Embedded array
  roles: [{
    roleId: ObjectId (ref: 'Role'),
    roleCode: String,  // Denormalized
    roleAuthority: Number,  // Denormalized
    assignedAt: Date,
    assignedBy: ObjectId,
    isActive: Boolean
  }],
  
  // ORGANIZATIONS: Embedded array (coordinators can have multiple)
  organizations: [{
    organizationId: ObjectId (ref: 'Organization'),
    organizationName: String,  // Denormalized
    organizationType: String,  // Denormalized
    isPrimary: Boolean,
    assignedAt: Date,
    assignedBy: ObjectId
  }],
  
  // COVERAGE: For coordinators (district-level)
  coverageAreas: [{
    coverageAreaId: ObjectId (ref: 'CoverageArea'),
    coverageAreaName: String,  // Denormalized
    districtIds: [ObjectId],  // Denormalized
    municipalityIds: [ObjectId],  // Denormalized (derived once, never recalculated)
    isPrimary: Boolean,
    assignedAt: Date,
    assignedBy: ObjectId
  }],
  
  // LOCATION: For stakeholders (municipality/barangay)
  locations: {
    municipalityId: ObjectId (ref: 'Location'),
    municipalityName: String,  // Denormalized
    barangayId: ObjectId (ref: 'Location'),  // Optional
    barangayName: String  // Denormalized, optional
  },
  
  isSystemAdmin: Boolean,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

## Role Model Schema

### Updated Schema

```javascript
{
  code: String (unique),
  name: String,
  description: String,
  
  // CRITICAL: Explicit authority field
  authority: Number (20-100, required, indexed),
  
  permissions: [PermissionSchema],
  isSystemRole: Boolean
}
```

## Authority System

### Authority Tiers

```javascript
const AUTHORITY_TIERS = {
  SYSTEM_ADMIN: 100,
  OPERATIONAL_ADMIN: 80,
  COORDINATOR: 60,
  STAKEHOLDER: 30,
  BASIC_USER: 20
};
```

### Authority Assignment

**On Role Assignment**:
1. Lookup `Role.authority` (persisted field)
2. Set `User.authority = Math.max(User.authority, Role.authority)`
3. Update `User.roles[]` with denormalized `roleAuthority`

**On Role Removal**:
1. Recalculate `User.authority` from remaining roles
2. Update `User.authority` field

### Authority Usage

- **Never calculated at runtime** (except during migration/backward compatibility)
- **Always read from `User.authority` field**
- **Used for all permission checks** (no role code string matching)

## Role Assignment

### How Roles Are Assigned

1. **Create UserRole record** (for audit trail and legacy compatibility)
2. **Update User.roles[] array** with denormalized data:
   - `roleId`: Reference to Role document
   - `roleCode`: Denormalized role code (for quick lookup)
   - `roleAuthority`: Denormalized authority (for quick comparison)
   - `assignedAt`, `assignedBy`, `isActive`: Metadata
3. **Update User.authority** to maximum of all active role authorities

### Role Assignment Rules

- **Generic Rule**: `creatorAuthority > targetRoleAuthority`
- **No Hardcoding**: All checks use numeric `authority` field
- **Data-Driven**: Rules defined in single configuration file

## Organization Assignment

### For Coordinators

- **Multiple organizations allowed**: `User.organizations[]` (array)
- **Primary organization**: Flagged with `isPrimary: true`
- **Denormalized data**: Organization name and type stored in User document

### For Stakeholders

- **Single organization**: `User.organizations[0]` (enforced at creation)
- **Required**: Stakeholders must have exactly one organization

### Organization Assignment Flow

1. **Validate organization exists and is active**
2. **Create UserOrganization record** (for audit trail)
3. **Add to User.organizations[]** with denormalized data:
   - `organizationId`: Reference to Organization document
   - `organizationName`: Denormalized name
   - `organizationType`: Denormalized type
   - `isPrimary`, `assignedAt`, `assignedBy`: Metadata

### Organization Fetching

**Single Query, No Joins**:
```javascript
const user = await User.findById(userId);
const organizations = user.organizations.filter(o => o.isActive);
```

## Coverage Area Assignment

### For Coordinators

- **Assigned at district level** (via CoverageArea)
- **CoverageArea contains districts** as geographicUnits
- **Municipalities derived once** at assignment time and stored in `User.coverageAreas[].municipalityIds`
- **Never derived at runtime again**

### Coverage Assignment Flow

1. **Get CoverageArea.geographicUnits** (districts/provinces)
2. **Query municipalities**: `Location.find({ parent: { $in: districtIds }, type: 'municipality' })`
3. **Store municipalityIds** in `User.coverageAreas[].municipalityIds`
4. **Store districtIds** in `User.coverageAreas[].districtIds`
5. **Store denormalized name** in `User.coverageAreas[].coverageAreaName`

### Municipality Selection for Stakeholder Creation

**Backend Logic**:
```javascript
const creator = await User.findById(creatorId);
const municipalityIds = creator.coverageAreas
  .flatMap(ca => ca.municipalityIds || [])
  .filter(Boolean);

const municipalities = await Location.find({
  _id: { $in: municipalityIds },
  isActive: true
});
```

**No More**:
- Deriving municipalities from districts at runtime
- Multiple queries to CoverageArea and Location
- Complex fallback logic

## Location Assignment

### For Stakeholders

- **Municipality**: Required, stored in `User.locations.municipalityId`
- **Barangay**: Optional, stored in `User.locations.barangayId`
- **Denormalized names**: Stored in `User.locations.municipalityName` and `User.locations.barangayName`

### Location Assignment Flow

1. **Validate municipality exists**
2. **Validate barangay belongs to municipality** (if provided)
3. **Create UserLocation record** (for audit trail)
4. **Update User.locations** with denormalized data

## User Creation Flows

### Coordinator Creation

**Required Fields**:
- At least one role (authority >= 60)
- At least one organization
- At least one coverage area

**Creation Steps**:
1. Validate creator has sufficient authority
2. Create User document with default authority (20)
3. Assign roles → Update `User.roles[]` and `User.authority`
4. Assign organizations → Update `User.organizations[]`
5. Assign coverage areas → Derive municipalities → Update `User.coverageAreas[]`
6. Schema validation ensures all required fields are present

### Stakeholder Creation

**Required Fields**:
- Role: 'stakeholder' (authority < 60)
- One organization
- One municipality

**Creation Steps**:
1. Validate creator has authority >= 60
2. Validate municipality is in creator's coverage
3. Validate organization is in creator's organizations
4. Create User document with stakeholder authority
5. Assign stakeholder role → Update `User.roles[]` and `User.authority`
6. Assign organization → Update `User.organizations[]`
7. Assign municipality/barangay → Update `User.locations`
8. Schema validation ensures municipality is present

## Permission Checks

### Authority-Based Checks

**Can Create User**:
```javascript
function canCreateUser(creatorAuthority, targetRoleAuthority) {
  return creatorAuthority > targetRoleAuthority;
}
```

**Can Assign Role**:
```javascript
function canAssignRole(creatorAuthority, roleAuthority) {
  return creatorAuthority > roleAuthority;
}
```

**Can View User**:
```javascript
function canViewUser(viewerAuthority, targetAuthority) {
  return viewerAuthority > targetAuthority || viewerAuthority === 100;
}
```

### Jurisdiction Checks

**Can Assign Organization**:
- System admin: Any organization
- Coordinator: Only their own organizations (from `User.organizations[]`)

**Can Assign Municipality**:
- System admin: Any municipality
- Coordinator: Only municipalities from their coverage areas (from `User.coverageAreas[].municipalityIds`)

## Querying User Data

### Single Query Pattern

```javascript
// Get all user data in one query
const user = await User.findById(userId);

// Access embedded data directly
const authority = user.authority;
const roles = user.roles.filter(r => r.isActive);
const organizations = user.organizations;
const coverageAreas = user.coverageAreas;
const municipalities = user.coverageAreas.flatMap(ca => ca.municipalityIds);
const locations = user.locations;
```

### No More Joins

**Before** (fragile):
```javascript
const user = await User.findById(userId);
const userRoles = await UserRole.find({ userId }).populate('roleId');
const userOrgs = await UserOrganization.find({ userId }).populate('organizationId');
const coverageAssignments = await UserCoverageAssignment.find({ userId }).populate('coverageAreaId');
// ... multiple queries, each can fail silently
```

**After** (reliable):
```javascript
const user = await User.findById(userId);
// All data available immediately
```

## Debugging Guide

### Diagnostic Endpoint

**Endpoint**: `GET /api/users/:userId/diagnostics`

Returns comprehensive user state:
- User information (authority, email, etc.)
- Roles (with authority)
- Organizations (with types)
- Coverage areas (with municipality counts)
- Locations (for stakeholders)
- Validation summary (what's missing, what's valid)

### Common Issues

#### Issue: "organizationsFound: 0"

**Possible Causes**:
1. User.organizations[] array is empty
2. Organization documents are inactive
3. Migration not run: `migrateUserOrganizations.js`

**Solution**:
1. Check `User.organizations[]` array in database
2. Run migration script if array is empty
3. Verify Organization documents exist and are active

#### Issue: "municipalitiesCount: 0"

**Possible Causes**:
1. User.coverageAreas[].municipalityIds[] is empty
2. Coverage area has no districts
3. Districts have no municipalities
4. Migration not run: `migrateUserCoverage.js`

**Solution**:
1. Check `User.coverageAreas[].municipalityIds[]` in database
2. Run migration script if array is empty
3. Verify CoverageArea.geographicUnits contain districts
4. Verify Location hierarchy (districts → municipalities)

#### Issue: "User not found"

**Possible Causes**:
1. userId format mismatch (string vs ObjectId)
2. User doesn't exist

**Solution**:
1. Use `User.findById()` first, then `User.findByLegacyId()` as fallback
2. Check database directly with MongoDB shell

#### Issue: "Roles blocked"

**Possible Causes**:
1. Creator authority <= target role authority
2. Role.authority field not set (migration not run)

**Solution**:
1. Check creator's `User.authority` field
2. Check target role's `Role.authority` field
3. Run migration: `migrateRoleAuthority.js`

### Validation Checks

**Schema Validation** (automatic):
- Coordinators (authority >= 60) must have organizations
- Coordinators (authority >= 60) must have coverage areas
- Stakeholders (authority < 60) must have municipality

**Runtime Validation**:
- Use diagnostic endpoint to check user state
- Check `User.authority` field (should be set)
- Check `User.roles[]` array (should have active roles)
- Check `User.organizations[]` array (coordinators need at least one)
- Check `User.coverageAreas[]` array (coordinators need at least one)
- Check `User.locations.municipalityId` (stakeholders need this)

## Best Practices

1. **Always use persisted authority**: Read from `User.authority`, never calculate
2. **Single query pattern**: Use `User.findById()` and access embedded arrays
3. **Denormalize on update**: When assigning roles/orgs/coverage, update both collection and embedded array
4. **Validate at creation**: Use schema validation hooks to prevent invalid users
5. **Use diagnostic endpoint**: When debugging, use `/api/users/:userId/diagnostics`

## Migration Notes

- **Legacy fields preserved**: `User.organizationId`, `UserRole`, `UserOrganization`, `UserCoverageAssignment` still exist for audit trail
- **Embedded arrays are source of truth**: Always read from `User.organizations[]`, `User.coverageAreas[]`, etc.
- **Migration scripts available**: See `MIGRATION_GUIDE.md` for migration instructions





















