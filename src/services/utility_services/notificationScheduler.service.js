/**
 * Notification Scheduler Service
 * 
 * Handles scheduled jobs for notification system:
 * - Hourly digest emails
 * - Daily summary emails
 * - Auto-revert digest mode
 * - Email count reset
 */

// Use node-cron if available, otherwise provide manual scheduling methods
let cron = null;
try {
  cron = require('node-cron');
} catch (error) {
  console.warn('[NOTIFICATION SCHEDULER] node-cron not available, using manual scheduling');
}
const { UserNotificationPreferences, EmailDailyLimit } = require('../../models/index');
const emailDigestService = require('./emailDigest.service');
const dailySummaryEmailService = require('./dailySummaryEmail.service');

class NotificationSchedulerService {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Start all scheduled jobs
   * Uses node-cron if available, otherwise sets up interval-based scheduling
   */
  start() {
    if (this.isRunning) {
      console.warn('[NOTIFICATION SCHEDULER] Scheduler is already running');
      return;
    }

    console.log('[NOTIFICATION SCHEDULER] Starting notification scheduler...');

    if (cron) {
      // Use node-cron for scheduling
      // Hourly digest emails - run every hour at minute 0
      const digestJob = cron.schedule('0 * * * *', async () => {
        console.log('[NOTIFICATION SCHEDULER] Running hourly digest email job...');
        try {
          const result = await emailDigestService.processDigestEmails();
          console.log('[NOTIFICATION SCHEDULER] Digest emails processed:', result);
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error processing digest emails:', error);
        }
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // Daily summary emails - run at configured time (default 8 AM)
      const summaryTime = process.env.DAILY_SUMMARY_SEND_TIME || '08:00';
      const [hour, minute] = summaryTime.split(':').map(Number);
      const summaryCron = `${minute || 0} ${hour || 8} * * *`;
      
      const summaryJob = cron.schedule(summaryCron, async () => {
        console.log('[NOTIFICATION SCHEDULER] Running daily summary email job...');
        try {
          const result = await dailySummaryEmailService.processDailySummaries();
          console.log('[NOTIFICATION SCHEDULER] Daily summaries processed:', result);
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error processing daily summaries:', error);
        }
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // Auto-revert digest mode - run every hour at minute 30
      const revertJob = cron.schedule('30 * * * *', async () => {
        console.log('[NOTIFICATION SCHEDULER] Running auto-revert digest mode job...');
        try {
          await this.autoRevertDigestMode();
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error auto-reverting digest mode:', error);
        }
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // Email count reset - run every hour at minute 0
      const resetJob = cron.schedule('0 * * * *', async () => {
        console.log('[NOTIFICATION SCHEDULER] Running email count reset job...');
        try {
          await this.resetEmailCounts();
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error resetting email counts:', error);
        }
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // Daily email limit reset - run at midnight (00:00) Asia/Manila
      const dailyLimitResetJob = cron.schedule('0 0 * * *', async () => {
        console.log('[NOTIFICATION SCHEDULER] Running daily email limit reset job...');
        try {
          await this.resetDailyEmailLimit();
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error resetting daily email limit:', error);
        }
      }, {
        scheduled: false,
        timezone: 'Asia/Manila'
      });

      // Store job references
      this.jobs = [
        { name: 'digest', job: digestJob },
        { name: 'summary', job: summaryJob },
        { name: 'revert', job: revertJob },
        { name: 'reset', job: resetJob },
        { name: 'dailyLimitReset', job: dailyLimitResetJob }
      ];

      // Start all jobs
      this.jobs.forEach(({ name, job }) => {
        job.start();
        console.log(`[NOTIFICATION SCHEDULER] Started ${name} job (cron)`);
      });
    } else {
      // Fallback: Use setInterval for scheduling (less precise but works without node-cron)
      console.warn('[NOTIFICATION SCHEDULER] node-cron not available, using setInterval fallback');
      
      // Hourly digest emails - every 60 minutes
      const digestInterval = setInterval(async () => {
        console.log('[NOTIFICATION SCHEDULER] Running hourly digest email job...');
        try {
          const result = await emailDigestService.processDigestEmails();
          console.log('[NOTIFICATION SCHEDULER] Digest emails processed:', result);
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error processing digest emails:', error);
        }
      }, 60 * 60 * 1000); // 1 hour

      // Daily summary emails - calculate time until next 8 AM
      const scheduleDailySummary = () => {
        const now = new Date();
        const summaryTime = process.env.DAILY_SUMMARY_SEND_TIME || '08:00';
        const [hour, minute] = summaryTime.split(':').map(Number);
        const nextRun = new Date();
        nextRun.setHours(hour || 8, minute || 0, 0, 0);
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        const msUntilNext = nextRun - now;

        setTimeout(async () => {
          console.log('[NOTIFICATION SCHEDULER] Running daily summary email job...');
          try {
            const result = await dailySummaryEmailService.processDailySummaries();
            console.log('[NOTIFICATION SCHEDULER] Daily summaries processed:', result);
          } catch (error) {
            console.error('[NOTIFICATION SCHEDULER] Error processing daily summaries:', error);
          }
          // Schedule next run
          scheduleDailySummary();
        }, msUntilNext);
      };
      scheduleDailySummary();

      // Auto-revert digest mode - every 60 minutes (at 30 min offset)
      const revertInterval = setInterval(async () => {
        console.log('[NOTIFICATION SCHEDULER] Running auto-revert digest mode job...');
        try {
          await this.autoRevertDigestMode();
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error auto-reverting digest mode:', error);
        }
      }, 60 * 60 * 1000); // 1 hour

      // Email count reset - every 60 minutes
      const resetInterval = setInterval(async () => {
        console.log('[NOTIFICATION SCHEDULER] Running email count reset job...');
        try {
          await this.resetEmailCounts();
        } catch (error) {
          console.error('[NOTIFICATION SCHEDULER] Error resetting email counts:', error);
        }
      }, 60 * 60 * 1000); // 1 hour

      // Daily email limit reset - calculate time until next midnight (Asia/Manila)
      const scheduleDailyLimitReset = () => {
        const now = new Date();
        const manilaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        const nextMidnight = new Date(manilaDate);
        nextMidnight.setHours(24, 0, 0, 0); // Next midnight
        const msUntilMidnight = nextMidnight - manilaDate;

        setTimeout(async () => {
          console.log('[NOTIFICATION SCHEDULER] Running daily email limit reset job...');
          try {
            await this.resetDailyEmailLimit();
          } catch (error) {
            console.error('[NOTIFICATION SCHEDULER] Error resetting daily email limit:', error);
          }
          // Schedule next run
          scheduleDailyLimitReset();
        }, msUntilMidnight);
      };
      scheduleDailyLimitReset();

      // Store interval references
      this.jobs = [
        { name: 'digest', job: { stop: () => clearInterval(digestInterval) } },
        { name: 'summary', job: { stop: () => {} } }, // Daily summary uses setTimeout, handled separately
        { name: 'revert', job: { stop: () => clearInterval(revertInterval) } },
        { name: 'reset', job: { stop: () => clearInterval(resetInterval) } },
        { name: 'dailyLimitReset', job: { stop: () => {} } } // Daily limit reset uses setTimeout, handled separately
      ];

      console.log('[NOTIFICATION SCHEDULER] Started all jobs (setInterval fallback)');
    }

    this.isRunning = true;
    console.log('[NOTIFICATION SCHEDULER] All scheduled jobs started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    if (!this.isRunning) {
      console.warn('[NOTIFICATION SCHEDULER] Scheduler is not running');
      return;
    }

    this.jobs.forEach(({ name, job }) => {
      job.stop();
      console.log(`[NOTIFICATION SCHEDULER] Stopped ${name} job`);
    });

    this.jobs = [];
    this.isRunning = false;
    console.log('[NOTIFICATION SCHEDULER] All scheduled jobs stopped');
  }

  /**
   * Auto-revert users from temporary digest mode after 24 hours
   */
  async autoRevertDigestMode() {
    try {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Find users in temporary digest mode who should be reverted
      const preferences = await UserNotificationPreferences.find({
        temporaryDigestMode: true,
        $or: [
          { temporaryDigestUntil: { $lte: now } },
          { temporaryDigestUntil: { $exists: false } },
          // Also revert if temporary digest was enabled more than 24 hours ago and no recent activity
          { 
            updatedAt: { $lte: oneDayAgo },
            emailCountLastHour: { $lt: 3 } // Low activity, safe to revert
          }
        ]
      });

      let reverted = 0;
      for (const pref of preferences) {
        try {
          await pref.disableTemporaryDigest();
          reverted++;
          console.log(`[NOTIFICATION SCHEDULER] Auto-reverted user ${pref.userId} from temporary digest mode`);
        } catch (error) {
          console.error(`[NOTIFICATION SCHEDULER] Error reverting user ${pref.userId}:`, error);
        }
      }

      console.log(`[NOTIFICATION SCHEDULER] Auto-reverted ${reverted} users from temporary digest mode`);
      return { reverted };
    } catch (error) {
      console.error('[NOTIFICATION SCHEDULER] Error in auto-revert digest mode:', error);
      throw error;
    }
  }

  /**
   * Reset email counts for all users (hourly reset)
   */
  async resetEmailCounts() {
    try {
      const now = new Date();

      // Find users whose email count reset time has passed
      const preferences = await UserNotificationPreferences.find({
        emailCountResetAt: { $lte: now }
      });

      let reset = 0;
      for (const pref of preferences) {
        try {
          await pref.resetEmailCount();
          reset++;
        } catch (error) {
          console.error(`[NOTIFICATION SCHEDULER] Error resetting email count for user ${pref.userId}:`, error);
        }
      }

      console.log(`[NOTIFICATION SCHEDULER] Reset email counts for ${reset} users`);
      return { reset };
    } catch (error) {
      console.error('[NOTIFICATION SCHEDULER] Error resetting email counts:', error);
      throw error;
    }
  }

  /**
   * Manually trigger digest email processing (for testing or manual runs)
   */
  async triggerDigestEmails() {
    console.log('[NOTIFICATION SCHEDULER] Manually triggering digest emails...');
    return await emailDigestService.processDigestEmails();
  }

  /**
   * Manually trigger daily summary processing (for testing or manual runs)
   */
  async triggerDailySummaries() {
    console.log('[NOTIFICATION SCHEDULER] Manually triggering daily summaries...');
    return await dailySummaryEmailService.processDailySummaries();
  }

  /**
   * Reset daily email limit (called at midnight Asia/Manila)
   */
  async resetDailyEmailLimit() {
    try {
      const result = await EmailDailyLimit.resetDailyLimit();
      console.log(`[NOTIFICATION SCHEDULER] Daily email limit reset: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      console.error('[NOTIFICATION SCHEDULER] Error resetting daily email limit:', error);
      throw error;
    }
  }
}

module.exports = new NotificationSchedulerService();

