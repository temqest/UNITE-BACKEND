const { User, UserRole, UserLocation } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');

class ChatPermissionsService {
  /**
   * Get allowed recipients for a user based on their roles and permissions
   * @param {string} userId - The user's ID (ObjectId or legacy userId)
   * @returns {Array} - Array of allowed recipient IDs
   */
  async getAllowedRecipients(userId) {
    try {
      const allowedRecipients = [];

      // Get user by ID (try ObjectId first, then legacy userId)
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findOne({ userId: userId });
      }
      if (!user) {
        return [];
      }

      // Get user's roles
      const userRoles = await permissionService.getUserRoles(user._id);
      if (userRoles.length === 0) {
        return [];
      }

      const roleCodes = userRoles.map(ur => ur.code);

      // System Admin: can chat with Coordinators
      if (roleCodes.includes('system-admin')) {
        const coordinatorRole = await permissionService.getRoleByCode('coordinator');
        if (coordinatorRole) {
          const coordinatorUserRoles = await UserRole.find({ roleId: coordinatorRole._id }).populate('userId');
          const coordinatorIds = coordinatorUserRoles
            .map(ur => ur.userId)
            .filter(u => u && u._id)
            .map(u => u._id.toString());
          allowedRecipients.push(...coordinatorIds);
        }
      }

      // Coordinator: can chat with assigned Stakeholders and System Admins
      if (roleCodes.includes('coordinator')) {
        // Get stakeholders (users with stakeholder role)
        const stakeholderRole = await permissionService.getRoleByCode('stakeholder');
        if (stakeholderRole) {
          const stakeholderUserRoles = await UserRole.find({ roleId: stakeholderRole._id }).populate('userId');
          const stakeholderIds = stakeholderUserRoles
            .map(ur => ur.userId)
            .filter(u => u && u._id)
            .map(u => u._id.toString());
          allowedRecipients.push(...stakeholderIds);
        }

        // Add System Admins
        const adminRole = await permissionService.getRoleByCode('system-admin');
        if (adminRole) {
          const adminUserRoles = await UserRole.find({ roleId: adminRole._id }).populate('userId');
          const adminIds = adminUserRoles
            .map(ur => ur.userId)
            .filter(u => u && u._id)
            .map(u => u._id.toString());
          allowedRecipients.push(...adminIds);
        }
      }

      // Stakeholder: can chat with their assigned Coordinator
      if (roleCodes.includes('stakeholder')) {
        // Find coordinators (users with coordinator role)
        const coordinatorRole = await permissionService.getRoleByCode('coordinator');
        if (coordinatorRole) {
          const coordinatorUserRoles = await UserRole.find({ roleId: coordinatorRole._id }).populate('userId');
          const coordinatorIds = coordinatorUserRoles
            .map(ur => ur.userId)
            .filter(u => u && u._id)
            .map(u => u._id.toString());
          allowedRecipients.push(...coordinatorIds);
        }
      }

      // Remove self from allowed recipients
      const userIdStr = user._id.toString();
      return allowedRecipients.filter(id => id !== userIdStr);
    } catch (error) {
      throw new Error(`Failed to get allowed recipients: ${error.message}`);
    }
  }

  /**
   * Check if a user can send a message to a specific recipient
   * @param {string} senderId - Sender's user ID
   * @param {string} receiverId - Receiver's user ID
   * @returns {boolean} - Whether the message is allowed
   */
  async canSendMessage(senderId, receiverId) {
    try {
      // Convert to strings for comparison
      const senderIdStr = String(senderId);
      const receiverIdStr = String(receiverId);
      
      // Check direct permission
      const allowedRecipients = await this.getAllowedRecipients(senderId);
      const allowedRecipientsStr = allowedRecipients.map(id => String(id));
      
      if (allowedRecipientsStr.includes(receiverIdStr)) {
        return true;
      }

      // Bidirectional check: if sender can't see receiver, check if receiver can see sender
      try {
        const reverseAllowed = await this.getAllowedRecipients(receiverId);
        const reverseAllowedStr = reverseAllowed.map(id => String(id));
        if (reverseAllowedStr.includes(senderIdStr)) {
          return true;
        }
      } catch (reverseError) {
        // Silently fail bidirectional check
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get user role and details for chat permissions
   * @param {string} userId - User ID (ObjectId or legacy userId)
   * @returns {Object} - User role information
   */
  async getUserChatRole(userId) {
    try {
      // Get user by ID
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findOne({ userId: userId });
      }
      if (!user) {
        return null;
      }

      // Get user's roles
      const userRoles = await permissionService.getUserRoles(user._id);
      const roleCodes = userRoles.map(ur => ur.code);
      const primaryRole = roleCodes[0] || 'user';

      return {
        role: primaryRole,
        roles: roleCodes,
        userType: primaryRole,
        user: user
      };
    } catch (error) {
      throw new Error(`Failed to get user chat role: ${error.message}`);
    }
  }

  /**
   * Get detailed information about allowed recipients
   * @param {string} userId - User's ID (ObjectId or legacy userId)
   * @returns {Array} - Array of recipient objects with details
   */
  async getAllowedRecipientsWithDetails(userId) {
    try {
      const allowedIds = await this.getAllowedRecipients(userId);
      const recipients = [];

      for (const recipientId of allowedIds) {
        if (!recipientId) continue; // Skip null/undefined IDs

        // Get user by ObjectId
        const user = await User.findById(recipientId);
        if (user) {
          // Get user's roles
          const userRoles = await permissionService.getUserRoles(user._id);
          const roleCodes = userRoles.map(ur => ur.code);
          const primaryRole = roleCodes[0] || 'user';

          recipients.push({
            id: user._id.toString(),
            name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
            role: primaryRole,
            roles: roleCodes,
            email: user.email || '',
            type: primaryRole
          });
        }
      }

      return recipients;
    } catch (error) {
      throw new Error(`Failed to get recipient details: ${error.message}`);
    }
  }

  /**
   * Filter conversations based on user permissions
   * @param {string} userId - User's ID
   * @param {Array} conversations - Raw conversations from database
   * @returns {Array} - Filtered conversations
   */
  async filterConversationsByPermissions(userId, conversations) {
    try {
      const allowedRecipients = await this.getAllowedRecipients(userId);

      return conversations.filter(conversation => {
        // Check if all participants are allowed
        return conversation.participants.every(participant => {
          return participant.userId === userId || allowedRecipients.includes(participant.userId);
        });
      });
    } catch (error) {
      return [];
    }
  }
}

module.exports = new ChatPermissionsService();