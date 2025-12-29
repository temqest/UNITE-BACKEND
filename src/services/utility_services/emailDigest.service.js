/**
 * Email Digest Service
 * 
 * Handles digest emails for users in digest mode.
 * Batches multiple notifications into a single digest email.
 */

const { Notification, User, UserNotificationPreferences, EventRequest, Event } = require('../../models/index');
const emailService = require('./email.service');

class EmailDigestService {
  /**
   * Default digest threshold (number of pending requests to trigger digest)
   */
  static DEFAULT_DIGEST_THRESHOLD = parseInt(process.env.EMAIL_DIGEST_THRESHOLD) || 3;

  /**
   * Default hourly interval for digest emails (in milliseconds)
   */
  static DEFAULT_HOURLY_INTERVAL = parseInt(process.env.EMAIL_DIGEST_HOURLY_INTERVAL) || 60 * 60 * 1000; // 1 hour

  /**
   * Queue notification for digest (mark as queued, don't send immediately)
   * @param {Object} notification - Notification document
   * @returns {Promise<boolean>} True if queued successfully
   */
  async queueNotificationForDigest(notification) {
    try {
      // Mark notification as queued for digest
      await Notification.updateOne(
        { Notification_ID: notification.Notification_ID },
        {
          $set: {
            'deliveryStatus.email': false,
            'deliveryStatus.queuedForDigest': true,
            'deliveryStatus.queuedAt': new Date()
          }
        }
      );

      return true;
    } catch (error) {
      console.error('[EMAIL DIGEST] Error queueing notification for digest:', error);
      return false;
    }
  }

  /**
   * Check if user should receive digest email (hourly OR threshold reached)
   * @param {ObjectId} userId - User ID
   * @param {Object} preferences - UserNotificationPreferences document (optional)
   * @returns {Promise<boolean>} True if digest should be sent
   */
  async checkDigestThreshold(userId, preferences = null) {
    try {
      if (!preferences) {
        preferences = await UserNotificationPreferences.getOrCreate(userId);
      }

      // Check if user is in digest mode
      if (!preferences.isInDigestMode()) {
        return false;
      }

      // Check hourly interval
      const now = new Date();
      const lastDigestSent = preferences.lastDigestSentAt;
      const hourlyInterval = EmailDigestService.DEFAULT_HOURLY_INTERVAL;

      if (lastDigestSent) {
        const timeSinceLastDigest = now - lastDigestSent;
        if (timeSinceLastDigest >= hourlyInterval) {
          return true; // Hourly interval reached
        }
      } else {
        // Never sent digest, check if we have queued notifications
        const queuedCount = await this.getQueuedNotificationCount(userId);
        if (queuedCount > 0) {
          return true; // Have queued notifications, send digest
        }
      }

      // Check threshold (number of pending requests)
      const threshold = EmailDigestService.DEFAULT_DIGEST_THRESHOLD;
      const pendingCount = await this.getPendingRequestCount(userId);

      if (pendingCount >= threshold) {
        return true; // Threshold reached
      }

      // Check if we have queued notifications
      const queuedCount = await this.getQueuedNotificationCount(userId);
      if (queuedCount >= threshold) {
        return true; // Queued notifications threshold reached
      }

      return false;
    } catch (error) {
      console.error('[EMAIL DIGEST] Error checking digest threshold:', error);
      return false;
    }
  }

  /**
   * Get count of queued notifications for user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<number>} Count of queued notifications
   */
  async getQueuedNotificationCount(userId) {
    try {
      const count = await Notification.countDocuments({
        recipientUserId: userId,
        'deliveryStatus.queuedForDigest': true,
        'deliveryStatus.email': { $ne: true }
      });

      return count;
    } catch (error) {
      console.error('[EMAIL DIGEST] Error getting queued notification count:', error);
      return 0;
    }
  }

  /**
   * Get count of pending requests for user (for coordinators)
   * @param {ObjectId} userId - User ID
   * @returns {Promise<number>} Count of pending requests
   */
  async getPendingRequestCount(userId) {
    try {
      // Get user to check role
      const user = await User.findById(userId);
      if (!user) return 0;

      // Check if user is a coordinator (has coordinator role or authority >= 60)
      const isCoordinator = user.authority >= 60 || 
                           (user.roles && user.roles.some(r => r.roleCode === 'coordinator' && r.isActive));

      if (!isCoordinator) {
        return 0; // Only coordinators have pending requests to review
      }

      // Count pending requests assigned to this reviewer
      const count = await EventRequest.countDocuments({
        'reviewer.userId': userId,
        status: 'pending-review'
      });

      return count;
    } catch (error) {
      console.error('[EMAIL DIGEST] Error getting pending request count:', error);
      return 0;
    }
  }

  /**
   * Get queued notifications for user
   * @param {ObjectId} userId - User ID
   * @param {number} limit - Maximum number of notifications to retrieve
   * @returns {Promise<Array>} Array of notification documents
   */
  async getQueuedNotifications(userId, limit = 50) {
    try {
      const notifications = await Notification.find({
        recipientUserId: userId,
        'deliveryStatus.queuedForDigest': true,
        'deliveryStatus.email': { $ne: true }
      })
      .sort({ createdAt: -1 })
      .limit(limit);

      return notifications;
    } catch (error) {
      console.error('[EMAIL DIGEST] Error getting queued notifications:', error);
      return [];
    }
  }

  /**
   * Generate digest email content from notifications
   * @param {ObjectId} userId - User ID
   * @param {Array} notifications - Array of notification documents
   * @returns {Promise<Object>} { subject, text, html }
   */
  async generateDigestEmail(userId, notifications) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Group notifications by type
      const grouped = {};
      for (const notif of notifications) {
        const type = notif.NotificationType;
        if (!grouped[type]) {
          grouped[type] = [];
        }
        grouped[type].push(notif);
      }

      // Generate summary counts
      const summaries = [];
      let totalCount = 0;

      for (const [type, notifs] of Object.entries(grouped)) {
        const count = notifs.length;
        totalCount += count;
        summaries.push({
          type,
          count,
          notifications: notifs
        });
      }

      // Generate subject
      const subject = `UNITE Digest: ${totalCount} Notification${totalCount !== 1 ? 's' : ''}`;

      // Generate text content
      let text = `Hello ${user.firstName || 'User'},\n\n`;
      text += `You have ${totalCount} notification${totalCount !== 1 ? 's' : ''}:\n\n`;

      for (const summary of summaries) {
        const typeLabel = this.getNotificationTypeLabel(summary.type);
        text += `- ${summary.count} ${typeLabel}\n`;
      }

      text += `\nPlease log in to your UNITE account to view details.\n\n`;
      text += `Best regards,\nUNITE Blood Bank Team`;

      // Generate HTML content
      const html = this.generateDigestHtml(user, summaries, totalCount);

      return { subject, text, html };
    } catch (error) {
      console.error('[EMAIL DIGEST] Error generating digest email:', error);
      throw error;
    }
  }

  /**
   * Get human-readable label for notification type
   * @param {string} notificationType - Notification type
   * @returns {string} Human-readable label
   */
  getNotificationTypeLabel(notificationType) {
    const labels = {
      'request.pending-review': 'pending review requests',
      'request.approved': 'approved requests',
      'request.rejected': 'rejected requests',
      'request.rescheduled': 'rescheduled requests',
      'request.cancelled': 'cancelled requests',
      'event.published': 'published events',
      'event.cancelled': 'cancelled events',
      'event.deleted': 'deleted events'
    };

    return labels[notificationType] || 'notifications';
  }

  /**
   * Generate HTML template for digest email
   * @param {Object} user - User document
   * @param {Array} summaries - Array of notification summaries
   * @param {number} totalCount - Total notification count
   * @returns {string} HTML content
   */
  generateDigestHtml(user, summaries, totalCount) {
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    let summaryHtml = '';
    for (const summary of summaries) {
      const typeLabel = this.getNotificationTypeLabel(summary.type);
      summaryHtml += `
        <div style="background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #dc3545;">
          <p style="margin: 0; font-weight: bold; color: #333;">${summary.count} ${typeLabel}</p>
        </div>
      `;
    }

    return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Notification Digest</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Hello ${userName},</h3>
    <p>You have <strong>${totalCount}</strong> notification${totalCount !== 1 ? 's' : ''}:</p>
    ${summaryHtml}
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://unitehealth.tech/notifications" style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View All Notifications</a>
    </div>
    <p style="color: #666; font-size: 14px;">Please log in to your UNITE account to view details and take action.</p>
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`;
  }

  /**
   * Send digest email for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<boolean>} True if sent successfully
   */
  async sendDigestEmail(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        console.warn(`[EMAIL DIGEST] No email found for user: ${userId}`);
        return false;
      }

      // Get queued notifications
      const notifications = await this.getQueuedNotifications(userId, 50);
      if (notifications.length === 0) {
        console.log(`[EMAIL DIGEST] No queued notifications for user: ${userId}`);
        return false;
      }

      // Generate digest email
      const { subject, text, html } = await this.generateDigestEmail(userId, notifications);

      // Send email
      await emailService.sendEmail(user.email, subject, text, html);

      // Mark notifications as sent
      const notificationIds = notifications.map(n => n.Notification_ID);
      await Notification.updateMany(
        { Notification_ID: { $in: notificationIds } },
        {
          $set: {
            'deliveryStatus.email': true,
            'deliveryStatus.emailSentAt': new Date(),
            'deliveryStatus.queuedForDigest': false
          }
        }
      );

      // Update preferences
      const preferences = await UserNotificationPreferences.getOrCreate(userId);
      preferences.lastDigestSentAt = new Date();
      await preferences.save();

      console.log(`[EMAIL DIGEST] Digest email sent to ${user.email} with ${notifications.length} notifications`);
      return true;
    } catch (error) {
      // Handle daily limit exceeded error gracefully
      if (error.name === 'DailyLimitExceeded') {
        console.warn(`[EMAIL DIGEST] Daily email limit reached. Digest email blocked for user ${userId}: ${error.message}`);
        // Don't mark notifications as sent - they'll remain queued for next day
        return false;
      }

      console.error(`[EMAIL DIGEST] Error sending digest email for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Process all pending digest emails (called by scheduler)
   * @returns {Promise<Object>} Processing results
   */
  async processDigestEmails() {
    try {
      // Find all users in digest mode
      const preferences = await UserNotificationPreferences.find({
        $or: [
          { emailDigestMode: true },
          { temporaryDigestMode: true }
        ]
      });

      let sent = 0;
      let skipped = 0;
      let errors = 0;

      for (const pref of preferences) {
        try {
          const shouldSend = await this.checkDigestThreshold(pref.userId, pref);
          if (shouldSend) {
            const result = await this.sendDigestEmail(pref.userId);
            if (result) {
              sent++;
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }
        } catch (error) {
          console.error(`[EMAIL DIGEST] Error processing digest for user ${pref.userId}:`, error);
          errors++;
        }
      }

      return {
        processed: preferences.length,
        sent,
        skipped,
        errors
      };
    } catch (error) {
      console.error('[EMAIL DIGEST] Error processing digest emails:', error);
      throw error;
    }
  }
}

module.exports = new EmailDigestService();

