# Emergency Coordinator Reassignment - Complete Guide

## Overview

This guide provides step-by-step instructions for reassigning all Event Requests and Scheduled Events from Ben to David in District 2, Camarines Sur.

**Target**: All documents in **District 2, Camarines Sur** that are currently assigned to Ben will be reassigned to David.

---

## Quick Start

### Option 1: Safe Preview (Recommended First Step)

```bash
# Preview what will be changed WITHOUT making any modifications
node src/scripts/reassignCoordinatorToDavid.js --dry-run --verbose
```

**Output**: 
- Lists all documents that would be updated
- Shows sample of changes
- No database modifications
- Creates a log file for review

### Option 2: Live Reassignment

```bash
# Apply the changes (requires --skip-prompt confirmation)
node src/scripts/reassignCoordinatorToDavid.js --skip-prompt
```

### Option 3: Verify Results

```bash
# Verify the reassignment was successful
node src/scripts/verifyCoordinatorReassignment.js
```

---

## Step-by-Step Instructions

### Step 1: Preparation (Do This First)

1. **Check your environment variables**
   ```bash
   # Verify these are set in your .env file
   MONGODB_URI=mongodb+srv://...
   MONGO_DB_NAME=unite-test-v2
   ```

2. **Ensure David exists in the database**
   - Email: `davidjaque@ymail.com`
   - Authority: 60 (Coordinator level)
   - Role: Coordinator

3. **Know who Ben is**
   - The script will search for Ben automatically
   - If Ben's email is different, you may need to modify the script

### Step 2: Dry Run (Preview Changes)

```bash
# Navigate to project root
cd /path/to/UNITE-BACKEND

# Run dry run with verbose logging
node src/scripts/reassignCoordinatorToDavid.js --dry-run --verbose
```

**What happens**:
1. ✅ Connects to MongoDB
2. ✅ Finds David's user record
3. ✅ Finds Ben's user record
4. ✅ Identifies District 2, Camarines Sur
5. ✅ Counts documents to be updated
6. ✅ Shows sample of changes
7. ⏹️ **STOPS WITHOUT MAKING CHANGES**

**Expected Output**:
```
═══════════════════════════════════════════════════════════════════
🔄 COORDINATOR REASSIGNMENT SCRIPT - STARTING
═══════════════════════════════════════════════════════════════════
Mode: DRY RUN (no changes)
Timestamp: 2026-01-26T...

📊 Connecting to MongoDB...
✅ Connected to MongoDB

👤 FINDING USERS
Searching for David (davidjaque@ymail.com)...
✅ Found David: { _id: ..., name: David Jaque, authority: 60 }

Searching for Ben...
✅ Found Ben: { ... }

📍 FINDING GEOGRAPHY
✅ Found Camarines Sur
✅ Found District 2
✅ Found 6 municipalities

📋 DOCUMENT COUNT
Event Requests with Ben as reviewer: 15
Events with Ben as coordinator: 23
Total documents to update: 38

🔍 PREVIEW OF CHANGES
Sample Event Requests (first 5):
  - REQ-20260125-001: Status = PENDING_REVIEW
  - REQ-20260125-002: Status = APPROVED
  ...

Sample Events (first 5):
  - EVT-20260125-001: Status = Confirmed
  ...

✅ DRY RUN COMPLETE
No changes were made. Review the preview above and run without --dry-run
```

### Step 3: Review the Dry Run Results

1. **Check the log file**: The script creates a log file in `logs/reassign-coordinator-[timestamp].log`
   ```bash
   cat logs/reassign-coordinator-*.log
   ```

2. **Verify the numbers**:
   - How many Event Requests will be updated?
   - How many Events will be updated?
   - Is the total reasonable?

3. **Review sample documents**:
   - Do the Request IDs and Event IDs look correct?
   - Are they all from District 2, Camarines Sur?

### Step 4: Apply Changes (Live Run)

Once you're confident with the dry run results:

```bash
# Run the actual reassignment
node src/scripts/reassignCoordinatorToDavid.js --skip-prompt
```

**Important Notes**:
- This will **MODIFY** the database
- Changes are **NOT easily reversible** without a backup
- The script creates an audit trail in the log files
- All changes are logged for accountability

**Expected Output**:
```
═══════════════════════════════════════════════════════════════════
🚀 APPLYING CHANGES
═══════════════════════════════════════════════════════════════════

Updating Event Requests...
✅ Updated 15 Event Requests

Updating Events...
✅ Updated 23 Events

═══════════════════════════════════════════════════════════════════
✅ REASSIGNMENT COMPLETE
═══════════════════════════════════════════════════════════════════

Summary:
  eventRequestsUpdated: 15
  eventsUpdated: 23
  totalUpdated: 38
  fromCoordinator: Ben [...] (ben@unite.com)
  toCoordinator: David Jaque (davidjaque@ymail.com)
  location: District 2, Camarines Sur
  municipalities: 6
  timestamp: 2026-01-26T...

✅ All changes applied successfully!
```

### Step 5: Verify the Changes

```bash
# Check that the reassignment was successful
node src/scripts/verifyCoordinatorReassignment.js
```

**Expected Output**:
```
═══════════════════════════════════════════════════════════════════
👤 USER INFORMATION
═══════════════════════════════════════════════════════════════════
✅ David Found: David Jaque
   Email: davidjaque@ymail.com
   ID: 507f1f77bcf86cd799439011

✅ Ben Found: Ben [...]
   Email: ben@unite.com
   ID: 507f1f77bcf86cd799439010

═══════════════════════════════════════════════════════════════════
📊 CURRENT ASSIGNMENT STATS
═══════════════════════════════════════════════════════════════════
Event Requests assigned to David: 15
Events assigned to David: 23
Total assigned to David: 38

Event Requests still assigned to Ben: 0
Events still assigned to Ben: 0
Total still assigned to Ben: 0

✅ SUCCESS: All documents have been reassigned from Ben to David!
```

---

## What Gets Updated

### EventRequest Model

When an EventRequest is reassigned from Ben to David:

```javascript
// Before
request.reviewer = {
  userId: ben._id,
  name: "Ben [...]",
  assignedAt: "2026-01-20T...",
  autoAssigned: true,
  assignmentRule: "auto-assigned"
}

// After
request.reviewer = {
  userId: david._id,  // ← CHANGED to David's ID
  name: "David Jaque", // ← CHANGED to David's name
  assignedAt: "2026-01-26T...",  // ← Same or updated
  autoAssigned: false,  // ← Changed (manual override)
  assignmentRule: "manual",  // ← Changed (emergency reassignment)
  overriddenAt: "2026-01-26T...",  // ← NEW
  overriddenBy: {  // ← NEW
    userId: null,
    name: "System (Emergency Reassignment)",
    roleSnapshot: "Admin",
    authoritySnapshot: 99
  }
}
```

### Event Model

When an Event is reassigned from Ben to David:

```javascript
// Before
event.coordinator_id = ben._id;

// After
event.coordinator_id = david._id;  // ← CHANGED
event.coordinator.userId = david._id;  // ← CHANGED
event.coordinator.name = "David Jaque";  // ← CHANGED
event.lastModified = "2026-01-26T...";  // ← NEW
event.lastModifiedBy = "System (Emergency Reassignment)";  // ← NEW
```

---

## Scope & Safety

### What's Updated

✅ Event Requests where:
- `reviewer.userId` equals Ben's ID
- `municipalityId` is in District 2, Camarines Sur

✅ Events where:
- `coordinator_id` equals Ben's ID  
- `municipalityId` is in District 2, Camarines Sur

### What's NOT Updated

❌ Event Requests/Events outside District 2, Camarines Sur
❌ Event Requests/Events assigned to other coordinators
❌ Historical data or audit trails (preserved for accountability)
❌ Status or other metadata (only coordinator assignment changed)

### Safety Features

1. **Dry Run Mode**: Preview changes without modifying database
2. **Confirmation Prompt**: Requires `--skip-prompt` to proceed
3. **Audit Trail**: All changes logged with timestamp
4. **Atomic Operations**: Uses MongoDB updateMany (all-or-nothing)
5. **Error Handling**: Try-catch blocks with detailed error messages
6. **Connection Management**: Properly closes database connections

---

## Troubleshooting

### Problem: "David not found in database"

**Cause**: David's email in database doesn't match expected `davidjaque@ymail.com`

**Solution**:
```bash
# Find David manually
mongo your-database-name
db.users.find({ firstName: "David" })

# Get his email and verify it matches
# If different, update the script:
# Change: const david = await findUserByEmail('davidjaque@ymail.com');
# To: const david = await findUserByEmail('his-actual@email.com');
```

### Problem: "Ben not found in database"

**Cause**: Ben's current email is not in the list of possible emails

**Solution**:
```bash
# Find Ben manually and identify his email
mongo your-database-name
db.users.find({ firstName: "Ben" })

# Update the possibleEmails array in the script
# Add Ben's actual email to the list
```

### Problem: "District 2 not found"

**Cause**: Location hierarchy is different or District 2 has a different name

**Solution**:
```bash
# Check the location hierarchy
mongo your-database-name
db.locations.find({ name: { $regex: "District", $options: "i" } })

# Update the script to match your exact location names
```

### Problem: Script runs but updates 0 documents

**Cause**: 
- Ben has no assignments in District 2
- Location IDs don't match
- Coordinator IDs don't match

**Solution**:
```bash
# Run with --verbose flag for detailed logging
node src/scripts/reassignCoordinatorToDavid.js --dry-run --verbose

# Check the log file for detailed error messages
cat logs/reassign-coordinator-*.log
```

---

## Rollback Plan (If Needed)

If something goes wrong and you need to revert:

### Option 1: Restore from Backup

If you have a database backup, restore it:
```bash
# Contact DevOps or Database Administrator
# Use their standard backup restoration procedure
```

### Option 2: Manual Reversal

```bash
# Create a script to change David back to Ben
mongo your-database-name
db.eventrequests.updateMany(
  { "reviewer.userId": ObjectId("david-id") },
  { $set: { "reviewer.userId": ObjectId("ben-id") } }
)
```

### Option 3: Contact Support

If you need help, save:
- The log file from the reassignment (`logs/reassign-coordinator-*.log`)
- The verification report (`logs/verify-reassignment-*.log`)
- Screenshots of the before/after dashboard

---

## Verification Checklist

After running the live reassignment:

- [ ] Script ran without errors
- [ ] Check log file confirms all updates
- [ ] Run verification script
- [ ] Verification shows 0 documents still with Ben
- [ ] Admin dashboard shows David has new documents
- [ ] Sample Event Requests are visible to David
- [ ] Sample Events are visible to David
- [ ] Notification logs show reassignment audit trail

---

## Admin Dashboard Verification

After the reassignment, verify in the Admin Dashboard:

1. **Go to**: Admin > Coordinators
2. **Select**: David Jaque
3. **Check**:
   - Assigned Event Requests: Should be ~15
   - Assigned Events: Should be ~23
   - Location: Should show District 2, Camarines Sur
   - Recent Activity: Should show reassignment

4. **Compare with Ben**:
   - Ben's request count should decrease
   - Ben's event count should decrease

---

## FAQ

**Q: Can I undo this if I made a mistake?**
A: Not easily without a backup. That's why the dry-run mode is important!

**Q: How long will this take?**
A: Usually 5-30 seconds depending on number of documents.

**Q: Will users be notified?**
A: No automatic notifications. You may want to manually notify David and Ben.

**Q: What if Ben and David have multiple coverage areas?**
A: This script only reassigns documents in **District 2, Camarines Sur** specifically.

**Q: Can I reassign to someone else besides David?**
A: Yes, modify the `davidjaque@ymail.com` email in the script to the other person's email.

---

## Support

For questions or issues:

1. **Check the log file**: `logs/reassign-coordinator-[timestamp].log`
2. **Review this guide**: Search for your problem in the Troubleshooting section
3. **Run verification**: `node src/scripts/verifyCoordinatorReassignment.js`
4. **Contact DevOps**: Provide the log files and verification report

---

## Summary

| Step | Command | Duration | Risk |
|------|---------|----------|------|
| 1. Preview | `--dry-run --verbose` | 5-10s | None |
| 2. Review | Read log file | 2-5min | None |
| 3. Apply | `--skip-prompt` | 5-30s | High (data modification) |
| 4. Verify | verification script | 5-10s | None |

**Total Time**: ~15-60 minutes (depending on careful review)

---

Last Updated: January 26, 2026
Version: 1.0

