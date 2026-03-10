const express = require('express');
const router = express.Router();
const waitlistController = require('../controller/waitlist_controller/waitlist.controller');
const { validateJoinWaitlist } = require('../validators/waitlist_validators/waitlist.validator');
const waitlistLimiterMiddleware = require('../middleware/waitlistRateLimiter');

/**
 * @route   POST /api/waitlist
 * @desc    Submit email to join the waitlist. Protects via Rate limiting and Honeypot triggers
 * @access  Public
 */
router.post('/waitlist', waitlistLimiterMiddleware, validateJoinWaitlist, waitlistController.joinWaitlist);

module.exports = router;
