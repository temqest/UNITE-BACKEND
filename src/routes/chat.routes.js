const express = require('express');
const router = express.Router();
const { messageController, presenceController } = require('../controller/chat_controller');
const authenticate = require('../middleware/authenticate');
const rateLimiter = require('../middleware/rateLimiter');

// Apply authentication to all chat routes
router.use(authenticate);

// Message routes
router.post('/messages', rateLimiter.general, messageController.sendMessage);
router.get('/messages/:conversationId', rateLimiter.general, messageController.getMessages);
router.put('/messages/:messageId/read', rateLimiter.general, messageController.markAsRead);
router.delete('/messages/:messageId', rateLimiter.general, messageController.deleteMessage);

// Conversation routes
router.get('/conversations', rateLimiter.general, messageController.getConversations);
router.get('/recipients', rateLimiter.general, messageController.getAllowedRecipients);

// Presence routes
router.get('/presence/:userId', rateLimiter.general, presenceController.getPresence);
router.post('/presence/batch', rateLimiter.general, presenceController.getPresences);
router.get('/presence/online', rateLimiter.general, presenceController.getOnlineUsers);

module.exports = router;