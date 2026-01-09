# Frontend Files That Need Updates

## Overview

This document identifies the frontend files that need to be updated to fix the Coordinator-Stakeholder visibility and filtering issues in the Event Creation modal and Stakeholder Page.

## Files to Locate and Update

### 1. Event Creation Modal Component

**What to look for:**
- Component that opens when user clicks "Create Event" or similar
- Contains coordinator and stakeholder dropdown fields
- May be in: `components/events/`, `components/modals/`, `pages/events/`, or similar

**What needs to change:**
- Add authority check on modal open
- Implement auto-fill logic for coordinator and stakeholder fields based on user authority
- Use new API endpoints: `/api/users/by-capability` and `/api/users/:userId/coordinator`
- Lock fields appropriately based on user type

**Reference**: See `EVENT_CREATION_MODAL_IMPLEMENTATION.md` for detailed implementation

### 2. getUserAuthority Utility

**What to look for:**
- File: `utils/getUserAuthority.ts` (mentioned in error: `utils/getUserAuthority.ts (74:15)`)
- Function that fetches user authority from `/api/rbac/authority/user/:userId`

**What needs to change:**
- Ensure it handles the self-read bypass correctly
- Add proper error handling for 403 errors (should be rare now)
- Verify it's using the correct endpoint

**Example fix:**
```typescript
// Should work now with self-read bypass, but add error handling
export const getUserAuthority = async (userId: string): Promise<number> => {
  try {
    const res = await fetch(`/api/rbac/authority/user/${userId}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.ok) {
      if (res.status === 403) {
        // Should not happen for self-read, but handle gracefully
        throw new Error('Permission denied - cannot read user authority');
      }
      throw new Error(`Failed to get authority: ${res.status}`);
    }
    
    const data = await res.json();
    return data.data.authority;
  } catch (error) {
    console.error('[getUserAuthority] Error:', error);
    throw error;
  }
};
```

### 3. Stakeholder Page Component

**What to look for:**
- Page/component that displays list of stakeholders for coordinators
- Shows "No Stakeholders Found" message
- May be in: `pages/stakeholders/`, `components/stakeholder-management/`, or similar

**What needs to change:**
- Ensure it uses `/api/users/by-capability?capability=request.review` endpoint
- Remove any legacy endpoint calls (e.g., `/api/stakeholders`)
- Verify it's not using district-based filtering (should use municipality from coverageAreas)

**Example:**
```typescript
// Correct endpoint usage
const fetchStakeholders = async () => {
  const res = await fetch('/api/users/by-capability?capability=request.review', {
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  return data.data; // Array of stakeholders in coordinator's jurisdiction
};
```

### 4. API Service/Client Files

**What to look for:**
- Files that define API client functions
- May be in: `services/api/`, `lib/api/`, `utils/api/`, or similar
- Functions like `getCoordinators()`, `getStakeholders()`, etc.

**What needs to change:**
- Update functions to use new endpoints
- Remove references to legacy endpoints:
  - `/api/coordinators` → `/api/users/by-capability?capability=request.create`
  - `/api/stakeholders` → `/api/users/by-capability?capability=request.review`
  - `/api/coordinators/:id` → `/api/users/:userId`
  - `/api/stakeholders/:id` → `/api/users/:userId`

### 5. User Context/Auth Hook

**What to look for:**
- Hook or context that provides current user information
- May be: `useCurrentUser()`, `useAuth()`, `UserContext`, etc.

**What needs to check:**
- Ensure it provides user's `authority` field
- If not, may need to fetch it using `/api/rbac/authority/user/:userId`

## Search Patterns

To find these files, search for:

1. **Event Creation Modal:**
   - Search for: "Create Event", "New Event", "Event Modal", "coordinator", "stakeholder" in component names
   - Look for dropdown/select components for coordinator and stakeholder

2. **getUserAuthority:**
   - Search for: `getUserAuthority`, `/api/rbac/authority/user`

3. **Stakeholder Page:**
   - Search for: "Stakeholder", "stakeholders", "No Stakeholders Found"
   - Look for list/table components displaying stakeholders

4. **API Calls:**
   - Search for: `/api/coordinators`, `/api/stakeholders`, `district_id`
   - Look for fetch/axios calls with these endpoints

## Common Issues to Fix

### Issue 1: Using Legacy Endpoints
**Find:**
```typescript
fetch('/api/coordinators')
fetch('/api/stakeholders?district_id=...')
```

**Replace with:**
```typescript
fetch('/api/users/by-capability?capability=request.create')
fetch('/api/users/by-capability?capability=request.review')
```

### Issue 2: Role-Based Checks Instead of Authority
**Find:**
```typescript
if (user.role === 'admin' || user.staff_type?.includes('admin'))
if (user.role === 'coordinator')
```

**Replace with:**
```typescript
if (user.authority >= 80) // System Admin
if (user.authority >= 60 && user.authority < 80) // Coordinator
if (user.authority < 60) // Stakeholder
```

### Issue 3: Not Auto-Filling Fields for Coordinators/Stakeholders
**Find:**
- Empty coordinator/stakeholder fields that should be auto-filled
- Missing logic to fetch coordinator for stakeholders

**Add:**
- Authority check on modal/page load
- Auto-fill logic based on user authority (see `EVENT_CREATION_MODAL_IMPLEMENTATION.md`)

### Issue 4: Using District Instead of Municipality
**Find:**
```typescript
fetch(`/api/stakeholders?district_id=${districtId}`)
```

**Replace with:**
```typescript
// Get municipality from coordinator's coverageAreas
const municipalityId = coordinator.coverageAreas[0]?.municipalityIds[0];
fetch(`/api/users/by-capability?capability=request.review&locationId=${municipalityId}`)
```

## Testing Checklist

After updating frontend files:

- [ ] System Admin can see all coordinators in dropdown
- [ ] System Admin can see stakeholders after selecting coordinator
- [ ] Coordinator sees coordinator field auto-filled and locked to self
- [ ] Coordinator sees stakeholders in dropdown (not empty)
- [ ] Coordinator sees stakeholders on Stakeholder Page
- [ ] Stakeholder can fetch their authority (no 403 error)
- [ ] Stakeholder sees coordinator field auto-filled and locked
- [ ] Stakeholder sees stakeholder field auto-filled and locked to self
- [ ] All fields are locked/disabled appropriately
- [ ] No console errors related to API calls

## Backend Endpoints Summary

### Working Endpoints (Use These)

1. **Get User Authority**: `GET /api/rbac/authority/user/:userId`
   - Now supports self-read (no 403 for own authority)

2. **Get Coordinators**: `GET /api/users/by-capability?capability=request.create`
   - Returns users with `authority >= 60` and `request.review` capability

3. **Get Stakeholders**: `GET /api/users/by-capability?capability=request.review`
   - Returns users with `authority < 60` in requester's jurisdiction
   - Optional: `&locationId=municipalityId` to filter by municipality

4. **Get Stakeholder's Coordinator**: `GET /api/users/:userId/coordinator`
   - Returns coordinator who manages the stakeholder
   - Based on organization + municipality matching

5. **Get User by ID**: `GET /api/users/:userId`
   - Returns full user object with organizations, coverageAreas, etc.

### Deprecated Endpoints (Don't Use)

- `/api/coordinators` - Does not exist
- `/api/stakeholders` - Does not exist
- `/api/coordinators/:id` - Use `/api/users/:userId` instead
- `/api/stakeholders/:id` - Use `/api/users/:userId` instead

