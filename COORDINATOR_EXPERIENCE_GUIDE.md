# Coordinator Experience with Batch-Created Events

## What Coordinators See

### 1. Campaign Page (Request List View)
When an admin creates a batch of events, each one automatically appears in the coordinator's campaign page as an **approved request**.

**Batch Event Request Card:**
```
┌─────────────────────────────────────┐
│ Event Title                    👁 VIEW
├─────────────────────────────────────┤
│ Status: ✓ APPROVED                  │
│ Location: [Event Location]          │
│ Date: [Start Date]                  │
│ Time: [Start Time] - [End Time]     │
│ Category: Blood Drive / Training    │
│ Created By: [Admin Name]            │
├─────────────────────────────────────┤
│ Actions:                            │
│ • Reschedule  • Edit  • Manage      │
│ • View Details                      │
└─────────────────────────────────────┘
```

### 2. Request Details View
Clicking on a batch-created event request shows:

**Header Section:**
- ✓ Status: APPROVED (green badge)
- Auto-assigned to you: [Coordinator Name]
- Created by: [Admin Name]
- Request ID: REQ-{timestamp}-{random}

**Event Information:**
- Event Title
- Location
- Start/End Dates & Times
- Email & Phone
- Description
- Category & Category-specific fields

**Status History:**
```
Timeline:
├─ Approved (Just now)
│  └─ Automatically approved as part of batch event creation by admin
│     Created by: [Admin Name]
```

**Available Actions:**
- Reschedule Event
- Edit Event Details
- Manage Staff Assignment
- View Event Details

### 3. Integration with Existing Coordinator Workflows

The batch-created event request works exactly like a normal approved request:

✅ **Search & Filter**: Find by event title, location, date
✅ **Bulk Actions**: Select multiple approved events
✅ **Dashboard**: Shows on coordinator dashboard
✅ **Notifications**: Can receive notifications (if enabled)
✅ **Status Tracking**: Full audit trail visible
✅ **Action History**: All changes tracked

## Coordinator Actions on Batch-Created Events

### Reschedule Event
```
1. Click "Reschedule" button
2. Select new date and time
3. Add optional notes
4. Submit
→ Event is updated with new schedule
→ Request status updated
→ History entry created
```

### Edit Event Details
```
1. Click "Edit" button
2. Modify fields:
   - Event Title
   - Location
   - Description
   - Contact Info
   - Category details
3. Save
→ Event updated
→ Request updated
→ Change tracked in history
```

### Manage Staff Assignment
```
1. Click "Manage Staff"
2. Assign or modify staff
3. Save
→ Staff assignment linked to event
→ Notification sent to staff (if configured)
```

## Key Differences vs. Pending Requests

| Aspect | Batch Event | Normal Request |
|--------|------------|-----------------|
| **Initial Status** | Approved ✓ | Pending ⏳ |
| **Requires Review** | No | Yes |
| **Coordinator Action** | Manage/Update | Review/Approve/Reject |
| **Request Flow** | Complete | In Progress |
| **Immediate Visibility** | ✓ Yes | No (pending) |
| **Editable** | ✓ Yes | Depends on status |

## When Batch Events Are Auto-Created

**Automatic Coordinator Assignment Triggers:**
1. Admin creates batch events through `/api/event-requests/batch` endpoint
2. For each event in the batch:
   - Event_ID generated and created
   - District & Province must be specified
   - Active coordinator for that district is found
   - EventRequest created with APPROVED status
   - Coordinator auto-assigned
   - Request_ID linked to Event

**No Manual Assignment Needed** - The system handles this automatically!

## Visibility on Campaign Page

### Campaign List Shows:
- ✓ All approved batch-created events (new ones appear immediately)
- ✓ Filter by status: APPROVED
- ✓ Filter by date range
- ✓ Filter by location/district
- ✓ Search by event title

### Batch-Created Events are Identified By:
- `reviewer.assignmentRule: "batch-created-auto-assignment"` (in data)
- Status: "approved"
- `requester.roleSnapshot: "system-admin"` (created by admin)
- Note in status history mentions "batch event creation"

## Coordinator Dashboard Integration

**Quick Stats:**
```
My Approved Events: 15
├─ Batch-Created Events: 8
├─ User-Requested Events: 5
├─ Admin-Assigned Events: 2
└─ Awaiting My Action: 0
```

**Recent Activity:**
```
Today
├─ [NEW] 8 batch events created by System Admin
│  └─ Blood Drive (3), Training (3), Advocacy (2)
│  └─ All auto-assigned to your district
```

## Important Notes

⚠️ **Permission Checks**: Coordinators still need appropriate `request.manage` permissions to edit/reschedule

⚠️ **Authority Levels**: Some actions may require higher authority levels

✅ **Read Access**: All coordinators automatically have visibility

✅ **No Notification**: System doesn't send notifications by default (can be configured)

## Troubleshooting

### Q: Event not appearing on my campaign page?
**A:** Check:
- Request was created successfully (check logs)
- Your district matches event's district
- Your user is active and assigned to that district
- You have request.view permission

### Q: Can't edit batch-created event?
**A:** Verify:
- Event status is "approved"
- You have `request.manage` or `request.edit` permission
- Event hasn't been locked by another admin

### Q: Multiple coordinators assigned?
**A:** System assigns to the first active coordinator found for the district. To change:
- Admin can update the EventRequest reviewer manually, or
- Next batch can target different coordinators by splitting events by district
