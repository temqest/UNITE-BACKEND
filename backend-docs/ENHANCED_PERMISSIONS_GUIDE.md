# Enhanced Permissions System Guide

## Overview

The permission system has been enhanced to support:
- **Page-level permissions** - Control which pages users can access
- **Feature-level permissions** - Control which features users can use (e.g., create events, request blood)
- **Staff management permissions** - Control staff creation/editing with type restrictions

## Permission Types

### 1. Resource Permissions (Default)
Standard CRUD permissions for resources (events, requests, users, etc.)
- Format: `resource.action` (e.g., `event.create`, `request.review`)
- Example: `{ resource: 'event', action: 'create', type: 'resource' }`

### 2. Page Permissions
Control access to specific pages/routes
- Format: `page.route` (e.g., `page.dashboard`, `page.events`)
- Example: `{ resource: 'page', action: 'dashboard', type: 'page' }`

### 3. Feature Permissions
Control access to specific features/functionality
- Format: `feature.feature-code` (e.g., `feature.create-event`, `feature.request-blood`)
- Example: `{ resource: 'feature', action: 'create-event', type: 'feature' }`

### 4. Staff Management Permissions
Control staff management with type restrictions
- Format: `staff.action` (e.g., `staff.create`, `staff.update`)
- Metadata: `{ allowedStaffTypes: ['coordinator', 'stakeholder'] }`
- Example: `{ resource: 'staff', action: 'create', type: 'staff', metadata: { allowedStaffTypes: ['stakeholder'] } }`

## Usage Examples

### 1. Page Access Control

**Middleware:**
```javascript
const { requirePageAccess } = require('../middleware/requirePageAccess');

router.get('/dashboard', authenticate, requirePageAccess('dashboard'), (req, res) => {
  // Dashboard page handler
});
```

**Service Method:**
```javascript
const canAccess = await permissionService.canAccessPage(userId, 'dashboard');
```

**Get All Accessible Pages:**
```javascript
const pages = await permissionService.getAccessiblePages(userId);
// Returns: ['dashboard', 'events', 'requests', 'chat']
```

### 2. Feature Access Control

**Middleware:**
```javascript
const { requireFeature } = require('../middleware/requireFeature');

router.post('/events', authenticate, requireFeature('create-event'), (req, res) => {
  // Create event handler
});
```

**Service Method:**
```javascript
const canUse = await permissionService.canUseFeature(userId, 'create-event');
```

**Get All Available Features:**
```javascript
const features = await permissionService.getAvailableFeatures(userId);
// Returns: ['create-event', 'request-blood', 'view-reports']
```

### 3. Staff Management with Type Restrictions

**Middleware:**
```javascript
const { requireStaffManagement } = require('../middleware/requireStaffManagement');

router.post('/users', authenticate, requireStaffManagement('create', 'staffType'), (req, res) => {
  // req.allowedStaffTypes contains allowed staff types
  // Check if requested staffType is in allowedStaffTypes
});
```

**Service Method:**
```javascript
// Check if user can create a specific staff type
const canCreate = await permissionService.canManageStaff(userId, 'create', 'stakeholder');

// Get all allowed staff types for an action
const allowedTypes = await permissionService.getAllowedStaffTypes(userId, 'create');
// Returns: ['stakeholder', 'coordinator'] or ['*'] for all types
```

## Creating Permissions

### Create a Page Permission
```javascript
POST /api/rbac/permissions
{
  "code": "page.reports",
  "name": "Access Reports Page",
  "resource": "page",
  "action": "reports",
  "type": "page",
  "description": "Access reports and analytics page"
}
```

### Create a Feature Permission
```javascript
POST /api/rbac/permissions
{
  "code": "feature.export-data",
  "name": "Export Data Feature",
  "resource": "feature",
  "action": "export-data",
  "type": "feature",
  "description": "Can export data"
}
```

### Create a Staff Management Permission with Type Restrictions
```javascript
POST /api/rbac/permissions
{
  "code": "staff.create",
  "name": "Create Staff",
  "resource": "staff",
  "action": "create",
  "type": "staff",
  "description": "Create new staff members",
  "metadata": {
    "allowedStaffTypes": ["stakeholder", "coordinator"]
  }
}
```

## Assigning Permissions to Roles

When creating or updating a role, include permissions with metadata:

```javascript
PUT /api/rbac/roles/:roleId
{
  "permissions": [
    { 
      "resource": "page", 
      "actions": ["dashboard", "events", "requests"],
      "metadata": {}
    },
    { 
      "resource": "feature", 
      "actions": ["create-event", "request-blood"],
      "metadata": {}
    },
    { 
      "resource": "staff", 
      "actions": ["create", "update"],
      "metadata": {
        "allowedStaffTypes": ["stakeholder"]
      }
    }
  ]
}
```

## API Endpoints

### Permission Management
- `GET /api/rbac/permissions` - Get all permissions (filter by `?type=page` or `?resource=feature`)
- `GET /api/rbac/permissions/:id` - Get permission by ID
- `POST /api/rbac/permissions` - Create new permission
- `PUT /api/rbac/permissions/:id` - Update permission
- `DELETE /api/rbac/permissions/:id` - Delete permission

### User Permission Queries
- `GET /api/rbac/permissions/user/:userId/pages` - Get user's accessible pages
- `GET /api/rbac/permissions/user/:userId/features` - Get user's available features
- `GET /api/rbac/permissions/user/:userId/staff-types/:action` - Get allowed staff types for action

## Default Permissions Included

### Page Permissions
- `page.dashboard` - Access Dashboard
- `page.events` - Access Events Page
- `page.requests` - Access Requests Page
- `page.users` - Access Users Page
- `page.inventory` - Access Inventory Page
- `page.locations` - Access Locations Page
- `page.reports` - Access Reports Page
- `page.settings` - Access Settings Page
- `page.chat` - Access Chat Page

### Feature Permissions
- `feature.create-event` - Create Event Feature
- `feature.request-blood` - Request Blood Feature
- `feature.manage-inventory` - Manage Inventory Feature
- `feature.view-reports` - View Reports Feature
- `feature.export-data` - Export Data Feature
- `feature.send-notifications` - Send Notifications Feature

### Staff Management Permissions
- `staff.create` - Create Staff (with metadata for allowed types)
- `staff.read` - Read Staff
- `staff.update` - Update Staff (with metadata for allowed types)
- `staff.delete` - Delete Staff (with metadata for allowed types)

## Frontend Integration

### Check Page Access
```javascript
// Get user's accessible pages
const response = await fetch('/api/rbac/permissions/user/123/pages');
const { data: pages } = await response.json();

// Check if user can access a page
if (pages.includes('dashboard')) {
  // Show dashboard link
}
```

### Check Feature Access
```javascript
// Get user's available features
const response = await fetch('/api/rbac/permissions/user/123/features');
const { data: features } = await response.json();

// Check if user can use a feature
if (features.includes('create-event')) {
  // Show "Create Event" button
}
```

### Check Staff Management
```javascript
// Get allowed staff types for creating staff
const response = await fetch('/api/rbac/permissions/user/123/staff-types/create');
const { data: allowedTypes } = await response.json();

// If allowedTypes includes '*', user can create any staff type
// Otherwise, filter staff type dropdown to only show allowed types
```

## Migration Notes

1. Run the seed script to add new permissions:
   ```bash
   node src/utils/seedRoles.js
   ```

2. Update existing roles to include page and feature permissions as needed

3. Frontend should query user permissions on login to determine:
   - Which pages to show in navigation
   - Which features to enable
   - Which staff types can be created/edited

## Best Practices

1. **Page Permissions**: Use for route-level access control
2. **Feature Permissions**: Use for feature-level access control (buttons, actions)
3. **Staff Permissions**: Use metadata to restrict which staff types can be managed
4. **Wildcards**: Use `'*'` in `allowedStaffTypes` to allow all types
5. **Location Scope**: All permission checks support location-based filtering
