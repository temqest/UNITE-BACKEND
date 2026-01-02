# Blood Bag Inventory API

## Overview

The Inventory API provides endpoints for managing blood bag inventory. Blood bags are tracked by type and can be created, read, updated, and deleted.

## Base URL

All inventory endpoints are under `/api/inventory`:

```
GET    /api/inventory (aliased as /api/bloodbags)
GET    /api/inventory/:bagId (aliased as /api/bloodbags/:bloodBagId)
POST   /api/inventory (aliased as /api/bloodbags)
PUT    /api/inventory/:bagId (aliased as /api/bloodbags/:bloodBagId)
DELETE /api/inventory/:bagId (aliased as /api/bloodbags/:bloodBagId)
```

## Authentication

All endpoints require authentication.

## Authorization

Inventory management requires specific permissions:

- **Read Inventory:** `request.read` permission
- **Create Blood Bag:** Appropriate permission (can be customized)
- **Update Blood Bag:** `request.update` permission
- **Delete Blood Bag:** `request.delete` permission

## Endpoints

### 1. List Blood Bags

Get all blood bags with filtering and pagination.

**Endpoint:** `GET /api/bloodbags`

**Access:** Private (requires `request.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| bloodType | string | No | - | Filter by blood type (`A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`) |
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page |
| sortBy | string | No | `createdAt` | Sort field |
| sortOrder | string | No | `desc` | Sort order (`asc` or `desc`) |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "601abc1234567890abcdef",
      "BloodBag_ID": "BB001",
      "BloodType": "O+",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

**cURL Example:**
```bash
curl -X GET "http://localhost:3000/api/bloodbags?bloodType=O+&page=1&limit=20" \
  -H "Authorization: Bearer <token>"
```

---

### 2. Get Blood Bag by ID

Get detailed information about a specific blood bag.

**Endpoint:** `GET /api/bloodbags/:bloodBagId`

**Access:** Private (requires `request.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bloodBagId | string | Yes | Blood bag ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "601abc1234567890abcdef",
    "BloodBag_ID": "BB001",
    "BloodType": "O+",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "message": "Blood bag not found"
}
```

---

### 3. Create Blood Bag

Create a new blood bag record.

**Endpoint:** `POST /api/bloodbags`

**Access:** Private (requires appropriate permission)

**Request Body:**
```json
{
  "BloodBag_ID": "BB001",
  "BloodType": "O+"
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| BloodBag_ID | string | Yes | Unique blood bag identifier |
| BloodType | string | Yes | Blood type enum: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` |

**Validation Rules:**
- BloodBag_ID must be unique
- BloodType must be valid enum value

**Success Response (201):**
```json
{
  "success": true,
  "message": "Blood bag created successfully",
  "data": {
    "_id": "601abc1234567890abcdef",
    "BloodBag_ID": "BB001",
    "BloodType": "O+",
    "createdAt": "2024-01-20T15:00:00.000Z",
    "updatedAt": "2024-01-20T15:00:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "BloodBag ID is required",
    "BloodType must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-"
  ]
}
```

**409 Conflict** - Duplicate ID
```json
{
  "success": false,
  "message": "BloodBag ID already exists"
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:3000/api/bloodbags" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "BloodBag_ID": "BB001",
    "BloodType": "O+"
  }'
```

---

### 4. Update Blood Bag

Update an existing blood bag.

**Endpoint:** `PUT /api/bloodbags/:bloodBagId`

**Access:** Private (requires `request.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bloodBagId | string | Yes | Blood bag ID |

**Request Body:**
```json
{
  "BloodType": "A+"
}
```

**Request Fields:** (All optional, at least one required)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| BloodType | string | No | Blood type enum |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Blood bag updated successfully",
  "data": {
    "_id": "601abc1234567890abcdef",
    "BloodBag_ID": "BB001",
    "BloodType": "A+",
    "updatedAt": "2024-01-20T16:00:00.000Z"
  }
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    "BloodType must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-"
  ]
}
```

**404 Not Found:**
```json
{
  "success": false,
  "message": "Blood bag not found"
}
```

---

### 5. Delete Blood Bag

Delete a blood bag.

**Endpoint:** `DELETE /api/bloodbags/:bloodBagId`

**Access:** Private (requires `request.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| bloodBagId | string | Yes | Blood bag ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Blood bag deleted successfully"
}
```

**Error Responses:**

**404 Not Found:**
```json
{
  "success": false,
  "message": "Blood bag not found"
}
```

---

## Blood Bag Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete BloodBag model schema.

### Key Fields

- **BloodBag_ID** (required, unique) - Unique blood bag identifier
- **BloodType** (required) - Blood type enum: `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`

### Blood Type Values

| Value | Description |
|-------|-------------|
| `A+` | A positive |
| `A-` | A negative |
| `B+` | B positive |
| `B-` | B negative |
| `AB+` | AB positive |
| `AB-` | AB negative |
| `O+` | O positive |
| `O-` | O negative |

---

## Business Logic

### Blood Bag Creation Flow

1. Validate input data (Joi validation)
2. Check if BloodBag_ID already exists
3. Create blood bag record
4. Return created blood bag

### Blood Bag Update Flow

1. Validate input data (Joi validation)
2. Find blood bag by ID
3. Update blood bag fields
4. Save blood bag
5. Return updated blood bag

### Blood Bag Deletion Flow

1. Find blood bag by ID
2. Delete blood bag record
3. Return success message

---

## Related Documentation

- [Requests API](API_REQUESTS.md) - Blood bag requests
- [Models Reference](MODELS_REFERENCE.md) - BloodBag model schema
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
