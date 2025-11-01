# Event Services Documentation

This directory contains all event-related services for viewing, managing, and analyzing events in the UNITE Blood Bank Event Management System.

## Services Overview

### 1. `calendar.service.js`
**Purpose:** Calendar views (monthly, weekly, daily) with category-colored events

**Key Methods:**
- `getMonthView(year, month, filters)` - Get all events in a month
- `getWeekView(weekStartDate, filters)` - Get all events in a week
- `getDayView(date, filters)` - Get all events on a specific day
- `getUpcomingEventsSummary(startDate, endDate, filters)` - Get upcoming events summary
- `getCategoryColor(category)` - Get color code for event category

**Usage Example:**
```javascript
const { calendarService } = require('./event_services');

// Get month view
const monthView = await calendarService.getMonthView(2024, 12, {
  coordinator_id: 'COORD_123', // Optional
  category: 'BloodDrive', // Optional
  status: ['Approved', 'Completed'] // Optional
});

// Get week view
const weekView = await calendarService.getWeekView(new Date('2024-12-01'));

// Get day view
const dayView = await calendarService.getDayView(new Date('2024-12-15'));
```

**Category Colors:**
- BloodDrive: Red (#DC2626)
- Advocacy: Blue (#2563EB)
- Training: Green (#059669)

---

### 2. `eventOverview.service.js`
**Purpose:** Event listing, overview page, and search functionality

**Key Methods:**
- `getAllEvents(filters, options)` - Get all events with filtering and pagination
- `getEventsByStatus(filters)` - Get events grouped by status
- `getUpcomingEvents(limit, filters)` - Get upcoming events
- `getRecentEvents(limit, filters)` - Get recently created events
- `searchEvents(searchTerm, filters, options)` - Search events by title/location

**Usage Example:**
```javascript
const { eventOverviewService } = require('./event_services');

// Get all events with pagination
const events = await eventOverviewService.getAllEvents(
  {
    status: ['Approved', 'Completed'],
    date_from: '2024-01-01',
    date_to: '2024-12-31',
    coordinator_id: 'COORD_123', // Optional
    location: 'Bicol Medical Center' // Optional
  },
  {
    page: 1,
    limit: 20,
    sortBy: 'Start_Date',
    sortOrder: 'desc'
  }
);

// Search events
const searchResults = await eventOverviewService.searchEvents(
  'blood drive',
  {
    status: 'Completed'
  },
  {
    page: 1,
    limit: 10
  }
);

// Get upcoming events
const upcoming = await eventOverviewService.getUpcomingEvents(10, {
  coordinator_id: 'COORD_123'
});
```

---

### 3. `eventDetails.service.js`
**Purpose:** Complete event details with full information

**Key Methods:**
- `getEventDetails(eventId)` - Get complete event information
- `getEventStatistics(eventId)` - Get statistics for a specific event
- `checkEventCompleteness(eventId)` - Check if event has all required data

**Usage Example:**
```javascript
const { eventDetailsService } = require('./event_services');

// Get full event details
const details = await eventDetailsService.getEventDetails('EVENT_123');

console.log(details.event);
// {
//   Event_ID,
//   Event_Title,
//   Location,
//   Start_Date,
//   Status,
//   category: 'BloodDrive' | 'Advocacy' | 'Training',
//   categoryData: { ... },
//   coordinator: { id, name, email, phone, district_id },
//   admin: { id, name, email, access_level },
//   request: { Request_ID, Status, AdminAction, ... },
//   staff: [{ Staff_FullName, Role, ... }],
//   history: [{ action, actor, note, ... }],
//   ...
// }

// Get event statistics
const stats = await eventDetailsService.getEventStatistics('EVENT_123');

// Check completeness
const completeness = await eventDetailsService.checkEventCompleteness('EVENT_123');
```

---

### 4. `eventStatistics.service.js`
**Purpose:** Event analytics, reporting, and dashboard statistics

**Key Methods:**
- `getEventStatistics(filters)` - Get comprehensive statistics
- `getDashboardStatistics(filters)` - Get dashboard summary
- `getEventsByStatus(dateFilter)` - Status breakdown
- `getEventsByCategory(dateFilter)` - Category breakdown
- `getRequestStatistics(filters)` - Request workflow statistics
- `getBloodDriveStatistics(dateFilter)` - Blood drive specific stats
- `getCoordinatorStatistics(dateFilter)` - Coordinator activity stats
- `getTimelineStatistics(filters)` - Monthly timeline breakdown

**Usage Example:**
```javascript
const { eventStatisticsService } = require('./event_services');

// Get comprehensive statistics
const stats = await eventStatisticsService.getEventStatistics({
  date_from: '2024-01-01',
  date_to: '2024-12-31'
});

console.log(stats.statistics);
// {
//   overview: { total_events, date_range },
//   by_status: { breakdown, total, percentages },
//   by_category: { breakdown, total, percentages },
//   request_statistics: {
//     total_requests,
//     pending, accepted, rescheduled, rejected, completed,
//     completion_rate, rejection_rate,
//     avg_time_to_admin_action_days,
//     avg_time_to_completion_days
//   },
//   blood_drive_statistics: {
//     total_blood_drives,
//     total_target_bags,
//     avg_bags_per_drive,
//     venue_type_breakdown
//   },
//   coordinator_statistics: {
//     total_coordinators,
//     active_coordinators,
//     top_coordinators,
//     coordinator_activity
//   },
//   timeline: [{ year, month, total_events, completed_events, ... }]
// }

// Get dashboard statistics
const dashboard = await eventStatisticsService.getDashboardStatistics();
console.log(dashboard.dashboard);
// {
//   today_events,
//   week_events,
//   month_events,
//   pending_requests,
//   overall: { ... }
// }
```

---

## Complete Usage Examples

### Calendar View Implementation

```javascript
// Frontend: Calendar Component
const { calendarService } = require('./event_services');

// Monthly calendar
app.get('/api/calendar/month/:year/:month', async (req, res) => {
  const { year, month } = req.params;
  const result = await calendarService.getMonthView(
    parseInt(year),
    parseInt(month),
    {
      coordinator_id: req.user.coordinator_id, // If coordinator
      status: ['Approved', 'Completed']
    }
  );
  res.json(result);
});

// Weekly calendar
app.get('/api/calendar/week', async (req, res) => {
  const weekStart = new Date(req.query.start);
  const result = await calendarService.getWeekView(weekStart);
  res.json(result);
});
```

### Overview Page Implementation

```javascript
// Event listing page
app.get('/api/events', async (req, res) => {
  const result = await eventOverviewService.getAllEvents(
    {
      status: req.query.status ? req.query.status.split(',') : undefined,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      coordinator_id: req.user.coordinator_id,
      search: req.query.search
    },
    {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      sortBy: req.query.sortBy || 'Start_Date',
      sortOrder: req.query.sortOrder || 'desc'
    }
  );
  res.json(result);
});
```

### Event Details Page

```javascript
app.get('/api/events/:eventId', async (req, res) => {
  const result = await eventDetailsService.getEventDetails(req.params.eventId);
  res.json(result);
});
```

### Dashboard Implementation

```javascript
// Admin Dashboard
app.get('/api/admin/dashboard/stats', async (req, res) => {
  const result = await eventStatisticsService.getDashboardStatistics({
    date_from: req.query.date_from,
    date_to: req.query.date_to
  });
  res.json(result);
});

// Coordinator Dashboard
app.get('/api/coordinator/dashboard/stats', async (req, res) => {
  const stats = await eventStatisticsService.getEventStatistics({
    coordinator_id: req.user.coordinator_id,
    date_from: req.query.date_from,
    date_to: req.query.date_to
  });
  const upcoming = await eventOverviewService.getUpcomingEvents(5, {
    coordinator_id: req.user.coordinator_id
  });
  
  res.json({
    statistics: stats.statistics,
    upcoming_events: upcoming.events
  });
});
```

---

## Event Status Flow

### Event Status Values:
- `Pending` - Event created, waiting for admin approval
- `Approved` - Admin approved, waiting for coordinator confirmation
- `Rescheduled` - Admin rescheduled, waiting for coordinator response
- `Rejected` - Event rejected
- `Completed` - Event finalized and completed

### Request Status Values:
- `Pending_Admin_Review` - Waiting for admin action
- `Accepted_By_Admin` - Admin accepted, waiting for coordinator
- `Rescheduled_By_Admin` - Admin rescheduled
- `Rejected_By_Admin` - Admin rejected
- `Completed` - Coordinator confirmed, event completed
- `Rejected` - Coordinator rejected after admin action

---

## Filtering Options

### Common Filters:
- `status` - Event status (string or array)
- `date_from` - Start date (ISO string)
- `date_to` - End date (ISO string)
- `coordinator_id` - Filter by coordinator
- `location` - Filter by location (regex search)
- `search` - Search term (searches title)
- `category` - Filter by category (BloodDrive, Advocacy, Training)

---

## Response Formats

### Calendar View Response:
```javascript
{
  success: true,
  month: {
    year: 2024,
    month: 12,
    startDate: Date,
    endDate: Date,
    events: [...],
    eventsByDate: {
      '2024-12-15': [...],
      '2024-12-16': [...]
    },
    totalEvents: 10,
    stats: {
      byCategory: { BloodDrive: 5, Advocacy: 3, Training: 2 },
      byStatus: { Approved: 8, Completed: 2 }
    }
  }
}
```

### Event Overview Response:
```javascript
{
  success: true,
  events: [...],
  pagination: {
    page: 1,
    limit: 20,
    total: 50,
    pages: 3
  },
  filters: { ... }
}
```

### Event Details Response:
```javascript
{
  success: true,
  event: {
    Event_ID: 'EVENT_123',
    Event_Title: 'Community Blood Drive',
    Location: 'Bicol Medical Center',
    Start_Date: Date,
    Status: 'Completed',
    category: 'BloodDrive',
    categoryData: { Target_Donation: 50, VenueType: 'Hospital' },
    coordinator: { id, name, email, phone, district_id },
    admin: { id, name, email, access_level },
    request: { Request_ID, Status, AdminAction, ... },
    staff: [{ Staff_FullName, Role, assigned_at }],
    history: [{ action, actor, note, actionDate, ... }]
  }
}
```

---

## Integration with Other Services

- ✅ **Request Services:** Gets event request information
- ✅ **User Services:** Gets coordinator and admin information
- ✅ **Notification Services:** (Future) Event-related notifications

---

## Performance Considerations

- Calendar views use efficient date range queries
- Statistics are calculated on-demand (consider caching for heavy use)
- Pagination is implemented for large datasets
- Category detection requires additional queries (consider denormalization for performance)

---

## Future Enhancements

1. **Caching Layer:**
   - Cache calendar views
   - Cache statistics for frequently accessed periods

2. **Real-time Updates:**
   - WebSocket support for live calendar updates
   - Real-time dashboard statistics

3. **Export Functionality:**
   - Export events to CSV/Excel
   - PDF reports for events

4. **Advanced Analytics:**
   - Event success rate predictions
   - Resource utilization analytics
   - Trend analysis

---

**Ready for controller and route implementation! 🚀**

