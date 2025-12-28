const { User } = require('../../models');
const authorityService = require('../../services/users_services/authority.service');

// Authority tier constants (must match authority.service.js)
const AUTHORITY_TIERS = {
  SYSTEM_ADMIN: 100,
  OPERATIONAL_ADMIN: 80,
  COORDINATOR: 60,
  STAKEHOLDER: 30,
  BASIC_USER: 20
};

class ChatPermissionsService {
  /**
   * Get allowed recipients for a user based on authority and relationships
   * @param {string} userId - The user's ID (ObjectId or legacy userId)
   * @returns {Array} - Array of allowed recipient IDs
   */
  async getAllowedRecipients(userId) {
    try {
      const allowedRecipients = [];
      const mongoose = require('mongoose');

      // Get user by ID (try ObjectId first, then legacy userId)
      let user = null;
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findOne({ userId: userId });
      }
      if (!user) {
        return [];
      }

      // Get user's authority (use persisted field)
      const userAuthority = user.authority || await authorityService.calculateUserAuthority(user._id);
      
      if (!userAuthority || userAuthority < AUTHORITY_TIERS.BASIC_USER) {
        return [];
      }

      // System Admin (100): Can chat with Coordinators (60) and Operational Admins (80)
      if (userAuthority >= AUTHORITY_TIERS.SYSTEM_ADMIN) {
        // Get all coordinators (authority 60)
        const coordinators = await User.find({
          authority: AUTHORITY_TIERS.COORDINATOR,
          isActive: true
        }).select('_id');
        allowedRecipients.push(...coordinators.map(u => u._id.toString()));

        // Get all operational admins (authority 80)
        const operationalAdmins = await User.find({
          authority: AUTHORITY_TIERS.OPERATIONAL_ADMIN,
          isActive: true
        }).select('_id');
        allowedRecipients.push(...operationalAdmins.map(u => u._id.toString()));
      }

      // Operational Admin (80): Can chat with Coordinators (60) and Stakeholders (30)
      if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN && userAuthority < AUTHORITY_TIERS.SYSTEM_ADMIN) {
        // Get all coordinators
        const coordinators = await User.find({
          authority: AUTHORITY_TIERS.COORDINATOR,
          isActive: true
        }).select('_id');
        allowedRecipients.push(...coordinators.map(u => u._id.toString()));

        // Get all stakeholders
        const stakeholders = await User.find({
          authority: AUTHORITY_TIERS.STAKEHOLDER,
          isActive: true
        }).select('_id');
        allowedRecipients.push(...stakeholders.map(u => u._id.toString()));
      }

      // Coordinator (60): Can chat with assigned Stakeholders (30) and System/Operational Admins (80-100)
      if (userAuthority >= AUTHORITY_TIERS.COORDINATOR && userAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Get stakeholders assigned to this coordinator via organizations
        // Stakeholders have organizations[] with coordinatorId reference
        const stakeholderIds = await this.getAssignedStakeholders(user._id);
        allowedRecipients.push(...stakeholderIds);

        // Get System Admins and Operational Admins
        const admins = await User.find({
          $or: [
            { authority: AUTHORITY_TIERS.SYSTEM_ADMIN },
            { authority: AUTHORITY_TIERS.OPERATIONAL_ADMIN }
          ],
          isActive: true
        }).select('_id');
        allowedRecipients.push(...admins.map(u => u._id.toString()));
      }

      // Stakeholder (30): Can chat with assigned Coordinator (60)
      if (userAuthority >= AUTHORITY_TIERS.STAKEHOLDER && userAuthority < AUTHORITY_TIERS.COORDINATOR) {
        // Get coordinator assigned via organizations
        const coordinatorId = await this.getAssignedCoordinator(user._id);
        if (coordinatorId) {
          allowedRecipients.push(coordinatorId);
        }
      }

      // Remove self from allowed recipients
      const userIdStr = user._id.toString();
      return [...new Set(allowedRecipients.filter(id => id !== userIdStr))];
    } catch (error) {
      throw new Error(`Failed to get allowed recipients: ${error.message}`);
    }
  }

  /**
   * Get stakeholders assigned to a coordinator
   * @param {string|ObjectId} coordinatorId - Coordinator's user ID
   * @returns {Array} - Array of stakeholder user IDs
   */
  async getAssignedStakeholders(coordinatorId) {
    try {
      const coordinatorIdStr = coordinatorId.toString();
      
      // Find stakeholders whose organizations reference this coordinator
      // Check if stakeholder's organizations have coordinatorId in metadata or assignedBy
      const stakeholders = await User.find({
        authority: AUTHORITY_TIERS.STAKEHOLDER,
        isActive: true,
        $or: [
          { 'organizations.assignedBy': coordinatorId },
          { 'metadata.assignedCoordinator': coordinatorId }
        ]
      }).select('_id');

      // Also check if coordinator's coverage areas match stakeholder's locations
      const coordinator = await User.findById(coordinatorId).select('coverageAreas');
      if (coordinator && coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
        const municipalityIds = coordinator.coverageAreas.flatMap(ca => ca.municipalityIds || []);
        if (municipalityIds.length > 0) {
          const stakeholdersByLocation = await User.find({
            authority: AUTHORITY_TIERS.STAKEHOLDER,
            isActive: true,
            'locations.municipalityId': { $in: municipalityIds }
          }).select('_id');
          
          stakeholders.push(...stakeholdersByLocation);
        }
      }

      return [...new Set(stakeholders.map(u => u._id.toString()))];
    } catch (error) {
      console.error('[ChatPermissions] Error getting assigned stakeholders:', error);
      return [];
    }
  }

  /**
   * Get coordinator assigned to a stakeholder
   * @param {string|ObjectId} stakeholderId - Stakeholder's user ID
   * @returns {string|null} - Coordinator user ID or null
   */
  async getAssignedCoordinator(stakeholderId) {
    try {
      const stakeholder = await User.findById(stakeholderId).select('organizations metadata locations');
      if (!stakeholder) {
        return null;
      }

      // Check organizations for assignedBy (coordinator who assigned the organization)
      if (stakeholder.organizations && stakeholder.organizations.length > 0) {
        const primaryOrg = stakeholder.organizations.find(org => org.isPrimary) || stakeholder.organizations[0];
        if (primaryOrg && primaryOrg.assignedBy) {
          return primaryOrg.assignedBy.toString();
        }
      }

      // Check metadata.assignedCoordinator
      if (stakeholder.metadata && stakeholder.metadata.assignedCoordinator) {
        return stakeholder.metadata.assignedCoordinator.toString();
      }

      // Check if stakeholder's location matches a coordinator's coverage area
      if (stakeholder.locations && stakeholder.locations.municipalityId) {
        const coordinators = await User.find({
          authority: AUTHORITY_TIERS.COORDINATOR,
          isActive: true,
          'coverageAreas.municipalityIds': stakeholder.locations.municipalityId
        }).select('_id').limit(1);
        
        if (coordinators.length > 0) {
          return coordinators[0]._id.toString();
        }
      }

      return null;
    } catch (error) {
      console.error('[ChatPermissions] Error getting assigned coordinator:', error);
      return null;
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
      console.log('[ChatPermissions] canSendMessage called:', {
        senderId: senderId.toString(),
        receiverId: receiverId.toString()
      });

      // First check if sender has chat.create permission (or wildcard permission)
      const permissionService = require('../../services/users_services/permission.service');
      const hasChatPermission = await permissionService.checkPermission(senderId, 'chat', 'create');
      
      console.log('[ChatPermissions] hasChatPermission result:', {
        senderId: senderId.toString(),
        hasChatPermission
      });
      
      if (!hasChatPermission) {
        console.log('[ChatPermissions] ✗ User does not have chat.create permission');
        return false;
      }

      // If user has chat.create permission, check if they can send to this specific recipient
      // For admins with wildcard permissions, allow sending to anyone
      const userPermissions = await permissionService.getUserPermissions(senderId, null);
      const hasWildcard = userPermissions.some(p => 
        p.resource === '*' && (Array.isArray(p.actions) ? p.actions.includes('*') : p.actions === '*')
      );
      
      console.log('[ChatPermissions] Wildcard check:', {
        senderId: senderId.toString(),
        hasWildcard,
        permissionsCount: userPermissions.length
      });
      
      if (hasWildcard) {
        // Admins with wildcard can send to anyone
        console.log('[ChatPermissions] ✓ Wildcard permission - allowing send to anyone');
        return true;
      }
      
      // For users with chat.create permission, check recipient list
      console.log('[ChatPermissions] Checking recipient list for sender:', senderId.toString());
      const allowedRecipients = await this.getAllowedRecipients(senderId);
      const allowedRecipientsStr = allowedRecipients.map(id => String(id));
      const senderIdStr = String(senderId);
      const receiverIdStr = String(receiverId);
      
      console.log('[ChatPermissions] Recipient check:', {
        senderId: senderIdStr,
        receiverId: receiverIdStr,
        allowedRecipientsCount: allowedRecipientsStr.length,
        isReceiverAllowed: allowedRecipientsStr.includes(receiverIdStr)
      });
      
      if (allowedRecipientsStr.includes(receiverIdStr)) {
        console.log('[ChatPermissions] ✓ Receiver is in allowed recipients list');
        return true;
      }

      // Bidirectional check: if sender can't see receiver, check if receiver can see sender
      console.log('[ChatPermissions] Performing bidirectional check...');
      try {
        const reverseAllowed = await this.getAllowedRecipients(receiverId);
        const reverseAllowedStr = reverseAllowed.map(id => String(id));
        if (reverseAllowedStr.includes(senderIdStr)) {
          console.log('[ChatPermissions] ✓ Bidirectional check passed - receiver can see sender');
          return true;
        }
        console.log('[ChatPermissions] ✗ Bidirectional check failed');
      } catch (reverseError) {
        console.error('[ChatPermissions] Error in bidirectional check:', reverseError);
        // Silently fail bidirectional check
      }

      console.log('[ChatPermissions] ✗ All checks failed - cannot send message');
      return false;
    } catch (error) {
      console.error('[ChatPermissions] Error in canSendMessage:', error);
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
      const mongoose = require('mongoose');
      
      // Get user by ID
      let user = null;
      if (mongoose.Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findOne({ userId: userId });
      }
      if (!user) {
        return null;
      }

      // Get primary role from embedded roles array
      const activeRoles = (user.roles || []).filter(r => r.isActive !== false);
      const primaryRole = activeRoles.length > 0 ? activeRoles[0].roleCode : 'user';
      const roleCodes = activeRoles.map(r => r.roleCode);

      return {
        role: primaryRole,
        roles: roleCodes,
        userType: primaryRole,
        user: user,
        authority: user.authority || AUTHORITY_TIERS.BASIC_USER
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
          // Get primary role from embedded roles array
          const activeRoles = (user.roles || []).filter(r => r.isActive !== false);
          const primaryRole = activeRoles.length > 0 ? activeRoles[0].roleCode : 'user';
          const roleCodes = activeRoles.map(r => r.roleCode);

          // Format name from firstName and lastName
          const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';

          recipients.push({
            id: user._id.toString(),
            name: name,
            role: primaryRole,
            roles: roleCodes,
            email: user.email || '',
            type: primaryRole,
            authority: user.authority || AUTHORITY_TIERS.BASIC_USER
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