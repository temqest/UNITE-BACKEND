# Visual Diagrams: Batch Event with Request Integration

## 1. System Architecture Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    BATCH EVENT CREATION FLOW                    │
└─────────────────────────────────────────────────────────────────┘

    Admin User
        │
        ▼
    ┌───────────────────────────────┐
    │  POST /api/event-requests/    │
    │  batch                        │
    │  + Array of event data        │
    └───────────┬───────────────────┘
                │
                ▼
    ┌───────────────────────────────────────┐
    │  Authentication & Authorization      │
    │  - Verify admin authority ≥ 80       │
    │  - Validate batch size               │
    └───────────┬───────────────────────────┘
                │
                ▼
    ┌───────────────────────────────────────────────────────────┐
    │  FOR EACH EVENT IN BATCH (within transaction):            │
    │                                                            │
    │  1. VALIDATE EVENT DATA                                  │
    │     - Check required fields                              │
    │     - Validate dates/times                               │
    │     - Validate category-specific fields                  │
    │                                                            │
    │  2. CREATE EVENT DOCUMENT                                │
    │     ├─ Generate Event_ID                                 │
    │     ├─ Set Status: "Approved"                            │
    │     ├─ Store location info (province, district)          │
    │     └─ Store in events collection                        │
    │                                                            │
    │  3. CREATE CATEGORY RECORD (if applicable)               │
    │     ├─ BloodDrive record                                 │
    │     ├─ Training record                                   │
    │     └─ Advocacy record                                   │
    │                                                            │
    │  4. 🆕 CREATE EVENTREQUEST                              │
    │     ├─ Generate Request_ID                               │
    │     ├─ Find coordinator for event's district             │
    │     ├─ Create EventRequest with:                         │
    │     │  ├─ Status: "approved"                             │
    │     │  ├─ Reviewer: Found coordinator                    │
    │     │  ├─ Requester: Admin user                          │
    │     │  ├─ assignmentRule: "batch-created-auto-..."       │
    │     │  └─ All event details                              │
    │     └─ Link Event to Request via Request_ID              │
    │                                                            │
    │  5. SEND NOTIFICATION (async, non-blocking)             │
    │     └─ Event published notification                      │
    │                                                            │
    │  6. ADD TO RESULTS                                        │
    │     ├─ If success: Add to created events                 │
    │     └─ If error: Add to failed/warnings                  │
    │                                                            │
    └───────────┬───────────────────────────────────────────────┘
                │
                ▼
    ┌───────────────────────────────────────┐
    │  COMMIT TRANSACTION                   │
    │  - All events and requests created    │
    │  - All in consistent state            │
    └───────────┬───────────────────────────┘
                │
                ▼
    ┌──────────────────────────────────────────────┐
    │  RETURN RESPONSE TO ADMIN                    │
    │  {                                           │
    │    success: true/false,                      │
    │    message: "Created X events",              │
    │    data: {                                   │
    │      created: number,                        │
    │      failed: number,                         │
    │      events: [...],                          │
    │      errors: [...]                           │
    │    }                                         │
    │  }                                           │
    └──────────────────────────────────────────────┘
                │
                ▼
    Events now visible to:
    ├─ Admin (in events collection)
    ├─ Coordinator (in campaign page - via EventRequest)
    └─ System (for analytics/reporting)
```

## 2. Database State After Batch Creation

```
BEFORE BATCH CREATION:
┌─────────────┐
│ collections │
└─────────────┘
  - events: []
  - eventrequests: []
  - blooddrives: []
  - trainings: []
  - advocacy: []


AFTER BATCH CREATION (3 events):
┌──────────────────┬──────────────────┬──────────────────┐
│   EVENTS         │   EVENTREQUESTS  │   CATEGORY       │
├──────────────────┼──────────────────┼──────────────────┤
│ Event 1          │ Request 1        │ BloodDrive 1     │
├─ Event_ID       │ ├─ Request_ID    │ ├─ Target_Donation
├─ Request_ID ────┼──► (linked)      │ └─ VenueType
├─ Event_Title    │ ├─ Event_ID      │
├─ Status: Approv │ │ (reference)     │ Training 1
├─ district       │ ├─ Status: appro │ ├─ MaxParticipants
├─ province       │ │ ved             │ └─ TrainingType
└─ ...            │ └─ reviewer:      │
                  │    {coordinator} │
Event 2           │                   │ Advocacy 1
├─ Event_ID       │ Request 2         │ ├─ Topic
├─ Request_ID ────┼──► (linked)      │ ├─ TargetAudience
├─ Event_Title    │ ├─ Request_ID    │ └─ ExpectedSize
├─ Status: Approv │ ├─ Status: appro │
├─ district       │ │ ved             │
├─ province       │ └─ reviewer:      │
└─ ...            │    {coordinator} │
                  │                   │
Event 3           │ Request 3         │
├─ Event_ID       │ ├─ Request_ID    │
├─ Request_ID ────┼──► (linked)      │
├─ Event_Title    │ ├─ Status: appro │
├─ Status: Approv │ │ ved             │
├─ district       │ └─ reviewer:      │
├─ province       │    {coordinator} │
└─ ...            │                   │
```

## 3. Coordinator Dashboard Workflow

```
┌──────────────────────────────────────────────────┐
│         COORDINATOR DASHBOARD                    │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  QUICK STATS                                     │
│  ┌──────────────────────────────────────────┐   │
│  │ My Campaigns: 15                         │   │
│  │ ├─ Pending Review: 0                     │   │
│  │ ├─ Approved Events: 15                   │   │
│  │ │  ├─ Batch-Created: 8  🆕             │   │
│  │ │  ├─ User-Requested: 5                 │   │
│  │ │  └─ Admin-Assigned: 2                 │   │
│  │ └─ Completed: 3                          │   │
│  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘

            ▼

┌──────────────────────────────────────────────────┐
│  APPROVED CAMPAIGNS (All 15 showing)             │
│  ┌─ [Filter] [Sort] [Search]                   │
│  │                                               │
│  │  🔵 BATCH-CREATED EVENTS:                   │
│  │                                               │
│  │  ┌────────────────────────────────────────┐ │
│  │  │ Blood Drive - North                 👁 │ │
│  │  │ Status: ✓ APPROVED (Batch-Created)    │ │
│  │  │ Location: City Hospital                │ │
│  │  │ Date: Feb 15, 2026 | 8:00 - 17:00     │ │
│  │  │ Target: 50 bags                        │ │
│  │  │ Actions: [Reschedule] [Edit] [Details]│ │
│  │  └────────────────────────────────────────┘ │
│  │                                               │
│  │  ┌────────────────────────────────────────┐ │
│  │  │ Training - Health Workers          👁 │ │
│  │  │ Status: ✓ APPROVED (Batch-Created)    │ │
│  │  │ Location: Training Center              │ │
│  │  │ Date: Feb 20, 2026 | 9:00 - 17:00     │ │
│  │  │ Max Participants: 100                  │ │
│  │  │ Actions: [Reschedule] [Edit] [Details]│ │
│  │  └────────────────────────────────────────┘ │
│  │                                               │
│  │  ⚪ OTHER APPROVED EVENTS:                  │
│  │  (5 user-requested, 2 admin-assigned)      │
│  │                                               │
│  └──────────────────────────────────────────────┘
│
└──────────────────────────────────────────────────┘

            ▼
   Coordinator clicks on event

            ▼

┌──────────────────────────────────────────────────┐
│  EVENT REQUEST DETAILS (APPROVED)                │
├──────────────────────────────────────────────────┤
│                                                  │
│ Request ID: REQ-1707xxxx-xxxx                    │
│ Event ID: EVENT_1707xxxx_xxxxx                   │
│ Status: ✓ APPROVED (Green Badge)                │
│                                                  │
│ ┌─ REQUEST METADATA                            │
│ │ Created By: System Admin                      │
│ │ Assigned To: You (Coordinator)                │
│ │ Assignment Rule: Batch-Created-Auto           │
│ │ Created: Jan 29, 2026 - 14:30 UTC            │
│ └─────────────────────────────────────────────── │
│                                                  │
│ ┌─ EVENT DETAILS                               │
│ │ Event Title: Blood Drive - North             │
│ │ Location: City Hospital                      │
│ │ Date: Feb 15, 2026                           │
│ │ Time: 8:00 AM - 5:00 PM                      │
│ │ Category: Blood Drive                        │
│ │ Target Donation: 50 bags                     │
│ │ Contact Email: contact@example.com           │
│ │ Contact Phone: +1-234-567-890                │
│ │ Description: Annual blood donation drive     │
│ └─────────────────────────────────────────────── │
│                                                  │
│ ┌─ STATUS HISTORY                              │
│ │ Timeline View:                               │
│ │ └─ ✓ APPROVED (Just now)                    │
│ │    Automatically approved as part of batch    │
│ │    event creation by System Admin             │
│ │    Time: Jan 29, 2026 - 14:30 UTC            │
│ └─────────────────────────────────────────────── │
│                                                  │
│ ┌─ AVAILABLE ACTIONS                           │
│ │ [Reschedule Event] [Edit Details]            │
│ │ [Manage Staff] [View Full History]           │
│ │ [Download Report] [Share with Team]          │
│ └─────────────────────────────────────────────── │
│                                                  │
│                    [Back] [Close]               │
│                                                  │
└──────────────────────────────────────────────────┘
```

## 4. Coordinator Action: Reschedule Event

```
BEFORE:                          AFTER RESCHEDULE:

Event Status: APPROVED      →    Event Status: RESCHEDULED
Start: Feb 15, 08:00        →    Start: Feb 22, 08:00
End: Feb 15, 17:00          →    End: Feb 22, 17:00

Request Status Timeline:         Request Status Timeline:
├─ Approved (initial)           ├─ Approved (initial)
                                └─ Rescheduled (coordinator action)
                                   Note: "Moved to Feb 22"
                                   Time: Jan 29, 2026 - 15:45 UTC
                                   By: Coordinator Name

Event in Database:              Event in Database:
├─ Request_ID: REQ-xxxx    →   ├─ Request_ID: REQ-xxxx (same)
├─ Status: Approved        →   ├─ Status: Rescheduled
├─ Start_Date: Feb 15      →   ├─ Start_Date: Feb 22
├─ End_Date: Feb 15        →   ├─ End_Date: Feb 22
└─ updated_at: (timestamp)      └─ updated_at: (new timestamp)
```

## 5. Error Handling Flow

```
Event Creation Process:

Event 1: Valid             ✓ Created
  ├─ Create Event         ✓
  ├─ Create Request       ✓
  └─ Result: SUCCESS

Event 2: Missing District ✗ Failed
  ├─ Create Event         ✗ Validation error
  └─ Result: FAILED (never reaches request creation)

Event 3: Valid Event, No Coordinator ⚠ Partial
  ├─ Create Event         ✓
  ├─ Create Request       ⚠ Warning (no coordinator found)
  │                         Event still created!
  └─ Result: CREATED (with warning)

Event 4: Valid             ✓ Created
  ├─ Create Event         ✓
  ├─ Create Request       ✓
  └─ Result: SUCCESS

Final Response:
{
  success: false,  (because of failures)
  message: "Created 3 event(s), 1 failed",
  data: {
    created: 3,
    failed: 1,
    errors: [
      { index: 1, event: "...", error: "Missing district" },
      { index: 2, event: "...", error: "No coordinator found", warning: true }
    ]
  }
}
```

## 6. Multi-District Batch Creation

```
BATCH INPUT:
Event 1: District A (North Province)
Event 2: District B (South Province)
Event 3: District A (North Province)  ← Same as Event 1
Event 4: District C (East Province)

DATABASE COORDINATOR QUERY:
Coordinator 1: North Province, District A ✓
Coordinator 2: South Province, District B ✓
Coordinator 3: East Province, District C ✓

ASSIGNMENT RESULT:
Event 1 → Request created → Assigned to Coordinator 1
Event 2 → Request created → Assigned to Coordinator 2
Event 3 → Request created → Assigned to Coordinator 1
Event 4 → Request created → Assigned to Coordinator 3

COORDINATOR DASHBOARDS:

Coordinator 1 Dashboard:     Coordinator 2 Dashboard:
├─ Event 1 (Approved)       ├─ Event 2 (Approved)
└─ Event 3 (Approved)       

Coordinator 3 Dashboard:
├─ Event 4 (Approved)
```

## 7. Transaction Flow (Database Consistency)

```
BEGIN TRANSACTION
│
├─ [LOCK] Event collection
├─ [LOCK] EventRequest collection
├─ [LOCK] User collection (for coordinator lookup)
│
├─ FOR EACH EVENT:
│  ├─ INSERT event document
│  ├─ INSERT category document (if applicable)
│  ├─ QUERY User collection for coordinator
│  └─ INSERT eventrequest document
│
├─ All operations succeed?
│  ├─ YES → COMMIT (all changes persisted)
│  └─ NO → ROLLBACK (all changes reverted)
│
└─ [UNLOCK] All collections

Result: Either complete success or complete failure
        No partial database states!
```

---

These diagrams illustrate:
1. The complete flow from admin request to coordinator dashboard
2. Database state changes
3. Coordinator user experience
4. Error handling strategy
5. Multi-district capability
6. Transaction safety guarantees
