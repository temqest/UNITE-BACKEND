# Stakeholder Creation Flow — Authority-Based Logic

## Overview

This document describes how stakeholders are created in the UNITE system, including the authority-based permission checks, organization/location assignment rules, and role filtering logic.

**Last Updated:** December 23, 2025 (Fixed undefined variable bug)

---

## Authority Hierarchy

| Role | Authority | Can Create | Notes |
|------|-----------|------------|-------|
| **System Admin** | 100 | All stakeholder roles | Full access to all organizations and locations |
| **Operational Admin** | 80 | All stakeholder roles | Limited to assigned organizations/locations |
| **Coordinator** | 60-79 | All stakeholder roles | Limited to assigned organizations and district municipalities |
| **Stakeholder** | <60 | Cannot create users | End users who cannot create staff |

---

## Stakeholder Creation Rules

### 1. Role Assignment

**Authority-Based Filtering:**
- Only roles with `authority < creatorAuthority AND authority < 60 (COORDINATOR)` can be assigned
- Coordinators cannot create coordinator-level or higher roles
- System admins can create any stakeholder-level role

**Implementation:**
```javascript
// src/services/users_services/jurisdiction.service.js
async getCreatableRolesForStakeholders(creatorId) {
  const creatorAuthority = await authorityService.calculateUserAuthority(creatorId);
  
  const roles = await Role.find({
    isActive: true,
    authority: { 
      $lt: creatorAuthority, 
      $lt: AUTHORITY_TIERS.COORDINATOR // Must be below coordinator level
    }
  }).sort({ authority: -1, name: 1 });
  
  return roles;
}
```

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

### 3. Location Assignment

**Location Hierarchy:**
```
Province
  └── District
       └── Municipality
            └── Barangay (optional)
```

**Stakeholder Location Rules:**
- **Required:** Municipality
- **Optional:** Barangay
- **Inherited from Coordinator:** Province and District

**System Admin:**
- Can select any municipality

**Coordinator:**
- Can select municipalities only from their assigned districts
- Districts come from `UserLocation` assignments

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
  roles: ['stakeholder'],         // Always stakeholder
  municipalityId: selectedMunicipality,  // Required
  barangayId: selectedBarangay,   // Optional
  organizationId: selectedOrganization,  // Required
  pageContext: 'stakeholder-management'  // Important: tells backend this is stakeholder creation
};

await createStakeholder(data);
```

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

1. **Authority Check:**
   ```javascript
   const requesterAuthority = await authorityService.calculateUserAuthority(requesterId);
   const targetAuthority = await authorityService.calculateRoleAuthority(roles);
   
   if (targetAuthority >= requesterAuthority) {
     throw new Error('Cannot create users with equal or higher authority');
   }
   ```

2. **Organization Check:**
   ```javascript
   if (organizationId) {
     const canAssignOrg = await jurisdictionService.canAssignOrganization(requesterId, organizationId);
     if (!canAssignOrg) {
       throw new Error('Organization is outside your jurisdiction');
     }
   }
   ```

3. **Location Check:**
   ```javascript
   if (municipalityId) {
     const allowedMunicipalities = await jurisdictionService.getMunicipalitiesForStakeholderCreation(requesterId);
     const municipalityIds = allowedMunicipalities.map(m => m._id.toString());
     
     if (!municipalityIds.includes(municipalityId)) {
       throw new Error('Municipality is outside your jurisdiction');
     }
   }
   ```

### Frontend Validation

**Modal:** `add-stakeholder-modal.tsx`

1. **Password Match:**
   ```typescript
   if (password !== retypePassword) {
     alert('Passwords do not match!');
     return;
   }
   ```

2. **Municipality Required:**
   ```typescript
   if (!selectedMunicipality) {
     alert('Please select a municipality.');
     return;
   }
   ```

3. **Organization Jurisdiction:**
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

## Files Modified (Dec 23, 2025)

1. **Backend Controller:**
   - `src/controller/stakeholder_controller/stakeholder.controller.js`
   - Fixed undefined `creatorAuthority` and `isSystemAdmin` variables
   - Added `roleOptions` to API response

2. **Backend Service:**
   - `src/services/users_services/jurisdiction.service.js`
   - Added `getCreatableRolesForStakeholders()` method

3. **Frontend Hook:**
   - `UNITE/hooks/useStakeholderManagement.ts`
   - Added `roleOptions` state and Role interface
   - Updated `canAssignRole()` logic

---

## References

- **Backend Documentation:** `backend-docs/BACKEND_DOCUMENTATION.md`
- **Authority Service:** `src/services/users_services/authority.service.js`
- **Jurisdiction Service:** `src/services/users_services/jurisdiction.service.js`
- **Location Service:** `src/services/utility_services/location.service.js`
- **Frontend API Docs:** `frontend-instruction/API_USERS.md`
