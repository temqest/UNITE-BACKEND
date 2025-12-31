/**
 * Notification Recipient Resolution Service
 * 
 * Resolves notification recipients based on permissions instead of roles.
 * Handles event and request notification recipient resolution.
 */

const { User, EventRequest, Event } = require('../../models/index');
const permissionService = require('../users_services/permission.service');

class NotificationRecipientService {
  /**
   * Resolve recipients for event notifications based on permissions
   * @param {Object} event - Event document
   * @param {Object} request - EventRequest document (optional)
   * @param {string} notificationType - Notification type (e.g., 'event.published', 'event.edited')
   * @returns {Promise<Array<ObjectId>>} Array of recipient user IDs
   */
  async resolveEventRecipients(event, request = null, notificationType) {
    try {
      const recipients = new Set();

      // Always include event owner (requester) if available
      if (request && request.requester && request.requester.userId) {
        recipients.add(request.requester.userId.toString());
      }

      // Get location context from event or request
      const locationId = event.district || event.municipalityId || 
                        (request && (request.district || request.municipalityId));

      // Determine required permission based on notification type
      let requiredPermission = 'event.read'; // Default
      
      if (notificationType === 'event.edited') {
        // For edited events, notify users with read OR update permission
        const readUsers = await permissionService.getUsersWithPermission(
          'event.read',
          { locationId }
        );
        const updateUsers = await permissionService.getUsersWithPermission(
          'event.update',
          { locationId }
        );
        
        readUsers.forEach(id => recipients.add(id.toString()));
        updateUsers.forEach(id => recipients.add(id.toString()));
      } else if (notificationType === 'event.staff-added') {
        // For staff additions, notify users with read OR manage-staff permission
        const readUsers = await permissionService.getUsersWithPermission(
          'event.read',
          { locationId }
        );
        const manageStaffUsers = await permissionService.getUsersWithPermission(
          'event.manage-staff',
          { locationId }
        );
        
        readUsers.forEach(id => recipients.add(id.toString()));
        manageStaffUsers.forEach(id => recipients.add(id.toString()));
      } else {
        // For published, cancelled, deleted - notify users with read permission
        const usersWithPermission = await permissionService.getUsersWithPermission(
          'event.read',
          { locationId }
        );
        
        usersWithPermission.forEach(id => recipients.add(id.toString()));
      }

      // Special handling for cancelled/deleted events
      if (['event.cancelled', 'event.deleted'].includes(notificationType)) {
        // If owner is Stakeholder (authority < 60), also notify assigned Coordinator
        if (request && request.requester && request.requester.userId) {
          const owner = await User.findById(request.requester.userId);
          if (owner && owner.authority < 60) {
            // Owner is a stakeholder, find their coordinator
            const coordinator = await this.resolveCoordinatorForStakeholder(owner, locationId);
            if (coordinator) {
              recipients.add(coordinator._id.toString());
            }
          }
        }
      }

      // Always include reviewer if available
      if (request && request.reviewer && request.reviewer.userId) {
        recipients.add(request.reviewer.userId.toString());
      }

      const mongoose = require('mongoose');
      return Array.from(recipients).map(id => {
        // Convert string IDs to ObjectId if needed
        if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
          return new mongoose.Types.ObjectId(id);
        }
        // If already an ObjectId, return as-is
        if (id instanceof mongoose.Types.ObjectId) {
          return id;
        }
        return id;
      });
    } catch (error) {
      console.error('[NOTIFICATION RECIPIENT SERVICE] Error resolving event recipients:', error);
      // Return at least the owner if we can find them
      const fallbackRecipients = [];
      if (request && request.requester && request.requester.userId) {
        fallbackRecipients.push(request.requester.userId);
      }
      return fallbackRecipients;
    }
  }

  /**
   * Resolve coordinator for a stakeholder
   * @param {Object} stakeholder - User document (stakeholder)
   * @param {ObjectId} locationId - Location ID (optional, for filtering)
   * @returns {Promise<Object|null>} Coordinator user document or null
   */
  async resolveCoordinatorForStakeholder(stakeholder, locationId = null) {
    try {
      // If stakeholder has a location, find coordinator for that location
      if (stakeholder.locations && stakeholder.locations.municipalityId) {
        const municipalityId = stakeholder.locations.municipalityId;
        
        // Find coordinators with coverage area that includes this municipality
        const coordinators = await User.find({
          'roles.roleCode': 'coordinator',
          'roles.isActive': true,
          isActive: true,
          'coverageAreas.municipalityIds': municipalityId
        }).limit(10);

        if (coordinators.length > 0) {
          // Return the first coordinator found
          return coordinators[0];
        }
      }

      // Fallback: Find any coordinator with event.read permission for the location
      if (locationId) {
        const coordinators = await permissionService.getUsersWithPermission(
          'event.read',
          { locationId }
        );

        // Filter to only coordinators (authority >= 60)
        const coordinatorUsers = await User.find({
          _id: { $in: coordinators },
          authority: { $gte: 60 },
          isActive: true
        }).limit(1);

        if (coordinatorUsers.length > 0) {
          return coordinatorUsers[0];
        }
      }

      // Last resort: Find any active coordinator
      const anyCoordinator = await User.findOne({
        'roles.roleCode': 'coordinator',
        'roles.isActive': true,
        isActive: true,
        authority: { $gte: 60 }
      });

      return anyCoordinator;
    } catch (error) {
      console.error('[NOTIFICATION RECIPIENT SERVICE] Error resolving coordinator:', error);
      return null;
    }
  }

  /**
   * Resolve recipients for request notifications
   * @param {Object} request - EventRequest document
   * @param {string} notificationType - Notification type (e.g., 'request.pending-review')
   * @returns {Promise<Array<ObjectId>>} Array of recipient user IDs
   */
  async resolveRequestRecipients(request, notificationType) {
    try {
      const recipients = new Set();

      if (notificationType === 'request.pending-review') {
        // Notify the assigned reviewer
        if (request.reviewer && request.reviewer.userId) {
          recipients.add(request.reviewer.userId.toString());
        }
      } else {
        // For other request notifications, notify the requester
        if (request.requester && request.requester.userId) {
          recipients.add(request.requester.userId.toString());
        }
      }

      return Array.from(recipients).map(id => {
        if (typeof id === 'string' && require('mongoose').Types.ObjectId.isValid(id)) {
          return require('mongoose').Types.ObjectId(id);
        }
        return id;
      });
    } catch (error) {
      console.error('[NOTIFICATION RECIPIENT SERVICE] Error resolving request recipients:', error);
      return [];
    }
  }
}

module.exports = new NotificationRecipientService();

