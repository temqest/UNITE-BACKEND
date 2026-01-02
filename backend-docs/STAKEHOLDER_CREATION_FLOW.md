# Stakeholder Creation Flow — Authority-Based Logic

## Overview

This document describes how stakeholders are created and viewed in the UNITE system, including the authority-based permission checks, organization/location assignment rules, role filtering logic, and viewing restrictions.

**Last Updated:** January 2025 (Updated for new user model with dynamic roles, organizations, and coverage areas)

---

## Authority Hierarchy

| Role | Authority | Can Create | Notes |
|------|-----------|------------|-------|
| **System Admin** | 100 | All stakeholder roles | Full access to all organizations and locations |
| **Operational Admin** | 80 | All stakeholder roles | Limited to assigned organizations/locations |
| **Coordinator** | 60-79 | All stakeholder roles | Limited to assigned organizations and district municipalities |
| **Stakeholder** | <60 | Cannot create users | End users who cannot create staff |

### Role Authority Mapping

The system uses explicit authority values stored in the `Role` model. The authority field is the source of truth for user authority levels.

| Role Code | Role Name | Authority Value |
|-----------|-----------|----------------|
| `system-admin` | System Administrator | 100 |
| `coordinator` | Coordinator | 60 |
| `stakeholder` | Stakeholder | 30 |

**Important Notes:**
- Role authority is set during role seeding and should not be changed manually
- User authority is calculated from the maximum authority of their assigned roles
- If role authorities are incorrect in the database, run the migration script (see below)

### Fixing Incorrect Role Authorities

If roles have incorrect authority values (e.g., all roles showing authority 20), run the migration script:

```bash
# Dry run first to see what will be changed
node src/utils/migrations/fixRoleAuthorities.js --dry-run

# Apply the changes
node src/utils/migrations/fixRoleAuthorities.js
```

This script will:
1. Update role authorities to correct values based on role code
2. Recalculate and update user authorities based on their assigned roles

**Reseeding Roles:**
To update role authorities during seeding (for new installations or updates):

```bash
# Dry run first
node src/utils/seedRoles.js --dry-run

# Apply changes
node src/utils/seedRoles.js
```

The seed script will automatically update existing roles' authority if it doesn't match the expected value.

---

## Stakeholder Viewing Rules

### Viewing Stakeholders

**System Admin / Authority ≥ 80:**
- Can view all stakeholders across all coverage areas and organizations
- No jurisdiction restrictions

**Coordinator / Authority = 60:**
- Can only view stakeholders:
  - Under the same organization(s) the coordinator belongs to
  - Within the coordinator's assigned coverage area (district → municipalities → optional barangays)
- Backend enforces this via `filterUsersByJurisdiction()` method

**Stakeholders:**
- Cannot view other stakeholders or coordinators
- Page access is restricted via `/api/pages/check/stakeholder-management` endpoint

**Implementation:**
```javascript
// Backend filtering in listUsersByCapability
// 1. Authority filtering: Only users with authority < viewer's authority
filteredUserIds = await authorityService.filterUsersByAuthority(
  requesterId,
  filteredUserIds,
  context,
  false // Don't allow equal authority for stakeholder viewing
);

// 2. Jurisdiction filtering: Only users within creator's jurisdiction
filteredUserIds = await jurisdictionService.filterUsersByJurisdiction(
  requesterId,
  filteredUserIds
);

// 3. Role type filtering: Only stakeholder roles (authority < 60)
if (capabilities.includes('request.review')) {
  // Filter to only stakeholder roles
}
```

## Stakeholder Creation Rules

### 1. Role Assignment

**Authority-Based Filtering:**
- Only roles with `authority < creatorAuthority AND authority < 60 (COORDINATOR)` can be assigned
- Coordinators cannot create coordinator-level or higher roles
- System admins can create any stakeholder-level role
- **No hard-coded roles**: All roles are dynamically loaded based on creator's authority

**Implementation:**
```javascript
// src/services/users_services/jurisdiction.service.js
async getCreatableRolesForStakeholders(creatorId) {
  const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
  
  const roles = await Role.find({
    isActive: true,
    authority: { 
      $lt: Math.min(creatorAuthority, AUTHORITY_TIERS.COORDINATOR) // Must be below both
    }
  }).sort({ authority: -1, name: 1 });
  
  return roles;
}
```

**Frontend:**
- Role selection dropdown shows all available roles (if multiple)
- Auto-selects first role if only one option available
- Sends role ID (not hard-coded string) to backend

### 2. Organization Assignment

**Rules:**
- **Stakeholders:** Can have only ONE organization
- **System Admin:** Can assign any active organization
- **Coordinator:** Can assign only from their own `UserOrganization` assignments

**Data Structure:**
```javascript
// Coordinator organizations (many-to-many via UserOrganization)
UserOrganization {
  userId: ObjectId,          // Coordinator ID
  organizationId: ObjectId,  // Organization ID
  isPrimary: Boolean,
  isActive: Boolean,
  expiresAt: Date (optional)
}

// Stakeholder organization (single reference)
User {
  organizationId: ObjectId   // Single organization for stakeholder
}
```

**Implementation:**
```javascript
// src/services/users_services/jurisdiction.service.js
async getAllowedOrganizationsForStakeholderCreation(creatorId) {
  const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
  
  if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
    return await Organization.find({ isActive: true });
  }
  
  // Non-system-admins get their assigned organizations
  const userOrgAssignments = await UserOrganization.find({
    userId: creatorId,
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate('organizationId');
  
  return userOrgAssignments
    .map(assignment => assignment.organizationId)
    .filter(org => org && org.isActive);
}
```

### 3. Coverage Area Assignment (Location)

**Location Hierarchy:**
```
Province
  └── District
       └── Municipality (Required for stakeholders)
            └── Barangay (Optional for stakeholders)
```

**Stakeholder Location Rules:**
- **Required:** Municipality (must be within creator's coverage areas)
- **Optional:** Barangay (must belong to selected municipality)
- **Tree Structure Display:** "Municipality Name → Barangay Name" (or just "Municipality Name" if no barangay)

**System Admin:**
- Can select any municipality and barangay

**Coordinator:**
- Can select municipalities only from their assigned coverage areas
- Coverage areas come from `User.coverageAreas[]` embedded array
- Municipalities are derived from coverage areas and stored in `User.coverageAreas[].municipalityIds[]`

**Data Structure:**
```javascript
// Stakeholder location (embedded in User document)
User {
  locations: {
    municipalityId: ObjectId,      // Required
    municipalityName: String,        // Denormalized
    barangayId: ObjectId,            // Optional
    barangayName: String             // Denormalized, optional
  }
}
```

**Implementation:**
```javascript
// src/services/users_services/jurisdiction.service.js
async getMunicipalitiesForStakeholderCreation(creatorId) {
  const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
  
  if (creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN) {
    return await Location.find({ type: 'municipality', isActive: true });
  }
  
  // Get coordinator's location assignments
  const userLocations = await locationService.getUserLocations(creatorId);
  
  // Extract districts from user location assignments
  const districtIds = new Set();
  for (const location of userLocations) {
    if (location.type === 'district' || location.type === 'city') {
      districtIds.add(location._id.toString());
    } else if (location.type === 'province') {
      // Get all districts under province
      const provinceDistricts = await Location.find({
        type: { $in: ['district', 'city'] },
        parent: location._id,
        isActive: true
      });
      provinceDistricts.forEach(d => districtIds.add(d._id.toString()));
    }
  }
  
  // Get all municipalities under these districts
  return await Location.find({
    type: 'municipality',
    parent: { $in: Array.from(districtIds) },
    isActive: true
  });
}
```

---

## API Endpoints

### 1. Get Creation Context

**Endpoint:** `GET /api/stakeholders/creation-context`  
**Controller:** `stakeholder.controller.js → getCreationContext()`

**Purpose:** Returns all data needed to populate the Add Stakeholder modal.

**Request:**
- Headers: `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "allowedRole": "stakeholder",
    "roleOptions": [
      {
        "_id": "role_id",
        "code": "stakeholder_basic",
        "name": "Basic Stakeholder",
        "authority": 30,
        "description": "..."
      }
    ],
    "canChooseMunicipality": false,
    "canChooseOrganization": false,
    "municipalityOptions": [
      {
        "_id": "location_id",
        "name": "Naga City",
        "code": "NAGA",
        "type": "municipality",
        "parent": "district_id",
        "province": "province_id",
        "level": 3
      }
    ],
    "barangayOptions": [],
    "organizationOptions": [
      {
        "_id": "org_id",
        "name": "Red Cross Camarines Sur",
        "type": "NGO",
        "code": "RC-CAMSUR"
      }
    ],
    "isSystemAdmin": false
  }
}
```

**Permission Flags:**
- `canChooseMunicipality`: `true` if System Admin, `false` otherwise (municipality pre-filtered by district)
- `canChooseOrganization`: `true` if System Admin OR has multiple organizations, `false` if single org (auto-selected)
- `isSystemAdmin`: `true` if user has authority 100

### 2. Get Barangays for Municipality

**Endpoint:** `GET /api/stakeholders/barangays/:municipalityId`  
**Controller:** `stakeholder.controller.js → getBarangays()`

**Purpose:** Dynamically load barangays after municipality is selected.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "barangay_id",
      "name": "Barangay 1",
      "code": "BRGY01",
      "type": "barangay",
      "parent": "municipality_id",
      "province": "province_id",
      "level": 4
    }
  ]
}
```

---

## Frontend Flow

### Hook: `useStakeholderManagement()`

**Location:** `UNITE/hooks/useStakeholderManagement.ts`

**Initialization:**
```typescript
const {
  roleOptions,              // Roles creator can assign (authority-filtered)
  canChooseMunicipality,    // Can select any municipality (system admin only)
  canChooseOrganization,    // Can select organization (system admin or multi-org)
  municipalityOptions,      // Municipalities in creator's district(s)
  barangayOptions,          // Barangays in selected municipality
  organizationOptions,      // Organizations creator can assign
  isSystemAdmin,            // Is creator a system admin
  loading,
  error,
  fetchBarangays,           // Fetch barangays for municipality
} = useStakeholderManagement();
```

**Auto-Selection Logic:**
```typescript
// If coordinator has only one organization, auto-select it
useEffect(() => {
  if (!canChooseOrganization && organizationOptions.length > 0) {
    setSelectedOrganization(organizationOptions[0]._id);
  }
}, [canChooseOrganization, organizationOptions]);
```

### Modal: `add-stakeholder-modal.tsx`

**Location:** `UNITE/components/stakeholder-management/add-stakeholder-modal.tsx`

**Form Submission:**
```typescript
const data = {
  firstName,
  middleName,
  lastName,
  email,
  phoneNumber,
  password,
  roles: [selectedRole],         // Dynamic role ID (not hard-coded)
  municipalityId: selectedMunicipality,  // Required
  barangayId: selectedBarangay,   // Optional
  organizationId: selectedOrganization,  // Required
  pageContext: 'stakeholder-management'  // Important: tells backend this is stakeholder creation
};

await createStakeholder(data);
```

**Role Selection:**
- If multiple role options available, user selects from dropdown
- If only one role option, it's auto-selected (hidden field)
- Role ID is sent to backend (not role code string)
- Backend validates role authority < creator's authority

---

## Diagnostic Logging

### Backend Logs

**Creation Context (`stakeholder.controller.js`):**
```javascript
console.log('[AddStakeholder] Creation Context:', {
  user: 'coordinator',
  authority: 65,
  isSystemAdmin: false,
  organizationsFound: 3,
  organizationNames: 'Red Cross Camarines Sur, Naga City LGU, ...',
  allowedRoles: 'stakeholder_basic, stakeholder_org',
  rolesCount: 2,
  municipalitiesCount: 12,
  canChooseMunicipality: false,
  canChooseOrganization: true,
  userId: '...',
  userEmail: 'coordinator@example.com'
});
```

**Organization Fetching (`jurisdiction.service.js`):**
```javascript
console.log('[DIAG] getAllowedOrganizationsForStakeholderCreation:', {
  creatorId: '...',
  creatorAuthority: 65,
  isSystemAdmin: false,
  organizationAssignmentsFound: 3,
  activeOrganizationsReturned: 3
});
```

**Municipality Fetching (`jurisdiction.service.js`):**
```javascript
console.log('[DIAG] getMunicipalitiesForStakeholderCreation:', {
  creatorId: '...',
  creatorAuthority: 65,
  userLocationsFound: 1,
  districtsExtracted: 1,
  municipalitiesReturned: 12
});
```

### Frontend Logs

**Hook Initialization (`useStakeholderManagement.ts`):**
```javascript
console.log('[DIAG] Stakeholder Creation Context:', {
  allowedRole: 'stakeholder',
  roleOptionsCount: 2,
  roleOptions: 'stakeholder_basic (30), stakeholder_org (35)',
  canChooseMunicipality: false,
  canChooseOrganization: true,
  municipalityOptionsCount: 12,
  barangayOptionsCount: 0,
  organizationOptionsCount: 3,
  isSystemAdmin: false
});
```

---

## Common Issues & Fixes

### Issue 1: "No organization or location detected"

**Root Cause:** Coordinator has no `UserOrganization` or `UserLocation` assignments.

**Fix:**
1. Verify coordinator has at least one organization assignment:
   ```javascript
   db.userorganizations.find({ userId: ObjectId("coordinator_id"), isActive: true })
   ```
2. Verify coordinator has district/province assignment:
   ```javascript
   db.userlocations.find({ userId: ObjectId("coordinator_id"), isActive: true })
   ```

### Issue 2: Organization/Location dropdowns locked

**Root Cause (FIXED Dec 23, 2025):** Variables `creatorAuthority` and `isSystemAdmin` were used but never declared in `stakeholder.controller.js`.

**Fix Applied:**
```javascript
// Added before line 33 in stakeholder.controller.js
const creatorAuthority = await authorityService.calculateUserAuthority(userId);
const isSystemAdmin = user.isSystemAdmin || creatorAuthority === AUTHORITY_TIERS.SYSTEM_ADMIN;
```

### Issue 3: Role dropdown shows coordinator roles

**Root Cause:** Missing authority-based filtering.

**Fix Applied:** Added `getCreatableRolesForStakeholders()` method that filters roles by:
- `role.authority < creatorAuthority`
- `role.authority < AUTHORITY_TIERS.COORDINATOR` (60)

---

## Validation Rules

### Backend Validation

**Controller:** `users_controller/user.controller.js → createUser()`

1. **Role Validation:**
   ```javascript
   // Validate that roles are provided (for stakeholder-management page)
   if (pageContext === 'stakeholder-management' && (!roles || roles.length === 0)) {
     return res.status(400).json({
       success: false,
       message: 'At least one role is required for stakeholder creation',
       code: 'MISSING_ROLE'
     });
   }
   
   // Validate each role (supports both role IDs and role codes)
   for (const roleIdentifier of roles) {
     let role;
     if (mongoose.Types.ObjectId.isValid(roleIdentifier)) {
       role = await Role.findById(roleIdentifier);
     } else {
       role = await Role.findOne({ code: roleIdentifier });
     }
     
     if (!role) {
       return res.status(400).json({
         success: false,
         message: `Invalid role: ${roleIdentifier}`,
         code: 'INVALID_ROLE'
       });
     }
     
     const roleAuthority = role.authority || await authorityService.calculateRoleAuthority(role._id);
     
     // Ensure role is stakeholder-level (authority < 60)
     if (roleAuthority >= AUTHORITY_TIERS.COORDINATOR) {
       return res.status(403).json({
         success: false,
         message: `Cannot assign coordinator-level or higher role to stakeholder`,
         code: 'INVALID_ROLE_AUTHORITY'
       });
     }
     
     // Ensure creator has higher authority than role
     if (requesterAuthority <= roleAuthority) {
       return res.status(403).json({
         success: false,
         message: `Cannot create staff with role '${role.code}': Your authority level is insufficient`,
         code: 'INSUFFICIENT_AUTHORITY'
       });
     }
   }
   ```

2. **Organization Check:**
   ```javascript
   if (organizationId) {
     const allowedOrganizations = await jurisdictionService.getAllowedOrganizationsForStakeholderCreation(requesterId);
     const allowedOrgIds = allowedOrganizations.map(o => o._id.toString());
     
     if (!allowedOrgIds.includes(organizationId.toString())) {
       return res.status(403).json({
         success: false,
         message: 'Cannot assign organization outside your jurisdiction',
         code: 'ORGANIZATION_OUTSIDE_JURISDICTION'
       });
     }
   }
   ```

3. **Municipality Check:**
   ```javascript
   if (!municipalityId) {
     return res.status(400).json({
       success: false,
       message: 'Municipality is required for stakeholder creation',
       code: 'MUNICIPALITY_REQUIRED'
     });
   }
   
   const allowedMunicipalities = await jurisdictionService.getMunicipalitiesForStakeholderCreation(requesterId);
   const allowedIds = allowedMunicipalities.map(m => m._id.toString());
   
   if (!allowedIds.includes(municipalityId.toString())) {
     return res.status(403).json({
       success: false,
       message: 'Cannot create stakeholder in municipality outside your jurisdiction',
       code: 'MUNICIPALITY_OUTSIDE_JURISDICTION'
     });
   }
   ```

4. **Barangay Check (if provided):**
   ```javascript
   if (barangayId) {
     const { Location } = require('../../models');
     const barangay = await Location.findById(barangayId);
     
     if (!barangay || barangay.type !== 'barangay') {
       return res.status(400).json({
         success: false,
         message: 'Invalid barangay specified',
         code: 'INVALID_BARANGAY'
       });
     }
     
     // Ensure barangay belongs to selected municipality
     if (barangay.parent?.toString() !== municipalityId.toString()) {
       return res.status(400).json({
         success: false,
         message: 'Barangay does not belong to the selected municipality',
         code: 'BARANGAY_MISMATCH'
       });
     }
   }
   ```

### Frontend Validation

**Modal:** `add-stakeholder-modal.tsx`

1. **Role Required:**
   ```typescript
   if (!selectedRole) {
     alert('Please select a role.');
     return;
   }
   ```

2. **Password Match:**
   ```typescript
   if (password !== retypePassword) {
     alert('Passwords do not match!');
     return;
   }
   ```

3. **Municipality Required:**
   ```typescript
   if (!selectedMunicipality) {
     alert('Please select a municipality.');
     return;
   }
   ```

4. **Organization Jurisdiction:**
   ```typescript
   if (selectedOrganization && !canSelectOrganization(selectedOrganization)) {
     alert('Selected organization is outside your jurisdiction.');
     return;
   }
   ```

---

## Schema Relationships

### User Model (Stakeholder)
```javascript
{
  _id: ObjectId,
  email: String (required, unique),
  firstName: String,
  lastName: String,
  phoneNumber: String,
  organizationId: ObjectId ref('Organization'),  // Single organization
  isSystemAdmin: Boolean (default: false),
  isActive: Boolean
}
```

### UserOrganization (Coordinator Organizations)
```javascript
{
  _id: ObjectId,
  userId: ObjectId ref('User'),          // Coordinator ID
  organizationId: ObjectId ref('Organization'),
  roleInOrg: String (default: 'member'),
  isPrimary: Boolean,
  isActive: Boolean,
  expiresAt: Date (optional)
}
```

### UserLocation (Coordinator Locations)
```javascript
{
  _id: ObjectId,
  userId: ObjectId ref('User'),          // Coordinator ID
  locationId: ObjectId ref('Location'),  // District/Province ID
  isActive: Boolean,
  expiresAt: Date (optional)
}
```

### Location Model
```javascript
{
  _id: ObjectId,
  name: String,
  code: String,
  type: Enum['province', 'district', 'city', 'municipality', 'barangay'],
  parent: ObjectId ref('Location'),  // Hierarchical parent
  province: ObjectId ref('Location'),
  level: Number,
  isActive: Boolean
}
```

---

## Testing Scenarios

### Scenario 1: System Admin Creates Stakeholder
- ✅ Should see all organizations
- ✅ Should see all municipalities
- ✅ Should see all stakeholder roles
- ✅ `canChooseMunicipality` = `true`
- ✅ `canChooseOrganization` = `true`

### Scenario 2: Coordinator with Single Organization
- ✅ Should see only their organization (auto-selected)
- ✅ Should see municipalities in their district
- ✅ Should see stakeholder roles only
- ✅ `canChooseMunicipality` = `false`
- ✅ `canChooseOrganization` = `false`

### Scenario 3: Coordinator with Multiple Organizations
- ✅ Should see dropdown with their organizations
- ✅ Should see municipalities in their district
- ✅ Should see stakeholder roles only
- ✅ `canChooseMunicipality` = `false`
- ✅ `canChooseOrganization` = `true`

### Scenario 4: Coordinator with Province Assignment
- ✅ Should see all municipalities in all districts under province
- ✅ Should be able to create stakeholders in any municipality in province

---

## Coverage Area Tree Structure

### Display Format

**In Table:**
- Format: `"Municipality Name → Barangay Name"` (if barangay exists)
- Format: `"Municipality Name"` (if no barangay)

**Example:**
- `"Naga City → Barangay 1"`
- `"Naga City"` (no barangay)

### Data Structure

**User Model (Embedded):**
```javascript
User {
  locations: {
    municipalityId: ObjectId,      // Required
    municipalityName: String,        // Denormalized
    barangayId: ObjectId,            // Optional
    barangayName: String             // Denormalized, optional
  }
}
```

**Location Model (Hierarchical):**
```javascript
Location {
  _id: ObjectId,
  name: String,
  type: 'municipality' | 'barangay',
  parent: ObjectId,  // For barangay, parent is municipality
  level: Number
}
```

## Files Modified (January 2025)

1. **Backend Controller:**
   - `src/controller/users_controller/user.controller.js`
   - Removed hard-coded role assignment for stakeholders
   - Added dynamic role validation (supports both role IDs and codes)
   - Enhanced stakeholder listing to include coverage area and organization data
   - Updated `listUsersByCapability` to properly filter by authority and jurisdiction

2. **Backend Controller:**
   - `src/controller/stakeholder_controller/stakeholder.controller.js`
   - Already returns dynamic `roleOptions` from `getCreatableRolesForStakeholders()`
   - Returns municipalities from creator's coverage areas

3. **Frontend Components:**
   - `UNITE/components/stakeholder-management/add-stakeholder-modal.tsx`
   - Added dynamic role selection dropdown
   - Removed hard-coded `roles: ['stakeholder']`
   - Uses `roleOptions` from `useStakeholderManagement` hook
   - Municipality/Barangay tree structure selection

4. **Frontend Components:**
   - `UNITE/components/stakeholder-management/stakeholder-edit-modal.tsx`
   - Added dynamic role selection (if multiple options)
   - Added municipality/barangay selection (if user has permission)
   - Removed hard-coded role display

5. **Frontend Components:**
   - `UNITE/components/stakeholder-management/stakeholder-management-table.tsx`
   - Updated to display coverage area in "Municipality → Barangay" format
   - Removed hard-coded role-based filtering (backend handles this)
   - Updated organization display to use embedded data

6. **Frontend Page:**
   - `UNITE/app/dashboard/stakeholder-management/page.tsx`
   - Updated `fetchStakeholders` to format coverage area properly
   - Updated organization display to use embedded `User.organizations[]` array
   - Removed client-side hard-coded filtering

7. **Frontend Service:**
   - `UNITE/services/stakeholderService.ts`
   - Updated `createStakeholder` to accept role IDs (not hard-coded strings)
   - Added support for `municipalityId` and `barangayId` parameters

8. **Frontend Hook:**
   - `UNITE/hooks/useStakeholderManagement.ts`
   - Already exposes `roleOptions` from backend
   - Provides `fetchBarangays` for dynamic barangay loading

---

## References

- **Backend Documentation:** `backend-docs/BACKEND_DOCUMENTATION.md`
- **Authority Service:** `src/services/users_services/authority.service.js`
- **Jurisdiction Service:** `src/services/users_services/jurisdiction.service.js`
- **Location Service:** `src/services/utility_services/location.service.js`
- **Frontend API Docs:** `frontend-instruction/API_USERS.md`
