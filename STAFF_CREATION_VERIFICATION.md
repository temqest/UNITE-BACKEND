# Staff Creation Process Verification

## Issue Identified

The diagnostic script shows **0 users** in the database, which means user creation is failing completely.

## Root Cause Analysis

### 1. **Capability Mismatch in `validatePageContext` Middleware**

The middleware at `src/middleware/requireStaffManagement.js` line 108 was checking for:
- `'event.manage'` ❌ (doesn't exist)
- `'coverage.assign'` ❌ (doesn't exist)  
- `'staff.assign'` ❌ (doesn't exist)

But the actual permissions in the database are:
- `'event.create'` ✅
- `'event.update'` ✅
- `'staff.create'` ✅
- `'staff.update'` ✅

**FIXED:** Updated the middleware to use the correct capability names.

### 2. **User Creation Flow**

The frontend creates users in 3 steps:
1. **POST `/api/users`** - Creates user (no roles sent)
2. **POST `/api/users/:userId/roles`** - Assigns roles (role IDs, not codes)
3. **POST `/api/users/:userId/coverage-areas`** - Assigns coverage areas

The `validatePageContext` middleware runs on step 1, but since `req.body.roles` is empty, it skips validation. This is actually correct behavior.

### 3. **Potential Issues to Check**

1. **Authentication**: Is the user authenticated? Check `authenticate` middleware
2. **Permission Check**: Does the user have `staff.create` permission? Check `requireStaffManagement` middleware
3. **Validation**: Does the request body pass `validateCreateUser`? Check validation schema
4. **Role Assignment**: Are roles being assigned correctly? Check if role IDs are valid

## Verification Steps

### Step 1: Check if user creation API is being called
- Open browser DevTools → Network tab
- Try creating a staff member
- Check if POST `/api/users` is called
- Check the response status and body

### Step 2: Check backend logs
- Look for errors in the console
- Check for validation errors
- Check for permission denied errors

### Step 3: Verify role assignment
- After user is created, check if POST `/api/users/:userId/roles` is called
- Verify the roleId is correct (should be ObjectId, not role code)

### Step 4: Run verification script
```bash
# Check all users
node src/utils/verifyStaffCreation.js

# Check specific user by email
node src/utils/verifyStaffCreation.js --email=user@example.com
```

## Expected Behavior

1. User is created with `isActive: true`
2. Roles are assigned via UserRole collection
3. Roles have correct permissions
4. User appears in diagnostic script
5. User appears in Staff page (if has operational capabilities)

## Next Steps

1. **Try creating a user again** after the middleware fix
2. **Check browser console** for any errors
3. **Check backend logs** for validation/permission errors
4. **Run verification script** to see detailed diagnostics
5. **If still failing**, check:
   - Is the authenticated user a system admin?
   - Does the authenticated user have `staff.create` permission?
   - Are the role IDs valid ObjectIds?

