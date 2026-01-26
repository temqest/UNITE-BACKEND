# Reschedule Loop Test Scenarios

## Overview
After the latest changes, the reschedule workflow now supports full negotiation loops between stakeholders, coordinators (assigned + valid), and admins.

## Changes Made

### 1. Valid Coordinator Access in REVIEW_RESCHEDULED State
- **File**: `src/services/eventRequests_services/actionValidator.service.js`
- **Change**: Extended valid coordinator check to include `REVIEW_RESCHEDULED` state (was only `PENDING_REVIEW`)
- **Impact**: Valid coordinators can now participate in reschedule negotiation loops, not just initial review

### 2. Admin Secondary Reviewer in Reschedule Loops
- **File**: `src/services/eventRequests_services/actionValidator.service.js`
- **Change**: Added `manual` assignment and `roleSnapshot` checks to S→C flow detection
- **Impact**: Admins can participate as secondary reviewers in reschedule loops for S→C requests

### 3. Active Responder Loop Logic
- **File**: `src/services/eventRequests_services/requestState.service.js`
- **Changes**:
  - Enhanced S→C flow detection with `manual` assignment and `roleSnapshot` checks
  - Improved fallback logic to route valid coordinator/admin reschedules back to stakeholder
  - Added comprehensive documentation for reschedule loop handling

## Test Scenarios

### Scenario 1: Stakeholder Reschedules Approved Event
**Setup:**
- Stakeholder has an approved event (created from their request)
- Event has assigned coordinator + 4 valid coordinators

**Flow:**
1. **Stakeholder reschedules** (proposes new date)
   - State: `approved` → `review-rescheduled`
   - Expected actions:
     - **Assigned coordinator**: `accept`, `reject`, `reschedule` ✓
     - **Valid coordinators**: `accept`, `reject`, `reschedule` ✓
     - **Admins**: `accept`, `reject`, `reschedule` ✓
     - **Stakeholder**: `view` only (waiting for response)

2. **Valid coordinator reschedules** (counter-proposal)
   - Active responder: Stakeholder
   - Expected actions:
     - **Stakeholder**: `confirm`, `decline`, `reschedule` ✓
     - **All coordinators**: `view` only (waiting for stakeholder)
     - **Admins**: `view` only (waiting for stakeholder)

3. **Stakeholder reschedules again** (another counter-proposal)
   - Active responder: All coordinators + admins
   - Expected actions:
     - **Assigned coordinator**: `accept`, `reject`, `reschedule` ✓
     - **Valid coordinators**: `accept`, `reject`, `reschedule` ✓
     - **Admins**: `accept`, `reject`, `reschedule` ✓
     - **Stakeholder**: `view` only

4. **Admin accepts** (ends negotiation)
   - State: `review-rescheduled` → `approved`
   - Event updated with new date

### Scenario 2: Coordinator Reschedules Pending Request
**Setup:**
- Stakeholder creates new request
- Manually assigned to coordinator (assignmentRule: 'manual')
- 4 other valid coordinators available

**Flow:**
1. **Initial state** (`pending-review`)
   - Expected actions:
     - **Assigned coordinator**: `accept`, `reject`, `reschedule` ✓
     - **Valid coordinators**: `accept`, `reject`, `reschedule` ✓
     - **Admins**: `accept`, `reject`, `reschedule` ✓
     - **Stakeholder**: `view`, `cancel`, `edit`

2. **Valid coordinator reschedules**
   - State: `pending-review` → `review-rescheduled`
   - Active responder: Stakeholder
   - Expected actions:
     - **Stakeholder**: `confirm`, `decline`, `reschedule` ✓
     - **All coordinators**: `view` only
     - **Admins**: `view` only

3. **Stakeholder confirms**
   - State: `review-rescheduled` → `approved`
   - Event created with proposed date

### Scenario 3: Admin Participates in Reschedule Loop
**Setup:**
- S→C request in `review-rescheduled` state
- Stakeholder proposed reschedule, waiting for coordinator response

**Flow:**
1. **Admin (not assigned) reschedules** (counter-proposal)
   - Active responder: Stakeholder
   - Expected actions:
     - **Stakeholder**: `confirm`, `decline`, `reschedule` ✓
     - **Admin**: `view` only (can't reschedule again until stakeholder responds)
     - **Coordinators**: `view` only

2. **Stakeholder declines**
   - State: `review-rescheduled` → `rejected`
   - Request ends

### Scenario 4: Assigned Coordinator in Reschedule Loop
**Setup:**
- S→C request, stakeholder reschedules approved event

**Flow:**
1. **Assigned coordinator reschedules** (as assigned reviewer)
   - Active responder: Stakeholder
   - Expected actions:
     - **Stakeholder**: `confirm`, `decline`, `reschedule` ✓
     - **Assigned coordinator**: `view` only (waiting for stakeholder)
     - **Valid coordinators**: `view` only
     - **Admins**: `view` only

## Key Rules

### Who Can Act When?
- **PENDING_REVIEW**: All valid coordinators, assigned coordinator, admins can act simultaneously
- **REVIEW_RESCHEDULED**: 
  - If last action was by coordinator/admin: Stakeholder can act, others view only
  - If last action was by stakeholder: All coordinators + admins can act simultaneously
  - Actor who just rescheduled: View only (can't reschedule again until other party responds)

### Action Mapping by Role
- **Coordinators/Admins** (authority >= 60): `accept`, `reject`, `reschedule`
- **Stakeholders** (authority < 60): `confirm`, `decline`, `reschedule`

### State Transitions
- `reschedule` → `review-rescheduled` (stays in this state for loops)
- `accept`/`confirm` → `approved`
- `reject`/`decline` → `rejected`

## Testing Checklist

- [ ] Stakeholder reschedules approved event → All coordinators + admins get actions
- [ ] Valid coordinator reschedules → Stakeholder gets actions
- [ ] Admin reschedules S→C request → Stakeholder gets actions
- [ ] Assigned coordinator reschedules → Stakeholder gets actions
- [ ] Stakeholder reschedules in loop → All coordinators + admins get actions again
- [ ] Multiple reschedule loops work correctly (3+ back-and-forth reschedules)
- [ ] Actions are view-only for party who just rescheduled
- [ ] Confirm/Accept ends negotiation and approves event
- [ ] Decline/Reject ends negotiation and rejects request

## Restart Required

After making these changes, restart the server to apply:

```bash
npm run dev
```

Then test the flows above with actual requests in the UI.
