const Waitlist = require('../../models/waitlist_models/Waitlist');
const emailService = require('../utility_services/email.service');

class WaitlistService {
  /**
   * Add a user to the waitlist and dispatch emails via core provider
   * @param {Object} data Waitlist data containing analytical, string, and source trackers
   * @returns {Object} Saved waitlist document
   */
  async joinWaitlist(data) {
    const { 
      email, 
      name, 
      source,
      ipAddress,
      userAgent,
      signupPage
    } = data;

    // Check if email already exists in the waitlist to reject duplicates natively
    const existingEntry = await Waitlist.findOne({ email });
    if (existingEntry) {
      const error = new Error('Email is already on the waitlist');
      error.statusCode = 409; // HTTP Conflict status
      throw error;
    }

    // Capture comprehensive metadata on insertion
    const newEntry = new Waitlist({
      email,
      name,
      source: source || 'direct',
      ipAddress,
      userAgent,
      signupPage
    });

    const savedEntry = await newEntry.save();

    // Async operation (non-blocking) - gracefully utilizing core backend provider
    // No `await` because we want to finish the HTTP response instantly rather than holding it up forever
    emailService.sendWaitlistConfirmation(email, name).catch(err => {
      console.error('Unhandled background Promise rejection sending waitlist email via core provider:', err);
    });

    return savedEntry;
  }

  /**
   * Optional: Get all waitlist entries (could be used for an admin dashboard)
   * @returns {Array} List of waitlist entries
   */
  async getWaitlist() {
    return await Waitlist.find().sort({ createdAt: -1 });
  }
}

module.exports = new WaitlistService();
