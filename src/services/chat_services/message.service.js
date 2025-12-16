// src/services/chat_services/message.service.js

const { Message, Conversation, Presence } = require('../../models');
const permissionsService = require('./permissions.service');
const { v4: uuidv4 } = require('uuid');
const s3 = require('../../utils/s3'); // Add S3 import

class MessageService {
  // Send a message
  async sendMessage(senderId, receiverId, content, messageType = 'text', attachments = []) {
    try {
      // Validate permissions
      const canSend = await permissionsService.canSendMessage(senderId, receiverId);
      if (!canSend) {
        throw new Error('You do not have permission to send messages to this user');
      }

      // Generate conversation ID (sorted to ensure consistency)
      const conversationId = [senderId, receiverId].sort().join('_');

      // Create message
      const messageId = uuidv4();
      const message = new Message({
        messageId,
        senderId,
        receiverId,
        content,
        messageType,
        attachments,
        conversationId,
        status: 'sent'
      });

      await message.save();

      // Update or create conversation
      await this.updateConversation(conversationId, senderId, receiverId, message);

      return message;
    } catch (error) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  // Update conversation with last message
  async updateConversation(conversationId, senderId, receiverId, message) {
    try {
      let conversation = await Conversation.findOne({ conversationId });

      if (!conversation) {
        conversation = new Conversation({
          conversationId,
          participants: [
            { userId: senderId },
            { userId: receiverId }
          ],
          type: 'direct'
        });
      }

      conversation.lastMessage = {
        messageId: message.messageId,
        content: message.content,
        senderId: message.senderId,
        timestamp: message.timestamp
      };

      conversation.updatedAt = new Date();

      // Increment unread count for receiver
      const currentUnread = conversation.unreadCount.get(receiverId) || 0;
      conversation.unreadCount.set(receiverId, currentUnread + 1);

      await conversation.save();
    } catch (error) {
      // Silently fail conversation update
    }
  }

  // Get messages for a conversation
  async getMessages(conversationId, userId, page = 1, limit = 50) {
    try {
      // Verify user is participant and has permission
      const conversation = await Conversation.findOne({ conversationId });
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check if user is participant
      const isParticipant = conversation.participants.some(p => p.userId === userId);
      if (!isParticipant) {
        throw new Error('Access denied to this conversation');
      }

      // Verify permissions for all participants
      const allowedRecipients = await permissionsService.getAllowedRecipients(userId);
      const otherParticipants = conversation.participants
        .filter(p => p.userId !== userId)
        .map(p => p.userId);

      // Convert to strings for comparison to handle any type mismatches
      const allowedRecipientsStr = allowedRecipients.map(id => String(id));
      const otherParticipantsStr = otherParticipants.map(id => String(id));

      // Check if user has permission to chat with all other participants
      let hasPermission = otherParticipantsStr.every(participantId =>
        allowedRecipientsStr.includes(participantId)
      );

      // Bidirectional check
      if (!hasPermission && otherParticipantsStr.length === 1) {
        const otherParticipantId = otherParticipantsStr[0];
        try {
          const reverseAllowed = await permissionsService.getAllowedRecipients(otherParticipantId);
          const reverseAllowedStr = reverseAllowed.map(id => String(id));
          if (reverseAllowedStr.includes(String(userId))) {
            hasPermission = true;
          }
        } catch (error) {
          // Silently fail bidirectional check
        }
      }

      if (!hasPermission) {
        throw new Error('Access denied to this conversation');
      }

      const skip = (page - 1) * limit;
      const messages = await Message.find({ conversationId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit);

      // Enrich messages with sender details and SIGNED URLS
      const enrichedMessages = await Promise.all(
        messages.map(async (message) => {
          const enriched = message.toObject();
          enriched.senderDetails = await this.getUserDetails(message.senderId);
          enriched.receiverDetails = await this.getUserDetails(message.receiverId);

          // Sign S3 URLs so images load correctly
          if (enriched.attachments && enriched.attachments.length > 0) {
            enriched.attachments = await Promise.all(enriched.attachments.map(async (att) => {
              if (att && att.key) {
                try {
                  const signedUrl = await s3.getSignedGetUrl(att.key, 3600); // 1 hour expiry
                  return { ...att, url: signedUrl };
                } catch (e) {
                  return att;
                }
              }
              return att;
            }));
          }

          return enriched;
        })
      );

      // Mark messages as read if user is receiver
      await Message.updateMany(
        { conversationId, receiverId: userId, status: { $ne: 'read' } },
        { status: 'read', readAt: new Date() }
      );

      // Reset unread count
      conversation.unreadCount.set(userId, 0);
      await conversation.save();

      return enrichedMessages.reverse(); // Return in chronological order
    } catch (error) {
      throw new Error(`Failed to get messages: ${error.message}`);
    }
  }

  // Mark message as delivered
  async markAsDelivered(messageId, userId) {
    try {
      const message = await Message.findOneAndUpdate(
        { messageId, receiverId: userId, status: 'sent' },
        { status: 'delivered' },
        { new: true }
      );
      return message;
    } catch (error) {
      throw new Error(`Failed to mark as delivered: ${error.message}`);
    }
  }

  // Mark message as read
  async markAsRead(messageId, userId) {
    try {
      const message = await Message.findOneAndUpdate(
        { messageId, receiverId: userId, status: { $in: ['sent', 'delivered'] } },
        { status: 'read', readAt: new Date() },
        { new: true }
      );
      return message;
    } catch (error) {
      throw new Error(`Failed to mark as read: ${error.message}`);
    }
  }

  // Get conversations for user
  async getConversations(userId) {
    try {
      const conversations = await Conversation.find({
        'participants.userId': userId
      })
      .sort({ updatedAt: -1 });

      const enrichedConversations = await Promise.all(
        conversations.map(async (conversation) => {
          const enriched = conversation.toObject();

          enriched.participants = await Promise.all(
            conversation.participants.map(async (participant) => {
              const details = await this.getUserDetails(participant.userId);
              return {
                ...participant.toObject(),
                details
              };
            })
          );

          return enriched;
        })
      );

      return enrichedConversations;
    } catch (error) {
      throw new Error(`Failed to get conversations: ${error.message}`);
    }
  }

  // Helper method to get user details
  async getUserDetails(userId) {
    try {
      const { BloodbankStaff, Stakeholder } = require('../../models');

      const staff = await BloodbankStaff.findOne({ ID: userId });
      if (staff) {
        return {
          id: userId,
          name: `${staff.First_Name} ${staff.Last_Name}`,
          role: staff.StaffType,
          email: staff.Email,
          type: 'staff'
        };
      }

      const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: userId });
      if (stakeholder) {
        return {
          id: userId,
          name: `${stakeholder.firstName} ${stakeholder.lastName}`,
          role: 'Stakeholder',
          email: stakeholder.email,
          type: 'stakeholder'
        };
      }

      return {
        id: userId,
        name: 'Unknown User',
        role: 'Unknown',
        type: 'unknown'
      };
    } catch (error) {
      return {
        id: userId,
        name: 'Unknown User',
        role: 'Unknown',
        type: 'unknown'
      };
    }
  }

  // Delete message
  async deleteMessage(messageId, userId) {
    try {
      const message = await Message.findOneAndDelete({
        messageId,
        senderId: userId
      });
      return message;
    } catch (error) {
      throw new Error(`Failed to delete message: ${error.message}`);
    }
  }
}

module.exports = new MessageService();