# PHASE 1: CODE CHANGES REFERENCE

This document provides exact line references and code snippets for all Phase 1 modifications.

---

## File 1: src/models/users_models/user.model.js

### Change 1: Add Audit Fields to User Schema (After authority field)

**Location**: Lines 100-118 (new fields inserted)

```javascript
// BEFORE
authority: {
  type: Number,
  required: true,
  default: 20,
  index: true,
  min: 20,
  max: 100
},

// AFTER - Added audit logging fields
authority: {
  type: Number,
  required: true,
  default: 20,
  index: true,
  min: 20,
  max: 100
},

// AUTHORITY AUDIT TRAIL
authority_changed_at: {
  type: Date,
  required: false
},

authority_changed_by: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: false
},
```

### Change 2: Add Pre-Save Hook for Authority Tracking (After email lowercase hook)

**Location**: After line 328 (pre-save hooks section)

```javascript
// Pre-save hook to track authority changes
userSchema.pre('save', function(next) {
  if (this.isModified('authority')) {
    this.authority_changed_at = new Date();
    // authority_changed_by should be set by the controller/service calling save()
    // If not set, leave as is (allows tracking of system-level updates)
  }
  next();
});
```

---

## File 2: src/services/request_services/eventRequest.service.js

### Change 1: Deprecate _normalizeRole() and Add Migration Guide

**Location**: Lines 163-197 (replaced entire method)

```javascript
// BEFORE
_normalizeRole(role) {
  if (!role) return null;
  const normalized = String(role).toLowerCase();
  // Normalize to role codes, not role names
  if (normalized === 'admin' || normalized === 'systemadmin' || ...) {
    return 'system-admin';
  }
  if (normalized === 'coordinator') return 'coordinator';
  if (normalized === 'stakeholder') return 'stakeholder';
  if (normalized === 'system-admin' || normalized === 'coordinator' || normalized === 'stakeholder') {
    return normalized;
  }
  return role;
}

// AFTER - Deprecated with migration guide
/**
 * @deprecated Use authority field from User model instead
 * Maps legacy role string to normalized role code (for backward compatibility only)
 * NEW: This method should NOT be used for new code; migrate to authority-based checks
 * 
 * MIGRATION PATH:
 * - Replace: `if (normalizedRole === 'system-admin')` with `if (authority >= 80)`
 * - Replace: `if (normalizedRole === 'coordinator')` with `if (authority >= 60 && authority < 80)`
 * - Replace: `if (normalizedRole === 'stakeholder')` with `if (authority >= 30 && authority < 60)`
 */
_normalizeRole(role) {
  if (!role) return null;
  const normalized = String(role).toLowerCase();
  // Normalize to role codes, not role names
  if (normalized === 'admin' || normalized === 'systemadmin' || normalized === 'sysadmin' || normalized === 'sysad' || normalized === 'system-admin') {
    return 'system-admin';
  }
  if (normalized === 'coordinator') return 'coordinator';
  if (normalized === 'stakeholder') return 'stakeholder';
  // If already a valid role code, return as-is
  if (normalized === 'system-admin' || normalized === 'coordinator' || normalized === 'stakeholder') {
    return normalized;
  }
  return role;
}

/**
 * NEW: Convert legacy role string to authority tier
 * Useful for audit trail generation from actor snapshots that only have role string
 * @param {string} role - Legacy role string
 * @returns {number} Authority value (20-100)
 */
_roleToAuthority(role) {
  const normalized = this._normalizeRole(role);
  const authorityMap = {
    'system-admin': 100,
    'coordinator': 60,
    'stakeholder': 30
  };
  return authorityMap[normalized] || 20;
}
```

### Change 2: Update _buildActorSnapshot() to Include Authority

**Location**: Lines 206-245 (replaced entire method)

```javascript
// BEFORE
async _buildActorSnapshot(role, id) {
  if (!role || !id) return null;
  const normalizedRole = this._normalizeRole(role);
  let name = null;
  if (normalizedRole === 'stakeholder') {
    name = await this._fetchStakeholderName(id);
  } else {
    name = await this._fetchBloodbankStaffName(id);
  }
  return {
    role: normalizedRole,
    id,
    name: name || null
  };
}

// AFTER - Fetches authority from User model
async _buildActorSnapshot(role, id) {
  if (!id) return null;
  
  try {
    // Prefer authority field from User model if available
    const user = await User.findById(id).select('authority firstName lastName email fullName organizationInstitution').lean();
    if (user) {
      const name = user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.organizationInstitution || null;
      // Role is kept for backward compatibility with existing audit trail
      // But authority is now the source of truth for permissions
      const normalizedRole = role ? this._normalizeRole(role) : null;
      return {
        role: normalizedRole,
        authority: user.authority,  // NEW: Include authority
        id,
        userId: user._id,
        name: name || null
      };
    }
  } catch (e) {
    console.warn(`[_buildActorSnapshot] Failed to fetch user ${id}:`, e.message);
  }
  
  // Fallback to legacy role-based snapshot if user not found
  const normalizedRole = this._normalizeRole(role);
  let name = null;
  if (normalizedRole === 'stakeholder') {
    name = await this._fetchStakeholderName(id);
  } else {
    name = await this._fetchBloodbankStaffName(id);
  }
  return {
    role: normalizedRole,
    authority: this._roleToAuthority(normalizedRole),  // NEW: Compute from role string
    id,
    name: name || null
  };
}
```

---

## File 3: src/controller/request_controller/eventRequest.controller.js

### Change: Authority Validation & Field Locking in createImmediateEvent

**Location**: Lines 155-215 (within createImmediateEvent method)

```javascript
// Get user document with authority field
const { User } = require('../../models');
const { AUTHORITY_TIERS } = require('../../services/users_services/authority.service');

const userDoc = await User.findById(creatorId);
if (!userDoc) {
  console.log(`[createImmediateEvent] User not found: ${creatorId}`);
  return res.status(404).json({ success: false, message: 'User not found' });
}

const userAuthority = userDoc.authority || 20;
const isSystemAdmin = userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN; // ≥80
const isCoordinator = userAuthority >= AUTHORITY_TIERS.COORDINATOR; // ≥60

// Log authority validation decision
console.log(`[createImmediateEvent] Authority validation for creator ${creatorId}`, {
  email: userDoc.email,
  authority: userAuthority,
  isSystemAdmin,
  isCoordinator,
  coordinatorThreshold: AUTHORITY_TIERS.COORDINATOR,
  adminThreshold: AUTHORITY_TIERS.OPERATIONAL_ADMIN
});

// Check authorization
if (!isSystemAdmin && !isCoordinator) {
  console.log(`[createImmediateEvent] DENIED - Insufficient authority (${userAuthority} < ${AUTHORITY_TIERS.COORDINATOR})`, {
    creatorId: userDoc._id,
    requestedCoordinator: body.coordinator_id
  });
  return res.status(403).json({
    success: false,
    message: `Insufficient authority (${userAuthority} < ${AUTHORITY_TIERS.COORDINATOR}) to create events`
  });
}

// LOCK: Non-admin coordinators cannot change coordinator field
if (!isSystemAdmin && isCoordinator) {
  console.log(`[createImmediateEvent] LOCK applied - Coordinator (authority ${userAuthority}) restricted to self`, {
    creatorId: userDoc._id,
    requestedCoordinator: body.coordinator_id,
    actualCoordinator: creatorId
  });
  eventData.coordinator_id = creatorId; // Lock to self
} else if (isSystemAdmin) {
  console.log(`[createImmediateEvent] UNLOCK - System Admin (authority ${userAuthority}) can select any coordinator`, {
    creatorId: userDoc._id,
    selectedCoordinator: body.coordinator_id
  });
}

// RESTRICT: Coordinators can only select stakeholders within their jurisdiction
if (!isSystemAdmin && isCoordinator && body.stakeholder_id) {
  // OPTIMIZATION: Flatten denormalized fields ONCE (avoid repeated .flatMap() calls)
  // Get coordinator's coverage areas and organizations
  const municipalityIds = userDoc.coverageAreas
    .flatMap(ca => ca.municipalityIds || [])
    .filter(Boolean);
  const organizationIds = userDoc.organizations
    .map(org => org.organizationId)
    .filter(Boolean);

  // Convert to Set for O(1) membership checking (but keep arrays for MongoDB $in queries)
  const municipalityIdSet = new Set(municipalityIds);
  const organizationIdSet = new Set(organizationIds);

  console.log(`[createImmediateEvent] RESTRICTION applied - Stakeholder selection scoped to coordinator jurisdiction`, {
    coordinatorId: creatorId,
    requestedStakeholder: body.stakeholder_id,
    coverageAreas: userDoc.coverageAreas.length,
    municipalities: municipalityIds.length,
    municipalities_unique: municipalityIdSet.size,
    organizations: organizationIds.length,
    organizations_unique: organizationIdSet.size,
    optimization: 'Flattened once, Sets created for validation lookups'
  });

  // Note: Stakeholder validation will happen in service layer
  // Store coverage context in eventData for service to use
  eventData._coordinatorMunicipalityIds = municipalityIds;
  eventData._coordinatorMunicipalityIdSet = municipalityIdSet;  // Set for O(1) lookups
  eventData._coordinatorOrganizationIds = organizationIds;
  eventData._coordinatorOrganizationIdSet = organizationIdSet;   // Set for O(1) lookups
} else if (body.stakeholder_id && isSystemAdmin) {
  console.log(`[createImmediateEvent] NO RESTRICTION - System Admin can select any stakeholder`, {
    creatorId: userDoc._id,
    selectedStakeholder: body.stakeholder_id
  });
}
```

---

## Service-Layer Validation (Already Complete, Verified)

### File: src/services/request_services/eventRequest.service.js

**Location**: Lines 1587-1700 (createImmediateEvent method)

Already implements:
- Authority-based coordinator assignment
- Stakeholder scope validation with pre-computed Sets
- Error handling for out-of-scope assignments
- Performance optimization using Sets for O(1) membership checking

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Files Modified | 3 |
| Code Blocks Replaced | 3 |
| Code Blocks Added | 1 |
| Lines Added | ~200 |
| Deprecations | 1 (`_normalizeRole()`) |
| New Methods | 1 (`_roleToAuthority()`) |
| Enhanced Methods | 2 (`_buildActorSnapshot()`, pre-save hooks) |
| Backward Compatibility | 100% Maintained |

---

## Verification Commands

To verify changes were applied correctly, run:

```bash
# Verify User model changes
grep -n "authority_changed" src/models/users_models/user.model.js

# Verify eventRequest.service.js changes
grep -n "@deprecated" src/services/request_services/eventRequest.service.js
grep -n "_roleToAuthority" src/services/request_services/eventRequest.service.js
grep -n "user.authority" src/services/request_services/eventRequest.service.js

# Verify controller changes
grep -n "AUTHORITY_TIERS" src/controller/request_controller/eventRequest.controller.js
grep -n "LOCK applied" src/controller/request_controller/eventRequest.controller.js
```

All modifications preserve backward compatibility while adding new authority-based features.
