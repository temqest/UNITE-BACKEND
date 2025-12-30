# Add Refresh Button to Campaign Page

## Overview

Add a refresh button to the campaign page that allows users to manually refresh the request list without requiring a full browser refresh. The button should update requests, statuses, and available actions while maintaining current filters, sorting, and pagination.

## Requirements

1. **Refresh Button UI**: Add a refresh button to the CampaignToolbar component
2. **Refresh Functionality**: Invalidate cache and fetch latest requests with current filters/pagination
3. **Loading State**: Show loading indicator on button during refresh to prevent multiple triggers
4. **State Preservation**: Maintain all current filters, sorting, pagination, and tab selection
5. **Extensibility**: Design in a way that can be extended for automatic polling or real-time updates

## Current Architecture

### Campaign Page (`UNITE/app/dashboard/campaign/page.tsx`)
- Has `fetchRequests()` function that handles fetching with caching
- Uses `invalidateCache(/event-requests/)` to clear cache before refreshing
- Has `isLoadingRequests` state for loading indicator
- Already listens to `unite:requests-changed` event for automatic refresh
- Uses `requestCache.ts` utility for caching with TTL

### Campaign Toolbar (`UNITE/components/campaign/campaign-toolbar.tsx`)
- Contains action buttons section (line ~825)
- Has commented-out Export button (line ~827-838)
- Uses @gravity-ui/icons for icons
- Receives callbacks via props (onExport, onQuickFilter, etc.)

## Implementation Plan

### Phase 1: Add Refresh Handler to Campaign Page

**File**: `UNITE/app/dashboard/campaign/page.tsx`

1. **Create refresh handler function**:
   - Create `handleRefreshRequests` function that:
     - Invalidates cache for event-requests
     - Cancels any pending requests
     - Calls `fetchRequests()` to get fresh data
     - Handles errors gracefully
   - Add a ref to track if refresh is in progress to prevent multiple simultaneous refreshes

2. **Add refresh state management**:
   - Add `isRefreshing` state (separate from `isLoadingRequests` for initial load)
   - Set `isRefreshing` to true when refresh starts
   - Set `isRefreshing` to false when refresh completes (success or error)

3. **Pass handler to CampaignToolbar**:
   - Add `onRefresh` prop to CampaignToolbar component
   - Pass `handleRefreshRequests` function and `isRefreshing` state

**Code Structure**:
```typescript
const [isRefreshing, setIsRefreshing] = useState(false);
const isRefreshingRef = useRef(false);

const handleRefreshRequests = async () => {
  // Prevent multiple simultaneous refreshes
  if (isRefreshingRef.current) {
    return;
  }
  
  try {
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    
    // Invalidate cache for event-requests
    invalidateCache(/event-requests/);
    
    // Cancel any pending requests
    cancelRequests(/event-requests/);
    
    // Fetch fresh data (will use current filters/pagination from state)
    await fetchRequests();
  } catch (error) {
    console.error("[Campaign] Error refreshing requests:", error);
    // Error is already handled in fetchRequests
  } finally {
    setIsRefreshing(false);
    isRefreshingRef.current = false;
  }
};
```

### Phase 2: Add Refresh Button to Campaign Toolbar

**File**: `UNITE/components/campaign/campaign-toolbar.tsx`

1. **Update interface**:
   - Add `onRefresh?: () => void` to `CampaignToolbarProps`
   - Add `isRefreshing?: boolean` to `CampaignToolbarProps`

2. **Import refresh icon**:
   - Import refresh icon from `@gravity-ui/icons`
   - Common names: `Rotate`, `ArrowRotateRight`, `Refresh`, `ArrowClockwise`, or `RotateRight`
   - **Note**: Verify exact icon name in @gravity-ui/icons documentation or by checking available exports
   - If no refresh icon available, use `ArrowRotateRight` or similar rotation icon

3. **Add refresh button**:
   - Place button in the action buttons section (around line 825, near Export button location)
   - Use same styling as other action buttons (bordered, small size)
   - Show loading spinner when `isRefreshing` is true
   - Disable button when `isRefreshing` is true

**Code Structure**:
```typescript
// In imports - verify exact icon name from @gravity-ui/icons
import { Rotate, ... } from "@gravity-ui/icons"; // or ArrowRotateRight, Refresh, etc.

// In interface
interface CampaignToolbarProps {
  // ... existing props
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

// In component
export default function CampaignToolbar({
  // ... existing props
  onRefresh,
  isRefreshing = false,
}: CampaignToolbarProps) {
  // ... existing code

  // In action buttons section (around line 825)
  {onRefresh && (
    <Tooltip content="Refresh requests list">
      <Button
        className="border-default-200 bg-white font-medium text-xs"
        radius="md"
        size="sm"
        variant="bordered"
        startContent={
          isRefreshing ? (
            <Spinner size="sm" className="w-4 h-4" />
          ) : (
            <Rotate className="w-4 h-4" /> // Use verified icon name
          )
        }
        onPress={onRefresh}
        isDisabled={isRefreshing}
        isLoading={isRefreshing}
      >
        {isRefreshing ? "Refreshing..." : "Refresh"}
      </Button>
    </Tooltip>
  )}
}
```

### Phase 3: Ensure Proper State Management

**File**: `UNITE/app/dashboard/campaign/page.tsx`

1. **Update fetchRequests to handle refresh state**:
   - Ensure `fetchRequests` doesn't interfere with `isRefreshing` state
   - `isLoadingRequests` should still work for initial loads
   - Consider: Should refresh show different loading indicator than initial load?

2. **Maintain filter/pagination state**:
   - The existing `fetchRequests` function already uses current state (selectedTab, quickFilter, advancedFilter, currentPage, searchQuery)
   - No changes needed - refresh will automatically use current filters

3. **Update CampaignToolbar props**:
   ```typescript
   <CampaignToolbar
     // ... existing props
     onRefresh={handleRefreshRequests}
     isRefreshing={isRefreshing}
   />
   ```

### Phase 4: Add Visual Feedback

1. **Button loading state**:
   - Show spinner icon when refreshing
   - Change button text to "Refreshing..." when active
   - Disable button during refresh

2. **Optional: Toast notification**:
   - Could add a toast notification on successful refresh
   - Show error message if refresh fails (already handled by error modal)

### Phase 5: Extensibility for Future Polling/Real-time

1. **Extract refresh logic**:
   - Keep `handleRefreshRequests` as a reusable function
   - Can be called from:
     - Manual refresh button click
     - Automatic polling (setInterval)
     - Real-time event listeners (already exists: `unite:requests-changed`)

2. **Consider adding polling hook** (future):
   - Create `useRequestPolling` hook that can:
     - Poll at configurable intervals
     - Respect user activity (pause when tab inactive)
     - Can be enabled/disabled via settings

3. **Real-time integration** (future):
   - The existing `unite:requests-changed` event listener already handles automatic refresh
   - Refresh button provides manual control when needed

## Files to Modify

1. **`UNITE/app/dashboard/campaign/page.tsx`**
   - Add `isRefreshing` state and `isRefreshingRef` ref
   - Add `handleRefreshRequests` function
   - Pass `onRefresh` and `isRefreshing` props to CampaignToolbar

2. **`UNITE/components/campaign/campaign-toolbar.tsx`**
   - Add `onRefresh` and `isRefreshing` to props interface
   - Import refresh icon from @gravity-ui/icons (verify exact name: Rotate, ArrowRotateRight, Refresh, etc.)
   - Import Spinner from @heroui/spinner (if not already imported)
   - Add refresh button in action buttons section

## Testing Checklist

- [ ] Refresh button appears in toolbar
- [ ] Button shows loading state when clicked
- [ ] Button is disabled during refresh
- [ ] Requests list updates after refresh
- [ ] Current filters are maintained after refresh
- [ ] Current pagination is maintained after refresh
- [ ] Current tab selection is maintained after refresh
- [ ] Status counts update correctly after refresh
- [ ] Newly created requests appear after refresh
- [ ] Status changes (accept, reject, reschedule, confirm) are reflected after refresh
- [ ] Available actions update correctly after refresh
- [ ] Multiple rapid clicks don't trigger multiple refreshes
- [ ] Error handling works if refresh fails
- [ ] Cache is properly invalidated before refresh

## Implementation Order

1. Add refresh handler to CampaignPage (Phase 1)
2. Add refresh button to CampaignToolbar (Phase 2)
3. Connect handler to button (Phase 3)
4. Test and verify all functionality (Phase 4)
5. Document extensibility for future polling (Phase 5)

## Notes

- The refresh button complements the existing automatic refresh via `unite:requests-changed` event
- Users can manually refresh if they want to check for updates without waiting for automatic refresh
- The implementation is designed to be extended for polling/real-time updates in the future
- Cache invalidation ensures fresh data is always fetched
- Loading state prevents user confusion and multiple simultaneous requests

