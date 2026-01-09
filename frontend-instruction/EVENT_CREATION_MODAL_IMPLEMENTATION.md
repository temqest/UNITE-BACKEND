# Event Creation Modal Implementation Guide

## Overview

This guide provides the exact implementation requirements for the Event Creation modal to properly handle Coordinator and Stakeholder visibility and auto-filling based on user authority.

## User Authority Levels

- **System Admin**: `authority >= 80`
- **Coordinator**: `authority >= 60 && authority < 80`
- **Stakeholder**: `authority < 60`

## API Endpoints

### 1. Get User Authority
**Endpoint**: `GET /api/rbac/authority/user/:userId`  
**Access**: Users can read their own authority (self-read bypass)  
**Response**:
```json
{
  "success": true,
  "data": {
    "userId": "userId",
    "authority": 60,
    "tierName": "COORDINATOR"
  }
}
```

### 2. Get Coordinators
**Endpoint**: `GET /api/users/by-capability?capability=request.create`  
**Access**: Requires `user.read` permission  
**Response**: Array of users with `authority >= 60` and `request.review` capability

### 3. Get Stakeholders
**Endpoint**: `GET /api/users/by-capability?capability=request.review`  
**Access**: Requires `user.read` permission  
**Query Parameters**:
- `locationId` (optional): Municipality ID to filter stakeholders by coordinator's coverage area
- `page` (default: 1)
- `limit` (default: 50)

**Response**: Array of users with `authority < 60` in requester's jurisdiction

### 4. Get Stakeholder's Coordinator
**Endpoint**: `GET /api/users/:userId/coordinator`  
**Access**: Requires `user.read` permission  
**Response**:
```json
{
  "success": true,
  "data": {
    "_id": "coordinatorId",
    "email": "coordinator@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "authority": 60
  }
}
```

## Implementation by User Type

### System Admin (authority >= 80)

**On Modal Open:**
1. Fetch all coordinators:
   ```typescript
   const coordinatorsRes = await fetch('/api/users/by-capability?capability=request.create', {
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     }
   });
   const coordinators = await coordinatorsRes.json();
   // coordinators.data contains array of coordinator users
   ```

2. Populate coordinator dropdown with all coordinators

3. **When Coordinator is Selected:**
   - Extract coordinator's municipality IDs from `coverageAreas[].municipalityIds[]`
   - Fetch stakeholders for selected coordinator:
     ```typescript
     // Get first municipality from coordinator's coverage areas
     const municipalityId = selectedCoordinator.coverageAreas[0]?.municipalityIds[0];
     
     const stakeholdersRes = await fetch(
       `/api/users/by-capability?capability=request.review&locationId=${municipalityId}`,
       {
         headers: {
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
         }
       }
     );
     const stakeholders = await stakeholdersRes.json();
     // stakeholders.data contains array of stakeholder users
     ```

4. Populate stakeholder dropdown with stakeholders from selected coordinator's jurisdiction

### Coordinator (authority >= 60 && < 80)

**On Modal Open:**
1. **Auto-fill Coordinator Field:**
   ```typescript
   // Coordinator field should be locked to self
   setCoordinator(currentUserId);
   setCoordinatorOptions([{
     key: currentUserId,
     label: `${user.firstName} ${user.lastName}`.trim()
   }]);
   setCoordinatorLocked(true);
   ```

2. **Fetch Stakeholders in Coordinator's Jurisdiction:**
   ```typescript
   const stakeholdersRes = await fetch(
     '/api/users/by-capability?capability=request.review',
     {
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       }
     }
   );
   const stakeholders = await stakeholdersRes.json();
   // Backend automatically filters to stakeholders in coordinator's jurisdiction
   // (same organization + municipality in coverage areas)
   ```

3. Populate stakeholder dropdown with stakeholders

4. **Note**: Coordinator field should be locked/disabled - coordinator cannot change it

### Stakeholder (authority < 60)

**On Modal Open:**
1. **Get User Authority:**
   ```typescript
   const authorityRes = await fetch(`/api/rbac/authority/user/${currentUserId}`, {
     headers: {
       'Authorization': `Bearer ${token}`,
       'Content-Type': 'application/json'
     }
   });
   const authorityData = await authorityRes.json();
   const userAuthority = authorityData.data.authority;
   ```

2. **If Stakeholder (authority < 60):**
   - **Fetch Assigned Coordinator:**
     ```typescript
     const coordRes = await fetch(`/api/users/${currentUserId}/coordinator`, {
       headers: {
         'Authorization': `Bearer ${token}`,
         'Content-Type': 'application/json'
       }
     });
     const coordinator = await coordRes.json();
     
     // Auto-fill coordinator field
     setCoordinator(coordinator.data._id);
     setCoordinatorOptions([{
       key: coordinator.data._id,
       label: `${coordinator.data.firstName} ${coordinator.data.lastName}`.trim()
     }]);
     setCoordinatorLocked(true);
     ```

   - **Auto-fill Stakeholder Field:**
     ```typescript
     setStakeholder(currentUserId);
     setStakeholderOptions([{
       key: currentUserId,
       label: `${user.firstName} ${user.lastName}`.trim()
     }]);
     setStakeholderLocked(true);
     ```

3. **Note**: Both fields should be locked/disabled - stakeholder cannot change them

## Error Handling

### 403 Forbidden on getUserAuthority
- **Cause**: User doesn't have `user.read` permission
- **Solution**: Backend now allows self-read (users can read their own authority)
- **If still occurs**: Check that `userId` matches authenticated user's ID

### No Stakeholders Found (Coordinator)
- **Cause**: Jurisdiction filtering is too strict or stakeholders don't match coordinator's org/municipality
- **Check**: 
  - Coordinator has `organizations[]` assigned
  - Coordinator has `coverageAreas[].municipalityIds[]` assigned
  - Stakeholders have matching `organizations[].organizationId` and `locations.municipalityId`

### No Coordinator Found (Stakeholder)
- **Cause**: Stakeholder doesn't have matching organization/municipality with any coordinator
- **Check**:
  - Stakeholder has `organizations[]` assigned
  - Stakeholder has `locations.municipalityId` assigned
  - There exists a coordinator with matching organization and coverage area containing stakeholder's municipality

## Field States

### Coordinator Field
- **System Admin**: Dropdown (unlocked), shows all coordinators
- **Coordinator**: Auto-filled to self, locked/disabled
- **Stakeholder**: Auto-filled to assigned coordinator, locked/disabled

### Stakeholder Field
- **System Admin**: Dropdown (unlocked), shows stakeholders from selected coordinator's jurisdiction
- **Coordinator**: Dropdown (unlocked), shows stakeholders in coordinator's jurisdiction
- **Stakeholder**: Auto-filled to self, locked/disabled

## Example Implementation

```typescript
// Event Creation Modal Component
const EventCreationModal = () => {
  const [coordinator, setCoordinator] = useState<string | null>(null);
  const [coordinatorOptions, setCoordinatorOptions] = useState<Option[]>([]);
  const [coordinatorLocked, setCoordinatorLocked] = useState(false);
  
  const [stakeholder, setStakeholder] = useState<string | null>(null);
  const [stakeholderOptions, setStakeholderOptions] = useState<Option[]>([]);
  const [stakeholderLocked, setStakeholderLocked] = useState(false);
  
  const currentUser = useCurrentUser(); // Get current user from context/auth
  const currentUserId = currentUser._id;
  
  useEffect(() => {
    const initializeFields = async () => {
      try {
        // Get user authority
        const authorityRes = await fetch(`/api/rbac/authority/user/${currentUserId}`, {
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!authorityRes.ok) {
          throw new Error(`Failed to get authority: ${authorityRes.status}`);
        }
        
        const authorityData = await authorityRes.json();
        const userAuthority = authorityData.data.authority;
        
        if (userAuthority >= 80) {
          // System Admin: Fetch coordinators
          const coordRes = await fetch('/api/users/by-capability?capability=request.create', {
            headers: {
              'Authorization': `Bearer ${getToken()}`,
              'Content-Type': 'application/json'
            }
          });
          const coordData = await coordRes.json();
          
          setCoordinatorOptions(
            coordData.data.map((c: any) => ({
              key: c._id,
              label: `${c.firstName} ${c.lastName}`.trim()
            }))
          );
          setCoordinatorLocked(false);
          
        } else if (userAuthority >= 60) {
          // Coordinator: Auto-fill self
          setCoordinator(currentUserId);
          setCoordinatorOptions([{
            key: currentUserId,
            label: `${currentUser.firstName} ${currentUser.lastName}`.trim()
          }]);
          setCoordinatorLocked(true);
          
          // Fetch stakeholders
          const stakeRes = await fetch('/api/users/by-capability?capability=request.review', {
            headers: {
              'Authorization': `Bearer ${getToken()}`,
              'Content-Type': 'application/json'
            }
          });
          const stakeData = await stakeRes.json();
          
          setStakeholderOptions(
            stakeData.data.map((s: any) => ({
              key: s._id,
              label: `${s.firstName} ${s.lastName}`.trim()
            }))
          );
          setStakeholderLocked(false);
          
        } else {
          // Stakeholder: Auto-fill coordinator and self
          const coordRes = await fetch(`/api/users/${currentUserId}/coordinator`, {
            headers: {
              'Authorization': `Bearer ${getToken()}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (!coordRes.ok) {
            throw new Error(`Failed to get coordinator: ${coordRes.status}`);
          }
          
          const coordData = await coordRes.json();
          
          setCoordinator(coordData.data._id);
          setCoordinatorOptions([{
            key: coordData.data._id,
            label: `${coordData.data.firstName} ${coordData.data.lastName}`.trim()
          }]);
          setCoordinatorLocked(true);
          
          setStakeholder(currentUserId);
          setStakeholderOptions([{
            key: currentUserId,
            label: `${currentUser.firstName} ${currentUser.lastName}`.trim()
          }]);
          setStakeholderLocked(true);
        }
      } catch (error) {
        console.error('Error initializing event creation fields:', error);
        // Handle error (show message, etc.)
      }
    };
    
    if (currentUserId) {
      initializeFields();
    }
  }, [currentUserId]);
  
  // Handle coordinator selection for System Admin
  const handleCoordinatorChange = async (selectedCoordinatorId: string) => {
    setCoordinator(selectedCoordinatorId);
    
    // Find selected coordinator to get municipality
    const selectedCoord = coordinatorOptions.find(c => c.key === selectedCoordinatorId);
    // You may need to fetch coordinator details to get coverageAreas
    const coordDetailsRes = await fetch(`/api/users/${selectedCoordinatorId}`, {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'Content-Type': 'application/json'
      }
    });
    const coordDetails = await coordDetailsRes.json();
    
    // Get first municipality from coordinator's coverage areas
    const municipalityId = coordDetails.data.coverageAreas?.[0]?.municipalityIds?.[0];
    
    if (municipalityId) {
      const stakeRes = await fetch(
        `/api/users/by-capability?capability=request.review&locationId=${municipalityId}`,
        {
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const stakeData = await stakeRes.json();
      
      setStakeholderOptions(
        stakeData.data.map((s: any) => ({
          key: s._id,
          label: `${s.firstName} ${s.lastName}`.trim()
        }))
      );
    }
  };
  
  // Render form with coordinator and stakeholder fields
  // ...
};
```

## Stakeholder Page Implementation

The Stakeholder Page should use the same filtering logic:

```typescript
// For Coordinator viewing Stakeholder Page
const fetchStakeholders = async () => {
  const res = await fetch('/api/users/by-capability?capability=request.review', {
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  // data.data contains stakeholders in coordinator's jurisdiction
  return data.data;
};
```

## Key Points

1. **Always check user authority first** before deciding what to fetch
2. **Use `/api/users/by-capability`** for fetching coordinators and stakeholders (not legacy endpoints)
3. **Backend handles jurisdiction filtering** - coordinators automatically see only their stakeholders
4. **Stakeholders use `/api/users/:userId/coordinator`** to get their assigned coordinator
5. **Lock fields appropriately** based on user authority
6. **Handle errors gracefully** - 403 errors should be rare now with self-read bypass

