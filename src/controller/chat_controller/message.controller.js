const Joi = require('joi');
const { messageService, permissionsService } = require('../../services/chat_services');
const { sendMessageSchema, getMessagesSchema, markReadSchema, deleteMessageSchema } = require('../../validators/chat_validators');

class MessageController {
  // Send a message
  async sendMessage(req, res) {
    try {
      const { error, value } = sendMessageSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { receiverId, content, messageType, attachments } = value;
      const senderId = req.user.id;

      // Prevent sending message to self
      if (senderId === receiverId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot send message to yourself'
        });
      }

      const message = await messageService.sendMessage(
        senderId,
        receiverId,
        content,
        messageType,
        attachments
      );

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: message
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  }

  // Get messages for a conversation
  async getMessages(req, res) {
    try {
      const { error, value } = getMessagesSchema.validate({
        ...req.params,
        ...req.query
      });

      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { conversationId, page, limit } = value;
      const userId = req.user.id;

      const messages = await messageService.getMessages(conversationId, userId, page, limit);

      res.status(200).json({
        success: true,
        data: messages,
        pagination: {
          page,
          limit,
          total: messages.length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get messages'
      });
    }
  }

  // Mark message as read
  async markAsRead(req, res) {
    try {
      const { error, value } = markReadSchema.validate(req.params);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { messageId } = value;
      const userId = req.user.id;

      const message = await messageService.markAsRead(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or already read'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Message marked as read'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to mark message as read'
      });
    }
  }

  // Get conversations for user
  async getConversations(req, res) {
    try {
      const userId = req.user.id;
      const conversations = await messageService.getConversations(userId);

      res.status(200).json({
        success: true,
        data: conversations
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get conversations'
      });
    }
  }

  // Get allowed recipients for user
  async getAllowedRecipients(req, res) {
    try {
      const userId = req.user.id;
      const recipients = await permissionsService.getAllowedRecipientsWithDetails(userId);

      res.status(200).json({
        success: true,
        data: recipients
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get allowed recipients'
      });
    }
  }

  // Delete message
  async deleteMessage(req, res) {
    try {
      const { error, value } = deleteMessageSchema.validate(req.params);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { messageId } = value;
      const userId = req.user.id;

      const message = await messageService.deleteMessage(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or not authorized to delete'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to delete message'
      });
    }
  }
}

module.exports = new MessageController();