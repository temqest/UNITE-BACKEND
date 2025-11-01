# Utility Services Documentation

This directory contains utility services for managing districts and notifications in the UNITE Blood Bank Event Management System.

## Services Overview

### 1. `district.service.js`
**Purpose:** District management and administration

**Key Methods:**
- `createDistrict(districtData)` - Create new district
- `getDistrictById(districtId)` - Get district by ID
- `getAllDistricts(filters, options)` - Get all districts with pagination
- `getDistrictsByRegion()` - Get districts grouped by region
- `updateDistrict(districtId, updateData)` - Update district information
- `deleteDistrict(districtId)` - Delete district (with validation)
- `searchDistricts(searchTerm, options)` - Search districts
- `getDistrictStatistics()` - Get district statistics
- `districtExists(districtId)` - Check if district exists

**Usage Example:**
```javascript
const { districtService } = require('./utility_services');

// Create district
const result = await districtService.createDistrict({
  District_ID: 'DIST_001', // Optional, auto-generated if not provided
  District_Name: 'Naga City',
  District_City: 'Naga',
  Region: 'Bicol'
});

// Get all districts
const districts = await districtService.getAllDistricts(
  {
    region: 'Bicol', // Optional filter
    city: 'Naga',    // Optional filter
    search: 'Naga'   // Optional search
  },
  {
    page: 1,
    limit: 20,
    sortBy: 'District_Name',
    sortOrder: 'asc'
  }
);

// Get districts by region
const byRegion = await districtService.getDistrictsByRegion();
console.log(byRegion.districts); // Grouped by region
console.log(byRegion.statistics); // Stats

// Get district statistics
const stats = await districtService.getDistrictStatistics();
```

**Features:**
- ✅ Automatic ID generation
- ✅ Duplicate prevention (name + region)
- ✅ Coordinator count tracking
- ✅ Search functionality
- ✅ Region grouping
- ✅ Statistics and analytics
- ✅ Validation before deletion (checks for coordinators)

---

### 2. `notification.service.js`
**Purpose:** Notification management and inbox functionality

**Key Methods:**
- `createNotification(notificationData)` - Create custom notification
- `getNotifications(recipientId, recipientType, filters, options)` - Get user notifications
- `getUnreadCount(recipientId, recipientType)` - Get unread count
- `markAsRead(notificationId, recipientId)` - Mark single notification as read
- `markMultipleAsRead(notificationIds, recipientId)` - Mark multiple as read
- `markAllAsRead(recipientId, recipientType)` - Mark all as read
- `getNotificationById(notificationId, recipientId)` - Get notification details
- `deleteNotification(notificationId, recipientId)` - Delete notification
- `getNotificationStatistics(recipientId, recipientType)` - Get notification stats
- `getLatestNotifications(recipientId, recipientType, limit)` - Get latest (for inbox preview)

**Workflow Notification Helpers:**
- `createNewRequestNotification()` - New request notification for admin
- `createAdminActionNotification()` - Admin action notification for coordinator
- `createCoordinatorActionNotification()` - Coordinator action notification for admin

**Usage Example:**
```javascript
const { notificationService } = require('./utility_services');

// Get notifications for user
const notifications = await notificationService.getNotifications(
  'COORD_123', // recipientId
  'Coordinator', // recipientType: 'Admin' or 'Coordinator'
  {
    isRead: false, // Optional: filter by read status
    type: 'AdminAccepted', // Optional: filter by type
    date_from: '2024-01-01', // Optional
    date_to: '2024-12-31', // Optional
    request_id: 'REQ_123' // Optional
  },
  {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  }
);

// Get unread count
const unread = await notificationService.getUnreadCount('COORD_123', 'Coordinator');
console.log(unread.unread_count); // Number

// Mark as read
await notificationService.markAsRead('NOTIF_123', 'COORD_123');

// Mark all as read
await notificationService.markAllAsRead('COORD_123', 'Coordinator');

// Get notification statistics
const stats = await notificationService.getNotificationStatistics(
  'COORD_123',
  'Coordinator'
);

// Get latest notifications (for inbox preview)
const latest = await notificationService.getLatestNotifications(
  'COORD_123',
  'Coordinator',
  10 // limit
);
```

**Notification Types:**
- `NewRequest` - New request created by coordinator
- `AdminAccepted` - Admin accepted the request
- `AdminRescheduled` - Admin rescheduled the request
- `AdminRejected` - Admin rejected the request
- `CoordinatorApproved` - Coordinator approved admin's acceptance
- `CoordinatorAccepted` - Coordinator accepted admin's decision
- `CoordinatorRejected` - Coordinator rejected after admin action
- `RequestCompleted` - Request completed
- `RequestRejected` - Request finally rejected

---

## Complete Usage Examples

### District Management Flow

```javascript
// Admin creates district
const newDistrict = await districtService.createDistrict({
  District_Name: 'Legazpi City',
  District_City: 'Legazpi',
  Region: 'Bicol'
});

// Get all districts with coordinator counts
const allDistricts = await districtService.getAllDistricts({}, {
  page: 1,
  limit: 50,
  sortBy: 'District_Name'
});

// Update district
await districtService.updateDistrict('DIST_001', {
  District_Name: 'Updated Name',
  District_City: 'Updated City'
});

// Search districts
const searchResults = await districtService.searchDistricts('Naga', {
  page: 1,
  limit: 10
});

// Get statistics
const districtStats = await districtService.getDistrictStatistics();
console.log(districtStats.statistics);
// {
//   total_districts: 10,
//   total_regions: 3,
//   total_coordinators: 25,
//   districts_with_coordinators: 8,
//   districts_without_coordinators: 2,
//   avg_coordinators_per_district: 2.5,
//   region_distribution: [...]
// }
```

### Notification Management Flow

```javascript
// Coordinator gets their notifications
const myNotifications = await notificationService.getNotifications(
  'COORD_123',
  'Coordinator',
  {
    isRead: false // Only unread
  },
  {
    page: 1,
    limit: 20
  }
);

// Get unread count for dashboard
const unreadCount = await notificationService.getUnreadCount(
  'COORD_123',
  'Coordinator'
);

// Mark notification as read when viewed
await notificationService.markAsRead(
  'NOTIF_123',
  'COORD_123'
);

// Mark all as read
await notificationService.markAllAsRead(
  'COORD_123',
  'Coordinator'
);

// Get notification statistics
const notifStats = await notificationService.getNotificationStatistics(
  'COORD_123',
  'Coordinator'
);
console.log(notifStats.statistics);
// {
//   total: 50,
//   read: 35,
//   unread: 15,
//   read_percentage: 70,
//   unread_percentage: 30,
//   by_type: [
//     { type: 'AdminAccepted', count: 10 },
//     { type: 'NewRequest', count: 5 },
//     ...
//   ],
//   recent_count: 20
// }
```

---

## Integration Examples

### Dashboard Integration

```javascript
// Get dashboard data
const getCoordinatorDashboard = async (coordinatorId) => {
  const [unreadNotifications, latestNotifications] = await Promise.all([
    notificationService.getUnreadCount(coordinatorId, 'Coordinator'),
    notificationService.getLatestNotifications(coordinatorId, 'Coordinator', 5)
  ]);

  return {
    unread_count: unreadNotifications.unread_count,
    latest_notifications: latestNotifications.notifications
  };
};
```

### District Selection Dropdown

```javascript
// Get all districts for dropdown
const getDistrictsForDropdown = async () => {
  const result = await districtService.getAllDistricts({}, {
    page: 1,
    limit: 1000, // Get all
    sortBy: 'District_Name',
    sortOrder: 'asc'
  });

  return result.districts.map(d => ({
    value: d.District_ID,
    label: `${d.District_Name}, ${d.District_City} - ${d.Region}`
  }));
};
```

---

## Notification Workflow Integration

Notifications are automatically created by the EventRequestService, but you can also create them manually:

```javascript
// Create notification for new request (admin)
await notificationService.createNewRequestNotification(
  'ADMIN_123',
  'REQ_123',
  'EVENT_123',
  'COORD_123'
);

// Create notification for admin action (coordinator)
await notificationService.createAdminActionNotification(
  'COORD_123',
  'REQ_123',
  'EVENT_123',
  'Accepted', // or 'Rejected', 'Rescheduled'
  'Your request has been approved',
  null // rescheduledDate (if rescheduled)
);

// Create notification for coordinator action (admin)
await notificationService.createCoordinatorActionNotification(
  'ADMIN_123',
  'REQ_123',
  'EVENT_123',
  'Approved' // or 'Accepted', 'Rejected'
);
```

---

## Error Handling

All services throw descriptive errors:

```javascript
try {
  await districtService.createDistrict(districtData);
} catch (error) {
  console.error(error.message);
  // Examples:
  // "District ID already exists"
  // "District with this name already exists in this region"
  // "Failed to create district: ..."
}

try {
  await notificationService.markAsRead(notificationId, userId);
} catch (error) {
  console.error(error.message);
  // Examples:
  // "Notification not found"
  // "Unauthorized: Notification does not belong to this user"
}
```

---

## Data Enrichment

Both services enrich data with related information:

### District Service:
- Adds `coordinator_count` to each district
- Groups districts by region with statistics

### Notification Service:
- Adds `event` details (Event_ID, Title, Location, Start_Date)
- Adds `request` details (Request_ID, Status, Actions)
- Provides statistics and aggregations

---

## Performance Considerations

- **Pagination:** All list methods support pagination
- **Indexing:** Notifications use indexes on Recipient_ID, RecipientType, and IsRead
- **Batch Operations:** Mark multiple notifications as read in one operation
- **Statistics:** Consider caching for frequently accessed statistics

---

## Security Features

- **Authorization:** Notifications verify recipient ownership before operations
- **Validation:** Districts check for existing coordinators before deletion
- **Data Integrity:** Prevents duplicate districts (name + region)

---

**Ready for controller and route implementation! 🚀**

