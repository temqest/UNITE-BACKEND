/**
 * Notification Batching Service
 * 
 * Batches same-type notifications within a time window to reduce notification spam.
 * Groups notifications by recipient + notification type within a configurable time window.
 */

const { Notification } = require('../../models/index');

class NotificationBatchingService {
  /**
   * Default batch window in milliseconds (5 minutes)
   * Can be overridden via NOTIFICATION_BATCH_WINDOW_MS environment variable
   */
  static DEFAULT_BATCH_WINDOW = parseInt(process.env.NOTIFICATION_BATCH_WINDOW_MS) || 5 * 60 * 1000; // 5 minutes default

  /**
   * Batch notifications of the same type for the same recipient
   * @param {Array<Object>} notifications - Array of notification documents or notification data
   * @param {number} batchWindow - Time window in milliseconds (default: 5 minutes)
   * @returns {Promise<Array<Object>>} Array of batched notifications (individual or batched)
   */
  async batchNotifications(notifications, batchWindow = NotificationBatchingService.DEFAULT_BATCH_WINDOW) {
    try {
      if (!notifications || notifications.length === 0) {
        return [];
      }

      // Group notifications by recipient + type
      const batches = new Map();
      const now = Date.now();

      for (const notification of notifications) {
        // Get recipient ID (support both new and legacy formats)
        const recipientId = notification.recipientUserId?.toString() || notification.Recipient_ID;
        const notificationType = notification.NotificationType;

        if (!recipientId || !notificationType) {
          // Skip notifications without required fields
          continue;
        }

        const batchKey = `${recipientId}-${notificationType}`;
        
        if (!batches.has(batchKey)) {
          batches.set(batchKey, {
            recipientId: recipientId,
            notificationType: notificationType,
            notifications: [],
            batchId: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          });
        }

        batches.get(batchKey).notifications.push(notification);
      }

      // Process each batch
      const result = [];
      
      for (const [batchKey, batch] of batches) {
        if (batch.notifications.length === 1) {
          // Single notification - no batching needed
          result.push(batch.notifications[0]);
        } else {
          // Multiple notifications - create batched notification
          const batchedNotification = await this.createBatchedNotification(batch);
          result.push(batchedNotification);
        }
      }

      return result;
    } catch (error) {
      console.error('[NOTIFICATION BATCHING] Error batching notifications:', error);
      // Return original notifications if batching fails
      return notifications;
    }
  }

  /**
   * Create a batched notification from multiple notifications
   * @param {Object} batch - Batch object with recipientId, notificationType, notifications array
   * @returns {Promise<Object>} Batched notification document
   */
  async createBatchedNotification(batch) {
    try {
      const { recipientId, notificationType, notifications, batchId } = batch;
      const count = notifications.length;

      // Get title and message for batched notification
      const { title, message } = this.getBatchedTitleAndMessage(notificationType, count, notifications);

      // Get common fields from first notification
      const firstNotification = notifications[0];
      
      // Determine recipientUserId (support both formats)
      let recipientUserId = firstNotification.recipientUserId;
      if (!recipientUserId && recipientId) {
        // Try to resolve from legacy Recipient_ID
        try {
          const { User } = require('../../models/index');
          const user = await User.findOne({ userId: recipientId }) || 
                      await User.findById(recipientId);
          if (user) {
            recipientUserId = user._id;
          }
        } catch (e) {
          // Ignore resolution errors
        }
      }

      // Create batched notification
      const batchedNotification = {
        Notification_ID: `NOTIF_BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        recipientUserId: recipientUserId,
        NotificationType: notificationType,
        Title: title,
        Message: message,
        batchId: batchId,
        // Common fields from first notification
        Request_ID: firstNotification.Request_ID || null,
        Event_ID: firstNotification.Event_ID || null,
        actor: firstNotification.actor || null,
        // Legacy fields for backward compatibility
        Recipient_ID: firstNotification.Recipient_ID || recipientId,
        RecipientType: firstNotification.RecipientType || null,
        deliveryStatus: {
          inApp: true,
          email: false
        },
        IsRead: false
      };

      return batchedNotification;
    } catch (error) {
      console.error('[NOTIFICATION BATCHING] Error creating batched notification:', error);
      throw error;
    }
  }

  /**
   * Get batched title and message based on notification type and count
   * @param {string} notificationType - Notification type
   * @param {number} count - Number of notifications in batch
   * @param {Array<Object>} notifications - Array of notification objects
   * @returns {Object} { title, message }
   */
  getBatchedTitleAndMessage(notificationType, count, notifications) {
    const firstNotification = notifications[0];

    switch (notificationType) {
      case 'event.staff-added':
        return {
          title: 'Staff Added to Events',
          message: `${count} staff member(s) have been added to ${count === 1 ? 'an event' : 'multiple events'}.`
        };

      case 'event.edited':
        return {
          title: 'Events Updated',
          message: `${count} event(s) have been updated.`
        };

      case 'event.published':
        return {
          title: 'Events Published',
          message: `${count} event(s) have been published and are now live.`
        };

      case 'request.pending-review':
        return {
          title: 'New Requests Require Review',
          message: `You have ${count} new request(s) requiring your review.`
        };

      case 'request.approved':
        return {
          title: 'Requests Approved',
          message: `${count} of your request(s) have been approved.`
        };

      case 'request.rejected':
        return {
          title: 'Requests Rejected',
          message: `${count} of your request(s) have been rejected.`
        };

      case 'request.rescheduled':
        return {
          title: 'Requests Rescheduled',
          message: `${count} of your request(s) have been rescheduled.`
        };

      default:
        // Generic batched message
        return {
          title: firstNotification.Title || 'Notifications',
          message: `You have ${count} new notification(s).`
        };
    }
  }

  /**
   * Check for existing batched notifications within time window and merge if found
   * @param {Object} notificationData - New notification data
   * @param {number} batchWindow - Time window in milliseconds
   * @returns {Promise<Object|null>} Existing batched notification to merge into, or null
   */
  async findExistingBatch(notificationData, batchWindow = NotificationBatchingService.DEFAULT_BATCH_WINDOW) {
    try {
      const recipientId = notificationData.recipientUserId?.toString() || notificationData.Recipient_ID;
      const notificationType = notificationData.NotificationType;

      if (!recipientId || !notificationType) {
        return null;
      }

      const cutoffTime = new Date(Date.now() - batchWindow);

      // Find recent batched notifications of the same type for the same recipient
      const query = {
        NotificationType: notificationType,
        batchId: { $exists: true, $ne: null },
        createdAt: { $gte: cutoffTime },
        IsRead: false
      };

      // Support both new and legacy formats
      if (notificationData.recipientUserId) {
        query.recipientUserId = notificationData.recipientUserId;
      } else if (notificationData.Recipient_ID) {
        query.Recipient_ID = notificationData.Recipient_ID;
        if (notificationData.RecipientType) {
          query.RecipientType = notificationData.RecipientType;
        }
      }

      const existingBatch = await Notification.findOne(query)
        .sort({ createdAt: -1 });

      return existingBatch;
    } catch (error) {
      console.error('[NOTIFICATION BATCHING] Error finding existing batch:', error);
      return null;
    }
  }

  /**
   * Merge a new notification into an existing batched notification
   * @param {Object} existingBatch - Existing batched notification document
   * @param {Object} newNotification - New notification data
   * @returns {Promise<Object>} Updated batched notification
   */
  async mergeIntoBatch(existingBatch, newNotification) {
    try {
      // Update the batched notification message to reflect new count
      // This is a simplified approach - in production, you might want to track individual notifications
      const currentCount = parseInt(existingBatch.Message.match(/\d+/)?.[0] || '1');
      const newCount = currentCount + 1;

      const { title, message } = this.getBatchedTitleAndMessage(
        existingBatch.NotificationType,
        newCount,
        [existingBatch, newNotification]
      );

      existingBatch.Title = title;
      existingBatch.Message = message;
      existingBatch.updatedAt = new Date();

      await existingBatch.save();

      return existingBatch;
    } catch (error) {
      console.error('[NOTIFICATION BATCHING] Error merging into batch:', error);
      throw error;
    }
  }
}

module.exports = new NotificationBatchingService();

