# Permission-Based Reschedule Workflow - Quick Reference

## 🎯 Core Concept

**Stop using role names. Start using permission codes.**

| Old Way (❌) | New Way (✅) |
|-------------|------------|
| `if (user.role === 'Coordinator')` | `if (authority >= AUTHORITY_TIERS.COORDINATOR)` |
| `if (roleSnapshot === 'stakeholder')` | `if (await isRequester(userId, context))` |
| `assignmentRule === 'stakeholder-to-coordinator'` | `if (proposerAuthority >= 60 && requesterId)` |

---

## 🔑 Permission Groups

### Requesters (Creators)
- **Permissions**: `request.create`, `request.initiate`
- **Typical Authority**: 30 (Stakeholder)
- **Workflow Role**: Initiates requests, responds to reschedule proposals

### Reviewers (Approvers)
- **Permissions**: `request.review`, `request.approve`
- **Typical Authority**: 60 (Coordinator), 80 (Admin)
- **Workflow Role**: Reviews requests, proposes reschedules

---

## 🔄 Reschedule Loop Logic

```
┌─────────────────────────────────────────────────────┐
│  WHO LAST ACTED?                                    │
├─────────────────────────────────────────────────────┤
│  Authority < 60 (Requester)  →  Next: Reviewer      │
│  Authority ≥ 60 (Reviewer)   →  Next: Requester     │
└─────────────────────────────────────────────────────┘
```

### Decision Tree

```javascript
if (actorId === requesterId) {
  // Requester rescheduled → Reviewer responds next
  activeResponder = reviewer;
} else if (actorAuthority >= AUTHORITY_TIERS.COORDINATOR) {
  // Reviewer (coordinator/admin) rescheduled → Requester responds next
  activeResponder = requester;
} else {
  // Fallback: Route to requester
  activeResponder = requester;
}
```

---

## 📦 New Service: `PermissionBasedRescheduleService`

### Key Methods

```javascript
// Check if user is a requester (has request.create)
await PermissionBasedRescheduleService.isRequester(userId, context);
// Returns: boolean

// Check if user is a reviewer (has request.review or request.approve)
await PermissionBasedRescheduleService.isReviewer(userId, context);
// Returns: boolean

// Get user's workflow role
await PermissionBasedRescheduleService.getUserWorkflowRole(userId, context);
// Returns: 'requester' | 'reviewer' | 'both' | null

// Check if user can participate in loop
await PermissionBasedRescheduleService.canParticipateInRescheduleLoop(userId, request);
// Returns: { canParticipate: boolean, reason?: string, workflowRole?: string }

// Determine next responder
await PermissionBasedRescheduleService.determineNextResponder(request, lastActorId, context);
// Returns: { userId: ObjectId, relationship: string, authority: number }
```

---

## 🏗️ Authority Levels as Permission Proxy

| Authority | Typical Role | Permissions | Workflow Role |
|-----------|--------------|-------------|---------------|
| 100 | System Admin | `*.*` (all) | Reviewer |
| 80 | Operational Admin | `request.review`, `request.approve` | Reviewer |
| 60 | Coordinator | `request.review`, `request.approve` | Reviewer |
| 30 | Stakeholder | `request.create`, `request.initiate` | Requester |
| 20 | Basic User | Minimal | None |

**Why authority?** It's a cached snapshot of permission level, avoiding expensive queries.

---

## 🧪 Testing Checklist

- [ ] **Basic Loop**: Stakeholder creates → Coordinator reschedules → Stakeholder reschedules → Coordinator accepts
- [ ] **Admin Participation**: Admin reschedules coordinator-to-admin request → Coordinator responds
- [ ] **Valid Coordinators**: Non-assigned coordinator reschedules → Stakeholder responds
- [ ] **Role Rename**: Rename "Coordinator" to "Event Manager" → Workflow still works
- [ ] **Custom Role**: Create "Mobile Unit Lead" with `request.review` → Can participate in loop
- [ ] **Self-Review Prevention**: Coordinator reschedules twice in a row → Blocked

---

## 🐛 Common Issues

### Issue 1: Active Responder Not Updating
**Cause**: `authoritySnapshot` not set  
**Fix**: Ensure `actor.authority` is captured when creating reschedule proposal

### Issue 2: Admin Can't Reschedule
**Cause**: Admin authority < 80  
**Fix**: Set `user.authority = 80` in User document

### Issue 3: Loop Stuck on One User
**Cause**: `lastAction.actorId` not being updated  
**Fix**: Call `RequestStateService.updateActiveResponder()` after every action

---

## 📝 Code Examples

### Creating a Reschedule Proposal (Permission-Based)

```javascript
// ✅ CORRECT (Permission-based)
const actor = await User.findById(userId).select('name authority').lean();
request.rescheduleProposal = {
  proposedDate: newDate,
  proposedBy: {
    userId: userId,
    authoritySnapshot: actor.authority || AUTHORITY_TIERS.BASIC_USER, // KEY!
    roleSnapshot: 'deprecated-field' // Optional, for backward compat
  }
};

// Update active responder using authority
RequestStateService.updateActiveResponder(
  request, 
  REQUEST_ACTIONS.RESCHEDULE, 
  userId,
  { 
    actorAuthority: actor.authority, // Pass authority
    requesterId: request.requester.userId.toString(),
    reviewerId: request.reviewer?.userId?.toString()
  }
);
```

### Checking Who Can Respond (Permission-Based)

```javascript
// ✅ CORRECT (Permission-based)
const activeResponder = RequestStateService.getActiveResponder(request);
if (!activeResponder) {
  // Final state, no one can respond
  return { valid: false, reason: 'Request is in final state' };
}

// Check if current user is the active responder
const userIdStr = userId.toString();
const responderIdStr = activeResponder.userId.toString();

if (userIdStr === responderIdStr) {
  // User is active responder
  return { valid: true };
}

// Special case: If relationship is 'reviewer', ANY qualified reviewer can respond
// (e.g., admins as secondary reviewers)
if (activeResponder.relationship === 'reviewer') {
  const userAuthority = await PermissionBasedRescheduleService.getUserAuthority(userId);
  if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
    // Check that user wasn't the last actor (prevent self-review)
    const lastActorId = request.lastAction?.actorId?.toString();
    if (lastActorId !== userIdStr) {
      return { valid: true };
    }
  }
}

return { valid: false, reason: 'Not active responder' };
```

---

## 🔗 Related Files

| File | Purpose |
|------|---------|
| `src/services/eventRequests_services/permissionBasedReschedule.service.js` | New helper utilities |
| `src/services/eventRequests_services/requestState.service.js` | State machine (updated) |
| `src/services/eventRequests_services/actionValidator.service.js` | Permission checks (updated) |
| `src/utils/seedRoles.js` | Default permissions per role |
| `backend-docs/PERMISSION_BASED_RESCHEDULE_IMPLEMENTATION.md` | Full documentation |

---

## 🎓 Key Principles

1. **Permissions drive behavior, not role names**
2. **Authority is a cached permission level (performance optimization)**
3. **Original requester always has `request.create` permission**
4. **Reviewers (coordinators/admins) have `request.review` or `request.approve` permission**
5. **The loop alternates based on who last acted and their authority**
6. **Self-review is prevented by checking `lastAction.actorId`**

---

## 💡 Migration Tip

**Search and replace** (for code review):
- ❌ `role === 'Coordinator'` → ✅ `authority >= 60`
- ❌ `roleSnapshot === 'stakeholder'` → ✅ `authority >= 30 && authority < 60`
- ❌ `assignmentRule === 'stakeholder-to-coordinator'` → ✅ `proposerAuthority >= 60`

**Don't forget**: Update logs and comments too!

---

**Quick Access**: [Full Implementation Doc](./PERMISSION_BASED_RESCHEDULE_IMPLEMENTATION.md)
