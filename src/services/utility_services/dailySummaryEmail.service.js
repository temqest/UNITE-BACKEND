/**
 * Daily Summary Email Service
 * 
 * Sends daily summary emails for non-urgent updates.
 * Includes counts of pending requests, events requiring action, and other updates.
 */

const { Notification, User, UserNotificationPreferences, EventRequest, Event } = require('../../models/index');
const emailService = require('./email.service');

class DailySummaryEmailService {
  /**
   * Default send time (8 AM)
   */
  static DEFAULT_SEND_TIME = process.env.DAILY_SUMMARY_SEND_TIME || '08:00';

  /**
   * Generate daily summary for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Summary data or null if no summary needed
   */
  async generateDailySummary(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.email) {
        return null;
      }

      // Get user preferences
      const preferences = await UserNotificationPreferences.getOrCreate(userId);
      
      // Check if user wants daily summaries
      if (preferences.emailDigestFrequency === 'never' && !preferences.emailDigestMode) {
        return null; // User doesn't want daily summaries
      }

      const summary = {
        userId,
        user,
        pendingReviewRequests: 0,
        eventsRequiringAction: 0,
        eventsChangedDetails: 0,
        totalNotifications: 0
      };

      // Check if user is a coordinator (has pending requests to review)
      const isCoordinator = user.authority >= 60 || 
                           (user.roles && user.roles.some(r => r.roleCode === 'coordinator' && r.isActive));

      if (isCoordinator) {
        // Count pending review requests
        summary.pendingReviewRequests = await EventRequest.countDocuments({
          'reviewer.userId': userId,
          status: 'pending-review'
        });
      }

      // Count events requiring action (for event owners)
      // This could include events that need confirmation, events with issues, etc.
      // For now, we'll count events that were recently updated and need attention
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      summary.eventsRequiringAction = await Event.countDocuments({
        $or: [
          { 'made_by_id': userId.toString() },
          { 'coordinator_id': userId.toString() }
        ],
        Status: { $in: ['Pending', 'Approved'] },
        updatedAt: { $gte: oneDayAgo }
      });

      // Count notifications from yesterday (non-urgent types)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const nonUrgentTypes = ['event.edited', 'event.staff-added'];
      summary.eventsChangedDetails = await Notification.countDocuments({
        recipientUserId: userId,
        NotificationType: { $in: nonUrgentTypes },
        createdAt: { $gte: yesterday, $lt: today },
        IsRead: false
      });

      // Total unread notifications
      summary.totalNotifications = await Notification.countDocuments({
        recipientUserId: userId,
        IsRead: false,
        createdAt: { $gte: yesterday }
      });

      // Only send summary if there's something to report
      if (summary.pendingReviewRequests === 0 && 
          summary.eventsRequiringAction === 0 && 
          summary.eventsChangedDetails === 0 &&
          summary.totalNotifications === 0) {
        return null; // No summary needed
      }

      return summary;
    } catch (error) {
      console.error(`[DAILY SUMMARY] Error generating daily summary for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Generate email content from summary
   * @param {Object} summary - Summary data
   * @returns {Object} { subject, text, html }
   */
  generateEmailContent(summary) {
    const { user, pendingReviewRequests, eventsRequiringAction, eventsChangedDetails, totalNotifications } = summary;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    // Generate subject
    const items = [];
    if (pendingReviewRequests > 0) items.push(`${pendingReviewRequests} pending request${pendingReviewRequests !== 1 ? 's' : ''}`);
    if (eventsRequiringAction > 0) items.push(`${eventsRequiringAction} event${eventsRequiringAction !== 1 ? 's' : ''} requiring action`);
    if (eventsChangedDetails > 0) items.push(`${eventsChangedDetails} event update${eventsChangedDetails !== 1 ? 's' : ''}`);
    
    const subject = items.length > 0 
      ? `UNITE Daily Summary: ${items.join(', ')}`
      : `UNITE Daily Summary: ${totalNotifications} notification${totalNotifications !== 1 ? 's' : ''}`;

    // Generate text content
    let text = `Hello ${userName},\n\n`;
    text += `Here's your daily summary from UNITE:\n\n`;

    if (pendingReviewRequests > 0) {
      text += `- You have ${pendingReviewRequests} pending review request${pendingReviewRequests !== 1 ? 's' : ''}\n`;
    }

    if (eventsRequiringAction > 0) {
      text += `- ${eventsRequiringAction} event${eventsRequiringAction !== 1 ? 's' : ''} require${eventsRequiringAction === 1 ? 's' : ''} action\n`;
    }

    if (eventsChangedDetails > 0) {
      text += `- ${eventsChangedDetails} event${eventsChangedDetails !== 1 ? 's' : ''} changed details\n`;
    }

    if (totalNotifications > 0 && items.length === 0) {
      text += `- You have ${totalNotifications} new notification${totalNotifications !== 1 ? 's' : ''}\n`;
    }

    text += `\nPlease log in to your UNITE account to view details and take action.\n\n`;
    text += `Best regards,\nUNITE Blood Bank Team`;

    // Generate HTML content
    const html = this.generateHtmlTemplate(userName, summary);

    return { subject, text, html };
  }

  /**
   * Generate HTML template for daily summary
   * @param {string} userName - User's name
   * @param {Object} summary - Summary data
   * @returns {string} HTML content
   */
  generateHtmlTemplate(userName, summary) {
    const { pendingReviewRequests, eventsRequiringAction, eventsChangedDetails, totalNotifications } = summary;

    let itemsHtml = '';

    if (pendingReviewRequests > 0) {
      itemsHtml += `
        <div style="background-color: #fff3cd; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #ffc107;">
          <p style="margin: 0; font-weight: bold; color: #333;">You have ${pendingReviewRequests} pending review request${pendingReviewRequests !== 1 ? 's' : ''}</p>
        </div>
      `;
    }

    if (eventsRequiringAction > 0) {
      itemsHtml += `
        <div style="background-color: #d1ecf1; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #17a2b8;">
          <p style="margin: 0; font-weight: bold; color: #333;">${eventsRequiringAction} event${eventsRequiringAction !== 1 ? 's' : ''} require${eventsRequiringAction === 1 ? 's' : ''} action</p>
        </div>
      `;
    }

    if (eventsChangedDetails > 0) {
      itemsHtml += `
        <div style="background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #6c757d;">
          <p style="margin: 0; font-weight: bold; color: #333;">${eventsChangedDetails} event${eventsChangedDetails !== 1 ? 's' : ''} changed details</p>
        </div>
      `;
    }

    if (totalNotifications > 0 && itemsHtml === '') {
      itemsHtml += `
        <div style="background-color: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #6c757d;">
          <p style="margin: 0; font-weight: bold; color: #333;">You have ${totalNotifications} new notification${totalNotifications !== 1 ? 's' : ''}</p>
        </div>
      `;
    }

    return `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
    <h2 style="color: #dc3545; margin: 0;">UNITE Blood Bank</h2>
    <p style="margin: 5px 0 0 0; color: #666;">Daily Summary</p>
  </div>
  <div style="padding: 30px 20px; background-color: white;">
    <h3>Hello ${userName},</h3>
    <p>Here's your daily summary from UNITE:</p>
    ${itemsHtml}
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://unitehealth.tech/dashboard" style="background-color: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Dashboard</a>
    </div>
    <p style="color: #666; font-size: 14px;">Please log in to your UNITE account to view details and take action.</p>
  </div>
  <div style="background-color: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px;">
    <p>Best regards,<br>UNITE Blood Bank Team<br><a href="https://unitehealth.tech" style="color: #dc3545;">unitehealth.tech</a></p>
  </div>
</div>`;
  }

  /**
   * Send daily summary email for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<boolean>} True if sent successfully
   */
  async sendDailySummary(userId) {
    try {
      const summary = await this.generateDailySummary(userId);
      if (!summary) {
        return false; // No summary needed
      }

      const { subject, text, html } = this.generateEmailContent(summary);

      // Send email
      await emailService.sendEmail(summary.user.email, subject, text, html);

      console.log(`[DAILY SUMMARY] Daily summary sent to ${summary.user.email}`);
      return true;
    } catch (error) {
      // Handle daily limit exceeded error gracefully
      if (error.name === 'DailyLimitExceeded') {
        console.warn(`[DAILY SUMMARY] Daily email limit reached. Daily summary blocked for user ${userId}: ${error.message}`);
        return false; // Graceful degradation - don't throw
      }

      console.error(`[DAILY SUMMARY] Error sending daily summary for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Process daily summaries for all eligible users (called by scheduler)
   * @returns {Promise<Object>} Processing results
   */
  async processDailySummaries() {
    try {
      // Find all users who should receive daily summaries
      // Users with email enabled and digest frequency set to 'daily' or 'never' (but not in digest mode)
      const preferences = await UserNotificationPreferences.find({
        emailNotificationsEnabled: true,
        $or: [
          { emailDigestFrequency: 'daily' },
          { 
            emailDigestFrequency: 'never',
            emailDigestMode: false,
            temporaryDigestMode: false
          }
        ]
      });

      let sent = 0;
      let skipped = 0;
      let errors = 0;

      for (const pref of preferences) {
        try {
          const result = await this.sendDailySummary(pref.userId);
          if (result) {
            sent++;
          } else {
            skipped++;
          }
        } catch (error) {
          console.error(`[DAILY SUMMARY] Error processing daily summary for user ${pref.userId}:`, error);
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
      console.error('[DAILY SUMMARY] Error processing daily summaries:', error);
      throw error;
    }
  }
}

module.exports = new DailySummaryEmailService();

