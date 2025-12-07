# UNITE Chat System

This document describes the real-time chat system implementation for the UNITE Blood Bank Event Management System.

## Features

### Core Features
- **Real-time messaging**: Send and receive messages instantly using WebSockets
- **One-on-one chats**: Private conversations between two users
- **Message persistence**: All messages stored in MongoDB with timestamps
- **Read receipts**: Track message delivery and read status
- **Typing indicators**: Show when someone is typing
- **Online presence**: Track user online/offline/idle status
- **Notifications**: In-app notifications for new messages
- **Message history**: Paginated message retrieval
- **Security**: Input validation, authentication, and sanitization

### Future Extensibility
- Group chats (conversation model supports multiple participants)
- Message attachments (images, files)
- Message reactions
- Message search
- Chat archiving

## Architecture

### Models
- **Message**: Stores individual messages with sender, receiver, content, timestamps, and status
- **Conversation**: Manages chat threads between users
- **Presence**: Tracks user online/offline status

### Services
- **MessageService**: Handles message CRUD operations
- **PresenceService**: Manages user presence status
- **TypingService**: Tracks typing indicators
- **NotificationService**: Creates notifications for new messages

### Controllers
- **MessageController**: REST API endpoints for messages
- **PresenceController**: REST API endpoints for presence

### Real-time Communication
- **Socket.IO**: WebSocket implementation for real-time features
- Authentication via JWT tokens
- Room-based messaging for conversations

## Role-Based Chat Permissions

The chat system implements strict role-based access control to ensure users can only communicate with authorized recipients:

### Permission Rules

**System Admin (StaffType: 'Admin')**
- Can chat **only** with Coordinators
- **Cannot** chat with Stakeholders
- Has access to all Coordinators in the system

**Coordinator (StaffType: 'Coordinator')**
- Can chat with their **assigned Stakeholders**
- Can chat with **System Admin**
- **Cannot** chat with Stakeholders assigned to other Coordinators

**Stakeholder**
- Can chat **only** with their assigned Coordinator
- **Cannot** chat with System Admin or other Stakeholders
- **Cannot** chat with Coordinators they're not assigned to

### Permission Enforcement

- **Message Sending**: Validated before message creation
- **Conversation Access**: Filtered based on user permissions
- **Recipient Lists**: Only shows allowed users
- **Real-time Events**: Typing indicators and presence respect permissions

### API Endpoints

```
GET  /api/chat/recipients     - Get list of allowed recipients for current user
GET  /api/chat/conversations  - Get filtered conversations (only allowed chats)
POST /api/chat/messages       - Send message (validates recipient permissions)
```

### Database Relationships

The permission system uses these model relationships:
- `Stakeholder.coordinator` → `Coordinator._id`
- `Coordinator.Coordinator_ID` → `BloodbankStaff.ID`
- `BloodbankStaff.StaffType` = 'Admin' | 'Coordinator'

## API Endpoints

### Messages
```
POST   /api/chat/messages              - Send a message
GET    /api/chat/messages/:conversationId - Get messages for conversation
PUT    /api/chat/messages/:messageId/read - Mark message as read
DELETE /api/chat/messages/:messageId     - Delete message
```

### Conversations & Recipients
```
GET    /api/chat/conversations         - Get user's conversations (filtered by permissions)
GET    /api/chat/recipients            - Get list of allowed recipients for current user
```

### Presence
```
GET    /api/chat/presence/:userId      - Get user presence
POST   /api/chat/presence/batch        - Get presence for multiple users
GET    /api/chat/presence/online       - Get all online users
```

## Socket.IO Events

### Client to Server
- `send_message`: Send a message
- `mark_read`: Mark message as read
- `typing_start`: Start typing indicator
- `typing_stop`: Stop typing indicator
- `join_conversation`: Join conversation room
- `leave_conversation`: Leave conversation room
- `get_presence`: Request presence info
- `go_offline`: Manually set offline
- `set_idle`: Set idle status
- `set_active`: Set active status

### Server to Client
- `message_sent`: Message sent confirmation
- `new_message`: New message received
- `message_delivered`: Message delivered
- `message_read`: Message read confirmation
- `message_error`: Message send error
- `typing_start`: User started typing
- `typing_stop`: User stopped typing
- `user_online`: User came online
- `user_offline`: User went offline
- `user_idle`: User became idle
- `presence_update`: Presence information

## Database Schema

### Message Collection
```javascript
{
  messageId: String (UUID),
  senderId: String,
  receiverId: String,
  content: String,
  messageType: String (text/image/file),
  attachments: Array,
  timestamp: Date,
  status: String (sent/delivered/read),
  readAt: Date,
  conversationId: String
}
```

### Conversation Collection
```javascript
{
  conversationId: String,
  participants: Array,
  type: String (direct/group),
  lastMessage: Object,
  unreadCount: Map,
  createdAt: Date,
  updatedAt: Date
}
```

### Presence Collection
```javascript
{
  userId: String,
  status: String (online/offline/idle),
  lastSeen: Date,
  socketId: String
}
```

## Security

### Authentication
- JWT token required for all chat operations
- Socket.IO authentication middleware validates tokens

### Input Validation
- Joi schemas for all API inputs
- Content sanitization
- Message length limits

### Authorization
- Users can only access their own conversations
- Message sender verification
- Conversation participant validation

## Usage Examples

### Connecting to Chat (Frontend)
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Listen for new messages
socket.on('new_message', (message) => {
  console.log('New message:', message);
});

// Send a message
socket.emit('send_message', {
  receiverId: 'user123',
  content: 'Hello!',
  messageType: 'text'
});
```

### REST API Usage
```javascript
// Get conversations
const response = await fetch('/api/chat/conversations', {
  headers: {
    'Authorization': 'Bearer your-jwt-token'
  }
});

// Send message via REST
const response = await fetch('/api/chat/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token'
  },
  body: JSON.stringify({
    receiverId: 'user123',
    content: 'Hello via REST!'
  })
});
```

## Setup

1. Install dependencies: `npm install socket.io uuid`
2. Database indexes are created automatically via `createIndexes.js`
3. Server integrates Socket.IO automatically
4. Chat endpoints are available at `/api/chat/*`

## Testing

### Manual Testing
1. Start the server: `npm run dev`
2. Connect two clients with different user tokens
3. Send messages and verify real-time delivery
4. Check database for message persistence
5. Test presence indicators

### API Testing
Use tools like Postman or curl to test REST endpoints:
```bash
curl -X GET "http://localhost:3000/api/chat/conversations" \
  -H "Authorization: Bearer your-token"
```

## Future Enhancements

- **Group Chats**: Extend conversation model for multiple participants
- **File Attachments**: Implement file upload and storage
- **Message Reactions**: Add emoji reactions to messages
- **Message Search**: Full-text search across messages
- **Push Notifications**: Mobile push notifications
- **Chat Encryption**: End-to-end encryption
- **Message Threads**: Reply to specific messages
- **Chat Bots**: Automated responses and integrations