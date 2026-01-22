/**
 * Coordinator Assignment Validation Middleware
 * 
 * Validates that the selected coordinator is valid for the stakeholder
 * during event creation. Prevents manual API manipulation.
 * 
 * Usage:
 *   router.post('/events', validateCoordinatorAssignment, createEvent);
 */

const coordinatorResolverService = require('../services/users_services/coordinatorResolver.service');

/**
 * Middleware: Validate coordinator assignment for event creation
 * 
 * Checks:
 * 1. Coordinator ID is provided
 * 2. Stakeholder ID is provided
 * 3. Coordinator is valid for that stakeholder
 * 
 * Sets req.validatedData.coordinatorValidation
 */
async function validateCoordinatorAssignment(req, res, next) {
  try {
    // Extract from various payload locations
    const stakeholderId = 
      req.validatedData?.stakeholderId || 
      req.body?.stakeholder || 
      req.body?.stakeholderId ||
      req.user?.id; // Fallback to current user if not specified

    const coordinatorId = 
      req.validatedData?.coordinatorId || 
      req.body?.coordinator || 
      req.body?.coordinatorId;

    // Log validation attempt
    console.log('[validateCoordinatorAssignment] Validating coordinator assignment:', {
      stakeholderId: stakeholderId?.toString() || 'none',
      coordinatorId: coordinatorId?.toString() || 'none',
      endpoint: req.path,
      method: req.method
    });

    // If no coordinator is specified, allow (some endpoints may not require it)
    if (!coordinatorId) {
      console.log('[validateCoordinatorAssignment] No coordinator specified, skipping validation');
      return next();
    }

    // If no stakeholder is specified, allow (system admin might be creating event)
    if (!stakeholderId) {
      console.log('[validateCoordinatorAssignment] No stakeholder specified, skipping validation');
      return next();
    }

    // Validate coordinator assignment
    const validation = await coordinatorResolverService.validateCoordinatorAssignment(
      stakeholderId,
      coordinatorId
    );

    if (!validation.valid) {
      console.warn('[validateCoordinatorAssignment] Invalid coordinator assignment:', {
        stakeholderId: stakeholderId.toString(),
        coordinatorId: coordinatorId.toString(),
        reason: validation.reason,
        details: validation.details
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid coordinator assignment',
        details: {
          stakeholderId: stakeholderId.toString(),
          coordinatorId: coordinatorId.toString(),
          reason: validation.reason,
          validationDetails: process.env.NODE_ENV === 'development' ? validation.details : undefined
        }
      });
    }

    // Store validation result for later use
    if (!req.validatedData) {
      req.validatedData = {};
    }
    req.validatedData.coordinatorValidation = {
      valid: true,
      stakeholderId,
      coordinatorId,
      timestamp: new Date()
    };

    console.log('[validateCoordinatorAssignment] Coordinator assignment valid:', {
      stakeholderId: stakeholderId.toString(),
      coordinatorId: coordinatorId.toString()
    });

    next();
  } catch (error) {
    console.error('[validateCoordinatorAssignment] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate coordinator assignment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = validateCoordinatorAssignment;
