/**
 * Email Notification Service
 * 
 * Sends email notifications for critical events (approved, rejected, cancelled).
 * Integrates with the existing email service and updates notification delivery status.
 */

const { Notification, User, UserNotificationPreferences } = require('../../models/index');
const emailService = require('./email.service');

class EmailNotificationService {
  /**
   * Critical notification types that should trigger email
   * High priority: Event Approved, Rejected, Rescheduled
   * Low priority (in-app only): event.edited, event.staff-added
   */
  static CRITICAL_TYPES = [
    'request.approved',
    'request.rejected',
    'request.rescheduled', // Added: High priority
    'request.cancelled',
    'event.cancelled',
    'event.deleted'
    // Removed: 'event.edited', 'event.staff-added' (low-importance, in-app only)
  ];

  /**
   * Email throttling: Maximum emails per hour per user (before auto-switching to digest)
   */
  static MAX_EMAILS_PER_HOUR = 5;

  /**
   * Same event rate limit: Maximum 1 email per event state change within this window
   */
  static SAME_EVENT_RATE_LIMIT_MS = parseInt(process.env.SAME_EVENT_RATE_LIMIT_MS) || 15 * 60 * 1000; // 15 minutes default

  /**
   * Deduplication window: Check for duplicates within this time window
   */
  static DEDUPLICATION_WINDOW_MS = 60 * 1000; // 1 minute

  /**
   * Send email notification for a notification document
   * Implements full checks: preferences, deduplication, rate limiting, digest mode
   * @param {Object} notification - Notification document
   * @returns {Promise<boolean|string>} True if sent, false if skipped, 'queued' if queued for digest
   */
  async sendEmailNotification(notification) {
    try {
      // 1. Check if this notification type should trigger email
      if (!EmailNotificationService.CRITICAL_TYPES.includes(notification.NotificationType)) {
        return false; // Not a critical notification type
      }

      // 2. Get recipient user
      const recipient = await this.getRecipient(notification);
      if (!recipient || !recipient.email) {
        console.warn(`[EMAIL NOTIFICATION] No email found for recipient: ${notification.recipientUserId || notification.Recipient_ID}`);
        return false;
      }

      // 3. Check user preferences
      const preferences = await UserNotificationPreferences.getOrCreate(recipient._id);
      const shouldSend = await this.checkUserPreferences(recipient._id, notification.NotificationType, preferences);
      if (!shouldSend) {
        console.log(`[EMAIL NOTIFICATION] Email skipped due to user preferences for notification ${notification.Notification_ID}`);
        return false;
      }

      // 3.5. Check if user is muted
      if (preferences.isMuted()) {
        console.log(`[EMAIL NOTIFICATION] Email skipped - user is muted until ${preferences.mutedUntil} for notification ${notification.Notification_ID}`);
        return false;
      }

      // 4. Check if user is in digest mode
      if (preferences.isInDigestMode()) {
        // Queue for digest instead of sending immediately
        const emailDigestService = require('./emailDigest.service');
        await emailDigestService.queueNotificationForDigest(notification);
        console.log(`[EMAIL NOTIFICATION] Notification queued for digest: ${notification.Notification_ID}`);
        return 'queued';
      }

      // 5. Check deduplication (same type + recipient + entity within 1 minute)
      const isDuplicate = await this.checkDeduplication(notification);
      if (isDuplicate) {
        console.log(`[EMAIL NOTIFICATION] Duplicate notification detected, skipping email: ${notification.Notification_ID}`);
        return false;
      }

      // 6. Check same event rate limit (max 1 email per 10-15 minutes for same event)
      const sameEventThrottled = await this.checkSameEventRateLimit(notification);
      if (sameEventThrottled) {
        console.log(`[EMAIL NOTIFICATION] Same event rate limit reached, skipping email: ${notification.Notification_ID}`);
        return false;
      }

      // 7. Check user hourly limit (max 5 emails/hour, then auto-switch to digest)
      const hourlyLimitExceeded = await this.checkUserHourlyLimit(recipient._id, preferences);
      if (hourlyLimitExceeded) {
        // Auto-switch to digest mode
        await this.autoSwitchToDigest(recipient._id, preferences);
        // Queue this notification for digest
        const emailDigestService = require('./emailDigest.service');
        await emailDigestService.queueNotificationForDigest(notification);
        console.log(`[EMAIL NOTIFICATION] Hourly limit exceeded, switched to digest mode and queued: ${notification.Notification_ID}`);
        return 'queued';
      }

      // 8. All checks passed - send email immediately
      const { subject, text, html } = this.generateEmailContent(notification);
      await emailService.sendEmail(recipient.email, subject, text, html);

      // 9. Update notification delivery status
      await Notification.updateOne(
        { Notification_ID: notification.Notification_ID },
        {
          $set: {
            'deliveryStatus.email': true,
            'deliveryStatus.emailSentAt': new Date()
          }
        }
      );

      // 10. Update user preferences (increment email count, update last sent time)
      await preferences.incrementEmailCount();

      console.log(`[EMAIL NOTIFICATION] Email sent for notification ${notification.Notification_ID} to ${recipient.email}`);
      return true;
    } catch (error) {
      // Handle daily limit exceeded error gracefully
      if (error.name === 'DailyLimitExceeded') {
        console.warn(`[EMAIL NOTIFICATION] Daily email limit reached. Email blocked for notification ${notification.Notification_ID}: ${error.message}`);
        
        // Update notification with limit error
        try {
          await Notification.updateOne(
            { Notification_ID: notification.Notification_ID },
            {
              $set: {
                'deliveryStatus.email': false,
                'deliveryStatus.emailError': `Daily email limit reached: ${error.message}`
              }
            }
          );
        } catch (updateError) {
          console.error(`[EMAIL NOTIFICATION] Error updating notification delivery status:`, updateError);
        }
        
        return false; // Return false but don't throw - graceful degradation
      }

      console.error(`[EMAIL NOTIFICATION] Error sending email for notification ${notification.Notification_ID}:`, error);

      // Update notification with error
      try {
        await Notification.updateOne(
          { Notification_ID: notification.Notification_ID },
          {
            $set: {
              'deliveryStatus.email': false,
              'deliveryStatus.emailError': error.message
            }
          }
        );
      } catch (updateError) {
        console.error(`[EMAIL NOTIFICATION] Error updating notification delivery status:`, updateError);
      }

      return false;
    }
  }

  /**
   * Check user preferences for email notifications
   * @param {ObjectId} userId - User ID
   * @param {string} notificationType - Notification type
   * @param {Object} preferences - UserNotificationPreferences document (optional, will fetch if not provided)
   * @returns {Promise<boolean>} True if email should be sent based on preferences
   */
  async checkUserPreferences(userId, notificationType, preferences = null) {
    try {
      if (!preferences) {
        preferences = await UserNotificationPreferences.getOrCreate(userId);
      }

      // Check if email notifications are globally enabled
      if (!preferences.emailNotificationsEnabled) {
        return false;
      }

      // Check if this notification type is enabled for the user
      if (!preferences.isNotificationTypeEnabled(notificationType)) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('[EMAIL NOTIFICATION] Error checking user preferences:', error);
      return true; // Default to allowing email if check fails
    }
  }

  /**
   * Check for duplicate notifications within time window
   * @param {Object} notification - Notification document
   * @returns {Promise<boolean>} True if duplicate found
   */
  async checkDeduplication(notification) {
    try {
      const oneMinuteAgo = new Date(Date.now() - EmailNotificationService.DEDUPLICATION_WINDOW_MS);

      // Build query based on notification type and entity
      const query = {
        recipientUserId: notification.recipientUserId || null,
        NotificationType: notification.NotificationType,
        createdAt: { $gte: oneMinuteAgo },
        'deliveryStatus.email': true // Only check sent emails
      };

      // Add entity-specific filter
      if (notification.Request_ID) {
        query.Request_ID = notification.Request_ID;
      } else if (notification.Event_ID) {
        query.Event_ID = notification.Event_ID;
      } else {
        // No entity ID, can't deduplicate
        return false;
      }

      // Support legacy format
      if (!notification.recipientUserId && notification.Recipient_ID) {
        query.$or = [
          { recipientUserId: null },
          { Recipient_ID: notification.Recipient_ID }
        ];
      }

      const duplicate = await Notification.findOne(query);

      return !!duplicate;
    } catch (error) {
      console.error('[EMAIL NOTIFICATION] Error checking deduplication:', error);
      return false; // Don't block if check fails
    }
  }

  /**
   * Check same event rate limit (max 1 email per 10-15 minutes for same event)
   * @param {Object} notification - Notification document
   * @returns {Promise<boolean>} True if rate limit exceeded
   */
  async checkSameEventRateLimit(notification) {
    try {
      const timeWindowAgo = new Date(Date.now() - EmailNotificationService.SAME_EVENT_RATE_LIMIT_MS);

      // Build query for same event/request
      const query = {
        recipientUserId: notification.recipientUserId || null,
        NotificationType: notification.NotificationType,
        'deliveryStatus.email': true,
        'deliveryStatus.emailSentAt': { $gte: timeWindowAgo }
      };

      // Add entity-specific filter
      if (notification.Request_ID) {
        query.Request_ID = notification.Request_ID;
      } else if (notification.Event_ID) {
        query.Event_ID = notification.Event_ID;
      } else {
        // No entity ID, can't check rate limit
        return false;
      }

      // Support legacy format
      if (!notification.recipientUserId && notification.Recipient_ID) {
        query.$or = [
          { recipientUserId: null },
          { Recipient_ID: notification.Recipient_ID }
        ];
      }

      const recentEmail = await Notification.findOne(query);

      return !!recentEmail; // If found, rate limit exceeded
    } catch (error) {
      console.error('[EMAIL NOTIFICATION] Error checking same event rate limit:', error);
      return false; // Don't block if check fails
    }
  }

  /**
   * Check user hourly email limit
   * @param {ObjectId} userId - User ID
   * @param {Object} preferences - UserNotificationPreferences document (optional)
   * @returns {Promise<boolean>} True if hourly limit exceeded
   */
  async checkUserHourlyLimit(userId, preferences = null) {
    try {
      if (!preferences) {
        preferences = await UserNotificationPreferences.getOrCreate(userId);
      }

      // Reset count if hour has passed
      if (preferences.emailCountResetAt && new Date() >= preferences.emailCountResetAt) {
        await preferences.resetEmailCount();
      }

      // Check if limit exceeded
      return preferences.emailCountLastHour >= preferences.autoDigestThreshold;
    } catch (error) {
      console.error('[EMAIL NOTIFICATION] Error checking user hourly limit:', error);
      return false; // Don't block if check fails
    }
  }

  /**
   * Auto-switch user to temporary digest mode
   * @param {ObjectId} userId - User ID
   * @param {Object} preferences - UserNotificationPreferences document (optional)
   */
  async autoSwitchToDigest(userId, preferences = null) {
    try {
      if (!preferences) {
        preferences = await UserNotificationPreferences.getOrCreate(userId);
      }

      // Only switch if not already in temporary digest mode
      if (!preferences.temporaryDigestMode) {
        await preferences.enableTemporaryDigest();
        console.log(`[EMAIL NOTIFICATION] Auto-switched user ${userId} to temporary digest mode`);
      }
    } catch (error) {
      console.error('[EMAIL NOTIFICATION] Error auto-switching to digest:', error);
    }
  }

  /**
   * Get recipient user from notification
   * @param {Object} notification - Notification document
   * @returns {Promise<Object|null>} User document or null
   */
  async getRecipient(notification) {
    try {
      if (notification.recipientUserId) {
        return await User.findById(notification.recipientUserId);
      } else if (notification.Recipient_ID) {
        // Try to find by legacy userId field or _id
        let user = await User.findOne({ userId: notification.Recipient_ID });
        if (!user && notification.Recipient_ID.match(/^[0-9a-fA-F]{24}$/)) {
          user = await User.findById(notification.Recipient_ID);
        }
        return user;
      }
      return null;
    } catch (error) {
      console.error('[EMAIL NOTIFICATION] Error getting recipient:', error);
      return null;
    }
  }

  /**
   * Generate email content (subject, text, html) for notification
   * @param {Object} notification - Notification document
   * @returns {Object} { subject, text, html }
   */
  generateEmailContent(notification) {
    const { NotificationType, Title, Message, Event_ID, Request_ID, actor, ActionNote } = notification;

    let subject = Title || 'UNITE Notification';
    let text = Message || 'You have a new notification.';
    let html = this.generateHtmlTemplate(Title || 'Notification', Message || 'You have a new notification.', actor, ActionNote, null, 'info');

    // Customize based on notification type
    switch (NotificationType) {
      case 'request.approved':
        subject = 'Your Event Request Has Been Approved - UNITE';
        text = `Your event request has been approved and is now live.\n\n${Message}`;
        html = this.generateHtmlTemplate(
          'Event Request Approved',
          Message,
          actor,
          null,
          null,
          'success'
        );
        break;

      case 'request.rejected':
        subject = 'Your Event Request Has Been Rejected - UNITE';
        // Always include ActionNote in text with "Reason:" label when present
        text = `Your event request has been rejected.\n\n${Message}${ActionNote ? `\n\nReason: ${ActionNote}` : ''}`;
        html = this.generateHtmlTemplate(
          'Event Request Rejected',
          Message,
          actor,
          ActionNote,
          'Reason', // Use "Reason" label for rejections
          'error'
        );
        break;

      case 'request.rescheduled':
        subject = 'Your Event Request Has Been Rescheduled - UNITE';
        // Always include ActionNote in text with "Note:" label when present
        text = `Your event request has been rescheduled.\n\n${Message}${ActionNote ? `\n\nNote: ${ActionNote}` : ''}`;
        html = this.generateHtmlTemplate(
          'Event Request Rescheduled',
          Message,
          actor,
          ActionNote,
          'Note', // Use "Note" label for reschedules
          'warning'
        );
        break;

      case 'request.cancelled':
        subject = 'Your Event Request Has Been Cancelled - UNITE';
        // Always include ActionNote in text with "Reason:" label when present
        text = `Your event request has been cancelled.\n\n${Message}${ActionNote ? `\n\nReason: ${ActionNote}` : ''}`;
        html = this.generateHtmlTemplate(
          'Event Request Cancelled',
          Message,
          actor,
          ActionNote,
          'Reason', // Use "Reason" label for cancellations
          'warning'
        );
        break;

      case 'event.cancelled':
        subject = 'Event Has Been Cancelled - UNITE';
        // Always include ActionNote in text with "Reason:" label when present
        text = `An event has been cancelled.\n\n${Message}${ActionNote ? `\n\nReason: ${ActionNote}` : ''}`;
        html = this.generateHtmlTemplate(
          'Event Cancelled',
          Message,
          actor,
          ActionNote,
          'Reason', // Use "Reason" label for cancellations
          'warning'
        );
        break;

      case 'event.deleted':
        subject = 'Event Has Been Deleted - UNITE';
        text = `An event has been deleted.\n\n${Message}`;
        html = this.generateHtmlTemplate(
          'Event Deleted',
          Message,
          actor,
          null,
          null,
          'error'
        );
        break;
    }

    return { subject, text, html };
  }

  /**
   * Generate HTML email template
   * @param {string} title - Email title
   * @param {string} message - Email message
   * @param {Object} actor - Actor information (optional)
   * @param {string} note - Additional note (optional)
   * @param {string} noteLabel - Label for note ('Reason', 'Note', or null for default 'Note')
   * @param {string} type - Notification type ('success', 'error', 'warning', 'info')
   * @returns {string} HTML email content
   */
  generateHtmlTemplate(title, message, actor = null, note = null, noteLabel = null, type = 'info') {
    const colors = {
      success: { primary: '#28a745', bg: '#d4edda', border: '#c3e6cb' },
      error: { primary: '#dc3545', bg: '#f8d7da', border: '#f5c6cb' },
      warning: { primary: '#ffc107', bg: '#fff3cd', border: '#ffeaa7' },
      info: { primary: '#17a2b8', bg: '#d1ecf1', border: '#bee5eb' }
    };

    const colorScheme = colors[type] || colors.info;
    const actorInfo = actor ? `<p style="color: #666; font-size: 14px; margin-top: 10px;"><strong>Action by:</strong> ${actor.name || 'System'}</p>` : '';
    
    // Determine note label - use provided label or default to "Note"
    const label = noteLabel || 'Note';
    
    // Generate note section with prominent styling when note exists
    const noteSection = note ? `
      <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px; border-left: 3px solid ${colorScheme.primary};">
        <p style="margin: 0; color: #333; font-weight: 600; font-size: 14px; margin-bottom: 8px;">${label}:</p>
        <p style="margin: 0; color: #555; font-size: 14px; line-height: 1.6;">${note}</p>
      </div>` : '';

    return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Notification</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3 style="color: ${colorScheme.primary}; margin-top: 0;">${title}</h3>
    <div style="background-color: ${colorScheme.bg}; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid ${colorScheme.primary};">
      <p style="margin: 0; color: #333; line-height: 1.6;">${message}</p>
      ${noteSection}
    </div>
    ${actorInfo}
    <p style="color: #666; font-size: 14px; margin-top: 20px;">Please log in to your UNITE account to view more details.</p>
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`;
  }

  /**
   * Process pending email notifications (can be called by a scheduled job)
   * @param {number} limit - Maximum number of notifications to process
   * @returns {Promise<Object>} Processing results
   */
  async processPendingEmails(limit = 50) {
    try {
      // Find notifications that should have emails but haven't been sent yet
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const pendingNotifications = await Notification.find({
        NotificationType: { $in: EmailNotificationService.CRITICAL_TYPES },
        'deliveryStatus.email': { $ne: true },
        'deliveryStatus.emailError': { $exists: false },
        createdAt: { $gte: oneHourAgo } // Only process recent notifications
      })
      .limit(limit)
      .sort({ createdAt: -1 });

      let sent = 0;
      let failed = 0;
      let throttled = 0;

      for (const notification of pendingNotifications) {
        const result = await this.sendEmailNotification(notification);
        if (result === true) {
          sent++;
        } else if (result === false) {
          // Check if it was throttled or failed
          const wasThrottled = await this.checkThrottling(notification);
          if (wasThrottled) {
            throttled++;
          } else {
            failed++;
          }
        }
      }

      return {
        processed: pendingNotifications.length,
        sent,
        failed,
        throttled
      };
    } catch (error) {
      console.error('[EMAIL NOTIFICATION] Error processing pending emails:', error);
      throw error;
    }
  }
}

module.exports = new EmailNotificationService();

