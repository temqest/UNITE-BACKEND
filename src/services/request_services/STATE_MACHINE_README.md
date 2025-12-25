# Request Flow State Machine Architecture

> **🔄 MAJOR UPDATE (Dec 2025)**: This system has been refactored to use a **permission-based access control model**. Role names are no longer hardcoded in business logic. All access decisions are based on permissions and authority hierarchy. See [Permission-Based Architecture](#permission-based-architecture) section below.

## Overview

This document describes the request flow system that uses a state machine-based architecture with **permission-driven access control**. The new system is modular, scalable, and uses capabilities (permissions) instead of role names to determine allowed actions.

### Key Principles

1. **Permission-First**: All access decisions based on permissions (e.g., `request.review`, `request.approve`), not role names
2. **Authority Hierarchy**: Actions validated against authority levels (reviewer authority ≥ requester authority)
3. **System Admin Override**: System admins (authority ≥ 100) can bypass authority checks with audit logging
4. **Location Scoping**: Permissions are scoped to coverage areas/locations
5. **Backend Enforcement**: Frontend action visibility is advisory only; backend always validates permissions

## Permission-Based Architecture

### Core Permissions

| Permission Code | Resource | Action | Description | Default Roles |
|----------------|----------|--------|-------------|---------------|
| `request.create` | request | create | Create new event requests | Stakeholder, Coordinator, System Admin |
| `request.read` | request | read | View requests | All roles |
| `request.review` | request | review | Review requests (accept/reject/reschedule) | Coordinator, System Admin |
| `request.approve` | request | approve | Final approval of requests | Coordinator, System Admin |
| `request.reject` | request | reject | Reject requests | Coordinator, System Admin |
| `request.reschedule` | request | reschedule | Propose reschedules | Coordinator, System Admin |
| `request.confirm` | request | confirm | Confirm reviewer decisions | Stakeholder (requester) |
| `request.cancel` | request | cancel | Cancel approved requests | Stakeholder (requester), Coordinator |
| `event.create` | event | create | Create events | Stakeholder, Coordinator, System Admin |
| `event.publish` | event | publish | Publish events to completed status | Coordinator, System Admin |
| `event.update` | event | update | Update event details | Coordinator, System Admin |

### Authority Hierarchy

Authority levels determine who can review/approve whose requests:

| Role | Authority Level | Can Review/Approve |
|------|----------------|-------------------|
| System Admin | ≥ 100 | All requests (admin override) |
| Coordinator | 60 | Stakeholder requests (authority 30) |
| Stakeholder | 30 | Cannot review (no review permission) |
| Default User | 20 | Cannot review (no review permission) |

**Validation Rule**: `reviewer.authority >= requester.authority` (unless system admin override)

### Permission Validation Flow

```
User attempts action
    ↓
1. Check Permission
   └─ Does user have required permission? (location-scoped)
       ├─ NO → 403 Forbidden
       └─ YES → Continue
    ↓
2. Check Authority Hierarchy
   └─ Is reviewer.authority >= requester.authority?
       ├─ NO → Check if System Admin (authority ≥ 100)
       │   ├─ YES → Log override, Allow
       │   └─ NO → 403 Forbidden
       └─ YES → Continue
    ↓
3. Check State Transition Validity
   └─ Is action valid for current state?
       ├─ NO → 400 Bad Request
       └─ YES → Execute action
    ↓
4. Log Audit Trail
   └─ Record: PermissionUsed, ReviewerAuthority, RequesterAuthority
```

## Architecture Components

### 1. State Machine Engine (`requestStateMachine.js`)

The core state machine defines:
- **States**: All possible request states (Pending Review, Approved, Rejected, etc.)
- **Actions**: All possible actions (View, Accept, Reject, Reschedule, etc.)
- **Transitions**: Rules for moving between states based on actions
- **Permission Validation**: Enforces permission and authority checks before transitions

**Key Methods (Permission-Based)**:
- `canPerformAction(action, currentState, userId, request, context)`: Validates permission + authority
- `validateRequestCreation(userId, context)`: Validates `request.create` permission
- `validateRequestApproval(userId, request, context)`: Validates `request.approve` + authority hierarchy

### 2. Reviewer Assignment Service (`reviewerAssignment.service.js`)

**Permission-based reviewer assignment** (no hardcoded role names):
- Queries users with `request.review` permission (location-scoped)
- Filters by authority hierarchy (reviewer.authority ≥ requester.authority)
- Applies permission priority rules for selection
- Falls back to system admin if no eligible reviewers found

**Deprecated**: Legacy role-based methods (`assignCoordinatorReviewer`, `assignSystemAdminReviewer`) - emit warnings

### 3. Event Publishing Service (`eventRequest.service.js`)

**Permission-based event publishing gates**:
- `_validateEventPublishing()`: Three-layer validation (permission + field completeness + request state)
- `_applyEventStatusTransition()`: Permission-driven event status transitions
- Requires `event.publish` OR `request.approve` permission to publish events

### 4. Audit Trail (`eventRequestHistory.model.js`)

Every action logged with:
- **PermissionUsed**: Which permission authorized the action
- **ReviewerAuthority**: Authority level of actor
- **RequesterAuthority**: Authority level of request creator
- Enables compliance reports and permission debugging

## States

### Canonical States

1. **pending-review**: Initial state when request is created
2. **review-accepted**: Reviewer has accepted the request
3. **review-rejected**: Reviewer has rejected the request
4. **review-rescheduled**: Reviewer has requested rescheduling
5. **awaiting-confirmation**: Waiting for requester confirmation
6. **approved**: Request is approved and event is published
7. **rejected**: Request is finally rejected
8. **cancelled**: Request was cancelled
9. **closed**: Request is closed (deleted)

## State Transitions with Permission Requirements

### State Flow Diagram

```
pending-review (REQUEST_REVIEW permission required)
  ├─ accept → review-accepted (reviewer has request.review)
  ├─ reject → review-rejected (reviewer has request.reject)
  └─ reschedule → review-rescheduled (reviewer has request.reschedule)

review-accepted (REQUEST_APPROVE permission required)
  ├─ confirm → approved (coordinator/admin has request.approve)
  └─ reject → rejected (coordinator/admin has request.reject)

review-rescheduled (REQUEST_CONFIRM or REQUEST_REVIEW permission)
  ├─ accept → approved (reviewer has request.review)
  ├─ reject → rejected (reviewer has request.reject)
  ├─ confirm → approved (requester has request.confirm)
  └─ reschedule → review-rescheduled (requester/reviewer has request.reschedule)

approved (EVENT_PUBLISH permission required for publishing)
  ├─ publish → event Status='Completed' (user has event.publish)
  ├─ reschedule → review-rescheduled (user has request.reschedule)
  └─ cancel → cancelled (user has request.cancel)
```

### Permission Requirements by Action

| Action | Required Permission(s) | Authority Check | Notes |
|--------|----------------------|----------------|-------|
| **create** | `request.create` | Creator authority set | Initial request creation |
| **accept** | `request.review` | reviewer.authority ≥ requester.authority | Reviewer accepts request |
| **reject** | `request.reject` | reviewer.authority ≥ requester.authority | Reviewer rejects request |
| **reschedule** | `request.reschedule` | reviewer.authority ≥ requester.authority | Reviewer proposes new date |
| **confirm** | `request.confirm` | requester only (self-action) | Requester confirms decision |
| **approve** | `request.approve` | reviewer.authority ≥ requester.authority | Final approval (if multi-stage) |
| **publish** | `event.publish` OR `request.approve` | Event field completeness + request approved | Publish event to public |
| **cancel** | `request.cancel` | requester or admin | Cancel approved request |

## Actions by Permission (Not Role!)

> **⚠️ DEPRECATED**: The old "Actions by Role" sections below are deprecated. Use permission-based approach instead.

### Permission-Based Action Computation

The system dynamically computes allowed actions based on **what the user is permitted to do**, not their role name.

**Example**: A custom "Regional Coordinator" role with `request.review` permission can review requests, even though the role name is not "Coordinator".

### Typical Action Patterns

#### For Request Creator (has `request.confirm`)
- **Pending Review**: View only (waiting for reviewer)
- **Review Decision Received**: Confirm or View
- **Approved**: View, Edit (if has `event.update`), Manage Staff, Reschedule, Cancel
- **Rejected/Cancelled**: View only

#### For Reviewer (has `request.review`)
- **Pending Review**: View, Accept, Reject, Reschedule (if authority ≥ requester)
- **Reschedule Loop**: View, Accept, Reject, Reschedule again
- **Admin Override**: System admin can review regardless of authority

#### For Publisher (has `event.publish`)
- **Approved Request**: Can publish event to Status='Completed' if all fields complete

### Dynamic Action Visibility

Frontend receives `allowedActions` array from backend:
```javascript
GET /api/requests/:id/allowed-actions
{
  "allowedActions": ["view", "accept", "reject", "reschedule"],
  "computedBy": "permission-based",
  "userPermissions": ["request.review", "request.approve"],
  "userAuthority": 60,
  "requesterAuthority": 30
}
```

Frontend uses this to show/hide UI buttons. **Backend always validates permissions independently.**

## Reschedule Loop

The reschedule loop is now stable and supports infinite cycles:

1. Reviewer requests reschedule → request goes to `review-rescheduled` state
2. Requester can:
   - **Confirm** → finalize & approve (goes to `approved`)
   - **Reschedule again** → return to reviewer (stays in `review-rescheduled`)

This loop is handled by the state machine and doesn't break with role changes or multiple cycles.

## Usage Examples

### Computing Allowed Actions (Permission-Based)

```javascript
const stateMachine = new RequestStateMachine();

// NEW: Permission-based (recommended)
const allowed = await stateMachine.canPerformAction(
  'accept',
  request.Status,
  userId,
  request,
  { locationId: request.location.district }
);
// Returns: { allowed: true/false, reason: string }
// Validates: permission + authority hierarchy + state transition validity

// Get all allowed actions for user
const service = new EventRequestService();
const actions = await service.computeAllowedActions(userId, request);
// Returns: ['view', 'accept', 'reject', 'reschedule']
// Computed based on user's permissions, not role name
```

### Processing an Action (Permission-Validated)

```javascript
// The service method automatically validates permissions + authority
await eventRequestService.processRequestActionWithStateMachine(
  actorId,
  'Coordinator', // Role for logging/audit only, NOT for access control
  requestId,
  {
    action: 'accept',
    note: 'Approved for scheduling'
  }
);
// Backend validates:
// 1. User has request.review permission (location-scoped)
// 2. User authority >= requester authority
// 3. Action valid for current state
// 4. Logs: PermissionUsed='request.review', authorities
```

### Assigning a Reviewer (Permission-Based)

```javascript
// NEW: Permission-based reviewer assignment
const reviewer = await reviewerAssignmentService.assignReviewer(
  requesterId,      // Creator's user ID
  requestType,      // 'event', 'advocacy', etc.
  {
    locationId: districtId,
    requestId: request.Request_ID
  }
);
// Finds users with request.review permission
// Filters by authority: reviewer.authority >= requester.authority
// Returns: { id, name, email, role, authority }
```

### Validating Event Publishing

```javascript
// Check if user can publish event
const publishCheck = await eventRequestService._validateEventPublishing(
  request,
  event,
  userId,
  'Coordinator',  // For logging
  { locationId: districtId }
);
// Returns: {
//   canPublish: true/false,
//   reason: string,
//   suggestedStatus: 'Completed' | 'Pending'
// }
// Validates: event.publish permission + field completeness + request approved
```

## System Admin Override Rules

System admins (authority ≥ 100) have special override capabilities:

### Override Scenarios

1. **Authority Mismatch**: Can review/approve requests from users with higher authority
   - Example: System Admin (authority 100) reviews Coordinator request (authority 60)
   - **Logged**: `[PERMISSION] Admin override: reviewer authority (100) < requester authority (60)`

2. **Emergency Actions**: Can perform actions regardless of typical permission scoping
   - Still requires base permission (e.g., `request.review`)
   - Authority check bypassed

3. **Audit Trail**: All overrides logged with full context
   - Permission used
   - Both authority levels
   - Override reason

### Override Validation Flow

```javascript
if (reviewer.authority < requester.authority) {
  // Authority hierarchy violated
  
  if (reviewer.authority >= 100) {
    // System admin override
    console.log('[PERMISSION] Admin override: ...');
    return { allowed: true, reason: 'admin-override' };
  } else {
    // Not authorized
    return { allowed: false, reason: 'authority-hierarchy-violation' };
  }
}
```

### When Overrides Are NOT Allowed

System admins still require the base permission. Override only bypasses authority checks, not permission checks.

**Example**:
- ✅ Admin with `request.review` can review higher-authority user's request
- ❌ Admin without `request.review` cannot review any request (missing permission)

## Extending the System

### Adding a New Permission

1. **Define permission** in `src/utils/seedRoles.js`:
   ```javascript
   { code: 'request.escalate', name: 'Escalate Request', 
     resource: 'request', action: 'escalate', 
     description: 'Escalate request to higher authority' }
   ```

2. **Assign to roles** in `defaultRoles`:
   ```javascript
   { resource: 'request', actions: ['review', 'approve', 'escalate'] }
   ```

3. **Add validation** in state machine:
   ```javascript
   // In canPerformAction() or new method
   const hasPermission = await permissionService.checkPermission(
     userId, 'request', 'escalate', context
   );
   ```

4. **Run seed**: `node src/utils/seedRoles.js`

### Adding a New State

1. Add state to `REQUEST_STATES` in `requestStateMachine.js`
2. Define state configuration in `STATE_TRANSITIONS`
3. Add state to model enum (for validation)
4. Update state normalization logic if needed
5. **Document permission requirements** for the new state

### Adding a New Action

1. Add action to `ACTIONS` in `requestStateMachine.js`
2. Define transitions in relevant state configurations
3. **Define required permission** for the action
4. Update action processing logic in service
5. Update `_computeAllowedActionsPermissionBased()` if needed

### Changing Reviewer Assignment Rules

> **⚠️ USE PERMISSIONS, NOT ROLES**

1. **Define new permission** (e.g., `request.review.priority`)
2. **Update** `reviewerAssignment.service.js` to query by new permission
3. **Modify sorting logic** in `_applyAssignmentRules()` for priority
4. DO NOT add hardcoded role name checks

### Adding a New Role

> **✅ PERMISSION-BASED ROLES**

1. **Create role** in `seedRoles.js`:
   ```javascript
   {
     code: 'regional-coordinator',
     name: 'Regional Coordinator',
     description: 'Coordinates events across multiple districts',
     authority: 70, // Higher than coordinator (60)
     permissions: [
       { resource: 'request', actions: ['review', 'approve'] },
       { resource: 'event', actions: ['publish', 'update'] }
     ]
   }
   ```

2. **No code changes needed** - system automatically uses permissions
3. **Run seed**: `node src/utils/seedRoles.js`
4. **Test**: User with this role can now review/approve based on permissions

## Benefits of Permission-Based Architecture

1. **Flexibility**: Create new roles instantly without code changes
   - Example: Add "District Manager" role with `request.review` permission → immediately works

2. **Security**: Multi-layer validation (permission + authority + state)
   - Backend always validates, never trusts frontend claims
   - Authority hierarchy prevents privilege escalation

3. **Scalability**: Supports complex organizational structures
   - Regional coordinators, district managers, deputy admins
   - Location-scoped permissions for multi-region deployments

4. **Auditability**: Full audit trail of permission usage
   - Track which permission authorized each action
   - Compare authority levels for compliance
   - Debug permission issues with detailed logs

5. **Maintainability**: Business logic separate from access control
   - Change permissions without touching workflow code
   - Reduce hardcoded conditionals (e.g., `if role === 'coordinator'`)

6. **Testability**: Permission checks isolated and testable
   - Mock permission service for unit tests
   - Test authority hierarchy independently

7. **Delegation**: Support for permission-based delegation
   - Delegate review permission to specific users
   - Temporary permission grants for coverage

## Backward Compatibility & Migration

### Legacy Support

The refactored system maintains full backward compatibility:

1. **Legacy states** still supported in model enum
2. **State normalization** converts legacy states to canonical forms
3. **Fallback logic** ensures old code paths work if permission check fails
4. **Existing APIs** continue to work without changes
5. **Role-based code** still functional but deprecated with warnings

### Migration Path

**Phase 1** (✅ Complete): Permission infrastructure added
- Permission service integration
- Authority hierarchy validation
- Audit trail enhancement

**Phase 2** (✅ Complete): Backend enforcement
- State machine validates permissions
- Reviewer assignment uses permissions
- Event publishing uses permission gates

**Phase 3** (Pending): Frontend updates
- Dynamic action visibility from backend
- Remove hardcoded role checks in UI
- Use `allowedActions` array for button visibility

**Phase 4** (Future): Deprecation cleanup
- Remove legacy role-based fallback code
- Migrate old audit entries to new schema
- Full permission-only enforcement

### Deprecated Features

> **⚠️ DEPRECATED - DO NOT USE IN NEW CODE**

- ❌ Hardcoded role checks: `if (user.role === 'coordinator')`
- ❌ Role-based reviewer assignment: `assignCoordinatorReviewer()`
- ❌ Role-specific action logic: `if (role === 'admin') { allow() }`
- ❌ Direct role name comparisons in business logic

**Instead, use**:
- ✅ Permission checks: `permissionService.checkPermission(userId, 'request', 'review')`
- ✅ Permission-based assignment: `assignReviewer()` with permission filtering
- ✅ Permission-driven actions: `canPerformAction()` with authority validation

## Troubleshooting

### Common Issues

#### "Permission denied" errors

**Symptom**: User gets 403 Forbidden when trying to perform action

**Diagnosis**:
1. Check user has required permission: Query `User.roles[].permissions[]`
2. Check location scoping: Permission must match request's location
3. Check authority hierarchy: `reviewer.authority >= requester.authority`
4. Check audit logs: Look for `[PERMISSION]` log entries

**Solution**:
- Grant missing permission via role update in `seedRoles.js`
- Verify user's coverage areas include request location
- Check if authority level needs adjustment

#### "Action not allowed in current state"

**Symptom**: Valid permission but action rejected

**Diagnosis**:
1. Check current request state: `request.Status`
2. Check valid transitions: Review state machine `STATE_TRANSITIONS`
3. Check state normalization: Legacy state may not map correctly

**Solution**:
- Verify action is valid for current state
- Check if state transition definition needs update
- Review state normalization logic

#### Reviewer not assigned automatically

**Symptom**: Request created but no reviewer assigned

**Diagnosis**:
1. Check if users exist with `request.review` permission
2. Check authority levels: Need reviewer with `authority >= requester.authority`
3. Check location scope: Reviewer must have coverage for request location

**Solution**:
- Grant `request.review` permission to coordinator role
- Verify coordinator has coverage area matching request location
- Check authority hierarchy configuration

#### Event not publishing after approval

**Symptom**: Request approved but event Status stays 'Pending'

**Diagnosis**:
1. Check if user has `event.publish` or `request.approve` permission
2. Check event field completeness: All required fields present?
3. Check request approval state: Request must be in approved status

**Solution**:
- Grant `event.publish` permission to coordinator role
- Complete missing event fields (Title, Location, Start_Date, Email, Phone, Category)
- Verify request status is 'approved' or 'review-accepted'

## FAQ

**Q: Can I create a custom role without modifying code?**  
A: Yes! Define the role in `seedRoles.js` with desired permissions and authority level. Run `node src/utils/seedRoles.js` and the system immediately recognizes it.

**Q: What happens if I change a user's authority level?**  
A: Authority changes take effect immediately. Previous actions remain valid (logged with old authority). New actions use new authority for validation.

**Q: Can I temporarily grant a permission to a user?**  
A: Yes, via UserRole relationship. Add a role with expiration or create a temporary role with specific permissions.

**Q: How do I audit who approved what?**  
A: Query `EventRequestHistory` with Action='review-decision' or Action='finalized'. Check `PermissionUsed`, `ReviewerAuthority`, and `RequesterAuthority` fields.

**Q: Can stakeholders review requests?**  
A: Only if granted `request.review` permission. By default, stakeholders only have `request.create` and `request.confirm` permissions.

**Q: What if multiple coordinators have `request.review` permission?**  
A: The system selects one based on permission priority and least privilege (lowest qualifying authority). See `_applyAssignmentRules()` in `reviewerAssignment.service.js`.

**Q: Can I override the reviewer assignment?**  
A: Yes, if you have `request.review` permission and authority >= requester authority. Use `overrideReviewer()` method. System admin can always override.

**Q: How do I add a new action like "escalate"?**  
A: (1) Define permission `request.escalate` in `seedRoles.js`, (2) Add action to state machine `ACTIONS`, (3) Define transitions, (4) Update action processing logic. See [Extending the System](#extending-the-system).

## Related Documentation

- **Permission Service**: `src/services/users_services/permission.service.js`
- **Role Seeding**: `src/utils/seedRoles.js`
- **State Machine**: `src/services/request_services/requestStateMachine.js`
- **Reviewer Assignment**: `src/services/request_services/reviewerAssignment.service.js`
- **Event Publishing**: `src/services/request_services/eventRequest.service.js` (see `_validateEventPublishing()`)
- **Audit Model**: `src/models/request_models/eventRequestHistory.model.js`
- **Backend API Docs**: `frontend-instruction/API_REQUESTS.md`

---

**Last Updated**: December 2025  
**Architecture Version**: Permission-Based v2.0  
**Migration Status**: Phase 2 Complete (Backend Enforcement)

