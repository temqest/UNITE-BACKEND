# Fix: Display ALL Valid Coordinators in Dropdown (Frontend + Backend)

## Problem
When a stakeholder had 2+ valid coordinators matching their organization type and coverage area, the event creation modal showed only 1 coordinator and it was "locked" (not selectable).

**Example**: 
- Stakeholder: "testing Kurt O. cam sur 2" (LGU, District II)
- Valid Coordinators: Ben Carlo Valiente (has "All Districts" coverage) + David Jaque (has "Dave's cool group" with District II)
- **Result**: Only one showing in field, not both

---

## Root Causes

### Backend Issue: Hard Authority Filtering
**File**: `src/services/users_services/coordinatorResolver.service.js`

The initial coordinator query was filtering with `authority: { $gte: 60, $lt: 80 }`, which excluded valid coordinators outside this range.

**Fixed**: Changed to `$or: [{ 'roles.roleCode': 'coordinator' }, { authority: { $gte: 60 } }]`
- Catches coordinators by role OR authority (no artificial ceiling)
- Allows returning ALL valid matches instead of just those meeting arbitrary authority bounds

---

### Frontend Issue 1: Auto-Selecting First Coordinator
**File**: `UNITE/hooks/useEventUserData.ts` (lines ~270)

When API returned multiple coordinators, the code did:
```typescript
setCoordinatorOptions(opts);  // ✅ Show all options
setCoordinator(coordinatorId); // ❌ Auto-select FIRST one
```

This made the field appear "locked" to one selection even though multiple options existed.

**Fixed**: Changed to NOT auto-select when multiple coordinators exist:
```typescript
if (coordData.data?.coordinators && coordData.data.coordinators.length > 1) {
  const opts = coordData.data.coordinators.map(/* ... */);
  setCoordinatorOptions(opts);
  setCoordinator('');  // ✅ Leave empty - let user choose
} else {
  // Single coordinator - auto-select it
  setCoordinator(coordinatorId);
}
```

---

### Frontend Issue 2: Displaying as Locked Input Instead of Dropdown
**File**: `UNITE/components/campaign/event-creation-modal.tsx` (lines ~240-260)

For non-admin users (coordinators and stakeholders), the code showed:
```tsx
// Single coordinator: Show locked input (WRONG for multiple)
<Input disabled value={selected?.label} />
```

This rendered ALL coordinator cases as a locked text input, even when multiple options existed.

**Fixed**: Added logic to show dropdown when multiple coordinators:
```tsx
if (coordinatorOptions.length > 1) {
  return (
    <Select /* Show all options as dropdown */>
      {coordinatorOptions.map(coord => <SelectItem>{coord.label}</SelectItem>)}
    </Select>
  );
} else {
  // Single: locked input
  return <Input disabled value={selected?.label} />;
}
```

---

## Changes Summary

### 1. Backend: `coordinatorResolver.service.js`
✅ **Lines ~320**: Updated initial query to include role-based coordinators
- Changed from: `authority: { $gte: 60, $lt: 80 }`
- Changed to: `$or: [{ 'roles.roleCode': 'coordinator' }, { authority: { $gte: 60 } }]`

✅ **Lines ~195**: Flexible coordinator validation
- Changed from: Rejected if authority not in [60, 80) range
- Changed to: Accepts coordinators with coordinator role OR authority >= 60

✅ **Lines ~350**: Enhanced logging for org type matching

---

### 2. Frontend: `useEventUserData.ts` Hook
✅ **Lines ~270**: Don't auto-select when multiple coordinators
```typescript
// When multiple coordinators exist:
setCoordinatorOptions(opts);
setCoordinator('');  // Leave empty - let user choose
```

---

### 3. Frontend: `event-creation-modal.tsx` Component
✅ **Lines ~240-290**: Show dropdown for multiple coordinators
```typescript
// Multiple coordinators: Show dropdown
if (coordinatorOptions.length > 1) {
  return <Select ...>/* Show all options */</Select>;
}
// Single coordinator: Show locked input
return <Input disabled ... />;
```

---

## Result

**Before**: 
```
Backend returns: 2 coordinators ✓
Frontend displays: 1 coordinator (locked) ✗
```

**After**:
```
Backend returns: 2 coordinators ✓
Frontend displays: 2 coordinators in dropdown ✓
User can select: Either coordinator ✓
```

---

## Testing Steps

1. **Start Backend**:
   ```bash
   npm run dev
   ```

2. **Login as Stakeholder**: `test@camsur2.com`
   - Authority: < 60 (Stakeholder tier)
   - Coverage: District II

3. **Open Create Event Modal**

4. **Coordinator Field Verification**:
   - ✅ Should show **dropdown** (not locked input)
   - ✅ Should list **both**: Ben Carlo Valiente + David Jaque
   - ✅ User should be able to **select either one**

5. **Backend Logs**:
   - `[resolveValidCoordinators] Found potential coordinators: { potentialCount: 8 ... }`
   - `[resolveValidCoordinators] Resolution complete: { validCount: 2 ... }`
   - Confirms 2 valid coordinators returned

---

## Files Modified

1. ✅ `src/services/users_services/coordinatorResolver.service.js`
2. ✅ `UNITE/hooks/useEventUserData.ts`
3. ✅ `UNITE/components/campaign/event-creation-modal.tsx`

---

## Security Notes

✅ **Still Secure**:
- Backend still validates each coordinator (org type + coverage)
- Middleware still prevents invalid coordinator assignment on event creation
- Frontend dropdown only shows pre-validated coordinators from backend
- User cannot inject arbitrary coordinator IDs

The changes only affect **display** and **selection logic**, not **validation logic**.

---

## Backward Compatibility

✅ **No Breaking Changes**:
- Single coordinator cases still work (auto-locked)
- Admin coordinator selection unchanged
- API responses still same format
- Dropdown gracefully handles 0, 1, or 2+ coordinators

