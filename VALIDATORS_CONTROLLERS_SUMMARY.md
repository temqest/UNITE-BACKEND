# Validators and Controllers Update Summary

## Overview
Created and updated validators and controllers to support the new RBAC system, flexible location system, and role-agnostic request workflows.

## New Validators Created

### 1. RBAC Validators (`src/validators/rbac_validators/`)

#### `role.validators.js`
- **createRoleSchema**: Validates role creation (code, name, description, isSystemRole, permissions)
- **updateRoleSchema**: Validates role updates
- **assignRoleSchema**: Validates role assignment to users (roleId, locationScope, expiresAt)
- **validateCreateRole**: Middleware for role creation
- **validateUpdateRole**: Middleware for role updates
- **validateAssignRole**: Middleware for role assignment

#### `permission.validators.js`
- **createPermissionSchema**: Validates permission creation (code, name, resource, action, description)
- **updatePermissionSchema**: Validates permission updates
- **checkPermissionSchema**: Validates permission check requests (resource, action, locationId)
- **validateCreatePermission**: Middleware for permission creation
- **validateUpdatePermission**: Middleware for permission updates
- **validateCheckPermission**: Middleware for permission checks

#### `index.js`
- Exports all RBAC validators

### 2. User Validators (`src/validators/users_validators/`)

#### `user.validators.js` (NEW)
- **createUserSchema**: Validates unified user creation
  - Personal info: email, firstName, middleName, lastName, phoneNumber
  - Authentication: password
  - Organization: organizationType, organizationInstitution, field
  - RBAC: roles (array), locations (array with scope)
  - System: isSystemAdmin
- **updateUserSchema**: Validates user updates
- **validateCreateUser**: Middleware for user creation
- **validateUpdateUser**: Middleware for user updates

### 3. Location Validators (`src/validators/utility_validators/`)

#### `location.validators.js` (NEW)
- **createLocationSchema**: Validates location creation
  - Required: name, type
  - Optional: parentId, code, administrativeCode, metadata (isCity, isCombined, operationalGroup, custom)
- **updateLocationSchema**: Validates location updates
- **assignUserLocationSchema**: Validates user-location assignment (locationId, scope, isPrimary, expiresAt)
- **validateCreateLocation**: Middleware for location creation
- **validateUpdateLocation**: Middleware for location updates
- **validateAssignUserLocation**: Middleware for location assignment

### 4. Request Validators (`src/validators/request_validators/`)

#### `requestAction.validators.js` (NEW)
- **executeActionSchema**: Validates request action execution
  - Required: action (accept, reject, reschedule, cancel, delete, confirm, decline, edit, view)
  - Optional: data (notes, proposedDate, proposedStartTime, proposedEndTime, reason)
  - Special validation: reschedule action requires proposedDate
- **validateExecuteAction**: Middleware for action execution

#### `eventRequest.validators.js` (UPDATED)
- Updated to support both legacy and new role-agnostic fields:
  - Legacy: coordinator_id, stakeholder_id, made_by_id, made_by_role
  - New: requester (object with userId, id, roleSnapshot, name)
  - New: location (object with province, district, municipality, custom)
  - Legacy location fields still supported for backward compatibility

## New Controllers Created

### 1. RBAC Controllers (`src/controller/rbac_controller/`)

#### `role.controller.js`
- **getAllRoles**: Get all roles
- **getRoleById**: Get role by ID
- **createRole**: Create new role
- **updateRole**: Update existing role
- **deleteRole**: Delete role (prevents deletion of system roles)

#### `permission.controller.js`
- **getAllPermissions**: Get all permissions
- **getPermissionById**: Get permission by ID
- **createPermission**: Create new permission
- **updatePermission**: Update existing permission
- **deletePermission**: Delete permission
- **checkPermission**: Check if user has permission

#### `userRole.controller.js`
- **getUserRoles**: Get all roles assigned to a user
- **assignRole**: Assign role to user with optional location scope
- **revokeRole**: Revoke role from user
- **getUserPermissions**: Get all permissions for a user

#### `index.js`
- Exports all RBAC controllers

### 2. User Controllers (`src/controller/users_controller/`)

#### `user.controller.js` (NEW)
- **createUser**: Create new user with roles and locations
- **getUserById**: Get user by ID (supports both ObjectId and legacy userId)
- **updateUser**: Update user information
- **deleteUser**: Soft delete user (sets isActive = false)
- **listUsers**: List users with filtering (role, organizationType, isActive, locationId, pagination)

### 3. Updated Controllers

#### `src/controller/request_controller/eventRequest.controller.js` (UPDATED)
- **executeRequestAction**: New method for unified request actions
- **getAvailableActions**: New method to get available actions for a user

#### `src/controller/utility_controller/location.controller.js` (UPDATED)
- Updated legacy methods to try new flexible location system first, fallback to old models
- **getProvinces**: Uses new `locationService.getProvinces()`
- **getDistrictsByProvince**: Uses new `locationService.getDistrictsByProvince()`
- **getMunicipalitiesByDistrict**: Uses new `locationService.getMunicipalitiesByDistrict()`
- **getAllMunicipalities**: Uses new `locationService.getLocationsByType()`

## Updated Route Files

### Routes Updated to Use New Validators

1. **`src/routes/rbac.routes.js`**
   - Added `validateCreateRole` to POST /api/roles
   - Added `validateUpdateRole` to PUT /api/roles/:roleId
   - Added `validateAssignRole` to POST /api/users/:userId/roles
   - Added `validateCheckPermission` to POST /api/permissions/check
   - Updated to use controllers instead of direct service calls

2. **`src/routes/locations.routes.js`**
   - Added `validateCreateLocation` to POST /api/locations
   - Added `validateUpdateLocation` to PUT /api/locations/:locationId
   - Added `validateAssignUserLocation` to POST /api/users/:userId/locations

3. **`src/routes/requests.routes.js`**
   - Added `validateExecuteAction` to POST /api/requests/:requestId/actions
   - Updated to use `eventRequestController.executeRequestAction()`
   - Updated to use `eventRequestController.getAvailableActions()`

## Validation Patterns

### Role Validation
- Code: lowercase, alphanumeric + hyphens, 2-50 chars
- Name: 2-100 chars
- Permissions: Array of { resource, actions[] }, at least 1 required

### Permission Validation
- Code: lowercase, alphanumeric + dots/hyphens (e.g., "request.review"), 3-100 chars
- Resource: 2-50 chars
- Action: 2-50 chars

### User Validation
- Email: Valid email, required
- Password: 6-128 chars, required
- Names: 1-100 chars
- Organization types: LGU, NGO, Hospital, RedCross, Non-LGU, Other
- Roles: Array of role codes
- Locations: Array of { locationId, scope }

### Location Validation
- Name: 2-200 chars, required
- Type: province, district, city, municipality, barangay, custom
- Code: Optional, lowercase, alphanumeric + hyphens
- Metadata: { isCity, isCombined, operationalGroup, custom }

### Request Action Validation
- Action: accept, reject, reschedule, cancel, delete, confirm, decline, edit, view
- Data: Object with notes, proposedDate, proposedStartTime, proposedEndTime, reason
- Special: reschedule requires proposedDate

## Integration Points

### Controllers → Services
- **RoleController** → `permissionService.createRole()`, `permissionService.getAllRoles()`
- **PermissionController** → Direct `Permission` model operations
- **UserRoleController** → `permissionService.assignRole()`, `permissionService.revokeRole()`, `permissionService.getUserRoles()`, `permissionService.getUserPermissions()`
- **UserController** → `User` model, `permissionService`, `locationService`
- **EventRequestController** → `requestActionService.executeAction()`, `requestActionService.getAvailableActions()`

### Routes → Controllers → Validators
- Routes use validators as middleware before controllers
- Controllers use `req.validatedData` from validators
- Controllers handle business logic and call services

## Backward Compatibility

- Legacy validators still exist and work
- New validators support both new and legacy field formats
- Controllers check for both ObjectId and legacy string IDs
- Location controller tries new system first, falls back to legacy models

## Files Created

**Validators:**
- `src/validators/rbac_validators/role.validators.js`
- `src/validators/rbac_validators/permission.validators.js`
- `src/validators/rbac_validators/index.js`
- `src/validators/users_validators/user.validators.js`
- `src/validators/utility_validators/location.validators.js`
- `src/validators/request_validators/requestAction.validators.js`

**Controllers:**
- `src/controller/rbac_controller/role.controller.js`
- `src/controller/rbac_controller/permission.controller.js`
- `src/controller/rbac_controller/userRole.controller.js`
- `src/controller/rbac_controller/index.js`
- `src/controller/users_controller/user.controller.js`

**Updated:**
- `src/validators/request_validators/eventRequest.validators.js`
- `src/controller/request_controller/eventRequest.controller.js`
- `src/controller/utility_controller/location.controller.js`
- `src/controller/users_controller/index.js`
- `src/routes/rbac.routes.js`
- `src/routes/locations.routes.js`
- `src/routes/requests.routes.js`

## Usage Examples

### Create User with Roles and Locations
```javascript
POST /api/users
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "securePassword",
  "roles": ["coordinator"],
  "locations": [
    {
      "locationId": "location_id_here",
      "scope": "descendants",
      "isPrimary": true
    }
  ]
}
```

### Execute Request Action
```javascript
POST /api/requests/:requestId/actions
{
  "action": "accept",
  "data": {
    "notes": "Approved for scheduling"
  }
}
```

### Assign Role to User
```javascript
POST /api/users/:userId/roles
{
  "roleId": "role_id_here",
  "locationScope": ["location_id_1", "location_id_2"],
  "expiresAt": "2025-12-31T00:00:00Z"
}
```

## Next Steps

1. Test all validators with various input scenarios
2. Test controllers with valid and invalid data
3. Update frontend to use new validation error formats
4. Add integration tests for new endpoints
5. Document API contracts with validation requirements
