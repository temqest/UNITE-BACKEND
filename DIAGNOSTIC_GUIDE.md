# Stakeholder Creation Blocking - Diagnostic Guide

This guide explains how to use the diagnostic tools and interpret the results to identify why stakeholder creation is blocked.

## Overview

The diagnostic system has been implemented with:
1. **Frontend Logging** - Console logs in browser DevTools
2. **Backend Logging** - Server console logs with `[DIAG]` prefix
3. **Data Integrity Script** - Standalone script to verify database state

## Step 1: Run Data Integrity Checks

Before testing, verify your database state:

```bash
# Check all roles and permissions
node src/utils/diagnostic-checks.js

# Check specific user (replace USER_ID with actual MongoDB ObjectId)
node src/utils/diagnostic-checks.js USER_ID
```

### What to Look For:

1. **Role-Permission Mappings**
   - Verify `stakeholder` role has `request.review` capability
   - Verify `coordinator` role has `staff.create` permission
   - Verify `system-admin` role has `*.*` permission

2. **User-Role Assignments**
   - System Admin user should have `system-admin` role assigned
   - Coordinator user should have `coordinator` role assigned
   - Roles should be active and not expired

3. **Coverage Area Assignments**
   - Coordinator users MUST have at least one coverage area assignment
   - System Admins can have zero (they bypass jurisdiction checks)

4. **Organization Assignments**
   - Coordinator users should have an organization assigned
   - Organization should be active

5. **Assignable Roles Check**
   - Should show at least one role that:
     - User can assign (user authority > role authority)
     - Has `request.review` capability
     - Would NOT be excluded by operational filter

## Step 2: Reproduce the Issue

1. **Open Browser DevTools** (F12)
2. **Go to Console tab**
3. **Navigate to Stakeholder Management page**
4. **Click "Add Stakeholder" button**
5. **Observe the form fields** (role dropdown, coverage area, organization)

## Step 3: Collect Frontend Logs

Look for these log entries in the browser console:

### `[DIAG] Assignable Roles:`
- **Expected**: `count > 0` with roles listed
- **Problem**: `count: 0` means no roles available → Role dropdown will be disabled

### `[DIAG] Creator Jurisdiction:`
- **Expected for System Admin**: 
  - `isSystemAdmin: true`
  - `coverageAreasCount > 0` (all coverage areas)
  - `organizationsCount > 0` (all organizations)
- **Expected for Coordinator**:
  - `isSystemAdmin: false`
  - `coverageAreasCount > 0` (their assigned coverage areas)
  - `organizationsCount: 1` (their organization)

### `[DIAG] Add Stakeholder Modal - Field States:`
- **Check `roleDisabledReason`**: Should not be "no roles"
- **Check `coverageDisabledReason`**: Should not be "no coverage areas"
- **Check `isSystemAdmin`**: Should match user's actual role

## Step 4: Collect Backend Logs

When you attempt to create a stakeholder, check the server console for:

### `[DIAG] getAssignableRoles:`
- **Check `userAuthority`**: Should be 100 for System Admin, 60 for Coordinator
- **Check `finalRolesCount`**: Should be > 0
- **Check `finalRoles`**: Should list roles with `request.review` capability

### `[DIAG] requireStaffManagement:`
- **Check `canManage`**: Should be `true`
- **Check `allowedStaffTypes`**: Should include `"stakeholder"` or `["*"]`

### `[DIAG] validatePageContext:`
- **Check `context`**: Should be `"stakeholder-management"`
- **Check `hasRequiredCapability`**: Should be `true`
- **Check `roles`**: Should not be empty array

### `[DIAG] validateJurisdiction:`
- **Check `isSystemAdmin`**: Should match user's actual role
- **Check `canCreateCoverage`**: Should be `true` or `"N/A"`
- **Check `result`**: Should be `"PASSED"` or `"bypassed (system admin)"`

### `[DIAG] createUser:`
- **Check `requesterAuthority`**: Should match expected authority
- **Check `roles`**: Should not be empty
- **Check `coverageAreaId`**: Should be present for non-system-admins

## Step 5: Analyze Against Hypothesis Matrix

Compare your logs against the hypothesis matrix in the plan:

| Hypothesis | What to Check | Fix Location |
|------------|---------------|--------------|
| **H1: Assignable roles API returns empty** | Frontend: `[DIAG] Assignable Roles` shows `count: 0` | `src/controller/rbac_controller/permission.controller.js` |
| **H2: User authority incorrectly calculated** | Backend: `[DIAG] getAssignableRoles` shows wrong `userAuthority` | `src/services/users_services/authority.service.js` |
| **H3: Coordinator role excluded by operational filter** | Backend: `[DIAG] getAssignableRoles` shows Coordinator filtered out | `src/controller/rbac_controller/permission.controller.js` line 432-440 |
| **H4: Coverage areas not assigned to creator** | Frontend: `[DIAG] Creator Jurisdiction` shows `coverageAreasCount: 0` | Database: Assign coverage areas to user |
| **H5: Page context not sent in request** | Backend: `[DIAG] validatePageContext` shows `context: "none"` | Frontend: Add `x-page-context` header |
| **H6: Roles array empty in request body** | Backend: `[DIAG] validatePageContext` shows `roles: []` | Frontend: Send roles in request body |
| **H7: Permission check fails** | Backend: `[DIAG] requireStaffManagement` shows `canManage: false` | Database: Verify `staff.create` permission exists |
| **H8: Authority tier mismatch** | Backend: `[DIAG] createUser` shows `requesterAuthority <= roleAuthority` | Adjust authority calculation |
| **H9: Coverage area validation fails** | Backend: `[DIAG] validateJurisdiction` shows `canCreateCoverage: false` | Fix jurisdiction service logic |
| **H10: Frontend calculates authority incorrectly** | Compare frontend `isSystemAdmin` with backend `userAuthority` | `UNITE/hooks/useStakeholderManagement.ts` |

## Step 6: Apply Fixes

Based on the confirmed hypothesis, apply the appropriate fix from the plan:

### Fix 1: Backend Role Filtering (H1 or H3)
**File**: `src/controller/rbac_controller/permission.controller.js`

Adjust the operational exclusion logic to allow roles with both review and operational capabilities.

### Fix 2: Frontend Coverage Area Display (H4 or H2)
**File**: `UNITE/components/stakeholder-management/add-stakeholder-modal.tsx`

Allow coordinators to select from their jurisdiction instead of showing disabled input.

### Fix 3: Authority Calculation (H2 or H8)
**File**: `src/services/users_services/authority.service.js`

Verify `isSystemAdmin` flag is checked correctly.

### Fix 4: Page Context Header (H5)
**File**: Frontend stakeholder creation service

Add `x-page-context: stakeholder-management` header to API request.

### Fix 5: Permission Assignment (H7)
**Database**: Verify role has `staff.create` permission, or update role seed data.

## Step 7: Verify Fix

1. Clear browser cache and reload
2. Restart backend server
3. Test stakeholder creation with both System Admin and Coordinator users
4. Verify all fields are enabled and functional
5. Verify stakeholder is created successfully

## Step 8: Remove Diagnostic Logging

After the issue is resolved, remove all `[DIAG]` console.log statements from:
- `UNITE/hooks/useStakeholderManagement.ts`
- `UNITE/components/stakeholder-management/stakeholder-edit-modal.tsx`
- `UNITE/components/stakeholder-management/add-stakeholder-modal.tsx`
- `src/controller/rbac_controller/permission.controller.js`
- `src/middleware/requireStaffManagement.js`
- `src/middleware/validateJurisdiction.js`
- `src/controller/users_controller/user.controller.js`

## Common Issues and Quick Fixes

### Issue: Role dropdown is disabled
**Check**: `[DIAG] Assignable Roles` - if `count: 0`
**Fix**: Verify user has sufficient authority and roles have `request.review` capability

### Issue: Coverage area selector is disabled
**Check**: `[DIAG] Creator Jurisdiction` - if `coverageAreasCount: 0` for coordinator
**Fix**: Assign coverage areas to the coordinator user in database

### Issue: Organization selector is disabled
**Check**: `[DIAG] Creator Jurisdiction` - if `organizationsCount: 0` for coordinator
**Fix**: Assign organization to the coordinator user in database

### Issue: Backend rejects with "Insufficient Capability"
**Check**: `[DIAG] validatePageContext` - if `hasRequiredCapability: false`
**Fix**: Verify role has `request.review` capability in database

### Issue: Backend rejects with "Coverage area required"
**Check**: `[DIAG] validateJurisdiction` - if `coverageAreaId: "none"`
**Fix**: Ensure frontend sends `coverageAreaId` in request body

## Support

If the issue persists after following this guide:
1. Collect all `[DIAG]` logs from both frontend and backend
2. Run diagnostic script and save output
3. Document which hypothesis was confirmed
4. Review the plan's "Proposed Fixes" section for additional guidance

