# API Routes Update Summary

## Overview
All API routes have been updated to use the new `requirePermission` middleware instead of hard-coded role checks. This enables flexible, permission-based access control that works with any role combination.

## Updated Route Files

### 1. `src/routes/users.routes.js`
**Changes:**
- Added `requirePermission` and `requireAnyPermission` imports
- Replaced `requireAdmin` with `requirePermission('user', 'create'|'read'|'update'|'delete')`
- Replaced `requireCoordinator` with `requirePermission('user', 'read')` or `requirePermission('event', 'read')`
- Replaced `requireAdminOrCoordinator` with `requireAnyPermission([...])` for registration code management
- Updated all admin, coordinator, and stakeholder routes to use permission-based checks

**Key Updates:**
- User management: `user.create`, `user.read`, `user.update`, `user.delete`
- Password reset: `user.update`
- Admin operations: `user.create`, `user.read`, `user.update`, `user.delete`
- Coordinator operations: `user.read`, `event.read`
- Registration codes: `user.manage-roles` or `user.create`

### 2. `src/routes/requests.routes.js`
**Changes:**
- Added `requirePermission` and `requireAnyPermission` imports
- Replaced role-based checks with permission-based checks
- Added new unified action endpoint: `POST /api/requests/:requestId/actions`
- Added available actions endpoint: `GET /api/requests/:requestId/actions`

**Key Updates:**
- Request creation: `request.create`
- Request reading: `request.read`
- Request updates: `request.update`
- Request actions: `request.approve`, `request.reject`, `request.reschedule`, `request.cancel`, `request.delete`, `request.confirm`
- System settings: `system.settings`
- Blood bag requests: `request.create`, `request.read`, `request.update`, `request.delete`

**New Endpoints:**
- `POST /api/requests/:requestId/actions` - Unified action endpoint (accept, reject, reschedule, cancel, delete, confirm, decline)
- `GET /api/requests/:requestId/actions` - Get available actions for user

### 3. `src/routes/utility.routes.js`
**Changes:**
- Added `requirePermission` imports
- Updated district routes to use `location.create`, `location.read`, `location.update`, `location.delete`
- Updated signup request routes to use `user.create` and `user.read`

**Key Updates:**
- District management: `location.create`, `location.read`, `location.update`, `location.delete`
- Signup requests: `user.create`, `user.read`

### 4. `src/routes/events.routes.js`
**Changes:**
- Added `requirePermission` imports
- Updated calendar and event routes to use `event.read` permission

**Key Updates:**
- Calendar views: `event.read`
- Event details: `event.read`
- Event statistics: `event.read`

### 5. `src/routes/inventory.routes.js`
**Changes:**
- Added `requirePermission` imports
- Updated blood bag routes to use `request.read`, `request.update`, `request.delete`

**Key Updates:**
- Blood bag operations: `request.read`, `request.update`, `request.delete`

### 6. `src/routes/locations.routes.js` (NEW)
**New file created** with routes for the flexible location system:
- `POST /api/locations` - Create location (`location.create`)
- `GET /api/locations/tree` - Get location tree (`location.read`)
- `GET /api/locations/:locationId` - Get location by ID (`location.read`)
- `GET /api/locations/:locationId/ancestors` - Get ancestors (`location.read`)
- `GET /api/locations/:locationId/descendants` - Get descendants (`location.read`)
- `GET /api/locations/provinces` - Get provinces (`location.read`)
- `GET /api/locations/provinces/:provinceId/districts` - Get districts (`location.read`)
- `GET /api/locations/districts/:districtId/municipalities` - Get municipalities (`location.read`)
- `GET /api/locations/type/:type` - Get locations by type (`location.read`)
- `PUT /api/locations/:locationId` - Update location (`location.update`)
- `DELETE /api/locations/:locationId` - Delete location (`location.delete`)
- `POST /api/users/:userId/locations` - Assign user to location (`user.manage-roles`)
- `GET /api/users/:userId/locations` - Get user locations (`user.read`)
- `GET /api/users/:userId/locations/primary` - Get primary location (`user.read`)
- `DELETE /api/users/:userId/locations/:locationId` - Revoke location assignment (`user.manage-roles`)
- `GET /api/users/:userId/locations/:locationId/access` - Check location access (`user.read`)

### 7. `src/routes/rbac.routes.js` (NEW)
**New file created** with routes for RBAC management:
- `GET /api/roles` - Get all roles (`role.read`)
- `GET /api/roles/:roleId` - Get role by ID (`role.read`)
- `POST /api/roles` - Create role (`role.create`)
- `PUT /api/roles/:roleId` - Update role (`role.update`)
- `DELETE /api/roles/:roleId` - Delete role (`role.delete`)
- `GET /api/permissions` - Get all permissions (`role.read`)
- `GET /api/users/:userId/roles` - Get user roles (`user.read`)
- `POST /api/users/:userId/roles` - Assign role to user (`user.manage-roles`)
- `DELETE /api/users/:userId/roles/:roleId` - Revoke role (`user.manage-roles`)
- `GET /api/users/:userId/permissions` - Get user permissions (`user.read`)
- `POST /api/permissions/check` - Check permission (authenticated users)

### 8. `src/routes/index.js`
**Changes:**
- Added `locationsRoutes` import and mounting
- Added `rbacRoutes` import and mounting

## Permission Mapping

### Legacy Role → Permission Mapping

| Legacy Role Check | New Permission Check |
|------------------|---------------------|
| `requireAdmin` | `requirePermission('user', 'create'|'read'|'update'|'delete')` or `requirePermission('system', 'settings')` |
| `requireCoordinator` | `requirePermission('request', 'review')` or `requirePermission('event', 'read')` |
| `requireAdminOrCoordinator` | `requireAnyPermission([...])` with appropriate permissions |
| `requireStakeholder` | `requirePermission('request', 'create')` or `requirePermission('request', 'confirm')` |

### Common Permission Patterns

**User Management:**
- Create user: `user.create`
- Read user: `user.read`
- Update user: `user.update`
- Delete user: `user.delete`
- Manage roles: `user.manage-roles`

**Request Management:**
- Create request: `request.create`
- Read request: `request.read`
- Update request: `request.update`
- Delete request: `request.delete`
- Review request: `request.review`
- Approve request: `request.approve`
- Reject request: `request.reject`
- Reschedule request: `request.reschedule`
- Cancel request: `request.cancel`
- Confirm request: `request.confirm`
- Decline request: `request.decline`

**Event Management:**
- Create event: `event.create`
- Read event: `event.read`
- Update event: `event.update`
- Delete event: `event.delete`
- Approve event: `event.approve`

**Location Management:**
- Create location: `location.create`
- Read location: `location.read`
- Update location: `location.update`
- Delete location: `location.delete`

**System Management:**
- System settings: `system.settings`
- System audit: `system.audit`

## Backward Compatibility

- Legacy `requireRoles` middleware is still imported but deprecated
- Old role-based routes continue to work during migration period
- New routes use permission-based checks
- Both systems can coexist during transition

## Migration Notes

1. **Gradual Migration**: Old routes still work, new routes are available
2. **Permission Seeding**: Run `node src/utils/seedRoles.js` to create default roles and permissions
3. **User Migration**: Run `node src/utils/migrateUsers.js` to migrate users and assign initial roles
4. **Testing**: Test both old and new routes during migration period

## Next Steps

1. Update frontend to use new permission-based endpoints
2. Gradually migrate from old role-based checks to new permission-based checks
3. Remove legacy `requireRoles` middleware after full migration
4. Update API documentation with new permission requirements
