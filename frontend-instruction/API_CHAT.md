# Chat & Messaging API

## Overview

The Chat API provides endpoints for real-time messaging, conversations, and presence management. The system uses Socket.IO for real-time features and supports file attachments via S3.

## Base URL

All chat endpoints are under `/api/chat`:

```
POST   /api/chat/messages
GET    /api/chat/messages/:conversationId
PUT    /api/chat/messages/:messageId/read
DELETE /api/chat/messages/:messageId
GET    /api/chat/conversations
GET    /api/chat/recipients
GET    /api/chat/presence/:userId
POST   /api/chat/presence/batch
GET    /api/chat/presence/online
```

## Authentication

All endpoints require authentication.

## Authorization

Chat management requires specific permissions:

- **Send Messages:** `chat.create` permission
- **Read Messages:** `chat.read` permission
- **Update Messages:** `chat.update` permission (e.g., mark as read)
- **Delete Messages:** `chat.delete` permission

## Endpoints

### 1. Send Message

Send a message to a recipient.

**Endpoint:** `POST /api/chat/messages`

**Access:** Private (requires `chat.create` permission)

**Request Body:**
```json
{
  "receiverId": "601def1234567890abcdef",
  "content": "Hello, how are you?",
  "messageType": "text",
  "attachments": []
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| receiverId | string | Yes | Recipient user ID |
| content | string | Yes | Message content (1-1000 characters) |
| messageType | string | No | `text`, `image`, `file` (default: `text`) |
| attachments | array | No | Array of attachment objects (see below) |

**Attachment Object:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| filename | string | Yes | File name |
| url | string | Yes | File URL (S3 URL) |
| key | string | No | S3 object key |
| mime | string | No | MIME type |
| fileType | string | No | File type |
| size | number | No | File size in bytes |

**Validation Rules:**
- Cannot send message to yourself
- Content: 1-1000 characters
- Receiver must be in allowed recipients list (permission-based)

**Success Response (201):**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "data": {
    "messageId": "MSG001",
    "senderId": "601abc1234567890abcdef",
    "receiverId": "601def1234567890abcdef",
    "content": "Hello, how are you?",
    "messageType": "text",
    "status": "sent",
    "timestamp": "2024-01-20T15:00:00.000Z",
    "conversationId": "CONV001"
  }
}
```

**Error Responses:**

**400 Bad Request** - Validation error
```json
{
  "success": false,
  "message": "Receiver ID is required"
}
```

**400 Bad Request** - Cannot send to self
```json
{
  "success": false,
  "message": "Cannot send message to yourself"
}
```

**403 Forbidden** - Recipient not allowed
```json
{
  "success": false,
  "message": "Cannot send message to this recipient"
}
```

**cURL Example:**
```bash
curl -X POST "http://localhost:3000/api/chat/messages" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "601def1234567890abcdef",
    "content": "Hello, how are you?",
    "messageType": "text"
  }'
```

---

### 2. Get Messages

Get messages for a conversation with pagination.

**Endpoint:** `GET /api/chat/messages/:conversationId`

**Access:** Private (requires `chat.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| conversationId | string | Yes | Conversation ID |

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page (max 100) |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "messageId": "MSG001",
      "senderId": "601abc1234567890abcdef",
      "receiverId": "601def1234567890abcdef",
      "content": "Hello, how are you?",
      "messageType": "text",
      "status": "read",
      "readAt": "2024-01-20T15:05:00.000Z",
      "timestamp": "2024-01-20T15:00:00.000Z",
      "conversationId": "CONV001"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25
  }
}
```

---

### 3. Mark Message as Read

Mark a message as read.

**Endpoint:** `PUT /api/chat/messages/:messageId/read`

**Access:** Private (requires `chat.update` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| messageId | string | Yes | Message ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Message marked as read",
  "data": {
    "messageId": "MSG001",
    "status": "read",
    "readAt": "2024-01-20T15:05:00.000Z"
  }
}
```

---

### 4. Delete Message

Delete a message.

**Endpoint:** `DELETE /api/chat/messages/:messageId`

**Access:** Private (requires `chat.delete` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| messageId | string | Yes | Message ID |

**Success Response (200):**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

---

### 5. Get Conversations

Get all conversations for the authenticated user.

**Endpoint:** `GET /api/chat/conversations`

**Access:** Private (requires `chat.read` permission)

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Items per page |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "conversationId": "CONV001",
      "participants": [
        {
          "userId": "601abc1234567890abcdef",
          "joinedAt": "2024-01-15T10:00:00.000Z"
        },
        {
          "userId": "601def1234567890abcdef",
          "joinedAt": "2024-01-15T10:00:00.000Z"
        }
      ],
      "type": "direct",
      "lastMessage": {
        "messageId": "MSG001",
        "content": "Hello, how are you?",
        "senderId": "601abc1234567890abcdef",
        "timestamp": "2024-01-20T15:00:00.000Z"
      },
      "unreadCount": 2,
      "updatedAt": "2024-01-20T15:00:00.000Z"
    }
  ]
}
```

---

### 6. Get Allowed Recipients

Get list of users the authenticated user can send messages to (permission-based).

**Endpoint:** `GET /api/chat/recipients`

**Access:** Private (requires `chat.read` permission)

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "userId": "601def1234567890abcdef",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "roles": ["coordinator"]
    }
  ]
}
```

**Note:** Recipients are filtered based on chat permissions. See chat permissions service for rules.

---

### 7. Get User Presence

Get presence status (online/offline) for a user.

**Endpoint:** `GET /api/chat/presence/:userId`

**Access:** Private (requires `chat.read` permission)

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | Yes | User ID |

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "userId": "601def1234567890abcdef",
    "status": "online",
    "lastSeen": "2024-01-20T15:00:00.000Z"
  }
}
```

**Presence Status Values:**
- `online` - User is currently online
- `offline` - User is offline
- `idle` - User is idle

---

### 8. Get Multiple Presences

Get presence status for multiple users.

**Endpoint:** `POST /api/chat/presence/batch`

**Access:** Private (requires `chat.read` permission)

**Request Body:**
```json
{
  "userIds": ["601abc1234567890abcdef", "601def1234567890abcdef"]
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| userIds | array | Yes | Array of user IDs |

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "userId": "601abc1234567890abcdef",
      "status": "online",
      "lastSeen": "2024-01-20T15:00:00.000Z"
    },
    {
      "userId": "601def1234567890abcdef",
      "status": "offline",
      "lastSeen": "2024-01-20T14:30:00.000Z"
    }
  ]
}
```

---

### 9. Get Online Users

Get all currently online users.

**Endpoint:** `GET /api/chat/presence/online`

**Access:** Private (requires `chat.read` permission)

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "userId": "601abc1234567890abcdef",
      "status": "online",
      "lastSeen": "2024-01-20T15:00:00.000Z"
    }
  ]
}
```

---

## Socket.IO Real-time Events

The chat system uses Socket.IO for real-time messaging. Connect to the Socket.IO server to receive real-time updates.

### Connection

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Events

#### Client → Server

**`join_room`** - Join user's personal room
```javascript
socket.emit('join_room', { userId: '601abc1234567890abcdef' });
```

**`send_message`** - Send message (alternative to REST API)
```javascript
socket.emit('send_message', {
  receiverId: '601def1234567890abcdef',
  content: 'Hello!',
  messageType: 'text'
});
```

**`typing`** - Send typing indicator
```javascript
socket.emit('typing', {
  conversationId: 'CONV001',
  isTyping: true
});
```

**`mark_read`** - Mark message as read
```javascript
socket.emit('mark_read', {
  messageId: 'MSG001'
});
```

#### Server → Client

**`new_message`** - New message received
```javascript
socket.on('new_message', (message) => {
  console.log('New message:', message);
});
```

**`message_sent`** - Message sent confirmation
```javascript
socket.on('message_sent', (message) => {
  console.log('Message sent:', message);
});
```

**`typing`** - Typing indicator
```javascript
socket.on('typing', (data) => {
  console.log('User typing:', data);
});
```

**`presence_update`** - Presence status update
```javascript
socket.on('presence_update', (data) => {
  console.log('Presence update:', data);
});
```

---

## Chat Permissions

Chat permissions are enforced based on user roles:

### Permission Rules

- **System Admin** - Can chat with Coordinators
- **Coordinator** - Can chat with System Admins and Stakeholders
- **Stakeholder** - Can chat with Coordinators

These rules are enforced by the chat permissions service. Users can only send messages to allowed recipients.

---

## File Attachments

Messages can include file attachments. Files are uploaded to S3 and referenced in messages.

### Upload Flow

1. Request presigned URL from `/api/files/presign`
2. Upload file directly to S3 using presigned URL
3. Send message with attachment metadata

See [API_UTILITY.md](API_UTILITY.md) for file upload details.

---

## Message Model Schema

See [MODELS_REFERENCE.md](MODELS_REFERENCE.md) for complete Message, Conversation, and Presence model schemas.

### Key Fields

**Message:**
- **messageId** (required, unique) - Unique message identifier
- **senderId** (required) - Sender user ID
- **receiverId** (required) - Receiver user ID
- **content** (required) - Message content
- **messageType** (default: `text`) - Message type enum
- **status** (default: `sent`) - Message status: `sent`, `delivered`, `read`
- **conversationId** (required) - Conversation ID

**Conversation:**
- **conversationId** (required, unique) - Unique conversation identifier
- **participants** (array) - Array of participant objects
- **type** (default: `direct`) - Conversation type: `direct`, `group`
- **lastMessage** (object) - Last message in conversation
- **unreadCount** (Map) - Unread count per user

**Presence:**
- **userId** (required, unique) - User ID
- **status** (default: `offline`) - Presence status: `online`, `offline`, `idle`
- **lastSeen** (Date) - Last seen timestamp
- **socketId** (string) - Active socket connection ID

---

## Business Logic

### Message Sending Flow

1. Validate input data (Joi validation)
2. Check if receiver is in allowed recipients (permission-based)
3. Prevent sending to self
4. Get or create conversation
5. Create message record
6. Update conversation lastMessage
7. Emit Socket.IO events (new_message, message_sent)
8. Return message data

### Presence Management

Presence is updated automatically when users connect/disconnect via Socket.IO. The presence service tracks:
- Online status
- Last seen timestamp
- Active socket connections

---

## Related Documentation

- [Utility API](API_UTILITY.md) - File upload endpoints
- [Models Reference](MODELS_REFERENCE.md) - Message, Conversation, Presence models
- [Chat README](src/utils/CHAT_README.md) - Complete chat system documentation
- [Error Codes](ERROR_CODES.md) - Error reference

---

**Last Updated:** 2024
