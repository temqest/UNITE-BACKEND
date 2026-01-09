# Location Management API

## Overview

The Location API provides endpoints for managing a flexible hierarchical location system. The system supports provinces, districts, cities, municipalities, barangays, and custom location types with self-referencing parent-child relationships.

## Base URL

All location endpoints are under `/api/locations`:

```
POST   /api/locations
GET    /api/locations/tree
GET    /api/locations/:locationId
PUT    /api/locations/:locationId
DELETE /api/locations/:locationId
GET    /api/locations/provinces
GET    /api/locations/provinces/:provinceId/districts
GET    /api/locations/districts/:districtId/municipalities
GET    /api/locations/type/:type
```

## Authentication

All endpoints require authentication except some public location queries.

## Authorization

Location management requires specific permissions:

- **Read Locations:** `location.read` permission
- **Create Location:** `location.create` permission
- **Update Location:** `location.update` permission
- **Delete Location:** `location.delete` permission

## Endpoints

### 1. Create Location

Create a new location in the hierarchy.

**Endpoint:** `POST /api/locations`

**Access:** Private (requires `location.create` permission)

**Request Body:**
```json
{
  "name": "Manila",
  "type": "city",
  "parentId": "601abc1234567890abcdef",
  "code": "manila-city",
  "administrativeCode": "1339000",
  "metadata": {
    "isCity": true,
    "isCombined": false
  },
  "isActive": true
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Location name (2-200 characters) |
| type | string | Yes | Location type: `province`, `district`, `city`, `municipality`, `barangay`, `custom` |
| parentId | string | No | Parent location ID (ObjectId) |
| code | string | No | Unique code (slug, lowercase, alphanumeric + hyphens) |
| administrativeCode | string | No | Official administrative code |
| metadata | object | No | Metadata object (see below) |
| isActive | boolean | No | Active status (default: `true`) |

**Metadata Fields:**
| Field | Type | Description |
|-------|------|-------------|
| isCity | boolean | Flag for cities acting as districts |
| isCombined | boolean | Flag for combined districts |
| operationalGroup | string | Operational grouping identifier |
| custom | object | Additional custom metadata |

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "601abc1234567890abcdef",
    "name": "Manila",
    "type": "city",
    "parent": "601def1234567890abcdef",
    "code": "manila-city",
    "administrativeCode": "1339000",
    "level": 1,
    "province": "601ghi1234567890abcdef",
    "metadata": {
      "isCity": true
    },
    "isActive": true,
    "createdAt": "2024-01-20T15:00:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:3000/api/locations" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manila",
    "type": "city",
    "parentId": "601def1234567890abcdef"
  }'
```

---

### 2. Get Location Tree

Get hierarchical location tree structure.

**Endpoint:** `GET /api/locations/tree`

**Access:** Private (requires `location.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| rootId | string | No | Root location ID (if not provided, returns all root locations) |
| includeInactive | boolean | No | Include inactive locations (default: `false`) |
| maxDepth | number | No | Maximum depth to traverse |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "601abc1234567890abcdef",
    "name": "Metro Manila",
    "type": "province",
    "children": [
      {
        "_id": "601def1234567890abcdef",
        "name": "Manila",
        "type": "city",
        "children": [/* municipalities */]
      }
    ]
  }
}
```

---

### 3. Get Location by ID

Get detailed information about a specific location.

**Endpoint:** `GET /api/locations/:locationId`

**Access:** Private (requires `location.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | Yes | Location MongoDB ObjectId |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "601abc1234567890abcdef",
    "name": "Manila",
    "type": "city",
    "parent": "601def1234567890abcdef",
    "code": "manila-city",
    "level": 1,
    "province": "601ghi1234567890abcdef",
    "isActive": true
  }
}
```

---

### 4. Get Location Ancestors

Get all ancestor locations (parents up to root).

**Endpoint:** `GET /api/locations/:locationId/ancestors`

**Access:** Private (requires `location.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | Yes | Location ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| includeSelf | boolean | No | `false` | Include the location itself |
| includeInactive | boolean | No | `false` | Include inactive locations |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601ghi1234567890abcdef",
      "name": "Metro Manila",
      "type": "province"
    },
    {
      "_id": "601def1234567890abcdef",
      "name": "Manila District",
      "type": "district"
    }
  ]
}
```

---

### 5. Get Location Descendants

Get all descendant locations (children recursively).

**Endpoint:** `GET /api/locations/:locationId/descendants`

**Access:** Private (requires `location.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | Yes | Location ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| includeSelf | boolean | No | `false` | Include the location itself |
| includeInactive | boolean | No | `false` | Include inactive locations |
| includeCitiesAsDistricts | boolean | No | `true` | Include cities as districts |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601jkl1234567890abcdef",
      "name": "Barangay 1",
      "type": "barangay"
    }
  ]
}
```

---

### 6. Get All Provinces

Get all provinces.

**Endpoint:** `GET /api/locations/provinces`

**Access:** Private (requires `location.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| includeInactive | boolean | No | `false` | Include inactive provinces |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601abc1234567890abcdef",
      "name": "Metro Manila",
      "type": "province",
      "code": "metro-manila",
      "isActive": true
    }
  ]
}
```

---

### 7. Get Districts by Province

Get districts for a province (including cities acting as districts).

**Endpoint:** `GET /api/locations/provinces/:provinceId/districts`

**Access:** Private (requires `location.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| provinceId | string | Yes | Province location ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| includeCities | boolean | No | `true` | Include cities acting as districts |
| includeCombined | boolean | No | `true` | Include combined districts |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601def1234567890abcdef",
      "name": "Manila",
      "type": "city",
      "metadata": {
        "isCity": true
      }
    }
  ]
}
```

---

### 8. Get Municipalities by District

Get municipalities for a district (or city acting as district).

**Endpoint:** `GET /api/locations/districts/:districtId/municipalities`

**Access:** Private (requires `location.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| districtId | string | Yes | District location ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601ghi1234567890abcdef",
      "name": "Municipality 1",
      "type": "municipality"
    }
  ]
}
```

---

### 9. Get Locations by Type

Get locations filtered by type.

**Endpoint:** `GET /api/locations/type/:type`

**Access:** Private (requires `location.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | string | Yes | Location type: `province`, `district`, `city`, `municipality`, `barangay`, `custom` |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| parentId | string | No | Filter by parent location ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601abc1234567890abcdef",
      "name": "Manila",
      "type": "city",
      "parent": "601def1234567890abcdef"
    }
  ]
}
```

---

### 10. Update Location

Update an existing location.

**Endpoint:** `PUT /api/locations/:locationId`

**Access:** Private (requires `location.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | Yes | Location ID |

**Request Body:**
```json
{
  "name": "Updated Name",
  "isActive": false
}
```

**Request Fields:** (All optional, at least one required)

| Field | Type | Description |
|-------|------|-------------|
| name | string | Location name (2-200 characters) |
| code | string | Location code |
| administrativeCode | string | Administrative code |
| metadata | object | Metadata object |
| isActive | boolean | Active status |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "601abc1234567890abcdef",
    "name": "Updated Name",
    "isActive": false,
    "updatedAt": "2024-01-20T16:00:00.000Z"
  }
}
```

---

### 11. Delete Location

Soft delete a location (sets `isActive = false`).

**Endpoint:** `DELETE /api/locations/:locationId`

**Access:** Private (requires `location.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| locationId | string | Yes | Location ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Location deleted",
  "data": {
    "_id": "601abc1234567890abcdef",
    "isActive": false
  }
}
```

---

## User Location Assignment

### 12. Assign User to Location

Assign a user to a location with scope coverage.

**Endpoint:** `POST /api/users/:userId/locations`

**Access:** Private (requires `user.manage-roles` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID |

**Request Body:**
```json
{
  "locationId": "601abc1234567890abcdef",
  "scope": "descendants",
  "isPrimary": true,
  "expiresAt": "2024-12-31T23:59:59.000Z"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| locationId | string | Yes | Location ID |
| scope | string | Yes | Scope: `exact`, `descendants`, `ancestors`, `all` |
| isPrimary | boolean | No | Primary location flag (default: `false`) |
| expiresAt | date | No | Expiration date (ISO format) |

**Scope Types:**
- `exact` - Only the specific location
- `descendants` - Location and all child locations
- `ancestors` - Location and all parent locations
- `all` - Location, all ancestors, and all descendants

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "_id": "601xyz1234567890abcdef",
    "userId": "601abc1234567890abcdef",
    "locationId": "601def1234567890abcdef",
    "scope": "descendants",
    "isPrimary": true,
    "assignedAt": "2024-01-20T15:00:00.000Z"
  }
}
```

---

### 13. Get User Locations

Get all locations assigned to a user.

**Endpoint:** `GET /api/users/:userId/locations`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| includeDescendants | boolean | No | `true` | Include descendant locations based on scope |
| includeInactive | boolean | No | `false` | Include inactive locations |
| onlyActiveAssignments | boolean | No | `true` | Only active assignments |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601xyz1234567890abcdef",
      "locationId": {
        "_id": "601def1234567890abcdef",
        "name": "Manila",
        "type": "city"
      },
      "scope": "descendants",
      "isPrimary": true
    }
  ]
}
```

---

### 14. Get Primary Location

Get primary location for a user.

**Endpoint:** `GET /api/users/:userId/locations/primary`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "601xyz1234567890abcdef",
    "locationId": {
      "_id": "601def1234567890abcdef",
      "name": "Manila",
      "type": "city"
    },
    "scope": "descendants",
    "isPrimary": true
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "message": "No primary location found"
}
```

---

### 15. Revoke User Location

Revoke a user's location assignment.

**Endpoint:** `DELETE /api/users/:userId/locations/:locationId`

**Access:** Private (requires `user.manage-roles` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID |
| locationId | string | Yes | Location ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Location assignment revoked"
}
```

---

### 16. Check Location Access

Check if user has access to a specific location.

**Endpoint:** `GET /api/users/:userId/locations/:locationId/access`

**Access:** Private (requires `user.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID |
| locationId | string | Yes | Location ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| includeDescendants | boolean | No | `true` | Check descendant access |
| includeAncestors | boolean | No | `false` | Check ancestor access |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "hasAccess": true
  }
}
```

---

## Location Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete Location model schema.

### Key Fields

- **name** (required) - Location display name
- **type** (required) - Location type enum
- **parent** (optional) - Parent location reference (ObjectId)
- **code** (optional, unique) - Unique location code (slug)
- **level** (optional) - Hierarchical level (0 = root/province)
- **province** (optional) - Denormalized province reference
- **metadata** (object) - Special case flags and custom data
- **isActive** (default: `true`) - Active status

### Location Types

| Type | Description | Typical Level |
|------|-------------|---------------|
| `province` | Province | 0 |
| `district` | District | 1 |
| `city` | City (may act as district) | 1 |
| `municipality` | Municipality | 2 |
| `barangay` | Barangay | 3 |
| `custom` | Custom location type | Variable |

---

## Business Logic

### Location Hierarchy

The system supports flexible hierarchies:
- Provinces contain districts/cities
- Districts contain municipalities
- Municipalities contain barangays
- Cities can act as districts (metadata.isCity = true)
- Combined districts can represent multiple districts (metadata.isCombined = true)

### Location Access

User location assignments determine access:
- `exact` scope: User has access only to the assigned location
- `descendants` scope: User has access to location and all children
- `ancestors` scope: User has access to location and all parents
- `all` scope: User has access to entire hierarchy branch

---

## Related Documentation

- [Users API](API_USERS.md) - User location assignments
- [Models Reference](MODELS_REFERENCE.md) - Location, UserLocation models
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
