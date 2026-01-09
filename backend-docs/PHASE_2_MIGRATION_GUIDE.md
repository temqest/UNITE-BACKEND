# Phase 2 Migration Guide - From Role-Specific to Unified Endpoints

**Status**: ✅ IMPLEMENTATION COMPLETE  
**Date**: 2025  
**Target Audience**: Frontend developers migrating to new unified endpoints

---

## Quick Summary

**Old Approach (Role-Specific)**:
- Different endpoints for coordinator vs. stakeholder (`/coordinator-action`, `/stakeholder-action`)
- Frontend logic needed to determine which endpoint to call
- No unified error handling

**New Approach (Unified)**:
- Single endpoint for all actors (`/review-decision`, `/confirm`, `/events`)
- Server handles authority validation and permission checking
- Consistent error responses with reason codes

**Breaking Changes**: NONE - Old endpoints still work during transition period

---

## Migration Checklist

### For Frontend Developers

- [ ] Review [PHASE_2_API_REFERENCE.md](PHASE_2_API_REFERENCE.md) for all new endpoint specs
- [ ] Update request review logic to use POST `/api/requests/{id}/review-decision`
- [ ] Update request confirmation logic to use POST `/api/requests/{id}/confirm`
- [ ] Update event creation to use POST `/api/events`
- [ ] Update event publishing to use POST `/api/events/{id}/publish`
- [ ] Handle new error response format (with `reason` codes)
- [ ] Test with both new and legacy endpoints during transition
- [ ] Remove all references to role-specific endpoints in production

---

## Detailed Migration Steps

### 1. Review Decision Endpoint Migration

**Old Code (Role-Specific)**:
```javascript
// Coordinator review
async function reviewRequest(requestId, decision, notes) {
  const response = await fetch(`/api/requests/${requestId}/coordinator-action`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      action: decision, // 'accept' or 'reject'
      notes
    })
  });
  return response.json();
}

// Stakeholder review (slightly different endpoint)
async function stakeholderReview(requestId, decision, notes) {
  const response = await fetch(`/api/requests/${requestId}/stakeholder-action`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      action: decision,
      notes
    })
  });
  return response.json();
}
```

**New Code (Unified)**:
```javascript
// Single endpoint for all actors
async function reviewRequest(requestId, action, notes, rescheduleDate = null) {
  const payload = { action, notes };
  
  // Add reschedule details if rescheduling
  if (action === 'reschedule' && rescheduleDate) {
    payload.proposedDate = rescheduleDate;
  }
  
  const response = await fetch(`/api/requests/${requestId}/review-decision`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  
  return response.json();
}
```

**Error Handling (New Format)**:
```javascript
async function reviewRequest(requestId, action, notes) {
  const response = await fetch(`/api/requests/${requestId}/review-decision`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action, notes })
  });
  
  const result = await response.json();
  
  if (!response.ok) {
    // Handle new error format with reason codes
    switch (result.reason) {
      case 'INSUFFICIENT_PERMISSION':
        showError(`You don't have permission to ${action} requests`);
        break;
      case 'AUTHORITY_INSUFFICIENT':
        showError(`Cannot ${action} request from higher-authority user`);
        break;
      default:
        showError(result.message);
    }
    return null;
  }
  
  return result.data;
}
```

**Payload Changes**:
| Parameter | Old | New | Notes |
|-----------|-----|-----|-------|
| Endpoint | `/coordinator-action`, `/stakeholder-action` | `/review-decision` | Unified |
| action | 'accept', 'reject' | 'accept', 'reject', 'reschedule' | Added reschedule |
| notes | optional | optional | Same |
| proposedDate | N/A | required if action='reschedule' | NEW |
| proposedStartTime | N/A | optional | NEW |

---

### 2. Confirmation Endpoint Migration

**Old Code (Role-Specific)**:
```javascript
// Coordinator confirm
async function coordinatorConfirm(requestId, confirmation) {
  const response = await fetch(`/api/requests/${requestId}/coordinator-confirm`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ 
      confirmed: confirmation, 
      notes 
    })
  });
  return response.json();
}

// Stakeholder confirm (via stakeholder-action endpoint)
async function stakeholderConfirm(requestId, confirmation) {
  const response = await fetch(`/api/requests/${requestId}/stakeholder-action`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ 
      action: confirmation ? 'confirm' : 'decline',
      notes 
    })
  });
  return response.json();
}
```

**New Code (Unified)**:
```javascript
// Single confirmation endpoint
async function confirmDecision(requestId, action = 'confirm', notes = '') {
  const response = await fetch(`/api/requests/${requestId}/confirm`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ action, notes })
  });
  
  return response.json();
}
```

**Payload Changes**:
| Parameter | Old | New | Notes |
|-----------|-----|-----|-------|
| Endpoint | `/coordinator-confirm`, `/stakeholder-action` | `/confirm` | Unified |
| confirmed | boolean | action string | Changed to 'confirm', 'decline', 'revise' |
| action | N/A | 'confirm', 'decline', 'revise' | NEW |
| notes | optional | optional | Same |

**State Transitions (Updated)**:
```
OLD:
REVIEW_ACCEPTED + confirmed=true → APPROVED
REVIEW_ACCEPTED + confirmed=false → CANCELLED

NEW:
REVIEW_ACCEPTED + action='confirm' → APPROVED
REVIEW_ACCEPTED + action='decline' → CANCELLED
REVIEW_ACCEPTED + action='revise' → PENDING_REVISION (new state)
REVIEW_RESCHEDULED + action='confirm' → APPROVED
```

---

### 3. Event Creation Migration

**Old Code (Role-Specific)**:
```javascript
// Create immediate event (often called from request context)
async function createEvent(coordinatorId, stakeholderId, eventData) {
  const response = await fetch(`/api/events/direct`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      ...eventData,
      coordinatorId,
      stakeholderId
    })
  });
  return response.json();
}
```

**New Code (Unified)**:
```javascript
// Direct event creation (decoupled from request)
async function createEvent(title, location, startDate, category, { coordinatorId, stakeholderId, endDate } = {}) {
  const payload = {
    title,
    location,
    startDate,
    category,
    ...(coordinatorId && { coordinatorId }),
    ...(stakeholderId && { stakeholderId }),
    ...(endDate && { endDate })
  };
  
  const response = await fetch(`/api/events`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  
  return response.json();
}
```

**Behavior Changes**:
| Aspect | Old | New | Notes |
|--------|-----|-----|-------|
| Endpoint | `/events/direct` | `/events` | Simplified path |
| Field Locking | Implicit | Explicit | Non-admins auto-locked to self as coordinator |
| Stakeholder Scope | No validation | Validated | Non-admins restricted to same jurisdiction |
| Permission | `event.create` + `event.approve` | `event.create` | Simplified |

**Authorization Changes**:
```javascript
// Old (implicit admin check)
if (isCoordinator) {
  // Can set any coordinator and stakeholder
}

// New (explicit authority-based)
if (authority >= 80) { // Admin
  // Can set any coordinator and stakeholder
} else { // Non-admin (coordinators, stakeholders)
  coordinatorId = myUserId; // FORCED
  // stakeholderId must be in my jurisdiction
}
```

---

### 4. Event Publishing Migration

**Old Code**:
```javascript
// Event completion was often done via approval workflow
async function completeEvent(eventId) {
  const response = await fetch(`/api/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ status: 'Completed' })
  });
  return response.json();
}
```

**New Code**:
```javascript
// Explicit publish endpoint
async function publishEvent(eventId) {
  const response = await fetch(`/api/events/${eventId}/publish`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({})
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('Event published, linked request status:', result.data.linkedRequest?.Status);
  }
  
  return result;
}
```

**Behavior Changes**:
| Aspect | Old | New | Notes |
|--------|-----|-----|-------|
| HTTP Method | PATCH | POST | Action-specific |
| Permission | Implicit | `event.publish` OR `request.approve` | Explicit |
| Linked Request Update | Manual | Automatic | Server auto-updates linked request |
| Audit Log | Optional | Automatic | Server logs all publishes |

---

## Transition Timeline

**Phase 2A (Now)**: New endpoints available, old endpoints still work
```
POST /api/requests/{id}/review-decision ← NEW
POST /api/requests/{id}/coordinator-action ← OLD (deprecated but functional)
```

**Phase 3 (Future)**: Old endpoints removed
```
// These will be deleted
POST /api/requests/{id}/coordinator-action
POST /api/requests/{id}/stakeholder-action
POST /api/events/direct
```

---

## Testing Checklist

### Unit Tests
- [ ] reviewDecision() with valid action and notes
- [ ] reviewDecision() with reschedule including proposedDate
- [ ] reviewDecision() with invalid action (400)
- [ ] reviewDecision() with insufficient permission (403)
- [ ] reviewDecision() with authority too low (403)
- [ ] confirmDecision() with requester identity check
- [ ] confirmDecision() with invalid state
- [ ] createEvent() with admin creating for others
- [ ] createEvent() with non-admin locked to self
- [ ] createEvent() with out-of-scope stakeholder (400)
- [ ] publishEvent() with valid event
- [ ] publishEvent() with incomplete event (400)

### Integration Tests
- [ ] Complete workflow: create → review → confirm → event → publish
- [ ] Reschedule workflow: create → reschedule → confirm → event
- [ ] Direct event creation by admin
- [ ] Permission denial scenarios for each endpoint

### Backward Compatibility Tests
- [ ] Old endpoint still works: POST /api/requests/{id}/coordinator-action
- [ ] Old endpoint still works: POST /api/requests/{id}/stakeholder-action
- [ ] Response format compatible with legacy client code

---

## Common Pitfalls

### ❌ Pitfall 1: Forgetting proposedDate for Reschedule

```javascript
// WRONG - will fail with 400
await fetch(`/api/requests/${id}/review-decision`, {
  body: JSON.stringify({ action: 'reschedule', notes: 'Reschedule please' })
});

// CORRECT
await fetch(`/api/requests/${id}/review-decision`, {
  body: JSON.stringify({ 
    action: 'reschedule',
    proposedDate: '2025-07-01',
    notes: 'Reschedule to July'
  })
});
```

### ❌ Pitfall 2: Ignoring Authority Checks

```javascript
// WRONG - higher authority user cannot review lower authority's request
// Will get 403 AUTHORITY_INSUFFICIENT

// Check user authority first
if (requester.authority > reviewer.authority) {
  showError('Cannot review request from higher authority');
  return;
}
```

### ❌ Pitfall 3: Non-Admin Overriding Coordinator

```javascript
// WRONG - non-admin trying to set coordinator to someone else
// Coordinator will be overridden to req.user.id

const response = await fetch(`/api/events`, {
  body: JSON.stringify({
    title: 'Event',
    coordinatorId: 'SOMEONE_ELSE_ID' // Ignored for non-admins
  })
});
// Result: coordinatorId = req.user.id (forced)

// CORRECT - only admins can set coordinator
if (user.authority >= 80) {
  // Can set coordinatorId freely
}
```

### ❌ Pitfall 4: Not Handling New Error Codes

```javascript
// OLD - only checking HTTP status
if (!response.ok) {
  showError('Request failed');
}

// NEW - check reason codes
if (!response.ok) {
  const { reason, message } = result;
  if (reason === 'AUTHORITY_INSUFFICIENT') {
    showError('Your authority level is too low');
  } else if (reason === 'INSUFFICIENT_PERMISSION') {
    showError('You lack required permission');
  } else {
    showError(message);
  }
}
```

---

## FAQ

**Q: Do I have to migrate immediately?**  
A: No, both old and new endpoints will work during Phase 2. Migration to new endpoints is recommended but optional until Phase 3.

**Q: What if I'm using old endpoints in production?**  
A: They'll continue working. Start planning migration to new endpoints for Phase 3.

**Q: Can I mix old and new endpoints?**  
A: Yes, during Phase 2 transition. However, new features only support new endpoints.

**Q: What's the difference between /confirm and /review-decision?**  
A: `/review-decision` is for reviewers (coordinator, admin) deciding on requests. `/confirm` is for requesters confirming reviewer decisions.

**Q: How do I know if I have required permission?**  
A: Frontend should check `user.permissions` array. Backend validates and returns 403 INSUFFICIENT_PERMISSION if lacking.

**Q: What if event is missing required fields for publishing?**  
A: Server returns 400 EVENT_INCOMPLETE with `missingFields` array showing which fields are required.

**Q: Can non-admins change event details?**  
A: Not via createEvent() - fields are locked based on authority. Use `/update` endpoints if they become available.

---

## Support

For issues or questions:
1. Check [PHASE_2_API_REFERENCE.md](PHASE_2_API_REFERENCE.md) for endpoint specs
2. Review example workflows in API reference
3. Check backward compatibility section if using old endpoints
4. Refer to error code reference for debugging

