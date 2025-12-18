const express = require('express');
const router = express.Router();
const { messageController, presenceController } = require('../controller/chat_controller');
const authenticate = require('../middleware/authenticate');
const { requirePermission } = require('../middleware/requirePermission');
const rateLimiter = require('../middleware/rateLimiter');

// Apply authentication to all chat routes
router.use(authenticate);

// Message routes
router.post('/messages', rateLimiter.general, requirePermission('chat', 'create'), messageController.sendMessage);
router.get('/messages/:conversationId', rateLimiter.general, requirePermission('chat', 'read'), messageController.getMessages);
router.put('/messages/:messageId/read', rateLimiter.general, requirePermission('chat', 'update'), messageController.markAsRead);
router.delete('/messages/:messageId', rateLimiter.general, requirePermission('chat', 'delete'), messageController.deleteMessage);

// Conversation routes
router.get('/conversations', rateLimiter.general, requirePermission('chat', 'read'), messageController.getConversations);
router.get('/recipients', rateLimiter.general, requirePermission('chat', 'read'), messageController.getAllowedRecipients);

// Presence routes
router.get('/presence/:userId', rateLimiter.general, requirePermission('chat', 'read'), presenceController.getPresence);
router.post('/presence/batch', rateLimiter.general, requirePermission('chat', 'read'), presenceController.getPresences);
router.get('/presence/online', rateLimiter.general, requirePermission('chat', 'read'), presenceController.getOnlineUsers);

module.exports = router;