# Request Flow State Machine Architecture

## Overview

This document describes the refactored request flow system that uses a state machine-based architecture instead of hardcoded logic. The new system is modular, scalable, and role-aware.

## Architecture Components

### 1. State Machine Engine (`requestStateMachine.js`)

The core state machine defines:
- **States**: All possible request states (Pending Review, Approved, Rejected, etc.)
- **Actions**: All possible actions (View, Accept, Reject, Reschedule, etc.)
- **Transitions**: Rules for moving between states based on actions
- **Permissions**: Role-based action permissions for each state

### 2. Reviewer Assignment Service (`reviewerAssignment.service.js`)

Configurable reviewer assignment based on requester role:
- **SystemAdmin creates request** → Coordinator becomes reviewer
- **Coordinator creates request** → SystemAdmin becomes reviewer
- **Stakeholder creates request** → Coordinator becomes primary reviewer (Admin can override)

### 3. Integration with Existing Service

The `eventRequest.service.js` has been updated to:
- Use the state machine for action computation
- Use the reviewer assignment service for reviewer selection
- Maintain backward compatibility with legacy code paths

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

### State Transitions

```
pending-review
  ├─ accept → review-accepted
  ├─ reject → review-rejected
  └─ reschedule → review-rescheduled

review-accepted
  ├─ confirm → approved
  └─ reject → rejected

review-rescheduled
  ├─ accept → approved
  ├─ reject → rejected
  ├─ confirm → approved (requester confirms)
  └─ reschedule → review-rescheduled (loop back)

approved
  ├─ reschedule → review-rescheduled
  └─ cancel → cancelled
```

## Actions by Role and State

### Requester Actions

- **Pending**: View only
- **After reviewer decision**: Confirm, View
- **If rescheduled**: Confirm or Request Reschedule
- **Approved**: View, Edit, Manage Staff, Reschedule, Cancel
- **Rejected**: View only
- **Cancelled**: View only

### Reviewer Actions

- **Pending**: View, Accept, Reject, Reschedule
- **If reschedule returned from requester**: View, Accept, Reject, Reschedule again
- **Admin as override reviewer**: Can perform same reviewer actions optionally

## Reschedule Loop

The reschedule loop is now stable and supports infinite cycles:

1. Reviewer requests reschedule → request goes to `review-rescheduled` state
2. Requester can:
   - **Confirm** → finalize & approve (goes to `approved`)
   - **Reschedule again** → return to reviewer (stays in `review-rescheduled`)

This loop is handled by the state machine and doesn't break with role changes or multiple cycles.

## Usage Examples

### Computing Allowed Actions

```javascript
const stateMachine = new RequestStateMachine();
const allowedActions = stateMachine.getAllowedActions(
  'pending-review',
  'Coordinator',
  coordinatorId,
  request
);
// Returns: ['view', 'accept', 'reject', 'reschedule']
```

### Processing an Action

```javascript
// The service method automatically uses the state machine
await eventRequestService.processRequestAction(
  actorId,
  'Coordinator',
  requestId,
  {
    action: 'accept',
    note: 'Approved for scheduling'
  }
);
```

### Assigning a Reviewer

```javascript
const reviewer = await reviewerAssignmentService.assignReviewer(
  'Stakeholder',
  stakeholderId,
  {
    coordinatorId: coordinatorId,
    stakeholderId: stakeholderId
  }
);
```

## Backward Compatibility

The refactored system maintains full backward compatibility:

1. **Legacy states** are still supported in the model enum
2. **State normalization** converts legacy states to canonical forms
3. **Fallback logic** ensures old code paths still work if state machine fails
4. **Existing APIs** continue to work without changes

## Extending the System

### Adding a New State

1. Add state to `REQUEST_STATES` in `requestStateMachine.js`
2. Define state configuration in `STATE_TRANSITIONS`
3. Add state to model enum (for validation)
4. Update state normalization logic if needed

### Adding a New Action

1. Add action to `ACTIONS` in `requestStateMachine.js`
2. Define transitions in relevant state configurations
3. Update action processing logic in service

### Changing Reviewer Assignment Rules

1. Update `REVIEWER_ASSIGNMENT_RULES` in `requestStateMachine.js`
2. Modify `reviewerAssignment.service.js` if custom logic needed

### Adding a New Role

1. Add role to `ROLES` in `requestStateMachine.js`
2. Define permissions in `STATE_TRANSITIONS` for each state
3. Update reviewer assignment rules if needed
4. Add role to model enums

## Benefits

1. **Modularity**: Clear separation of concerns
2. **Scalability**: Easy to add new states, actions, or roles
3. **Maintainability**: Rules are centralized and easy to understand
4. **Testability**: State machine logic can be tested independently
5. **Flexibility**: Business rules can be changed without rewriting flow logic
6. **Robustness**: State transitions are validated and predictable

## Migration Notes

- Existing requests continue to work with legacy states
- New requests use canonical states
- State normalization ensures compatibility
- No database migration required (states are backward compatible)

