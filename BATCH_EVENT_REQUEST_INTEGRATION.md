# Batch Event with Request Integration

## Overview

When an admin creates events through batch event creation, the system now automatically creates an `EventRequest` entity for each event. This enables coordinators to see and manage batch-created events through the campaign/request visibility system.

## Changes Made

### 1. Modified: `src/services/eventRequests_services/batchEvent.service.js`

#### Added Imports
```javascript
const { Event, BloodDrive, Training, Advocacy, User, EventRequest } = require('../../models/index');
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');
const reviewerAssignmentService = require('./reviewerAssignment.service');
```

#### New Methods

**`generateRequestId()`**
- Generates unique `Request_ID` for EventRequest documents
- Format: `REQ-${timestamp}-${random}`

**`_createApprovedEventRequest(event, adminUser, session)`** (Private)
- Creates an approved EventRequest for each batch-created event
- Automatically assigns to the coordinator of the event's province/district
- Links the event to the request via Request_ID field
- Called for each successfully inserted event during batch creation

#### Modified `createBatchEvents()`
- Now calls `_createApprovedEventRequest()` after event creation
- Gracefully handles request creation failures (logs warning but doesn't fail event)
- Maintains transaction integrity

## Workflow

### Before Changes
```
Admin → Batch Create API → Event Created (standalone)
         (Event has no request entity)
         Coordinator cannot see event in request system
```

### After Changes
```
Admin → Batch Create API → Event Created
                       ↓
                EventRequest Created (Approved status)
                Event linked to Request via Request_ID
                       ↓
                Coordinator sees event:
                - In campaign page
                - In request visibility system
                - Can manage/reschedule it
```

## EventRequest Structure

When a batch event is created, the following EventRequest is generated:

```javascript
{
  Request_ID: "REQ-{timestamp}-{random}",
  Event_ID: "{eventId}",
  requester: {
    userId: "{adminUserId}",
    name: "{adminName}",
    roleSnapshot: "system-admin",
    authoritySnapshot: 100
  },
  reviewer: {
    userId: "{coordinatorId}",
    name: "{coordinatorName}",
    roleSnapshot: "coordinator",
    assignedAt: Date.now(),
    autoAssigned: true,
    assignmentRule: "batch-created-auto-assignment"
  },
  status: "approved",  // Directly approved, not pending
  statusHistory: [{
    status: "approved",
    note: "Automatically approved as part of batch event creation by admin",
    changedAt: Date.now(),
    actor: "{adminSnapshot}"
  }],
  // All event details copied from Event
  Event_Title, Location, Date, Email, Phone_Number, Event_Description,
  Category, Target_Donation, MaxParticipants, etc.
}
```

## Coordinator Assignment Logic

The coordinator is found using:
```javascript
User.findOne({
  roles: { $elemMatch: { roleCode: 'coordinator' } },
  'coverageAreas.districtIds': event.district,
  isActive: true
})
```

**Priority:**
1. Search for active coordinator assigned to the event's district
2. If no coordinator found, request is created without assignment (logged as warning)
3. Request is created with "approved" status regardless

## Event-Request Linking

- Event's `Request_ID` field is updated with the created request's ID
- Allows bidirectional navigation between Event and EventRequest
- Event remains accessible both as:
  - Standalone Event document
  - Part of EventRequest workflow system

## Benefits

✅ **Admin Efficiency**: Admins can create multiple events quickly
✅ **Coordinator Visibility**: Events automatically appear on coordinator dashboard
✅ **Campaign Integration**: Events visible in campaign/request system
✅ **Workflow Tracking**: Events remain in request system for audit/management
✅ **Graceful Degradation**: If request creation fails, event still exists
✅ **No Breaking Changes**: Existing batch create API behavior unchanged

## Error Handling

If EventRequest creation fails:
- Event is still created successfully
- Warning logged to console
- Error tracked in response warnings (marked with `warning: true`)
- Transaction is NOT aborted
- Batch creation continues with remaining events

## API Response

The batch creation endpoint response includes any request creation warnings:

```json
{
  "success": true,
  "message": "Successfully created 50 event(s)",
  "data": {
    "created": 50,
    "failed": 0,
    "total": 50,
    "events": [...],
    "errors": [
      // Any warnings about request creation failures
      {
        "index": 5,
        "event": "Event Title",
        "error": "EventRequest creation failed: No coordinator found",
        "warning": true
      }
    ]
  }
}
```

## Coordinator Workflow

After batch creation, coordinators can:

1. **View Events**: See batch-created events on their campaign page
2. **Manage Events**: Update event details (requires admin authority check)
3. **Reschedule**: Change event date/time
4. **Track History**: View request status history

## Database Impact

- **New EventRequest records**: One per batch-created event
- **Updated Event records**: Added Request_ID field
- **Indexes**: Uses existing indexes on district, province, coordinator roles
- **Transaction**: All operations within single MongoDB session for consistency

## Future Considerations

- Add bulk assignment to specific coordinators
- Add request expiration/completion workflow
- Add coordinator action tracking/analytics
- Add notification to coordinator when batch events created
