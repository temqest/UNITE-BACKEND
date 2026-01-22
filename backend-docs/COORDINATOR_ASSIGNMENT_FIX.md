# Coordinator Assignment Logic Fix - Implementation Guide

## Overview

This document describes the fix for coordinator assignment during event creation, ensuring that stakeholders can only be assigned coordinators who:
1. Match the stakeholder's **organization type**
2. Have coverage areas containing the stakeholder's **municipality/district**

## Problem Statement

**Issue**: A stakeholder from District 2, Camarines Sur (LGU) could be assigned a coordinator from Naga City (different coverage area), resulting in invalid assignments.

**Root Causes**:
- Backend resolver did not validate organization type matching
- Backend resolver did not properly validate district/municipality containment
- Frontend provided no secondary validation
- Event creation endpoints had no validation middleware

## Solution Architecture

The fix implements **three layers of validation**:

### Layer 1: Enhanced Backend Service (`coordinatorResolver.service.js`)
- **File**: `src/services/users_services/coordinatorResolver.service.js`
- **Responsibility**: Core business logic for coordinator validation
- **Key Features**:
  - `isValidCoordinatorForStakeholder()`: Comprehensive validation
  - `isMunicipalityInCoverage()`: Geographic coverage validation
  - `isOrganizationTypeMatch()`: Organization type matching
  - `resolveValidCoordinators()`: Returns ONLY valid coordinators
  - `validateCoordinatorAssignment()`: Validates assignment during event creation

### Layer 2: Backend Controller & Middleware
- **Controller Update**: `src/controller/users_controller/user.controller.js`
  - Method: `resolveCoordinatorForStakeholder()`
  - Now uses enhanced service
  - Returns only validated coordinators

- **Validation Middleware**: `src/middleware/validateCoordinatorAssignment.js`
  - Validates coordinator assignment during event creation
  - Prevents manual API manipulation
  - Provides detailed error messages

### Layer 3: Enhanced Frontend Utilities
- **File**: `UNITE/utils/coordinatorFiltering.ts`
- **Responsibility**: Client-side filtering and validation helpers
- **Functions**:
  - `formatCoordinatorLabel()`: Enhanced display with coverage/org type
  - `isCoordinatorValidForStakeholder()`: Client-side validation
  - `filterValidCoordinatorsForStakeholder()`: Filter coordinators
  - `getCoordinatorValidationMessage()`: User-friendly error messages

## Validation Rules

### Rule 1: Organization Type Matching
```
Stakeholder.organizationType === Coordinator.organizationType
```

**Examples**:
- ✅ LGU Stakeholder + LGU Coordinator = VALID
- ✅ NGO Stakeholder + NGO Coordinator = VALID
- ❌ LGU Stakeholder + NGO Coordinator = INVALID
- ❌ Hospital Stakeholder + BloodBank Coordinator = INVALID

### Rule 2: Geographic Coverage
```
Stakeholder.Municipality ∈ Coordinator.CoverageArea.Municipalities
OR
Stakeholder.Municipality.District ∈ Coordinator.CoverageArea.Districts
```

**Examples**:
- ✅ Stakeholder: Gainza (District 2) + Coordinator: District 2 coverage = VALID
- ✅ Stakeholder: Naga City (acts as District) + Coordinator: covers Naga City = VALID
- ❌ Stakeholder: Gainza (District 2) + Coordinator: Naga City only = INVALID (if Naga City not in District 2)

### Rule 3: User Status
- Coordinator must be **active** (`isActive: true`)
- Coordinator must have **authority 60-80** (coordinator-level)
- Stakeholder must have **authority < 60** (stakeholder-level)

## Implementation Details

### Backend Service: `coordinatorResolver.service.js`

#### Method: `isValidCoordinatorForStakeholder(stakeholder, coordinator)`

**Validation Steps**:
1. Check coordinator is active
2. Check coordinator authority is 60-80
3. Get stakeholder's organization types
4. Verify coordinator has matching organization types
5. Verify stakeholder's municipality is in coordinator's coverage areas

**Returns**: `{ valid: boolean, reason?: string, details?: object }`

```javascript
// Example usage
const validation = await coordinatorResolverService
  .isValidCoordinatorForStakeholder(stakeholder, coordinator);

if (validation.valid) {
  // Coordinator is valid for this stakeholder
} else {
  console.log(validation.reason);
  // e.g., "Organization type mismatch: Stakeholder [LGU], Coordinator [NGO]"
}
```

#### Method: `resolveValidCoordinators(stakeholderId)`

**Returns**: `{ coordinators: [], primaryCoordinator: Object, validationDetails: [] }`

```javascript
// Example usage
const result = await coordinatorResolverService
  .resolveValidCoordinators(stakeholderId);

// result.coordinators contains ONLY valid coordinators
// Each coordinator has full details (name, email, organizationType, coverageAreas)
```

### Backend Controller: Updated `resolveCoordinatorForStakeholder()`

**Endpoint**: `GET /api/users/:userId/coordinator`

**Changes**:
- Now uses enhanced `coordinatorResolverService`
- Returns coordinators with full coverage area info
- Includes validation details in development mode

**Response**:
```json
{
  "success": true,
  "data": {
    "coordinators": [
      {
        "_id": "user123",
        "firstName": "Juan",
        "lastName": "Dela Cruz",
        "email": "juan@example.com",
        "fullName": "Juan Dela Cruz",
        "organizationType": "LGU",
        "coverageAreas": [
          {
            "coverageAreaName": "District 2, Camarines Sur",
            "districtIds": ["loc456"],
            "municipalityIds": ["loc789"]
          }
        ],
        "source": "validated_match"
      }
    ],
    "primaryCoordinator": { /* ... */ }
  }
}
```

### Validation Middleware: `validateCoordinatorAssignment.js`

**Purpose**: Prevents invalid coordinator assignment during event creation

**Usage**:
```javascript
// In routes/events.routes.js
router.post(
  '/events',
  authenticate,
  validateCoordinatorAssignment,  // Add this middleware
  createEventController
);
```

**Checks**:
- If coordinator ID is provided, validate it for the stakeholder
- Returns 400 error with details if validation fails
- Stores validation result in `req.validatedData.coordinatorValidation`

**Example Error Response**:
```json
{
  "success": false,
  "message": "Invalid coordinator assignment",
  "details": {
    "stakeholderId": "stake123",
    "coordinatorId": "coord456",
    "reason": "Organization type mismatch: Stakeholder [LGU], Coordinator [NGO]",
    "validationDetails": {
      "stakeholderOrgTypes": ["LGU"],
      "coordinatorOrgTypes": ["NGO"]
    }
  }
}
```

### Frontend Utilities: `coordinatorFiltering.ts`

#### Function: `formatCoordinatorLabel(coordinator)`

Provides enhanced display with coverage and org type:
```typescript
const label = formatCoordinatorLabel(coordinator);
// Output: "Juan Dela Cruz - District 2, Camarines Sur (LGU)"
```

#### Function: `isCoordinatorValidForStakeholder(stakeholder, coordinator)`

Client-side validation (secondary to backend):
```typescript
if (isCoordinatorValidForStakeholder(stakeholder, coordinator)) {
  // Show coordinator as option
} else {
  // Hide coordinator or show as disabled
}
```

#### Function: `filterValidCoordinatorsForStakeholder(coordinators, stakeholder)`

Filter coordinator list:
```typescript
const validCoordinators = filterValidCoordinatorsForStakeholder(
  coordinatorOptions,
  currentStakeholder
);

// Update UI to show only validCoordinators
```

## Integration Guide

### Step 1: Backend Integration

1. **Service is already created**: `src/services/users_services/coordinatorResolver.service.js`

2. **Controller updated**: The `resolveCoordinatorForStakeholder()` method in `src/controller/users_controller/user.controller.js` now uses the new service

3. **Add middleware to event creation routes**:
   ```javascript
   // In src/routes/events.routes.js (or where event creation is handled)
   const validateCoordinatorAssignment = require('../middleware/validateCoordinatorAssignment');

   router.post('/events', authenticate, validateCoordinatorAssignment, createEventController);
   router.post('/events/training', authenticate, validateCoordinatorAssignment, createTrainingController);
   router.post('/events/blood-drive', authenticate, validateCoordinatorAssignment, createBloodDriveController);
   // etc.
   ```

### Step 2: Frontend Integration

1. **Update `useEventUserData` hook** (if needed):
   - Already uses the resolved coordinators from backend
   - No changes needed; backend returns only valid coordinators

2. **Use new filtering utilities**:
   ```typescript
   // In components/campaign/event-creation-modal.tsx
   import {
     formatCoordinatorLabel,
     isCoordinatorValidForStakeholder,
     filterValidCoordinatorsForStakeholder
   } from '@/utils/coordinatorFiltering';

   // Format coordinator labels
   const coordinatorLabel = formatCoordinatorLabel(coordinator);

   // Filter options (secondary to backend)
   const validCoords = filterValidCoordinatorsForStakeholder(
     coordinatorOptions,
     stakeholder
   );
   ```

## Testing Strategy

### Test Case 1: Valid Coordinator Assignment
```javascript
// Setup
const stakeholder = {
  _id: 'stake123',
  organizationType: 'LGU',
  locations: { municipalityId: 'gainza123' } // Gainza in District 2
};

const coordinator = {
  _id: 'coord456',
  authority: 70,
  organizationType: 'LGU',
  coverageAreas: [{
    districtIds: ['district2'] // Covers District 2
  }]
};

// Test
const validation = await coordinatorResolverService
  .isValidCoordinatorForStakeholder(stakeholder, coordinator);

// Expected: validation.valid === true
```

### Test Case 2: Organization Type Mismatch
```javascript
const stakeholder = { organizationType: 'LGU', /* ... */ };
const coordinator = { organizationType: 'NGO', /* ... */ };

// Expected: validation.valid === false
// Expected: validation.reason includes "Organization type mismatch"
```

### Test Case 3: Coverage Area Mismatch
```javascript
const stakeholder = {
  locations: { municipalityId: 'gainza123' } // District 2
};

const coordinator = {
  coverageAreas: [{
    districtIds: ['district3'] // Covers District 3, not District 2
  }]
};

// Expected: validation.valid === false
// Expected: validation.reason includes "not within coordinator's coverage areas"
```

### Manual Testing

1. **Create test stakeholders**:
   - LGU Stakeholder in Gainza (District 2)
   - NGO Stakeholder in Naga City
   - LGU Stakeholder in another district

2. **Create test coordinators**:
   - LGU Coordinator for District 2
   - LGU Coordinator for District 3
   - NGO Coordinator for Naga City

3. **Test event creation**:
   - Verify correct coordinators appear for each stakeholder
   - Verify incorrect coordinators are not available
   - Verify error messages if trying to manually assign invalid coordinator

## Debugging & Diagnostics

### Enable Detailed Logging

Logging is automatic in development mode. Set `NODE_ENV=development` to see:
- Coordinator resolution details
- Validation results for each coordinator
- Coverage area matching details

### Development Mode Response

When `NODE_ENV=development`, responses include `_debug.validationDetails`:

```json
{
  "success": true,
  "data": {
    "coordinators": [...],
    "_debug": {
      "validationDetails": [
        {
          "coordinatorId": "coord1",
          "coordinatorName": "Juan Dela Cruz",
          "valid": true,
          "reason": null
        },
        {
          "coordinatorId": "coord2",
          "coordinatorName": "Maria Santos",
          "valid": false,
          "reason": "Organization type mismatch",
          "details": {
            "stakeholderOrgTypes": ["LGU"],
            "coordinatorOrgTypes": ["NGO"]
          }
        }
      ]
    }
  }
}
```

### Troubleshooting

**Issue**: Coordinator not appearing in options for valid assignment

1. Check logs for validation details
2. Verify coordinator has `authority: 60-80`
3. Verify coordinator is `isActive: true`
4. Verify coverage areas are correctly populated
5. Check organization types match

**Issue**: Invalid coordinator appearing in options

1. Backend should prevent this (all returned coordinators are valid)
2. If frontend shows invalid: refresh page, clear cache
3. Report as bug if persists

## Migration Notes

For existing data:
- No data migration needed
- New validation applies to all new events
- Existing events are not affected
- Can run validation retrospectively if needed

## Performance Considerations

- **Database Queries**: Service uses `.lean()` for read-only queries
- **Indexing**: Ensure indexes exist on:
  - `User.authority`
  - `User.organizations.organizationType`
  - `User.coverageAreas.municipalityIds`
  - `User.coverageAreas.districtIds`
- **Caching**: Consider caching coordinator lists if performance issues arise

## Security Considerations

1. **Backend is authoritative**: Frontend validation is UX only
2. **Middleware prevents bypass**: Event creation validates coordinator
3. **No client-side trust**: All validation re-checked on server
4. **Logging**: All validation attempts logged for audit trail

## Additional Improvements

Future enhancements could include:
- Caching resolved coordinators per stakeholder (with TTL)
- Batch validation for bulk operations
- Coordinator performance metrics (events handled, stakeholder coverage density)
- Coverage area visualization UI
- Audit trail for coordinator assignments

## Files Modified

1. ✅ `src/services/users_services/coordinatorResolver.service.js` (NEW)
2. ✅ `src/controller/users_controller/user.controller.js` (UPDATED)
3. ✅ `src/middleware/validateCoordinatorAssignment.js` (NEW)
4. ✅ `UNITE/utils/coordinatorFiltering.ts` (NEW)
5. ⏳ `src/routes/events.routes.js` (NEEDS UPDATE - add middleware)
6. ⏳ `src/routes/eventRequests.routes.js` (NEEDS UPDATE - add middleware if applicable)

## Next Steps

1. Review and test the implementation
2. Update routes to include validation middleware
3. Run test cases to validate
4. Deploy to staging environment
5. Perform end-to-end testing with sample data
6. Deploy to production
