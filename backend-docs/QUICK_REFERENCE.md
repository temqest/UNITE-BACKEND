# UNITE V2.0 - Quick Reference & Integration Guide

**Purpose:** Fast lookup for developers integrating v2.0 components  
**Target Audience:** Frontend developers, backend developers, QA team  
**Last Updated:** 2025

---

## Quick Start (5 minutes)

### Installation

```bash
# No additional packages needed - uses existing dependencies
# Ensure these are installed in package.json:
# - next
# - react
# - react-query (for data fetching)
# - socket.io-client
# - @sendgrid/client (for notifications)
```

### Basic Usage

```typescript
import EventCreationModalV2 from '@/components/events/EventCreationModalV2';

export function MyPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Create Event</button>
      <EventCreationModalV2
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onEventCreated={(id) => console.log('Created:', id)}
      />
    </>
  );
}
```

---

## Component Quick Reference

### Available Components

| Component | File | Purpose | Props |
|-----------|------|---------|-------|
| **EventCreationModalV2** | `components/events/EventCreationModalV2.tsx` | Event creation form | `isOpen`, `onClose`, `onEventCreated`, `useV1Fallback` |
| **EventRequestListV2** | `components/dashboard/EventRequestListV2.tsx` | Request list view | `filters`, `onFilterChange`, `onSelectRequest` |
| **EventRequestDetailV2** | `components/requests/EventRequestDetailV2.tsx` | Request details | `requestId`, `onClose`, `onActionComplete` |
| **RequestActionsV2** | `components/requests/RequestActionsV2.tsx` | Action buttons | `request`, `onActionComplete`, `disabled` |
| **CommentsAndHistoryV2** | `components/requests/CommentsAndHistoryV2.tsx` | Timeline & comments | `requestId`, `readonly` |
| **ProtectedComponent** | `components/common/ProtectedComponent.tsx` | RBAC wrapper | `permission`, `children`, `fallback` |
| **NotificationCenter** | `components/notifications/NotificationCenter.tsx` | Notifications | (auto-connects to Socket.IO) |

### Component Tree

```
App
├── RoleBasedAccessContext
│   └── ProtectedComponent (wrap sensitive areas)
│       ├── Page
│       │   ├── EventRequestListV2
│       │   ├── EventCreationModalV2
│       │   └── EventRequestDetailV2
│       └── RequestActionsV2
└── NotificationCenter (top-level, once per app)
```

---

## Service Quick Reference

### Service Functions

#### createEventRequestV2Service

```typescript
import {
  createEventRequestV2,
  validateEventRequestV2,
  getValidJurisdictionsV2,
  validateJurisdictionV2,
} from '@/services/createEventRequestV2Service';

// Validate form data
const result = validateEventRequestV2(formData);
if (!result.valid) {
  result.errors.forEach(e => console.error(e.field, e.message));
}

// Create request
const request = await createEventRequestV2({
  Event_Title: 'Blood Drive',
  Location: 'Hospital A',
  Start_Date: '2025-06-15T10:00:00Z',
  Category: 'BloodDrive',
  Target_Donation: 100,
});

// Get user's valid jurisdictions
const locs = await getValidJurisdictionsV2();
console.log(locs.provinces); // [{ _id, name }, ...]

// Validate location
const isValid = await validateJurisdictionV2('province-id', 'district-id');
```

#### eventRequestListService

```typescript
import {
  getEventRequestsV2,
  applyFilters,
  sortRequests,
} from '@/services/eventRequestListService';

// Get all requests
const data = await getEventRequestsV2({
  page: 1,
  limit: 25,
  sort: 'createdAt',
});

// Apply filters
const filtered = await getEventRequestsV2({
  status: ['Pending', 'Under Review'],
  category: 'Training',
  dateRange: { start: '2025-01-01', end: '2025-12-31' },
});
```

#### eventRequestActionService

```typescript
import {
  approveRequest,
  rejectRequest,
  assignCoordinator,
  addComment,
  getRequestHistory,
} from '@/services/eventRequestActionService';

// Approve request
await approveRequest(requestId, {
  reason: 'All requirements met',
  assignCoordinator: 'coordinator-id',
});

// Reject request
await rejectRequest(requestId, {
  reason: 'Outside coverage area',
});

// Add comment
await addComment(requestId, {
  text: 'Need more details on venue',
  attachments: [],
});

// Get history
const history = await getRequestHistory(requestId);
```

---

## Hook Quick Reference

### Custom Hooks

#### useUserPermissions

```typescript
import { useUserPermissions } from '@/hooks/useUserPermissions';

function MyComponent() {
  const perms = useUserPermissions();
  
  return (
    <div>
      {perms.canCreate && <button>Create Request</button>}
      {perms.canApprove && <button>Approve</button>}
      {perms.canReview && <button>Review</button>}
    </div>
  );
}
```

#### useRequestStateMachine

```typescript
import { useRequestStateMachine } from '@/hooks/useRequestStateMachine';

function RequestActions({ requestId }) {
  const { state, canTransitionTo, executeAction } = useRequestStateMachine(requestId);
  
  return (
    <div>
      Current: {state.name}
      {canTransitionTo('Approved') && (
        <button onClick={() => executeAction('approve')}>Approve</button>
      )}
    </div>
  );
}
```

#### useRequestActions

```typescript
import { useRequestActions } from '@/hooks/useRequestActions';

function RequestForm({ requestId }) {
  const { executeAction, isPending, error } = useRequestActions(requestId);
  
  const handleApprove = async () => {
    await executeAction('approve', { reason: 'OK' });
  };
  
  return (
    <button onClick={handleApprove} disabled={isPending}>
      {isPending ? 'Approving...' : 'Approve'}
    </button>
  );
}
```

---

## API Endpoints Reference

### Request Management

```
GET    /api/v2/event-requests                 - List requests
POST   /api/v2/event-requests                 - Create request
GET    /api/v2/event-requests/:id             - Get details
PATCH  /api/v2/event-requests/:id             - Update request
POST   /api/v2/event-requests/:id/actions     - Execute action
GET    /api/v2/event-requests/:id/history     - Get history
POST   /api/v2/event-requests/:id/comments    - Add comment
```

### Jurisdictions

```
GET    /api/v2/jurisdictions                  - Get user's jurisdictions
POST   /api/v2/jurisdictions/validate         - Validate location
```

### State Machine

```
GET    /api/v2/state-machine/transitions      - Valid transitions
GET    /api/v2/state-machine/actions          - Available actions
GET    /api/v2/state-machine/states           - All states
```

### Real-Time (Socket.IO)

```
Socket namespace: /api/v2/requests
Events:
  - request:created           (data: V2EventRequest)
  - request:updated           (data: V2EventRequest)
  - request:state-changed     (data: { requestId, state })
  - request:action-executed   (data: { requestId, action })
  - request:comment-added     (data: { requestId, comment })
  - request:history-updated   (data: { requestId, history })
```

---

## Common Patterns

### Pattern 1: Create Event and Redirect

```typescript
function CreateEventFlow() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleEventCreated = (eventId: string) => {
    router.push(`/requests/${eventId}`);
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Create</button>
      <EventCreationModalV2
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onEventCreated={handleEventCreated}
      />
    </>
  );
}
```

### Pattern 2: List with Real-Time Updates

```typescript
function RequestsList() {
  const [requests, setRequests] = useState([]);
  
  useEffect(() => {
    // Load initial data
    getEventRequestsV2().then(setRequests);
    
    // Subscribe to real-time updates
    const socket = io('/api/v2/requests');
    socket.on('request:created', (request) => {
      setRequests(prev => [request, ...prev]);
    });
    socket.on('request:updated', (request) => {
      setRequests(prev => prev.map(r => r._id === request._id ? request : r));
    });
    
    return () => socket.disconnect();
  }, []);

  return (
    <EventRequestListV2
      requests={requests}
      onFilterChange={(filters) => {
        // Apply filters
      }}
    />
  );
}
```

### Pattern 3: Protected Component

```typescript
function AdminPanel() {
  return (
    <ProtectedComponent
      permission="admin.access"
      fallback={<div>Access Denied</div>}
    >
      <div>Admin Dashboard</div>
    </ProtectedComponent>
  );
}
```

### Pattern 4: Handle Request Actions

```typescript
function RequestDetail({ requestId }) {
  const { executeAction, isPending } = useRequestActions(requestId);

  const handleApprove = async () => {
    try {
      await executeAction('approve', {
        reason: 'Looks good',
      });
      toast.success('Request approved');
    } catch (error) {
      toast.error(error.message);
    }
  };

  return (
    <button onClick={handleApprove} disabled={isPending}>
      Approve
    </button>
  );
}
```

---

## Error Handling

### Try-Catch Pattern

```typescript
try {
  const result = await createEventRequestV2(data);
  toast.success('Created successfully');
} catch (error) {
  if (error.message.includes('Validation failed')) {
    // Handle validation error
    toast.error('Please fix validation errors');
  } else if (error.message.includes('Jurisdiction')) {
    // Handle authorization error
    toast.error('Location not in your coverage area');
  } else {
    // Handle unexpected error
    toast.error(error.message);
  }
}
```

### Form Validation Pattern

```typescript
const validation = validateEventRequestV2(formData);
if (!validation.valid) {
  // Show errors to user
  validation.errors.forEach(error => {
    setFieldError(error.field, error.message);
  });
  return;
}
// Proceed with submission
```

### State Machine Guard Pattern

```typescript
const { canTransitionTo } = useRequestStateMachine(requestId);

if (!canTransitionTo('Approved')) {
  // Show error - cannot transition
  toast.error('Cannot approve in current state');
  return;
}
// Proceed with action
```

---

## Debugging

### Enable Debug Mode

```env
# .env.local
NEXT_PUBLIC_DEBUG_MODE=true
NEXT_PUBLIC_LOG_SOCKET_EVENTS=true
```

### Console Logging

```typescript
// In createEventRequestV2Service.ts
if (process.env.NEXT_PUBLIC_DEBUG_MODE) {
  console.log('[createEventRequestV2] Request data:', payload);
  console.log('[createEventRequestV2] Response:', response);
}
```

### Check Network Requests

```javascript
// Browser DevTools → Network tab
// Filter by 'api/v2'
// Check:
// - Request payload (correct data?)
// - Response status (200?)
// - Response body (success: true?)
```

### Check Real-Time Connection

```javascript
// Browser console
io('/api/v2/requests').on('connect', () => {
  console.log('Connected to Socket.IO');
});
io('/api/v2/requests').on('disconnect', () => {
  console.log('Disconnected from Socket.IO');
});
io('/api/v2/requests').on('request:created', (data) => {
  console.log('Request created:', data);
});
```

---

## Performance Tips

### Optimization 1: Memoize Components

```typescript
import React, { memo } from 'react';

// Wrap component to prevent unnecessary re-renders
const RequestItem = memo(({ request }) => {
  return <div>{request.Event_Title}</div>;
});
```

### Optimization 2: Lazy Load

```typescript
import dynamic from 'next/dynamic';

const EventDetailV2 = dynamic(
  () => import('@/components/requests/EventRequestDetailV2'),
  { loading: () => <div>Loading...</div> }
);
```

### Optimization 3: Debounce Filters

```typescript
import { useDebouncedCallback } from 'use-debounce';

const debouncedFilter = useDebouncedCallback((filters) => {
  // Apply filters after 300ms of inactivity
  applyFilters(filters);
}, 300);
```

### Optimization 4: Virtual Scrolling

```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={requests.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <RequestItem request={requests[index]} />
    </div>
  )}
</FixedSizeList>
```

---

## Troubleshooting

### Problem: Modal not opening

**Solution:**
```typescript
const [isOpen, setIsOpen] = useState(false);

// Make sure prop is correctly passed
<EventCreationModalV2
  isOpen={isOpen}  // ✅ Must be boolean
  onClose={() => setIsOpen(false)}
/>

// Debug:
console.log('isOpen:', isOpen); // Should be true when clicking button
```

### Problem: Validation showing errors incorrectly

**Solution:**
```typescript
// Use field name exactly as in type
// ✅ Correct:
<input name="Event_Title" />

// ❌ Wrong:
<input name="eventTitle" />
<input name="event_title" />
```

### Problem: No jurisdictions loading

**Solution:**
```typescript
// Check:
1. API endpoint exists: GET /api/v2/jurisdictions
2. User is authenticated (JWT token present)
3. Network tab shows response with data
4. Error is logged in browser console

// Debug:
const locs = await getValidJurisdictionsV2();
console.log('Jurisdictions:', locs);
```

### Problem: Real-time updates not working

**Solution:**
```typescript
// Check:
1. Socket.IO is connected: io().connected === true
2. Event listeners are registered
3. Backend is broadcasting events
4. Network tab shows Socket.IO upgrade (XHR → WebSocket)

// Debug:
const socket = io('/api/v2/requests');
socket.on('connect', () => console.log('Connected'));
socket.on('request:created', (data) => console.log('Updated:', data));
```

---

## Common Tasks

### Task 1: Add a new event category

**Steps:**
1. Update `CreateEventRequestV2Data` type in `createEventRequestV2Service.ts`
2. Add category-specific fields validation
3. Update `EventCreationModalV2.tsx` to show new fields
4. Add conditional rendering in form
5. Test validation and API call

**Example:**
```typescript
// In createEventRequestV2Service.ts
export interface CreateEventRequestV2Data {
  // ...
  Category: 'Training' | 'BloodDrive' | 'Advocacy' | 'NewCategory'; // Add here
  NewCategoryField?: string; // Add type
}

// In validation
if (data.Category === 'NewCategory') {
  if (!data.NewCategoryField) {
    errors.push({ field: 'NewCategoryField', message: 'Required' });
  }
}

// In EventCreationModalV2.tsx
{formData.Category === 'NewCategory' && (
  <div>
    <label>New Category Field</label>
    <input name="NewCategoryField" />
  </div>
)}
```

### Task 2: Add a new action type

**Steps:**
1. Add action to `REQUEST_ACTIONS` in state machine
2. Add transition rule
3. Create action handler in backend
4. Add UI button in `RequestActionsV2.tsx`
5. Add modal for complex actions

### Task 3: Add a new filter option

**Steps:**
1. Add filter to `EventRequestFiltersV2.tsx` UI
2. Add filter field to backend query
3. Test with multiple values
4. Update filter persistence (localStorage)

### Task 4: Extend permission system

**Steps:**
1. Add permission to permission matrix
2. Add check in `useUserPermissions()` hook
3. Wrap components with `ProtectedComponent`
4. Add guard in state machine transitions
5. Test with different user roles

---

## Version Info

| Component | Version | Status |
|-----------|---------|--------|
| EventCreationModalV2 | 2.0 | ✅ Stable |
| EventRequestListV2 | 2.0 | ✅ Stable |
| EventRequestDetailV2 | 2.0 | ✅ Stable |
| RequestActionsV2 | 2.0 | ✅ Stable |
| RoleBasedAccessContext | 2.0 | ✅ Stable |
| State Machine | 2.0 | ✅ Stable |
| Broadcast Model | 2.0 | ✅ Stable |

**Compatibility:**
- Next.js: 14+
- React: 18+
- Node: 18+
- TypeScript: 5+

---

## Support & Resources

### Documentation
- [V2.0 Implementation Complete](./V2.0_IMPLEMENTATION_COMPLETE.md)
- [Chunk 5: Request Creation Guide](./CHUNK_5_REQUEST_CREATION_GUIDE.md)
- [Chunk 4: Request Details Guide](./CHUNK_4_REQUEST_DETAILS_GUIDE.md)
- [Chunk 3: Dashboard Guide](./CHUNK_3_DASHBOARD_GUIDE.md)
- [Chunk 2: State Machine Guide](./CHUNK_2_STATE_MACHINE_GUIDE.md)
- [Chunk 1: Permissions Guide](./CHUNK_1_PERMISSIONS_GUIDE.md)

### External Links
- React Documentation: https://react.dev
- Next.js Documentation: https://nextjs.org/docs
- Socket.IO Documentation: https://socket.io/docs/v4

### Getting Help
1. Check error logs in browser console
2. Review troubleshooting section above
3. Check component Props documentation
4. Search existing documentation
5. Contact UNITE Development Team

---

**Quick Links:**
- 🚀 [Getting Started](#quick-start-5-minutes)
- 📚 [Component Reference](#component-quick-reference)
- 🔧 [Services Reference](#service-quick-reference)
- 🪝 [Hooks Reference](#hook-quick-reference)
- 🐛 [Debugging](#debugging)
- ⚡ [Performance](#performance-tips)
- ❓ [Troubleshooting](#troubleshooting)

---

**Document Version:** 1.0  
**Last Updated:** 2025  
**Audience:** Developers, QA, DevOps
