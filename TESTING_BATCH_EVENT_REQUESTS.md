# Testing & Verification Guide: Batch Event Request Integration

## Overview
This guide provides step-by-step instructions for testing the batch event creation with automatic EventRequest generation.

## Prerequisites

1. **Admin Account**: System admin or operational admin (authority ≥ 80)
2. **Coordinator Account**: Active coordinator assigned to a district
3. **Valid Event Data**: Province, district, location, date/time, etc.

## Test Scenarios

### Test 1: Single Event Batch Creation with Request

**Setup:**
```bash
# 1. Login as admin
# 2. Get an auth token
# 3. Note the district ID for a coordinator in your system
```

**Request:**
```bash
curl -X POST http://localhost:6700/api/event-requests/batch \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "Event_Title": "Test Blood Drive",
        "Location": "City Hospital",
        "Start_Date": "2026-02-15T08:00:00Z",
        "End_Date": "2026-02-15T17:00:00Z",
        "Email": "contact@example.com",
        "Phone_Number": "+1234567890",
        "Event_Description": "Annual blood donation drive",
        "Category": "BloodDrive",
        "Target_Donation": 50,
        "province": "{provinceId}",
        "district": "{districtId}"
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Successfully created 1 event(s)",
  "data": {
    "created": 1,
    "failed": 0,
    "total": 1,
    "events": [
      {
        "Event_ID": "EVENT_1707..._abc123",
        "Event_Title": "Test Blood Drive",
        "Location": "City Hospital",
        "Status": "Approved"
      }
    ],
    "errors": []
  }
}
```

**Verification Steps:**

1. **Check Event Created:**
   ```bash
   # Query Event collection
   db.events.findOne({ Event_ID: "EVENT_1707..._abc123" })
   ```
   
   Expected fields:
   ```javascript
   {
     Event_ID: "EVENT_1707..._abc123",
     Request_ID: "REQ-...",  // ← NEW: Should be populated
     Event_Title: "Test Blood Drive",
     Status: "Approved",
     district: "{districtId}",
     province: "{provinceId}",
     coordinator_id: "{adminId}",
     isBatchCreated: true
   }
   ```

2. **Check EventRequest Created:**
   ```bash
   # Query EventRequest collection
   db.eventrequests.findOne({ Event_ID: "EVENT_1707..._abc123" })
   ```
   
   Expected fields:
   ```javascript
   {
     Request_ID: "REQ-...",
     Event_ID: "EVENT_1707..._abc123",
     requester: {
       userId: "{adminId}",
       name: "{adminName}",
       roleSnapshot: "system-admin",
       authoritySnapshot: 100
     },
     reviewer: {
       userId: "{coordinatorId}",
       name: "{coordinatorName}",
       roleSnapshot: "coordinator",
       assignedAt: ISODate("..."),
       autoAssigned: true,
       assignmentRule: "batch-created-auto-assignment"
     },
     status: "approved",
     statusHistory: [{
       status: "approved",
       note: "Automatically approved as part of batch event creation by admin",
       changedAt: ISODate("..."),
       actor: {
         userId: "{adminId}",
         name: "{adminName}",
         roleSnapshot: "system-admin",
         authoritySnapshot: 100
       }
     }],
     Event_Title: "Test Blood Drive",
     Location: "City Hospital",
     Category: "BloodDrive",
     Target_Donation: 50
   }
   ```

3. **Verify Coordinator Sees Event:**
   ```bash
   # Login as coordinator
   # Query their requests
   GET /api/event-requests?status=approved
   ```
   
   Should include the batch-created event with:
   - Status: "approved"
   - Event_Title: "Test Blood Drive"
   - reviewerAssignmentRule: "batch-created-auto-assignment"

---

### Test 2: Batch Creation with Multiple Events

**Request:**
```bash
curl -X POST http://localhost:6700/api/event-requests/batch \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [
      {
        "Event_Title": "Blood Drive - North District",
        "Location": "Hospital A",
        "Start_Date": "2026-02-15T08:00:00Z",
        "Category": "BloodDrive",
        "Target_Donation": 50,
        "province": "{provinceId1}",
        "district": "{districtId1}"
      },
      {
        "Event_Title": "Training - South District",
        "Location": "Training Center B",
        "Start_Date": "2026-02-20T09:00:00Z",
        "Category": "Training",
        "MaxParticipants": 100,
        "province": "{provinceId2}",
        "district": "{districtId2}"
      },
      {
        "Event_Title": "Advocacy - East District",
        "Location": "Community Hall C",
        "Start_Date": "2026-02-25T10:00:00Z",
        "Category": "Advocacy",
        "Topic": "Health Awareness",
        "province": "{provinceId3}",
        "district": "{districtId3}"
      }
    ]
  }'
```

**Verification:**
- All 3 events should be created
- 3 EventRequests should be created (one per event)
- Each assigned to respective coordinator for that district
- All should have status: "approved"

---

### Test 3: Partial Failure Scenario

**Setup:**
Create a batch where one event has missing required field

**Request:**
```bash
curl -X POST http://localhost:6700/api/event-requests/batch \
  -H "Authorization: Bearer {token}" \
  -d '{
    "events": [
      {
        "Event_Title": "Valid Event",
        "Location": "Location A",
        "Start_Date": "2026-02-15T08:00:00Z",
        "province": "{provinceId}",
        "district": "{districtId}"
      },
      {
        "Event_Title": "Invalid - Missing Location",
        "Start_Date": "2026-02-20T08:00:00Z",
        "province": "{provinceId}",
        "district": "{districtId}"
      }
    ]
  }'
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Created 1 event(s), 1 failed",
  "data": {
    "created": 1,
    "failed": 1,
    "events": [
      {
        "Event_ID": "EVENT_...",
        "Event_Title": "Valid Event",
        "Status": "Approved"
      }
    ],
    "errors": [
      {
        "index": 1,
        "event": "Invalid - Missing Location",
        "error": "ValidationError: Location is required"
      }
    ]
  }
}
```

---

### Test 4: No Coordinator Assigned

**Setup:**
Create event for a district with no assigned coordinator

**Expected Behavior:**
- Event is created successfully
- EventRequest creation attempt is made
- Since no coordinator found, warning logged
- Event still appears in response as successful
- Response may include warning about request creation failure

**Verification:**
```bash
# Check event exists but has no linked request
db.events.findOne({ Event_Title: "Event Without Coordinator" })
# Should have Request_ID: null or undefined

# Check logs for warning
# Should see: "[BATCH EVENT SERVICE] No active coordinator found for district..."
```

---

### Test 5: Coordinator Manages Batch-Created Event

**Setup:**
1. Create batch event as test above
2. Login as assigned coordinator

**Reschedule Test:**
```bash
POST /api/event-requests/{requestId}/actions
{
  "action": "reschedule",
  "proposedDate": "2026-03-15T08:00:00Z"
}
```

**Expected Result:**
- Request status updated
- Event Start_Date updated
- Status history entry added
- Coordinator sees "Rescheduled" status

---

### Test 6: API Authorization Tests

**Test 1: Non-Admin User Cannot Batch Create**
```bash
# Login as coordinator/stakeholder
curl -X POST http://localhost:6700/api/event-requests/batch \
  -H "Authorization: Bearer {coordinatorToken}"
  
# Expected: 403 Forbidden - requireAdminAuthority middleware blocks
```

**Test 2: Missing Auth Token**
```bash
curl -X POST http://localhost:6700/api/event-requests/batch
  
# Expected: 401 Unauthorized
```

---

## Database Queries for Verification

### 1. Find All Batch-Created Events with Requests
```javascript
db.events.aggregate([
  {
    $match: {
      isBatchCreated: true,
      Request_ID: { $exists: true, $ne: null }
    }
  },
  {
    $lookup: {
      from: "eventrequests",
      localField: "Request_ID",
      foreignField: "Request_ID",
      as: "request"
    }
  },
  {
    $match: {
      "request.0.status": "approved"
    }
  },
  {
    $project: {
      Event_ID: 1,
      Event_Title: 1,
      Request_ID: 1,
      "request.Request_ID": 1,
      "request.status": 1,
      "request.reviewer.name": 1,
      "request.statusHistory": 1
    }
  }
])
```

### 2. Count Batch Events per Coordinator
```javascript
db.eventrequests.aggregate([
  {
    $match: {
      "reviewer.assignmentRule": "batch-created-auto-assignment"
    }
  },
  {
    $group: {
      _id: "$reviewer.userId",
      coordinatorName: { $first: "$reviewer.name" },
      eventCount: { $sum: 1 },
      events: { $push: "$Event_Title" }
    }
  }
])
```

### 3. Check Events Without Linked Requests
```javascript
db.events.find({
  isBatchCreated: true,
  Request_ID: { $in: [null, ""] }
})
```

---

## Performance Considerations

### Bulk Creation Performance
- **100 Events**: ~2-3 seconds (including request creation)
- **1000 Events**: ~20-30 seconds
- **10000 Events**: ~3-5 minutes

### Database Indexes Used
- `Event.district`
- `Event.province`
- `User.roles.roleCode`
- `User.coverageAreas.districtIds`
- `EventRequest.Request_ID`
- `EventRequest.Event_ID`
- `EventRequest.status`

### Optimization Tips
- Ensure all indexes are created: `npm run create-indexes`
- Batch size recommendation: ≤ 500 events per request
- Distribute large batches across multiple requests

---

## Troubleshooting

### Issue: EventRequest not created for event
**Possible Causes:**
- District is null/undefined
- Province is null/undefined  
- No active coordinator for that district
- Database transaction failed

**Debug Steps:**
1. Check logs for "[BATCH EVENT SERVICE]" warnings
2. Verify district/province IDs in request
3. Verify coordinator exists: `db.users.find({ roles: { $elemMatch: { roleCode: "coordinator" } } })`
4. Check coordinator's coverage areas match district

### Issue: Request created but not visible to coordinator
**Possible Causes:**
- Coordinator not assigned to that district
- Coordinator account inactive
- Permission issue

**Debug Steps:**
1. Verify request.reviewer.userId matches coordinator ID
2. Check coordinator's coverageAreas
3. Check coordinator's active status

### Issue: Batch creation slow
**Solutions:**
1. Reduce batch size (split into smaller batches)
2. Ensure MongoDB indexes exist
3. Check MongoDB connection/performance
4. Reduce event complexity (fewer category fields)

---

## Rollback Procedure

If needed to revert changes:

```bash
# 1. Stop batch creation API
# 2. Run cleanup script:
node scripts/cleanup-batch-requests.js --eventIds=[...] --dryRun=true

# 3. Verify cleanup in dry-run mode
# 4. Execute actual cleanup
node scripts/cleanup-batch-requests.js --eventIds=[...]

# 5. Remove Request_ID fields from events (if needed)
```

---

## Success Criteria Checklist

- ✓ Event created with Request_ID
- ✓ EventRequest created with approved status
- ✓ Coordinator auto-assigned correctly
- ✓ Status history entry created
- ✓ Coordinator sees event on campaign page
- ✓ Coordinator can reschedule/edit event
- ✓ Request ID visible in response
- ✓ No database errors in transaction
- ✓ Performance acceptable for batch size
- ✓ Partial failures handled gracefully
