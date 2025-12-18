/**
 * Request Action Service
 * 
 * Unified service for executing request actions (accept, reject, reschedule, cancel, delete)
 * that works with any role combination using RBAC permissions.
 */

const { EventRequest } = require('../../models');
const permissionService = require('../users_services/permission.service');
const { RequestStateMachine } = require('./requestStateMachine');

class RequestActionService {
  /**
   * Execute an action on a request
   * @param {string} requestId - Request ID
   * @param {string|ObjectId} userId - User ID performing the action
   * @param {string} action - Action to perform ('accept', 'reject', 'reschedule', 'cancel', 'delete', 'confirm', 'decline')
   * @param {Object} actionData - Additional data for the action
   * @returns {Promise<Object>} Updated request
   */
  async executeAction(requestId, userId, action, actionData = {}) {
    // 1. Get request
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    // 2. Verify permission
    const hasPermission = await this.checkActionPermission(userId, requestId, action);
    if (!hasPermission) {
      throw new Error(`User ${userId} cannot perform ${action} on request ${requestId}`);
    }

    // 3. Validate action for current state
    const stateMachine = new RequestStateMachine();
    const isValidTransition = await stateMachine.canTransition(
      request.Status,
      action,
      { userId, request }
    );

    if (!isValidTransition) {
      throw new Error(`Action ${action} is not valid for request in state ${request.Status}`);
    }

    // 4. Execute action via state machine
    const result = await stateMachine.executeTransition(
      request,
      action,
      { userId, ...actionData }
    );

    // 5. Update audit trail
    await this.addAuditEntry(requestId, {
      action,
      actor: { id: userId },
      changes: actionData,
      timestamp: new Date()
    });

    return result;
  }

  /**
   * Check if user has permission to perform action on request
   * @param {string|ObjectId} userId - User ID
   * @param {string} requestId - Request ID
   * @param {string} action - Action to check
   * @returns {Promise<Boolean>} True if user has permission
   */
  async checkActionPermission(userId, requestId, action) {
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return false;
    }

    // Map actions to required permissions
    const permissionMap = {
      'accept': { resource: 'request', action: 'approve' },
      'reject': { resource: 'request', action: 'reject' },
      'reschedule': { resource: 'request', action: 'reschedule' },
      'cancel': { resource: 'request', action: 'cancel' },
      'delete': { resource: 'request', action: 'delete' },
      'confirm': { resource: 'request', action: 'confirm' },
      'decline': { resource: 'request', action: 'decline' },
      'edit': { resource: 'request', action: 'update' },
      'view': { resource: 'request', action: 'read' }
    };

    const requiredPerm = permissionMap[action];
    if (!requiredPerm) {
      return false;
    }

    // Check permission with location context
    const locationId = request.location?.district || request.district;
    const hasPermission = await permissionService.checkPermission(
      userId,
      requiredPerm.resource,
      requiredPerm.action,
      { locationId, requestId: request._id }
    );

    // Also check if user is the requester (for certain actions)
    if (['cancel', 'confirm', 'decline'].includes(action)) {
      const isRequester = this._isRequester(userId, request);
      if (isRequester) {
        return true; // Requester can always cancel/confirm/decline their own requests
      }
    }

    // Check if user is the reviewer (for review actions)
    if (['accept', 'reject', 'reschedule'].includes(action)) {
      const isReviewer = this._isReviewer(userId, request);
      if (isReviewer && hasPermission) {
        return true;
      }
    }

    return hasPermission;
  }

  /**
   * Check if user is the requester
   * @private
   */
  _isRequester(userId, request) {
    const userIdStr = userId.toString();
    
    // Check new requester field
    if (request.requester?.userId) {
      return request.requester.userId.toString() === userIdStr;
    }
    
    // Check legacy made_by_id
    if (request.made_by_id) {
      return request.made_by_id.toString() === userIdStr;
    }
    
    return false;
  }

  /**
   * Check if user is the reviewer
   * @private
   */
  _isReviewer(userId, request) {
    const userIdStr = userId.toString();
    
    // Check new reviewer field
    if (request.reviewer?.userId) {
      return request.reviewer.userId.toString() === userIdStr;
    }
    
    // Check legacy reviewer.id
    if (request.reviewer?.id) {
      return request.reviewer.id.toString() === userIdStr;
    }
    
    return false;
  }

  /**
   * Add audit entry to request
   * @param {string} requestId - Request ID
   * @param {Object} entry - Audit entry data
   */
  async addAuditEntry(requestId, entry) {
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      throw new Error(`Request ${requestId} not found`);
    }

    // Get user details for actor
    const { User } = require('../../models');
    const user = await User.findById(entry.actor.id) || await User.findByLegacyId(entry.actor.id);
    const roles = user ? await permissionService.getUserRoles(user._id) : [];
    const primaryRole = roles[0];

    const auditEntry = {
      action: entry.action,
      actor: {
        userId: user?._id,
        id: user?.userId || user?._id?.toString() || entry.actor.id,
        role: primaryRole?.code || null,
        roleSnapshot: primaryRole?.code || null,
        name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email : null
      },
      timestamp: entry.timestamp || new Date(),
      changes: entry.changes || {},
      location: entry.location || null
    };

    if (!request.auditTrail) {
      request.auditTrail = [];
    }

    request.auditTrail.push(auditEntry);
    await request.save();
  }

  /**
   * Get available actions for a user on a request
   * @param {string|ObjectId} userId - User ID
   * @param {string} requestId - Request ID
   * @returns {Promise<Array>} Array of available action names
   */
  async getAvailableActions(userId, requestId) {
    const request = await EventRequest.findOne({ Request_ID: requestId });
    if (!request) {
      return [];
    }

    const stateMachine = new RequestStateMachine();
    const availableActions = stateMachine.getAllowedActions(
      request.Status,
      null, // role (not needed with permissions)
      userId,
      request
    );

    // Filter by permissions
    const permittedActions = [];
    for (const action of availableActions) {
      const hasPermission = await this.checkActionPermission(userId, requestId, action);
      if (hasPermission) {
        permittedActions.push(action);
      }
    }

    return permittedActions;
  }
}

module.exports = new RequestActionService();
