const { BloodbankStaff, Coordinator, Stakeholder } = require('../../models');

class ChatPermissionsService {
  /**
   * Get allowed recipients for a user based on their role
   * @param {string} userId - The user's ID
   * @returns {Array} - Array of allowed recipient IDs
   */
  async getAllowedRecipients(userId) {
    try {
      // Get user details
      const user = await BloodbankStaff.findOne({ ID: userId });
      if (!user) {
        throw new Error('User not found');
      }

      const allowedRecipients = [];

      if (user.StaffType === 'Admin') {
        // System Admin: can chat only with Coordinators
        const coordinators = await BloodbankStaff.find({ StaffType: 'Coordinator' });
        allowedRecipients.push(...coordinators.map(c => c.ID));

      } else if (user.StaffType === 'Coordinator') {
        // Coordinator: can chat with their assigned Stakeholders and System Admin
        // First, get the coordinator record
        const coordinatorRecord = await Coordinator.findOne({ Coordinator_ID: userId });
        if (coordinatorRecord) {
          // Get assigned stakeholders
          const stakeholders = await Stakeholder.find({ coordinator: coordinatorRecord._id });
          allowedRecipients.push(...stakeholders.map(s => s.Stakeholder_ID));
        }

        // Add System Admin
        const systemAdmins = await BloodbankStaff.find({ StaffType: 'Admin' });
        allowedRecipients.push(...systemAdmins.map(a => a.ID));

      } else {
        // Check if user is a Stakeholder
        const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: userId });
        if (stakeholder && stakeholder.coordinator) {
          // Stakeholder: can chat only with their assigned Coordinator
          const coordinatorRecord = await Coordinator.findById(stakeholder.coordinator);
          if (coordinatorRecord) {
            allowedRecipients.push(coordinatorRecord.Coordinator_ID);
          }
        }
      }

      // Remove self from allowed recipients
      return allowedRecipients.filter(id => id !== userId);
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
      const allowedRecipients = await this.getAllowedRecipients(senderId);
      return allowedRecipients.includes(receiverId);
    } catch (error) {
      console.error('Error checking message permissions:', error);
      return false;
    }
  }

  /**
   * Get user role and details for chat permissions
   * @param {string} userId - User ID
   * @returns {Object} - User role information
   */
  async getUserChatRole(userId) {
    try {
      // Check if BloodbankStaff (Admin/Coordinator)
      const staff = await BloodbankStaff.findOne({ ID: userId });
      if (staff) {
        return {
          role: staff.StaffType,
          userType: 'staff',
          user: staff
        };
      }

      // Check if Stakeholder
      const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: userId });
      if (stakeholder) {
        return {
          role: 'Stakeholder',
          userType: 'stakeholder',
          user: stakeholder
        };
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to get user chat role: ${error.message}`);
    }
  }

  /**
   * Get detailed information about allowed recipients
   * @param {string} userId - User's ID
   * @returns {Array} - Array of recipient objects with details
   */
  async getAllowedRecipientsWithDetails(userId) {
    try {
      const allowedIds = await this.getAllowedRecipients(userId);
      const recipients = [];

      for (const recipientId of allowedIds) {
        // Check if recipient is BloodbankStaff
        const staff = await BloodbankStaff.findOne({ ID: recipientId });
        if (staff) {
          recipients.push({
            id: recipientId,
            name: `${staff.First_Name} ${staff.Last_Name}`,
            role: staff.StaffType,
            email: staff.Email,
            type: 'staff'
          });
          continue;
        }

        // Check if recipient is Stakeholder
        const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: recipientId });
        if (stakeholder) {
          recipients.push({
            id: recipientId,
            name: `${stakeholder.firstName} ${stakeholder.lastName}`,
            role: 'Stakeholder',
            email: stakeholder.email,
            type: 'stakeholder'
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
      console.error('Error filtering conversations:', error);
      return [];
    }
  }
}

module.exports = new ChatPermissionsService();