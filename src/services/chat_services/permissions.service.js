const { User } = require('../../models');
const authorityService = require('../../services/users_services/authority.service');
const stakeholderFilteringService = require('../../services/users_services/stakeholderFiltering.service');
const coordinatorResolverService = require('../../services/users_services/coordinatorResolver.service');

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

      // Coordinator (60): Can chat with assigned Stakeholders (30) - filtered by coverage area + org type - and System Admins (100)
      if (userAuthority >= AUTHORITY_TIERS.COORDINATOR && userAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Get all stakeholders
        const allStakeholders = await User.find({
          authority: AUTHORITY_TIERS.STAKEHOLDER,
          isActive: true
        }).select('_id');
        
        const allStakeholderIds = allStakeholders.map(s => s._id.toString());
        
        // Filter stakeholders by coordinator's coverage area + organization type
        if (allStakeholderIds.length > 0) {
          const filteredStakeholderIds = await stakeholderFilteringService.filterStakeholdersByCoverageArea(
            user._id,
            allStakeholderIds
          );
          allowedRecipients.push(...filteredStakeholderIds);
        }

        // Get System Admins only (not operational admins)
        const admins = await User.find({
          authority: AUTHORITY_TIERS.SYSTEM_ADMIN,
          isActive: true
        }).select('_id');
        allowedRecipients.push(...admins.map(u => u._id.toString()));
      }

      // Stakeholder (30): Can chat with assigned Coordinators (60) - same org type + coverage - and peer Stakeholders (same coverage + org type)
      if (userAuthority >= AUTHORITY_TIERS.STAKEHOLDER && userAuthority < AUTHORITY_TIERS.COORDINATOR) {
        // Get coordinators assigned to this stakeholder (same org type + coverage)
        try {
          const coordinatorIds = await this.getAssignedCoordinators(user._id);
          allowedRecipients.push(...coordinatorIds);
        } catch (err) {
          console.error('[ChatPermissions] Error getting assigned coordinators:', err);
        }
        
        // Get peer stakeholders (same coverage area + org type)
        try {
          const peerStakeholderIds = await this.getPeerStakeholders(user._id);
          allowedRecipients.push(...peerStakeholderIds);
        } catch (err) {
          console.error('[ChatPermissions] Error getting peer stakeholders:', err);
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
   * Get coordinators assigned to a stakeholder (same org type + coverage area)
   * @param {string|ObjectId} stakeholderId - Stakeholder's user ID
   * @returns {Array<string>} - Array of coordinator user IDs
   */
  async getAssignedCoordinators(stakeholderId) {
    try {
      console.log('[ChatPermissions] getAssignedCoordinators called for stakeholder:', stakeholderId.toString());
      
      // Use the coordinator resolver service which properly matches org type + coverage
      const result = await coordinatorResolverService.resolveValidCoordinators(stakeholderId);
      
      console.log('[ChatPermissions] Coordinator resolver result:', {
        stakeholderId: stakeholderId.toString(),
        hasResult: !!result,
        hasCoordinators: !!(result && result.coordinators),
        coordinatorCount: result?.coordinators?.length || 0,
        coordinators: result?.coordinators?.map(c => ({
          id: c._id.toString(),
          name: `${c.firstName || ''} ${c.lastName || ''}`.trim()
        })) || []
      });
      
      if (result && result.coordinators && result.coordinators.length > 0) {
        return result.coordinators.map(c => c._id.toString());
      }
      
      console.log('[ChatPermissions] No coordinators found for stakeholder:', stakeholderId.toString());
      return [];
    } catch (error) {
      console.error('[ChatPermissions] Error getting assigned coordinators:', error);
      console.error('[ChatPermissions] Error stack:', error.stack);
      return [];
    }
  }
  
  /**
   * Get peer stakeholders (same municipality + org type)
   * @param {string|ObjectId} stakeholderId - Stakeholder's user ID
   * @returns {Array<string>} - Array of peer stakeholder user IDs
   */
  async getPeerStakeholders(stakeholderId) {
    try {
      // Get the stakeholder's municipality and org type
      const stakeholder = await User.findById(stakeholderId)
        .select('locations organizations')
        .lean();
      
      if (!stakeholder) {
        return [];
      }
      
      // Extract municipality ID
      const municipalityId = stakeholder.locations?.municipalityId;
      if (!municipalityId) {
        return [];
      }
      
      // Extract organization types (handle both embedded array and legacy field)
      let orgTypes = [];
      if (stakeholder.organizations && Array.isArray(stakeholder.organizations)) {
        orgTypes = stakeholder.organizations.map(o => o.organizationType).filter(Boolean);
      }
      if (orgTypes.length === 0 && stakeholder.organizationType) {
        orgTypes = [stakeholder.organizationType];
      }
      
      if (orgTypes.length === 0) {
        return [];
      }
      
      // Find peer stakeholders in same municipality with same org type (case-insensitive)
      const peerStakeholders = await User.find({
        _id: { $ne: stakeholderId },
        authority: AUTHORITY_TIERS.STAKEHOLDER,
        isActive: true,
        'locations.municipalityId': municipalityId,
        $or: [
          { 'organizations.organizationType': { $in: orgTypes.map(t => new RegExp(`^${t}$`, 'i')) } },
          { organizationType: { $in: orgTypes.map(t => new RegExp(`^${t}$`, 'i')) } }
        ]
      }).select('_id');
      
      return peerStakeholders.map(p => p._id.toString());
    } catch (error) {
      console.error('[ChatPermissions] Error getting peer stakeholders:', error);
      return [];
    }
  }
  
  /** Escape regex special chars */
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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