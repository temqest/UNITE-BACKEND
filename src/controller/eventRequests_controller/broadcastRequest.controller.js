/**
 * Broadcast Request Controller Extensions
 * 
 * Adds endpoints for:
 * 1. Manually overriding coordinator assignment (fixes the bug)
 * 2. Claiming a request
 * 3. Releasing a claim on a request
 * 4. Getting valid coordinators for a request
 * 
 * Add these methods to the EventRequestController class
 */

const { User } = require('../../models');
const EventRequest = require('../../models/eventRequests_models/eventRequest.model');
const broadcastAccessService = require('../../services/eventRequests_services/broadcastAccess.service');
const notificationService = require('../../services/utility_services/notification.service');
const { AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');

/**
 * Manually override the assigned coordinator
 * 
 * FIXES THE BUG: When frontend sends coordinator selection, backend properly updates the assignment
 * 
 * @route PUT /api/event-requests/:requestId/override-coordinator
 */
async function overrideCoordinator(req, res) {
  try {
    const { requestId } = req.params;
    const { coordinatorId } = req.body;
    const adminId = req.user._id || req.user.id;

    // Validate: only admin can override
    if ((req.user.authority || 0) < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can override coordinator assignment'
      });
    }

    // Validate: coordinatorId is provided
    if (!coordinatorId) {
      return res.status(400).json({
        success: false,
        message: 'coordinatorId is required'
      });
    }

    // Get request
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Validate: coordinator is in validCoordinators
    const isValidCoordinator = request.validCoordinators && request.validCoordinators.some(
      vc => vc.userId.toString() === coordinatorId
    );

    if (!isValidCoordinator) {
      return res.status(400).json({
        success: false,
        message: 'Coordinator is not valid for this request. Not in valid coordinators list.',
        validCoordinators: request.validCoordinators
      });
    }

    // Get admin details for audit trail
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin user not found'
      });
    }

    // Get new coordinator details
    const coordinator = await User.findById(coordinatorId);
    if (!coordinator) {
      return res.status(404).json({
        success: false,
        message: 'Coordinator user not found'
      });
    }

    // IMPORTANT: Update the entire reviewer object to properly replace the assignment
    const oldReviewerId = request.reviewer?.userId?.toString() || null;

    request.reviewer = {
      userId: coordinator._id,
      name: `${coordinator.firstName || ''} ${coordinator.lastName || ''}`.trim(),
      roleSnapshot: coordinator.roles?.[0]?.roleName || 'Coordinator',
      authoritySnapshot: coordinator.authority || 60,
      assignedAt: new Date(),
      autoAssigned: false,
      assignmentRule: 'manual',
      overriddenAt: new Date(),
      overriddenBy: {
        userId: admin._id,
        name: `${admin.firstName || ''} ${admin.lastName || ''}`.trim(),
        roleSnapshot: admin.roles?.[0]?.roleName || 'Admin',
        authoritySnapshot: admin.authority
      }
    };

    // Save the request
    await request.save();

    // Log the override
    console.log('[OVERRIDE COORDINATOR] Request updated:', {
      requestId: request.Request_ID,
      oldReviewerId,
      newReviewerId: coordinator._id.toString(),
      overriddenBy: admin._id.toString(),
      timestamp: new Date().toISOString()
    });

    // Emit notification to new coordinator
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(coordinator._id.toString()).emit('coordinator_assigned', {
          requestId: request._id,
          Request_ID: request.Request_ID,
          title: request.Event_Title,
          assignedAt: request.reviewer.assignedAt,
          overriddenAt: request.reviewer.overriddenAt,
          overriddenBy: request.reviewer.overriddenBy.name
        });
      }
    } catch (socketError) {
      console.warn('[OVERRIDE COORDINATOR] Socket.IO notification failed:', socketError.message);
    }

    // Send notification
    try {
      await notificationService.createNotification({
        userId: coordinator._id,
        type: 'COORDINATOR_ASSIGNMENT_OVERRIDE',
        title: 'You have been assigned to a request',
        message: `Admin ${admin.firstName} ${admin.lastName} has assigned you to request ${request.Request_ID}: ${request.Event_Title}`,
        data: {
          requestId: request._id,
          Request_ID: request.Request_ID
        },
        relatedUserId: admin._id
      });
    } catch (notificationError) {
      console.warn('[OVERRIDE COORDINATOR] Notification creation failed:', notificationError.message);
    }

    res.status(200).json({
      success: true,
      message: 'Coordinator assignment updated successfully',
      data: {
        request: {
          _id: request._id,
          Request_ID: request.Request_ID,
          reviewer: request.reviewer,
          validCoordinators: request.validCoordinators
        }
      }
    });
  } catch (error) {
    console.error('[OVERRIDE COORDINATOR] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to override coordinator assignment'
    });
  }
}

/**
 * Claim a request for review
 * 
 * Allows a coordinator to claim a request so that other coordinators
 * know someone is working on it. Only the claiming coordinator can act on the request.
 * 
 * @route POST /api/event-requests/:requestId/claim
 */
async function claimRequest(req, res) {
  try {
    const { requestId } = req.params;
    const coordinatorId = req.user._id || req.user.id;

    // Get request
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check: Is valid coordinator?
    const canClaim = await broadcastAccessService.canClaimRequest(coordinatorId, request);
    if (!canClaim.canClaim) {
      return res.status(409).json({
        success: false,
        message: canClaim.reason || 'Cannot claim this request'
      });
    }

    // Get coordinator details
    const coordinator = await User.findById(coordinatorId);
    if (!coordinator) {
      return res.status(404).json({
        success: false,
        message: 'Coordinator not found'
      });
    }

    // Mark as claimed
    request.claimedBy = {
      userId: coordinator._id,
      name: `${coordinator.firstName || ''} ${coordinator.lastName || ''}`.trim(),
      claimedAt: new Date(),
      claimTimeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hour timeout
    };

    await request.save();

    // Broadcast to other coordinators that this is now claimed
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('request_claimed', {
          requestId: request._id,
          Request_ID: request.Request_ID,
          claimedBy: request.claimedBy.name,
          claimedAt: request.claimedBy.claimedAt
        });
      }
    } catch (socketError) {
      console.warn('[CLAIM REQUEST] Socket.IO broadcast failed:', socketError.message);
    }

    console.log('[CLAIM REQUEST] Request claimed:', {
      requestId: request.Request_ID,
      claimedBy: coordinator._id.toString(),
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Request claimed successfully',
      data: {
        claimedBy: request.claimedBy
      }
    });
  } catch (error) {
    console.error('[CLAIM REQUEST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to claim request'
    });
  }
}

/**
 * Release claim on a request
 * 
 * Allows the coordinator who claimed a request to release it back
 * to the pool of valid coordinators.
 * 
 * @route POST /api/event-requests/:requestId/release
 */
async function releaseRequest(req, res) {
  try {
    const { requestId } = req.params;
    const coordinatorId = req.user._id || req.user.id;

    // Get request
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Check: Only coordinator who claimed it can release
    if (!request.claimedBy || request.claimedBy.userId.toString() !== coordinatorId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the coordinator who claimed this request can release it'
      });
    }

    const releasedByName = request.claimedBy.name;

    // Release claim
    request.claimedBy = null;
    await request.save();

    // Broadcast to other coordinators that this is now available
    try {
      const io = req.app.get('io');
      if (io) {
        io.emit('request_released', {
          requestId: request._id,
          Request_ID: request.Request_ID,
          releasedBy: releasedByName,
          releasedAt: new Date()
        });
      }
    } catch (socketError) {
      console.warn('[RELEASE REQUEST] Socket.IO broadcast failed:', socketError.message);
    }

    console.log('[RELEASE REQUEST] Claim released:', {
      requestId: request.Request_ID,
      releasedBy: coordinatorId.toString(),
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      message: 'Request claim released'
    });
  } catch (error) {
    console.error('[RELEASE REQUEST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to release request'
    });
  }
}

/**
 * Get valid coordinators for a request
 * 
 * Returns the list of all coordinators who can act on this request
 * 
 * @route GET /api/event-requests/:requestId/valid-coordinators
 */
async function getValidCoordinators(req, res) {
  try {
    const { requestId } = req.params;

    // Get request
    const request = await EventRequest.findOne({ Request_ID: requestId })
      .populate('validCoordinators.userId', '_id firstName lastName authority organizationType');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        validCoordinators: request.validCoordinators || [],
        claimedBy: request.claimedBy || null,
        count: (request.validCoordinators || []).length
      }
    });
  } catch (error) {
    console.error('[GET VALID COORDINATORS] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get valid coordinators'
    });
  }
}

module.exports = {
  overrideCoordinator,
  claimRequest,
  releaseRequest,
  getValidCoordinators
};
