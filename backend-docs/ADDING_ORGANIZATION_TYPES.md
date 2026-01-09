# Adding New Organization Types

## Overview
Organization types are defined in **one place only**: the Organization model. This allows you to add new types without modifying User model or redeploying code.

## How to Add a New Organization Type

### Option 1: Database-Only (No Code Changes Required)

Simply create a new organization with the new type:

```javascript
// Example: Adding "PrivateClinic" type
db.organizations.insertOne({
  name: "Sample Private Clinic",
  code: "sample-private-clinic",
  type: "PrivateClinic",  // ← New type
  description: "Private medical clinic",
  isActive: true
});
```

**Validation:** The Organization model enum will validate the type. To add a new type to the allowed list:

### Option 2: Update Organization Model Enum (Recommended for New Types)

**File:** `src/models/utility_models/organization.model.js`

```javascript
type: {
  type: String,
  enum: [
    'LGU', 
    'NGO', 
    'Hospital', 
    'BloodBank', 
    'RedCross', 
    'Non-LGU', 
    'Other',
    'PrivateClinic'  // ← Add your new type here
  ],
  required: true,
  index: true
}
```

**Steps:**
1. Update the `enum` array in Organization model
2. Restart server
3. Create organizations with the new type

**That's it!** No need to update:
- ❌ User.organizationType enum (removed - accepts any string)
- ❌ User.organizations[].organizationType enum (removed - accepts any string)
- ❌ Frontend type definitions (unless you want autocomplete)

## How It Works

### Before (Hard-Coded Enums - 3 places to update):
```
Organization.type enum: ['LGU', 'NGO', ...]  ← Update here
User.organizationType enum: ['LGU', 'NGO', ...]  ← AND here
User.organizations[].organizationType enum: ['LGU', 'NGO', ...]  ← AND here
```

### After (Single Source of Truth - 1 place to update):
```
Organization.type enum: ['LGU', 'NGO', ...]  ← Update ONLY here
User.organizationType: String  ← Accepts any string
User.organizations[].organizationType: String  ← Accepts any string
```

### Validation Flow:

1. **Organization Creation:** Validated by Organization model enum
2. **Signup Request:** References existing Organization (already validated)
3. **User Approval:** Uses `organization.type` from validated Organization
4. **User Save:** No enum validation, accepts any string from Organization

## Adding Types Without Enum (Fully Dynamic)

If you want **zero code changes** when adding types, remove the enum entirely:

**File:** `src/models/utility_models/organization.model.js`

```javascript
type: {
  type: String,
  required: true,
  trim: true,
  index: true
  // No enum - fully dynamic types
}
```

**Trade-offs:**
- ✅ Add types anytime without code changes
- ✅ Maximum flexibility
- ❌ No database-level type validation
- ❌ Risk of typos (e.g., "Hosptal" instead of "Hospital")

**Recommended:** Keep the enum for common types, but understand it's the only place you need to update.

## Frontend Updates (Optional)

If you use TypeScript types on the frontend, update:

**File:** `UNITE/types/organization.ts` (if it exists)

```typescript
export type OrganizationType = 
  | 'LGU'
  | 'NGO'
  | 'Hospital'
  | 'BloodBank'
  | 'RedCross'
  | 'Non-LGU'
  | 'Other'
  | 'PrivateClinic';  // ← Add here for autocomplete
```

This is **optional** and only affects developer experience (autocomplete).

## Migration for Existing Users

If you need to update existing users' organization types:

```javascript
// Find all users with old organization type
const usersToUpdate = await User.find({ 
  organizationType: 'OldType' 
});

// Update to new type
for (const user of usersToUpdate) {
  user.organizationType = 'NewType';
  await user.save();
}
```

## Summary

**To add a new organization type:**
1. Update `Organization.type` enum (optional if fully dynamic)
2. Restart server
3. Create organizations with new type
4. Done! ✅

No User model changes needed. No complex migrations. Single source of truth.
