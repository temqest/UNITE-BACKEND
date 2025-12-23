const express = require('express');
const router = express.Router();
const stakeholderController = require('../controller/stakeholder_controller/stakeholder.controller');
const authenticate = require('../middleware/authenticate');

/**
 * @route   GET /api/stakeholders/creation-context
 * @desc    Get creation context for stakeholder management page
 * @access  Private (requires authentication)
 */
router.get('/stakeholders/creation-context',
  authenticate,
  stakeholderController.getCreationContext.bind(stakeholderController)
);

/**
 * @route   GET /api/stakeholders/barangays/:municipalityId
 * @desc    Get barangays for a municipality
 * @access  Private (requires authentication)
 */
router.get('/stakeholders/barangays/:municipalityId',
  authenticate,
  stakeholderController.getBarangays.bind(stakeholderController)
);

/**
 * @route   GET /api/stakeholders/diagnostics/:userId
 * @desc    Get diagnostic information for a user (authority, organizations, coverage areas, municipalities)
 * @access  Private (requires authentication, users can only view their own diagnostics unless system admin)
 */
router.get('/stakeholders/diagnostics/:userId',
  authenticate,
  stakeholderController.getDiagnostics.bind(stakeholderController)
);

module.exports = router;

