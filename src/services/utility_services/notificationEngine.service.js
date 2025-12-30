/**
 * Notification Engine Service
 * 
 * Core service for creating and managing notifications in the modernized system.
 * Handles notification creation with ObjectId references and permission-based recipient resolution.
 */

const { Notification, EventRequest, Event, User } = require('../../models/index');
const notificationService = require('./notification.service');
const notificationRecipientService = require('./notificationRecipient.service');
const emailNotificationService = require('./emailNotification.service');

class NotificationEngine {
  /**
   * Generate unique notification ID
   */
  generateNotificationID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `NOTIF_${timestamp}_${random}`;
  }

  /**
   * Create a notification with proper recipient resolution
   * Includes deduplication check before creating
   * @param {Object} notificationData - Notification data
   * @returns {Promise<Object|null>} Created notification or null if duplicate
   */
  async createNotification(notificationData) {
    try {
      // Ensure Notification_ID is set
      if (!notificationData.Notification_ID) {
        notificationData.Notification_ID = this.generateNotificationID();
      }

      // Ensure recipientUserId is set (required for new notifications)
      if (!notificationData.recipientUserId) {
        throw new Error('recipientUserId is required for new notifications');
      }

      // Check for duplicate notification (same type + recipient + entity within 1 minute)
      const isDuplicate = await this.checkDuplicateNotification(notificationData);
      if (isDuplicate) {
        console.log(`[NOTIFICATION ENGINE] Duplicate notification detected, skipping creation: ${notificationData.Notification_ID}`);
        return null; // Return null instead of creating duplicate
      }

      // Set default delivery status
      if (!notificationData.deliveryStatus) {
        notificationData.deliveryStatus = {
          inApp: true,
          email: false
        };
      }

      const notification = new Notification(notificationData);
      const savedNotification = await notification.save();

      return savedNotification;
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error creating notification:', error);
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  /**
   * Check for duplicate notification within time window
   * @param {Object} notificationData - Notification data
   * @returns {Promise<boolean>} True if duplicate found
   */
  async checkDuplicateNotification(notificationData) {
    try {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000); // 1 minute window

      // Build query for duplicate check
      const query = {
        recipientUserId: notificationData.recipientUserId,
        NotificationType: notificationData.NotificationType,
        createdAt: { $gte: oneMinuteAgo }
      };

      // Add entity-specific filter
      if (notificationData.Request_ID) {
        query.Request_ID = notificationData.Request_ID;
      } else if (notificationData.Event_ID) {
        query.Event_ID = notificationData.Event_ID;
      } else {
        // No entity ID, can't check for duplicates
        return false;
      }

      const duplicate = await Notification.findOne(query);

      return !!duplicate;
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error checking duplicate notification:', error);
      return false; // Don't block creation if check fails
    }
  }

  /**
   * Notify reviewer when a new request is created
   * @param {Object} request - EventRequest document
   */
  async notifyRequestCreated(request) {
    try {
      if (!request.reviewer || !request.reviewer.userId) {
        console.warn('[NOTIFICATION ENGINE] No reviewer assigned to request:', request.Request_ID);
        return;
      }

      const reviewer = await User.findById(request.reviewer.userId);
      if (!reviewer) {
        console.warn('[NOTIFICATION ENGINE] Reviewer not found:', request.reviewer.userId);
        return;
      }

      const requester = await User.findById(request.requester.userId);
      const requesterName = requester 
        ? `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.email
        : request.requester.name || 'Unknown';

      const category = request.Category || 'Event';
      const eventTitle = request.Event_Title || 'Untitled Event';

      const notification = await this.createNotification({
        recipientUserId: reviewer._id,
        NotificationType: 'request.pending-review',
        Request_ID: request.Request_ID,
        Event_ID: request.Event_ID,
        Title: 'New Event Request Requires Review',
        Message: `A new ${category} request "${eventTitle}" submitted by ${requesterName} requires your review.`,
        actor: {
          userId: request.requester.userId,
          name: requesterName,
          roleSnapshot: request.requester.roleSnapshot,
          authoritySnapshot: request.requester.authoritySnapshot
        },
        // Legacy fields for backward compatibility
        Recipient_ID: reviewer.userId || reviewer._id.toString(),
        RecipientType: this._inferRecipientType(reviewer)
      });

      // Trigger email notification if notification was created (not duplicate)
      if (notification) {
        try {
          await emailNotificationService.sendEmailNotification(notification);
        } catch (emailError) {
          console.error(`[NOTIFICATION ENGINE] Error sending email notification: ${emailError.message}`);
          // Don't fail notification creation if email fails
        }
      }

      console.log(`[NOTIFICATION ENGINE] Created pending-review notification for reviewer ${reviewer.email}`);
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error notifying request created:', error);
      // Don't throw - notification failures shouldn't break request creation
    }
  }

  /**
   * Notify requester when request state changes
   * @param {Object} request - EventRequest document
   * @param {string} action - Action taken (accept, reject, reschedule, etc.)
   * @param {Object} actor - Actor snapshot
   * @param {Object} actionData - Action data (notes, proposedDate, etc.)
   */
  async notifyRequestStateChange(request, action, actor, actionData = {}) {
    try {
      const state = request.status;
      let notificationType = null;
      let title = null;
      let message = null;

      // Determine notification type and message based on new state
      if (state === 'approved') {
        notificationType = 'request.approved';
        title = 'Your Event Request Approved';
        const eventTitle = request.Event_Title || 'Your event';
        message = `Your event "${eventTitle}" has been approved and is now live.`;
      } else if (state === 'rejected') {
        notificationType = 'request.rejected';
        title = 'Your Event Request Rejected';
        const eventTitle = request.Event_Title || 'Your event request';
        // Keep message clean - ActionNote will be displayed separately
        message = `Your event request "${eventTitle}" has been rejected.`;
      } else if (state === 'review-rescheduled') {
        notificationType = 'request.rescheduled';
        title = 'Your Event Request Rescheduled';
        const eventTitle = request.Event_Title || 'Your event';
        
        // Format dates
        let newDateStr = '';
        let originalDateStr = '';
        
        if (actionData.proposedDate) {
          try {
            newDateStr = new Date(actionData.proposedDate).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          } catch (e) {}
        }
        
        if (actionData.originalDate) {
          try {
            originalDateStr = new Date(actionData.originalDate).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            });
          } catch (e) {}
        }
        
        // Keep date info in message - ActionNote will be displayed separately
        if (originalDateStr && newDateStr) {
          message = `Your event "${eventTitle}" scheduled on ${originalDateStr} has a proposed reschedule to ${newDateStr}.`;
        } else if (newDateStr) {
          message = `Your event "${eventTitle}" has a proposed reschedule to ${newDateStr}.`;
        } else {
          message = `Your event "${eventTitle}" has a proposed reschedule.`;
        }
      } else if (state === 'cancelled') {
        notificationType = 'request.cancelled';
        title = 'Your Event Request Cancelled';
        const eventTitle = request.Event_Title || 'Your event request';
        // Keep message clean - ActionNote will be displayed separately
        message = `Your event request "${eventTitle}" has been cancelled.`;
      }

      if (!notificationType) {
        // No notification needed for this state change
        return;
      }

      // Get requester
      const requester = await User.findById(request.requester.userId);
      if (!requester) {
        console.warn('[NOTIFICATION ENGINE] Requester not found:', request.requester.userId);
        return;
      }

      // Retrieve note from actionData, with fallback to request history if needed
      let actionNote = actionData.notes || null;
      
      // Fallback: If note is missing, try to retrieve from request history
      if (!actionNote && (state === 'rejected' || state === 'review-rescheduled' || state === 'cancelled')) {
        // Try to get note from latest decisionHistory entry
        if (request.decisionHistory && request.decisionHistory.length > 0) {
          const latestDecision = request.decisionHistory[request.decisionHistory.length - 1];
          if (latestDecision && latestDecision.notes) {
            actionNote = latestDecision.notes;
          }
        }
        
        // If still no note, try statusHistory
        if (!actionNote && request.statusHistory && request.statusHistory.length > 0) {
          const latestStatus = request.statusHistory[request.statusHistory.length - 1];
          if (latestStatus && latestStatus.note) {
            actionNote = latestStatus.note;
          }
        }
        
        // For rescheduled requests, also check rescheduleProposal
        if (!actionNote && state === 'review-rescheduled' && request.rescheduleProposal && request.rescheduleProposal.reviewerNotes) {
          actionNote = request.rescheduleProposal.reviewerNotes;
        }
      }

      // Create notification
      const notification = await this.createNotification({
        recipientUserId: requester._id,
        NotificationType: notificationType,
        Request_ID: request.Request_ID,
        Event_ID: request.Event_ID,
        Title: title,
        Message: message,
        actor: {
          userId: actor.userId,
          name: actor.name,
          roleSnapshot: actor.roleSnapshot,
          authoritySnapshot: actor.authoritySnapshot
        },
        ActionTaken: action,
        ActionNote: actionNote, // Always set (can be null if no note provided)
        RescheduledDate: actionData.proposedDate || null,
        OriginalDate: actionData.originalDate || null,
        // Legacy fields
        Recipient_ID: requester.userId || requester._id.toString(),
        RecipientType: this._inferRecipientType(requester)
      });

      // Trigger email notification if notification was created (not duplicate)
      if (notification) {
        try {
          await emailNotificationService.sendEmailNotification(notification);
        } catch (emailError) {
          console.error(`[NOTIFICATION ENGINE] Error sending email notification: ${emailError.message}`);
          // Don't fail notification creation if email fails
        }
      }

      console.log(`[NOTIFICATION ENGINE] Created ${notificationType} notification for requester ${requester.email}`);
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error notifying request state change:', error);
      // Don't throw - notification failures shouldn't break request actions
    }
  }

  /**
   * Notify users when an event is published
   * @param {Object} event - Event document
   * @param {Object} request - EventRequest document (optional)
   * @param {Object} actor - Actor snapshot
   */
  async notifyEventPublished(event, request = null, actor = null) {
    try {
      // Resolve recipients using permission-based service
      const recipients = await notificationRecipientService.resolveEventRecipients(
        event,
        request,
        'event.published'
      );

      const eventTitle = event.Event_Title || 'Untitled Event';
      const actorName = actor?.name || 'System';

      // Create notifications for all recipients
      const notificationPromises = recipients.map(async (recipientId) => {
        const recipient = await User.findById(recipientId);
        if (!recipient) return null;

        return this.createNotification({
          recipientUserId: recipient._id,
          NotificationType: 'event.published',
          Event_ID: event.Event_ID,
          Request_ID: request?.Request_ID || null,
          Title: 'Event Published',
          Message: `The event "${eventTitle}" has been published and is now live.`,
          actor: actor ? {
            userId: actor.userId,
            name: actor.name,
            roleSnapshot: actor.roleSnapshot,
            authoritySnapshot: actor.authoritySnapshot
          } : null,
          // Legacy fields
          Recipient_ID: recipient.userId || recipient._id.toString(),
          RecipientType: this._inferRecipientType(recipient)
        });
      });

      const notifications = await Promise.all(notificationPromises.filter(Boolean));
      
      // Trigger email notifications for created notifications (event.published is critical)
      for (const notification of notifications) {
        if (notification) {
          try {
            await emailNotificationService.sendEmailNotification(notification);
          } catch (emailError) {
            console.error(`[NOTIFICATION ENGINE] Error sending email notification: ${emailError.message}`);
          }
        }
      }
      
      console.log(`[NOTIFICATION ENGINE] Created event.published notifications for ${recipients.length} recipients`);
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error notifying event published:', error);
    }
  }

  /**
   * Notify users when an event is edited
   * @param {Object} event - Event document
   * @param {Object} request - EventRequest document (optional)
   * @param {string|ObjectId} editorId - User ID of editor
   */
  async notifyEventEdited(event, request = null, editorId) {
    try {
      const editor = await User.findById(editorId);
      if (!editor) {
        console.warn('[NOTIFICATION ENGINE] Editor not found:', editorId);
        return;
      }

      // Resolve recipients
      const recipients = await notificationRecipientService.resolveEventRecipients(
        event,
        request,
        'event.edited'
      );

      const eventTitle = event.Event_Title || 'Untitled Event';

      const notificationPromises = recipients.map(async (recipientId) => {
        const recipient = await User.findById(recipientId);
        if (!recipient) return null;

        return this.createNotification({
          recipientUserId: recipient._id,
          NotificationType: 'event.edited',
          Event_ID: event.Event_ID,
          Request_ID: request?.Request_ID || null,
          Title: 'Event Updated',
          Message: `The event "${eventTitle}" has been updated.`,
          actor: {
            userId: editor._id,
            name: `${editor.firstName || ''} ${editor.lastName || ''}`.trim() || editor.email,
            roleSnapshot: editor.roles?.[0]?.roleCode || null,
            authoritySnapshot: editor.authority || 20
          },
          // Legacy fields
          Recipient_ID: recipient.userId || recipient._id.toString(),
          RecipientType: this._inferRecipientType(recipient)
        });
      });

      await Promise.all(notificationPromises.filter(Boolean));
      // Note: event.edited is low-importance, no email sent (in-app only)
      console.log(`[NOTIFICATION ENGINE] Created event.edited notifications for ${recipients.length} recipients`);
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error notifying event edited:', error);
    }
  }

  /**
   * Notify users when staff is added to an event
   * @param {Object} event - Event document
   * @param {Object} request - EventRequest document (optional)
   * @param {string|ObjectId} assignerId - User ID of staff assigner
   * @param {number} staffCount - Number of staff members added
   */
  async notifyStaffAdded(event, request = null, assignerId, staffCount) {
    try {
      const assigner = await User.findById(assignerId);
      if (!assigner) {
        console.warn('[NOTIFICATION ENGINE] Assigner not found:', assignerId);
        return;
      }

      // Resolve recipients
      const recipients = await notificationRecipientService.resolveEventRecipients(
        event,
        request,
        'event.staff-added'
      );

      const eventTitle = event.Event_Title || 'Untitled Event';
      const batchId = `staff-${event.Event_ID}-${Date.now()}`;

      const notificationPromises = recipients.map(async (recipientId) => {
        const recipient = await User.findById(recipientId);
        if (!recipient) return null;

        return this.createNotification({
          recipientUserId: recipient._id,
          NotificationType: 'event.staff-added',
          Event_ID: event.Event_ID,
          Request_ID: request?.Request_ID || null,
          Title: 'Staff Added to Event',
          Message: `${staffCount} staff member(s) have been added to the event "${eventTitle}".`,
          actor: {
            userId: assigner._id,
            name: `${assigner.firstName || ''} ${assigner.lastName || ''}`.trim() || assigner.email,
            roleSnapshot: assigner.roles?.[0]?.roleCode || null,
            authoritySnapshot: assigner.authority || 20
          },
          batchId: batchId,
          // Legacy fields
          Recipient_ID: recipient.userId || recipient._id.toString(),
          RecipientType: this._inferRecipientType(recipient)
        });
      });

      await Promise.all(notificationPromises.filter(Boolean));
      // Note: event.staff-added is low-importance, no email sent (in-app only)
      console.log(`[NOTIFICATION ENGINE] Created event.staff-added notifications for ${recipients.length} recipients`);
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error notifying staff added:', error);
    }
  }

  /**
   * Notify users when an event is cancelled
   * @param {Object} event - Event document
   * @param {Object} request - EventRequest document (optional)
   * @param {Object} actor - Actor snapshot
   * @param {string} notes - Cancellation reason/notes
   */
  async notifyEventCancelled(event, request = null, actor = null, notes = null) {
    try {
      // Resolve recipients (includes owner + coordinator if stakeholder)
      const recipients = await notificationRecipientService.resolveEventRecipients(
        event,
        request,
        'event.cancelled'
      );

      const eventTitle = event.Event_Title || 'Untitled Event';
      const actorName = actor?.name || 'System';
      const reason = notes ? ` Reason: ${notes}` : '';

      const notificationPromises = recipients.map(async (recipientId) => {
        const recipient = await User.findById(recipientId);
        if (!recipient) return null;

        return this.createNotification({
          recipientUserId: recipient._id,
          NotificationType: 'event.cancelled',
          Event_ID: event.Event_ID,
          Request_ID: request?.Request_ID || null,
          Title: 'Event Cancelled',
          Message: `The event "${eventTitle}" has been cancelled.${reason}`,
          actor: actor ? {
            userId: actor.userId,
            name: actor.name,
            roleSnapshot: actor.roleSnapshot,
            authoritySnapshot: actor.authoritySnapshot
          } : null,
          ActionNote: notes,
          // Legacy fields
          Recipient_ID: recipient.userId || recipient._id.toString(),
          RecipientType: this._inferRecipientType(recipient)
        });
      });

      const notifications = await Promise.all(notificationPromises.filter(Boolean));
      
      // Trigger email notifications for created notifications (event.cancelled is critical)
      for (const notification of notifications) {
        if (notification) {
          try {
            await emailNotificationService.sendEmailNotification(notification);
          } catch (emailError) {
            console.error(`[NOTIFICATION ENGINE] Error sending email notification: ${emailError.message}`);
          }
        }
      }
      
      console.log(`[NOTIFICATION ENGINE] Created event.cancelled notifications for ${recipients.length} recipients`);
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error notifying event cancelled:', error);
    }
  }

  /**
   * Notify users when an event is deleted
   * @param {Object} event - Event document (may be partial if already deleted)
   * @param {Object} request - EventRequest document (optional)
   * @param {Object} actor - Actor snapshot
   */
  async notifyEventDeleted(event, request = null, actor = null) {
    try {
      // Resolve recipients (includes owner + coordinator if stakeholder)
      const recipients = await notificationRecipientService.resolveEventRecipients(
        event,
        request,
        'event.deleted'
      );

      const eventTitle = event?.Event_Title || request?.Event_Title || 'Untitled Event';
      const actorName = actor?.name || 'System';

      const notificationPromises = recipients.map(async (recipientId) => {
        const recipient = await User.findById(recipientId);
        if (!recipient) return null;

        return this.createNotification({
          recipientUserId: recipient._id,
          NotificationType: 'event.deleted',
          Event_ID: event?.Event_ID || request?.Event_ID || null,
          Request_ID: request?.Request_ID || null,
          Title: 'Event Deleted',
          Message: `The event "${eventTitle}" has been deleted.`,
          actor: actor ? {
            userId: actor.userId,
            name: actor.name,
            roleSnapshot: actor.roleSnapshot,
            authoritySnapshot: actor.authoritySnapshot
          } : null,
          // Legacy fields
          Recipient_ID: recipient.userId || recipient._id.toString(),
          RecipientType: this._inferRecipientType(recipient)
        });
      });

      const notifications = await Promise.all(notificationPromises.filter(Boolean));
      
      // Trigger email notifications for created notifications (event.deleted is critical)
      for (const notification of notifications) {
        if (notification) {
          try {
            await emailNotificationService.sendEmailNotification(notification);
          } catch (emailError) {
            console.error(`[NOTIFICATION ENGINE] Error sending email notification: ${emailError.message}`);
          }
        }
      }
      
      console.log(`[NOTIFICATION ENGINE] Created event.deleted notifications for ${recipients.length} recipients`);
    } catch (error) {
      console.error('[NOTIFICATION ENGINE] Error notifying event deleted:', error);
    }
  }

  /**
   * Infer recipient type from user (for legacy compatibility)
   * @private
   */
  _inferRecipientType(user) {
    if (!user) return 'Coordinator';
    
    // Check if user has system-admin role
    if (user.isSystemAdmin || user.authority >= 100) {
      return 'Admin';
    }
    
    // Check roles
    if (user.roles && user.roles.length > 0) {
      const roleCodes = user.roles.map(r => r.roleCode || r.roleId?.code).filter(Boolean);
      if (roleCodes.includes('system-admin')) return 'Admin';
      if (roleCodes.includes('coordinator')) return 'Coordinator';
      if (roleCodes.includes('stakeholder')) return 'Stakeholder';
    }
    
    // Check authority
    if (user.authority >= 80) return 'Admin';
    if (user.authority >= 60) return 'Coordinator';
    if (user.authority < 60) return 'Stakeholder';
    
    return 'Coordinator'; // Default
  }
}

module.exports = new NotificationEngine();

