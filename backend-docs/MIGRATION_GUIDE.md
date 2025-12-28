# Migration Guide: User Architecture Revamp

## Overview

This guide explains how to migrate from the old fragmented user architecture to the new embedded data model. The migration is **non-breaking** and can be done in phases.

## Migration Phases

### Phase 1: Add New Fields (Non-Breaking)

**Status**: ✅ Already completed (schema updated)

New fields have been added to User and Role models:
- `Role.authority` (Number, default: 20)
- `User.authority` (Number, default: 20)
- `User.roles[]` (Array, optional)
- `User.organizations[]` (Array, optional)
- `User.coverageAreas[]` (Array, optional)
- `User.locations` (Object, optional)

**No action required** - fields are optional and won't break existing code.

### Phase 2: Populate New Fields

Run migration scripts in order:

#### Step 1: Migrate Role Authority

```bash
# Dry run first (recommended)
node src/utils/migrateRoleAuthority.js --dry-run

# Apply changes
node src/utils/migrateRoleAuthority.js
```

**What it does**:
- Calculates authority for each Role from permissions
- Sets `Role.authority` field
- Skips roles that already have authority set

**Expected output**:
```
Found 3 roles to migrate
  → Role "system-admin": calculating authority...
    Current: 20, Calculated: 100
    ✓ Updated authority to 100
  → Role "coordinator": calculating authority...
    Current: 20, Calculated: 60
    ✓ Updated authority to 60
  → Role "stakeholder": calculating authority...
    Current: 20, Calculated: 30
    ✓ Updated authority to 30
```

#### Step 2: Migrate User Authority

```bash
# Dry run first
node src/utils/migrateUserAuthority.js --dry-run

# Apply changes
node src/utils/migrateUserAuthority.js
```

**What it does**:
- Calculates authority for each User from their roles
- Sets `User.authority` field
- Skips users that already have authority set

**Expected output**:
```
Found 150 users to migrate
  → User "admin@example.com": calculating authority...
    Current: 20, Calculated: 100
    ✓ Updated authority to 100
  ...
```

#### Step 3: Migrate User Organizations

```bash
# Dry run first
node src/utils/migrateUserOrganizations.js --dry-run

# Apply changes
node src/utils/migrateUserOrganizations.js
```

**What it does**:
- Reads from `UserOrganization` collection
- Populates `User.organizations[]` array with denormalized data
- Also migrates legacy `User.organizationId` field
- Skips users that already have organizations embedded

**Expected output**:
```
Found 200 active user organization assignments
Found 150 unique users with organization assignments
  → User "coordinator@example.com": migrating 2 organization assignments...
    ✓ Embedded 2 organizations
  ...
```

#### Step 4: Migrate User Coverage

```bash
# Dry run first
node src/utils/migrateUserCoverage.js --dry-run

# Apply changes
node src/utils/migrateUserCoverage.js
```

**What it does**:
- Reads from `UserCoverageAssignment` collection
- Derives municipalities from coverage area geographic units
- Populates `User.coverageAreas[]` array with:
  - Coverage area reference
  - Denormalized name
  - District IDs
  - Municipality IDs (derived once, stored permanently)
- Skips users that already have coverage areas embedded

**Expected output**:
```
Found 100 active coverage area assignments
Found 80 unique users with coverage area assignments
  → User "coordinator@example.com": migrating 1 coverage area assignments...
    → Coverage area "Camarines Norte – Unified":
      Districts: 2, Municipalities: 12
    ✓ Embedded 1 coverage areas
  ...
```

#### Step 5: Migrate Stakeholder Locations

**Note**: Stakeholder locations are migrated during user creation (new stakeholders) or can be migrated manually:

```javascript
// Manual migration script (if needed)
const { User, UserLocation, Location } = require('./models');
const stakeholders = await User.find({ authority: { $lt: 60 } });

for (const user of stakeholders) {
  const userLocations = await UserLocation.find({ 
    userId: user._id, 
    isActive: true 
  }).populate('locationId');
  
  const municipality = userLocations.find(l => l.locationId?.type === 'municipality');
  const barangay = userLocations.find(l => l.locationId?.type === 'barangay');
  
  if (municipality) {
    user.locations = {
      municipalityId: municipality.locationId._id,
      municipalityName: municipality.locationId.name,
      barangayId: barangay?.locationId?._id || null,
      barangayName: barangay?.locationId?.name || null
    };
    await user.save();
  }
}
```

### Phase 3: Update Application Code

**Status**: ✅ Already completed

Application code has been updated to:
- Use `User.authority` field instead of runtime calculation
- Use `User.organizations[]` instead of `UserOrganization` queries
- Use `User.coverageAreas[]` instead of `UserCoverageAssignment` queries
- Use `User.locations` for stakeholders

**No action required** - code is already updated.

### Phase 4: Validation & Cleanup

#### Detect Broken Users

```bash
# Check for broken users
node src/utils/detectBrokenUsers.js

# Attempt to fix issues (where possible)
node src/utils/detectBrokenUsers.js --fix
```

**What it checks**:
- Users without authority
- Coordinators without organizations
- Coordinators without coverage areas
- Coordinators without municipalities in coverage
- Stakeholders without municipality

**Expected output**:
```
=== Broken Users Summary ===

MISSING_AUTHORITY: 5 users
  - user1@example.com (507f1f77bcf86cd799439011)
  - user2@example.com (507f1f77bcf86cd799439012)
  ...

COORDINATOR_NO_ORG: 3 users
  - coordinator1@example.com (507f1f77bcf86cd799439013)
  ...

Total issues found: 8
```

#### Fix Broken Users

**Manual fixes required**:

1. **Coordinators without organizations**:
   ```javascript
   // Assign organization via UserOrganization
   await UserOrganization.assignOrganization(userId, organizationId, {
     isPrimary: true,
     assignedBy: adminUserId
   });
   
   // Then run migration again: migrateUserOrganizations.js
   ```

2. **Coordinators without coverage**:
   ```javascript
   // Assign coverage area via UserCoverageAssignment
   await UserCoverageAssignment.assignCoverageArea(userId, coverageAreaId, {
     isPrimary: true,
     assignedBy: adminUserId
   });
   
   // Then run migration again: migrateUserCoverage.js
   ```

3. **Stakeholders without municipality**:
   ```javascript
   // Assign municipality via UserLocation
   await UserLocation.assignLocation(userId, municipalityId, 'exact', {
     isPrimary: true,
     assignedBy: adminUserId
   });
   
   // Then update User.locations manually or recreate user
   ```

## Migration Checklist

- [ ] **Backup database** before running migrations
- [ ] Run `migrateRoleAuthority.js` (dry-run first)
- [ ] Run `migrateUserAuthority.js` (dry-run first)
- [ ] Run `migrateUserOrganizations.js` (dry-run first)
- [ ] Run `migrateUserCoverage.js` (dry-run first)
- [ ] Run `detectBrokenUsers.js` to find issues
- [ ] Fix broken users manually
- [ ] Verify all users have required data
- [ ] Test coordinator → stakeholder creation flow
- [ ] Monitor application logs for errors

## Rollback Plan

If migration causes issues:

1. **New fields are optional** - old code will still work
2. **Legacy collections preserved** - `UserOrganization`, `UserCoverageAssignment`, `UserLocation` still exist
3. **Revert code changes** - Git revert to previous commit
4. **Data is safe** - New fields don't delete old data

## Post-Migration Validation

### Verify Migration Success

```javascript
// Check all roles have authority
const rolesWithoutAuthority = await Role.find({ 
  authority: { $exists: false } 
});
console.log(`Roles without authority: ${rolesWithoutAuthority.length}`);

// Check all users have authority
const usersWithoutAuthority = await User.find({ 
  authority: { $exists: false } 
});
console.log(`Users without authority: ${usersWithoutAuthority.length}`);

// Check coordinators have organizations
const coordinatorsWithoutOrgs = await User.find({
  authority: { $gte: 60 },
  $or: [
    { organizations: { $size: 0 } },
    { organizations: { $exists: false } }
  ]
});
console.log(`Coordinators without orgs: ${coordinatorsWithoutOrgs.length}`);

// Check coordinators have coverage
const coordinatorsWithoutCoverage = await User.find({
  authority: { $gte: 60 },
  $or: [
    { coverageAreas: { $size: 0 } },
    { coverageAreas: { $exists: false } }
  ]
});
console.log(`Coordinators without coverage: ${coordinatorsWithoutCoverage.length}`);
```

### Test Coordinator → Stakeholder Creation

1. **Login as coordinator**
2. **Navigate to stakeholder management page**
3. **Verify**:
   - Organizations dropdown shows coordinator's organizations
   - Municipalities dropdown shows municipalities from coordinator's coverage
   - Role dropdown shows only stakeholder-level roles
4. **Create stakeholder**
5. **Verify**:
   - Stakeholder created successfully
   - Stakeholder has organization assigned
   - Stakeholder has municipality assigned

## Troubleshooting

### Migration Script Fails

**Error**: "Role not found" or "User not found"
- **Solution**: Check database connection and verify IDs exist

**Error**: "Organization not found"
- **Solution**: Verify Organization documents exist and are active

**Error**: "Coverage area has no geographic units"
- **Solution**: Populate CoverageArea.geographicUnits before running migration

### Users Still Show "organizationsFound: 0"

**Possible causes**:
1. Migration not run for this user
2. UserOrganization records are inactive or expired
3. Organization documents are inactive

**Solution**:
1. Check `User.organizations[]` array in database
2. Check `UserOrganization` collection for this user
3. Re-run migration: `migrateUserOrganizations.js`

### Users Still Show "municipalitiesCount: 0"

**Possible causes**:
1. Migration not run for this user
2. Coverage area has no districts
3. Districts have no municipalities

**Solution**:
1. Check `User.coverageAreas[].municipalityIds[]` in database
2. Check CoverageArea.geographicUnits contain districts
3. Verify Location hierarchy (districts → municipalities)
4. Re-run migration: `migrateUserCoverage.js`

## Performance Considerations

### Document Size

- **Before**: User document ~1-2KB
- **After**: User document ~5-10KB (with embedded data)
- **Impact**: Minimal - MongoDB handles documents up to 16MB

### Query Performance

- **Before**: 6+ queries per user lookup
- **After**: 1 query per user lookup
- **Impact**: Significant performance improvement

### Index Usage

New indexes added:
- `User.authority` (for authority filtering)
- `User.roles.roleId` (for role lookups)
- `User.organizations.organizationId` (for org lookups)
- `User.coverageAreas.coverageAreaId` (for coverage lookups)
- `User.locations.municipalityId` (for location lookups)

## Maintenance

### Keeping Embedded Data in Sync

When updating:
- **Role changes**: Update `Role.authority`, then re-migrate user authorities
- **Organization changes**: Update `User.organizations[]` when `UserOrganization` changes
- **Coverage changes**: Update `User.coverageAreas[]` when `UserCoverageAssignment` changes

**Best Practice**: Always update both the collection (for audit) and the embedded array (for querying).

### Adding New Users

New users are automatically created with embedded data (see `user.controller.js` createUser method). No manual migration needed.

## Support

For issues or questions:
1. Check diagnostic endpoint: `GET /api/users/:userId/diagnostics`
2. Review logs for error messages
3. Run `detectBrokenUsers.js` to identify issues
4. Consult `USER_ARCHITECTURE.md` for architecture details







