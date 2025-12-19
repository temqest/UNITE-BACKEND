# Permissions Setup Guide

This guide explains how to set up roles, permissions, and admin accounts for the UNITE system.

## Quick Start

To set up everything from scratch:

```bash
# 1. Seed roles and permissions
node src/utils/seedRoles.js

# 2. Create an admin account (or use existing)
node src/utils/createAdmin.js

# 3. Ensure admin has system-admin role assigned
node src/utils/setupAdminPermissions.js --email=admin@example.com
```

## Step-by-Step Instructions

### Step 1: Seed Roles and Permissions

This creates all default roles and permissions in the database.

```bash
node src/utils/seedRoles.js
```

**What it does:**
- Creates all permission definitions (event.*, request.*, page.*, settings.*, etc.)
- Creates default roles:
  - `system-admin` - Full access (wildcard permissions)
  - `coordinator` - Event/request coordinator with staff management
  - `stakeholder` - Stakeholder with event creation capabilities

**Settings Permissions Created:**
- `settings.edit-requesting` - Edit requesting settings
- `settings.edit-location` - Edit location settings
- `settings.edit-staff` - Edit staff settings

**Page Permissions Created:**
- `page.campaign` - Campaign/requests page
- `page.calendar` - Calendar page
- `page.chat` - Chat page
- `page.notification` - Notifications page
- `page.settings` - Settings page
- `page.stakeholder-management` - Stakeholder management page
- `page.coordinator-management` - Coordinator management page
- Plus other standard pages (dashboard, events, requests, etc.)

**Dry-run mode:**
```bash
node src/utils/seedRoles.js --dry-run
```

### Step 2: Create Admin Account

Create an admin account with system-admin role.

**Option A: Using createAdmin.js**

1. Create/edit `src/utils/admin.json`:
```json
{
  "user": {
    "firstName": "Admin",
    "lastName": "User",
    "email": "admin@example.com",
    "password": "secure-password-here"
  },
  "admin": {
    "isSystemAdmin": true
  },
  "roles": ["system-admin"]
}
```

2. Run the script:
```bash
node src/utils/createAdmin.js
```

**Option B: Using createSysAdmin.js**

1. Create/edit `src/utils/sysadmin.json` with admin details
2. Run:
```bash
node src/utils/createSysAdmin.js
```

### Step 3: Verify/Assign Admin Permissions

Ensure your admin account has the system-admin role assigned:

```bash
# For a specific admin email
node src/utils/setupAdminPermissions.js --email=admin@example.com

# To check all admin users
node src/utils/setupAdminPermissions.js
```

**What it does:**
- Checks if system-admin role exists
- Finds all users with `isSystemAdmin: true`
- Assigns system-admin role if missing
- Verifies accessible pages

**Dry-run mode:**
```bash
node src/utils/setupAdminPermissions.js --email=admin@example.com --dry-run
```

## Troubleshooting

### Issue: Admin has no sidebar items

**Cause:** Admin account doesn't have the system-admin role assigned, or permissions aren't seeded.

**Solution:**
1. Verify roles are seeded:
   ```bash
   node src/utils/seedRoles.js
   ```

2. Assign system-admin role to admin:
   ```bash
   node src/utils/setupAdminPermissions.js --email=admin@example.com
   ```

3. Verify accessible pages:
   - Check that `/api/pages/accessible` returns page routes
   - System-admin should have access to all pages (wildcard permission)

### Issue: Missing page permissions

**Cause:** Page permissions weren't created or role doesn't include them.

**Solution:**
1. Re-seed roles (this will update existing roles):
   ```bash
   node src/utils/seedRoles.js
   ```

2. The script will update existing roles with new permissions.

### Issue: Role exists but user can't access pages

**Cause:** User doesn't have the role assigned, or role assignment is inactive/expired.

**Solution:**
1. Check user's roles:
   ```bash
   # Use setupAdminPermissions.js to verify
   node src/utils/setupAdminPermissions.js --email=user@example.com
   ```

2. Manually assign role via API:
   ```bash
   POST /api/users/:userId/roles
   {
     "roleId": "<system-admin-role-id>"
   }
   ```

## Role Permissions Summary

### system-admin
- **Permissions:** `{ resource: '*', actions: ['*'] }` (wildcard - all access)
- **Accessible Pages:** All pages (handled by wildcard)
- **Staff Management:** All staff types
- **Settings Management:** All settings permissions including:
  - `settings.edit-requesting` - Edit requesting settings
  - `settings.edit-location` - Edit location settings
  - `settings.edit-staff` - Edit staff settings

### coordinator
- **Page Access:** campaign, calendar, chat, notification, settings, stakeholder-management
- **Staff Management:** Can manage stakeholders only
- **Events:** create, read, update
- **Requests:** create, read, review, approve, reject, reschedule

### stakeholder
- **Page Access:** campaign, calendar, chat, notification, settings
- **Events:** create, read
- **Requests:** create, read, confirm, decline

## API Endpoints for Verification

After setup, verify using these endpoints:

```bash
# Get accessible pages for current user
GET /api/pages/accessible
Authorization: Bearer <token>

# Get user's roles
GET /api/users/:userId/roles
Authorization: Bearer <token>

# Get user's permissions
GET /api/users/:userId/permissions
Authorization: Bearer <token>
```

## Notes

- The `system-admin` role uses wildcard permissions (`*.*`) which grants access to everything
- The `getAccessiblePages` function handles wildcards by returning all page routes from the database
- Page routes must match exactly what the frontend expects (e.g., `campaign`, `calendar`, not `dashboard`, `events`)
- Roles can be updated by re-running `seedRoles.js` - it will update existing roles with new permissions
