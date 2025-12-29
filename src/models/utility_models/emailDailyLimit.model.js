const mongoose = require('mongoose');

/**
 * Email Daily Limit Model
 * 
 * Tracks daily email sending limits to prevent exceeding the configured daily limit.
 * One document per day, automatically reset at midnight (Asia/Manila timezone).
 */
const emailDailyLimitSchema = new mongoose.Schema({
  // Date for tracking (YYYY-MM-DD format, stored as Date at midnight)
  date: {
    type: Date,
    required: true,
    unique: true,
    index: true
  },
  
  // Count of emails sent today
  emailsSent: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Flag indicating if limit has been reached
  isLocked: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // When the limit was reached
  lockedAt: {
    type: Date,
    required: false
  },
  
  // Last time counter was reset
  lastResetAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

/**
 * Get the daily email limit from environment variable
 * @returns {number} Daily email limit (defaults to 200 if not set)
 */
emailDailyLimitSchema.statics.getDailyLimit = function() {
  const limit = process.env.DAILY_EMAIL_LIMIT;
  if (limit) {
    const parsed = parseInt(limit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  // Default fallback (should not be used in production)
  console.warn('[EMAIL DAILY LIMIT] DAILY_EMAIL_LIMIT not set, using default 200');
  return 200;
};

/**
 * Get or create today's limit document
 * @returns {Promise<Document>} Today's email limit document
 */
emailDailyLimitSchema.statics.getOrCreateToday = async function() {
  try {
    // Get today's date at midnight in Asia/Manila timezone
    const now = new Date();
    const manilaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const today = new Date(manilaDate.getFullYear(), manilaDate.getMonth(), manilaDate.getDate());
    
    let limitDoc = await this.findOne({ date: today });
    
    if (!limitDoc) {
      // Check if there's an old document that needs reset
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const oldDoc = await this.findOne({ date: { $lt: today } });
      if (oldDoc) {
        // Reset old document for today
        oldDoc.date = today;
        oldDoc.emailsSent = 0;
        oldDoc.isLocked = false;
        oldDoc.lockedAt = null;
        oldDoc.lastResetAt = new Date();
        await oldDoc.save();
        limitDoc = oldDoc;
      } else {
        // Create new document
        limitDoc = await this.create({
          date: today,
          emailsSent: 0,
          isLocked: false,
          lastResetAt: new Date()
        });
      }
    }
    
    return limitDoc;
  } catch (error) {
    console.error('[EMAIL DAILY LIMIT] Error getting or creating today\'s limit:', error);
    throw error;
  }
};

/**
 * Check if daily limit is reached
 * @returns {Promise<boolean>} True if limit is reached
 */
emailDailyLimitSchema.statics.isLimitReached = async function() {
  try {
    const limitDoc = await this.getOrCreateToday();
    const dailyLimit = this.getDailyLimit();
    return limitDoc.emailsSent >= dailyLimit;
  } catch (error) {
    console.error('[EMAIL DAILY LIMIT] Error checking limit:', error);
    // On error, allow sending (fail open)
    return false;
  }
};

/**
 * Increment email count and check if limit is reached
 * @returns {Promise<{success: boolean, isLocked: boolean, emailsSent: number, limit: number}>}
 */
emailDailyLimitSchema.statics.incrementCount = async function() {
  try {
    const limitDoc = await this.getOrCreateToday();
    const dailyLimit = this.getDailyLimit();
    
    limitDoc.emailsSent += 1;
    
    // Check if limit reached
    if (limitDoc.emailsSent >= dailyLimit && !limitDoc.isLocked) {
      limitDoc.isLocked = true;
      limitDoc.lockedAt = new Date();
      console.log(`[EMAIL DAILY LIMIT] Daily limit reached: ${limitDoc.emailsSent}/${dailyLimit} emails sent`);
    }
    
    await limitDoc.save();
    
    return {
      success: true,
      isLocked: limitDoc.isLocked,
      emailsSent: limitDoc.emailsSent,
      limit: dailyLimit
    };
  } catch (error) {
    console.error('[EMAIL DAILY LIMIT] Error incrementing count:', error);
    throw error;
  }
};

/**
 * Reset daily limit for new day
 * This is called by the scheduler at midnight
 * @returns {Promise<Object>} Reset result
 */
emailDailyLimitSchema.statics.resetDailyLimit = async function() {
  try {
    const now = new Date();
    const manilaDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    const today = new Date(manilaDate.getFullYear(), manilaDate.getMonth(), manilaDate.getDate());
    
    // Find today's document
    let limitDoc = await this.findOne({ date: today });
    
    if (limitDoc) {
      // Reset today's document
      limitDoc.emailsSent = 0;
      limitDoc.isLocked = false;
      limitDoc.lockedAt = null;
      limitDoc.lastResetAt = new Date();
      await limitDoc.save();
      console.log(`[EMAIL DAILY LIMIT] Reset daily limit for ${today.toISOString()}`);
    } else {
      // Create new document for today
      limitDoc = await this.create({
        date: today,
        emailsSent: 0,
        isLocked: false,
        lastResetAt: new Date()
      });
      console.log(`[EMAIL DAILY LIMIT] Created new daily limit document for ${today.toISOString()}`);
    }
    
    // Clean up old documents (older than 7 days)
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const deleted = await this.deleteMany({ date: { $lt: sevenDaysAgo } });
    if (deleted.deletedCount > 0) {
      console.log(`[EMAIL DAILY LIMIT] Cleaned up ${deleted.deletedCount} old limit documents`);
    }
    
    return {
      success: true,
      date: today,
      emailsSent: limitDoc.emailsSent,
      isLocked: limitDoc.isLocked
    };
  } catch (error) {
    console.error('[EMAIL DAILY LIMIT] Error resetting daily limit:', error);
    throw error;
  }
};

/**
 * Get current status
 * @returns {Promise<Object>} Current limit status
 */
emailDailyLimitSchema.statics.getStatus = async function() {
  try {
    const limitDoc = await this.getOrCreateToday();
    const dailyLimit = this.getDailyLimit();
    
    return {
      date: limitDoc.date,
      emailsSent: limitDoc.emailsSent,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - limitDoc.emailsSent),
      isLocked: limitDoc.isLocked,
      lockedAt: limitDoc.lockedAt,
      lastResetAt: limitDoc.lastResetAt
    };
  } catch (error) {
    console.error('[EMAIL DAILY LIMIT] Error getting status:', error);
    throw error;
  }
};

const EmailDailyLimit = mongoose.models.EmailDailyLimit || mongoose.model('EmailDailyLimit', emailDailyLimitSchema);

module.exports = EmailDailyLimit;

