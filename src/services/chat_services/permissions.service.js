const { BloodbankStaff, Coordinator, Stakeholder } = require('../../models');

class ChatPermissionsService {
  /**
   * Get allowed recipients for a user based on their role
   * @param {string} userId - The user's ID
   * @returns {Array} - Array of allowed recipient IDs
   */
  async getAllowedRecipients(userId) {
    try {
      const allowedRecipients = [];

      // First check if user is a Stakeholder (since they won't be in BloodbankStaff)
      const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: userId });
      if (stakeholder) {
        // Stakeholder: can chat only with their assigned Coordinator
        let coordinatorId = null;

        // Try multiple ways to find the coordinator:
        // 1. Check coordinator ObjectId reference
        if (stakeholder.coordinator) {
          const coordinatorRecord = await Coordinator.findById(stakeholder.coordinator);
          if (coordinatorRecord && coordinatorRecord.Coordinator_ID) {
            coordinatorId = coordinatorRecord.Coordinator_ID;
          }
        }

        // 2. Check Coordinator_ID or coordinator_id string fields (legacy support)
        if (!coordinatorId) {
          coordinatorId = stakeholder.Coordinator_ID || stakeholder.coordinator_id || null;
        }

        // 3. Fallback: Find coordinator by district
        if (!coordinatorId && stakeholder.district) {
          const coordinatorByDistrict = await Coordinator.findOne({ district: stakeholder.district });
          if (coordinatorByDistrict && coordinatorByDistrict.Coordinator_ID) {
            coordinatorId = coordinatorByDistrict.Coordinator_ID;
          }
        }

        if (coordinatorId) {
          allowedRecipients.push(coordinatorId);
        }

        // Remove self from allowed recipients
        return allowedRecipients.filter(id => id !== userId);
      }

      // If not a stakeholder, check if user is BloodbankStaff (Admin/Coordinator)
      const user = await BloodbankStaff.findOne({ ID: userId });
      if (!user) {
        // User not found in either Stakeholder or BloodbankStaff
        return [];
      }

      if (user.StaffType === 'Admin') {
        // System Admin: can chat only with Coordinators
        const coordinators = await BloodbankStaff.find({ StaffType: 'Coordinator' });
        allowedRecipients.push(...coordinators.map(c => c.ID));

      } else if (user.StaffType === 'Coordinator') {
        // Coordinator: can chat with their assigned Stakeholders and System Admin
        // First, get the coordinator record
        const coordinatorRecord = await Coordinator.findOne({ Coordinator_ID: userId });
        if (coordinatorRecord) {
          // Get assigned stakeholders (using the Coordinator's _id)
          const stakeholdersByRef = await Stakeholder.find({ coordinator: coordinatorRecord._id });
          const stakeholderIdsByRef = stakeholdersByRef.map(s => s.Stakeholder_ID);
          allowedRecipients.push(...stakeholderIdsByRef);
          
          // Also find stakeholders by district (fallback for stakeholders not directly assigned)
          if (coordinatorRecord.district) {
            const stakeholdersByDistrict = await Stakeholder.find({ district: coordinatorRecord.district });
            const stakeholderIdsByDistrict = stakeholdersByDistrict
              .map(s => s.Stakeholder_ID)
              .filter(id => !stakeholderIdsByRef.includes(id)); // Avoid duplicates
            allowedRecipients.push(...stakeholderIdsByDistrict);
          }
        }

        // Add System Admin
        const systemAdmins = await BloodbankStaff.find({ StaffType: 'Admin' });
        const adminIds = systemAdmins.map(a => a.ID);
        allowedRecipients.push(...adminIds);
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
   * @param {string} userId - User ID
   * @returns {Object} - User role information
   */
  async getUserChatRole(userId) {
    try {
      // First check if Stakeholder (since they won't be in BloodbankStaff)
      const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: userId });
      if (stakeholder) {
        return {
          role: 'Stakeholder',
          userType: 'stakeholder',
          user: stakeholder
        };
      }

      // Check if BloodbankStaff (Admin/Coordinator)
      const staff = await BloodbankStaff.findOne({ ID: userId });
      if (staff) {
        return {
          role: staff.StaffType,
          userType: 'staff',
          user: staff
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
        if (!recipientId) continue; // Skip null/undefined IDs

        // Check if recipient is BloodbankStaff (Admin/Coordinator)
        const staff = await BloodbankStaff.findOne({ ID: recipientId });
        if (staff) {
          recipients.push({
            id: recipientId,
            name: `${staff.First_Name || ''} ${staff.Last_Name || ''}`.trim() || 'Unknown',
            role: staff.StaffType || 'Staff',
            email: staff.Email || '',
            type: 'staff'
          });
          continue;
        }

        // Check if recipient is Stakeholder
        const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: recipientId });
        if (stakeholder) {
          recipients.push({
            id: recipientId,
            name: `${stakeholder.firstName || ''} ${stakeholder.lastName || ''}`.trim() || 'Unknown',
            role: 'Stakeholder',
            email: stakeholder.email || '',
            type: 'stakeholder'
          });
          continue;
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