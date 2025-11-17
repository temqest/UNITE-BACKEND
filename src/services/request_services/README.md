# Event Request Services Documentation

This directory contains all event request and scheduling logic for the UNITE Blood Bank Event Management System.

## Services Overview

### 1. `eventRequest.service.js`
**Purpose:** Core event request management and double-confirmation workflow

**Key Methods:**
- `createEventRequest(coordinatorId, eventData)` - Coordinator submits event request
- `getEventRequestById(requestId)` - Get full request details
- `updateEventRequest(requestId, coordinatorId, updateData)` - Update pending request
- `adminAcceptRequest(adminId, requestId, adminAction)` - Admin reviews and decides
- `coordinatorConfirmRequest(coordinatorId, requestId, action)` - Coordinator confirms
- `assignStaffToEvent(adminId, eventId, staffMembers)` - Assign staff (Admin only)
- `cancelEventRequest(requestId, coordinatorId)` - Cancel pending request
- `getCoordinatorRequests(coordinatorId, filters, page, limit)` - Get coordinator's requests
- `getPendingRequests(filters, page, limit)` - Get all pending requests for admin

**Scheduling Validation:**
- `validateSchedulingRules(coordinatorId, eventData)` - Validates all business rules
- `checkCoordinatorOverlappingRequests(coordinatorId, eventDate)` - Prevents overlaps
- `checkDoubleBooking(eventDate, location)` - Prevents venue conflicts
- `getTotalBloodBagsForDate(date)` - Calculates blood bag capacity

---

### 2. `systemSettings.service.js`
**Purpose:** Configurable system settings and business rules

**Current Settings:**
```javascript
{
  maxEventsPerDay: 3,
  maxBloodBagsPerDay: 200,
  allowWeekendEvents: false,
  advanceBookingDays: 30,
  maxPendingRequests: 1,
  pendingFollowUpDays: 3,
  preventOverlappingRequests: true,
  preventDoubleBooking: false,
  allowCoordinatorStaffAssignment: false,
  requireStaffAssignment: false
}
```

**Key Methods:**
- `getSettings()` - Get all settings
- `getSetting(settingKey)` - Get specific setting
- `validateAdvanceBooking(eventDate)` - Check 1 month advance booking
- `validateWeekendRestriction(eventDate)` - Check weekend restrictions
- `validatePendingRequestsLimit(pendingCount)` - Check pending limit
- `getMinBookingDate()` - Get earliest allowed date
- `getMaxBookingDate()` - Get latest allowed date (30 days from today)

---

## Complete Workflow

### 1. Coordinator Submits Event Request

```javascript
const { eventRequestService } = require('./request_services');

// Create event request
const result = await eventRequestService.createEventRequest('COORD_123', {
  categoryType: 'BloodDrive', // or 'Advocacy' or 'Training'
  Event_Title: 'Community Blood Drive',
  Location: 'Bicol Medical Center',
  Start_Date: new Date('2024-12-15'),
  Email: 'coordinator@bloodbank.com',
  Phone_Number: '09123456789',
  
  // BloodDrive specific
  Target_Donation: 50,
  VenueType: 'Hospital',
  
  // Or Advocacy specific
  // Topic: 'Blood Donation Awareness',
  // TargetAudience: 'Local Communities',
  // ExpectedAudienceSize: 200,
  // PartnerOrganization: 'Local NGO',
  
  // Or Training specific
  // TrainingType: 'Basic First Aid',
  // MaxParticipants: 30
});

console.log(result.request); // Request details
console.log(result.warnings); // Any warnings (e.g., weekend events)
```

**What Happens:**
1. ✅ Validates coordinator exists
2. ✅ Checks all scheduling rules (see below)
3. ✅ Creates Event record
4. ✅ Creates category-specific record (BloodDrive/Advocacy/Training)
5. ✅ Creates EventRequest record
6. ✅ Creates history entry
7. ✅ Sends notifications to all admins

**Validation Rules Applied:**
- ✅ Must be 1 month (30 days) in advance
- ✅ No weekend events (unless admin override)
- ✅ Max 1 pending request per coordinator
- ✅ No overlapping requests for same coordinator
- ✅ No double booking (location conflict)
- ✅ Max 3 events per day
- ✅ Max 200 blood bags per day (for BloodDrive)
- ✅ Proper event date range

---

### 2. Coordinator Updates Pending Request

```javascript
// Only allowed if status is 'Pending_Admin_Review'
const result = await eventRequestService.updateEventRequest(
  'REQ_123',
  'COORD_123', // Must own this request
  {
    Start_Date: new Date('2024-12-20'), // New date
    Event_Title: 'Updated Title',
    Location: 'New Location'
  }
);
```

---

### 3. Admin Reviews and Decides

```javascript
const result = await eventRequestService.adminAcceptRequest(
  'ADMIN_123',
  'REQ_123',
  {
    action: 'Accepted', // or 'Rejected' or 'Rescheduled'
    note: 'Approved!',
    rescheduledDate: null // Only if Rescheduled
  }
);

// For rescheduling:
await eventRequestService.adminAcceptRequest('ADMIN_123', 'REQ_123', {
  action: 'Rescheduled',
  note: 'Please move to December 20th',
  rescheduledDate: new Date('2024-12-20')
});
```

**What Happens:**
1. ✅ Validates admin exists
2. ✅ Updates EventRequest with admin decision
3. ✅ Updates Event status
4. ✅ Creates history entry
5. ✅ Sends notification to coordinator

---

### 4. Coordinator Confirms Admin's Decision

```javascript
const result = await eventRequestService.coordinatorConfirmRequest(
  'COORD_123',
  'REQ_123',
  'Approved' // or 'Accepted' or 'Rejected'
);
```

**What Happens:**
1. ✅ Validates coordinator owns request
2. ✅ Updates EventRequest status to 'Completed' or 'Rejected'
3. ✅ Creates history entry
4. ✅ Sends notification to admin

---

### 5. Admin Assigns Staff (Admin Only)

```javascript
const result = await eventRequestService.assignStaffToEvent(
  'ADMIN_123', // Must be admin
  'EVENT_123',
  [
    { FullName: 'Dr. Juan Dela Cruz', Role: 'Lead Physician' },
    { FullName: 'Nurse Maria Santos', Role: 'Nurse' },
    { FullName: 'John Doe', Role: 'Coordinator' }
  ]
);
```

**What Happens:**
1. ✅ Validates admin
2. ✅ Validates event exists and is approved
3. ✅ Removes existing staff assignments
4. ✅ Creates new staff assignments
5. ✅ Updates event with StaffAssignmentID

---

### 6. Get Event Requests

```javascript
// Get coordinator's requests
const coordinatorRequests = await eventRequestService.getCoordinatorRequests(
  'COORD_123',
  {
    status: 'Pending_Admin_Review', // Optional filter
    date_from: '2024-01-01',
    date_to: '2024-12-31'
  },
  1, // page
  10 // limit
);

// Get all pending requests (admin)
const pendingRequests = await eventRequestService.getPendingRequests(
  {
    date_from: '2024-01-01',
    date_to: '2024-12-31'
  },
  1, // page
  20 // limit
);
```

---

## Scheduling Rules Details

### 1. Advance Booking (1 Month)
**Default:** 30 days in advance
**Rule:** Coordinators can only book events up to 30 days from today
**Implementation:** `systemSettings.validateAdvanceBooking(date)`

**Example:**
```javascript
// Today: November 1, 2024
// Allowed: November 1 - December 1, 2024
// Not allowed: December 2, 2024 or later
```

---

### 2. Pending Request Limit
**Default:** 1 pending request per coordinator
**Rule:** Coordinator cannot have multiple pending requests
**Implementation:** `systemSettings.validatePendingRequestsLimit(count)`

---

### 3. Overlapping Requests Prevention
**Default:** Enabled
**Rule:** Coordinator cannot have multiple requests for the same date
**Implementation:** `eventRequestService.checkCoordinatorOverlappingRequests()`

---

### 4. Double Booking Prevention
**Default:** Enabled
**Rule:** Same location cannot be booked twice on same date
**Implementation:** `eventRequestService.checkDoubleBooking()`

---

### 5. Daily Event Limit
**Default:** 3 events per day
**Rule:** Maximum events allowed on a single day
**Implementation:** Checked in `validateSchedulingRules()`

---

### 6. Daily Blood Bag Limit
**Default:** 200 bags per day
**Rule:** Maximum blood donations target for BloodDrive events
**Implementation:** `getTotalBloodBagsForDate()` in validation

---

### 7. Weekend Restrictions
**Default:** Weekend events not allowed
**Rule:** Events on Saturday/Sunday require admin approval
**Implementation:** `systemSettings.validateWeekendRestriction()`
**Note:** Weekend requests are allowed but flagged as warnings

---

## Event Categories

### BloodDrive
**Required Fields:**
- `Event_Title`
- `Location`
- `Start_Date`
- `Email`
- `Phone_Number`
- `Target_Donation` (number)
- `VenueType` (string)

**Additional Validation:**
- Blood bag limit checked against total for the day

---

### Advocacy
**Required Fields:**
- `Event_Title`
- `Location`
- `Start_Date`
- `Email`
- `Phone_Number`
- `Topic` (string)
- `TargetAudience` (string)
- `ExpectedAudienceSize` (number)
- `PartnerOrganization` (string)

---

### Training
**Required Fields:**
- `Event_Title`
- `Location`
- `Start_Date`
- `Email`
- `Phone_Number`
- `TrainingType` (string)
- `MaxParticipants` (number)

---

## Future Settings Configuration

The system is designed to support a settings page where admins can update:

1. **`maxEventsPerDay`** - How many events per day
2. **`maxBloodBagsPerDay`** - Maximum blood bag target
3. **`advanceBookingDays`** - How far in advance coordinators can book (default: 30)
4. **`maxPendingRequests`** - How many pending requests per coordinator
5. **`pendingFollowUpDays`** - Auto-follow-up days for pending requests
6. **`allowWeekendEvents`** - Enable/disable weekend events

**To implement settings page:**
1. Create Settings model in database
2. Update `systemSettings.service.js` to fetch from database
3. Add admin endpoints to update settings
4. Add caching layer for performance

---

## Error Handling

All services throw descriptive errors:

```javascript
try {
  await eventRequestService.createEventRequest(coordinatorId, eventData);
} catch (error) {
  console.error(error.message);
  // Examples:
  // "Validation failed: Events can only be booked up to 30 days in advance"
  // "You already have an event request for this date"
  // "This location is already booked for this date"
  // "Maximum 3 events allowed per day. This date is full."
  // "Blood bag limit exceeded. 25 bags remaining for this date."
}
```

---

## Integration with Other Services

- ✅ **User Services:** Validates coordinator/admin existence
- ✅ **History Model:** Auto-creates audit trail
- ✅ **Notification Model:** Auto-sends notifications
- ✅ **Event Models:** Creates category-specific records

---

## Testing Checklist

- [ ] Create BloodDrive request
- [ ] Create Advocacy request
- [ ] Create Training request
- [ ] Validate 30-day advance booking
- [ ] Validate pending request limit
- [ ] Validate overlapping requests
- [ ] Validate double booking
- [ ] Validate daily event limit
- [ ] Validate blood bag limit
- [ ] Update pending request
- [ ] Cancel pending request
- [ ] Admin accept request
- [ ] Admin reject request
- [ ] Admin reschedule request
- [ ] Coordinator confirm request
- [ ] Assign staff to event
- [ ] Get coordinator requests
- [ ] Get pending requests
- [ ] Notification creation
- [ ] History creation

---

**Ready for controller and route implementation! 🚀**

