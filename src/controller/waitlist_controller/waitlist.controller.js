const waitlistService = require('../../services/waitlist_services/waitlist.service');

class WaitlistController {
  /**
   * @desc    Join waitlist
   * @route   POST /api/waitlist
   * @access  Public
   */
  async joinWaitlist(req, res, next) {
    try {
      // Data is rigorously validated, checked for honeypot, and normalized by Joi middleware 
      const { email, name, source, signupPage } = req.validatedData;

      // Detect environmental footprints and hardware
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // Send to the business logic layer without bloating the controller logic itself
      const newEntry = await waitlistService.joinWaitlist({
        email,
        name,
        source,
        ipAddress,
        userAgent,
        signupPage
      });

      res.status(201).json({
        success: true,
        message: 'Successfully joined the waitlist!',
        data: {
          id: newEntry._id,
          email: newEntry.email,
          status: newEntry.status
        }
      });
    } catch (error) {
      if (error.statusCode === 409) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      
      // Funnel general internal bugs to Express global error loggings securely.
      next(error);
    }
  }
}

module.exports = new WaitlistController();
