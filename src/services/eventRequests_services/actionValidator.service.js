/**
 * Action Validator Service
 * 
 * Validates request actions based on permissions and authority hierarchy
 */

const permissionService = require('../users_services/permission.service');
const { User } = require('../../models/index');
const { AUTHORITY_TIERS, REQUEST_ACTIONS } = require('../../utils/eventRequests/requestConstants');
const RequestStateService = require('./requestState.service');

class ActionValidatorService {
  /**
   * Action to permission mapping
   */
  static ACTION_PERMISSIONS = {
    [REQUEST_ACTIONS.VIEW]: { resource: 'request', action: 'read' },
    [REQUEST_ACTIONS.ACCEPT]: { resource: 'request', action: 'review' },
    [REQUEST_ACTIONS.REJECT]: { resource: 'request', action: 'review' },
    [REQUEST_ACTIONS.RESCHEDULE]: { resource: 'request', action: 'reschedule' },
    [REQUEST_ACTIONS.CONFIRM]: { resource: 'request', action: 'confirm' },
    [REQUEST_ACTIONS.CANCEL]: { resource: 'request', action: 'cancel' },
    [REQUEST_ACTIONS.DELETE]: { resource: 'request', action: 'delete' },
    [REQUEST_ACTIONS.EDIT]: { resource: 'request', action: 'update' }
  };

  /**
   * Validate if user can perform action on request
   * @param {string|ObjectId} userId - User ID
   * @param {string} action - Action to perform
   * @param {Object} request - Request document
   * @param {Object} context - Context { locationId }
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateAction(userId, action, request, context = {}) {
    try {
      // 1. Check if action is valid for current state
      const currentState = request.status || request.Status;
      if (!RequestStateService.isValidTransition(currentState, action)) {
        return {
          valid: false,
          reason: `Action '${action}' is not valid for request in state '${currentState}'`
        };
      }

      // 2. Check permission
      const permission = this.ACTION_PERMISSIONS[action];
      if (!permission) {
        return {
          valid: false,
          reason: `Unknown action: ${action}`
        };
      }

      const locationId = context.locationId || request.district || request.municipalityId;
      const hasPermission = await permissionService.checkPermission(
        userId,
        permission.resource,
        permission.action,
        { locationId }
      );

      if (!hasPermission) {
        return {
          valid: false,
          reason: `User does not have ${permission.resource}.${permission.action} permission`
        };
      }

      // 3. Check authority hierarchy for review actions
      if ([REQUEST_ACTIONS.ACCEPT, REQUEST_ACTIONS.REJECT, REQUEST_ACTIONS.RESCHEDULE].includes(action)) {
        const authorityCheck = await this._checkAuthorityHierarchy(userId, request);
        if (!authorityCheck.valid) {
          return authorityCheck;
        }
      }

      // 4. Special checks for confirm action
      if (action === REQUEST_ACTIONS.CONFIRM) {
        const isRequester = this._isRequester(userId, request);
        const isReviewer = this._isReviewer(userId, request);
        
        // Requester can confirm, or reviewer can confirm
        if (!isRequester && !isReviewer) {
          return {
            valid: false,
            reason: 'Only requester or reviewer can confirm'
          };
        }
      }

      return { valid: true };
    } catch (error) {
      console.error(`[ACTION VALIDATOR] Error: ${error.message}`);
      return {
        valid: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Check authority hierarchy for review actions
   * @private
   */
  async _checkAuthorityHierarchy(userId, request) {
    try {
      const actor = await User.findById(userId).select('authority isSystemAdmin').lean();
      if (!actor) {
        return {
          valid: false,
          reason: 'Actor user not found'
        };
      }

      const actorAuthority = actor.authority || AUTHORITY_TIERS.BASIC_USER;
      const isSystemAdmin = actorAuthority >= AUTHORITY_TIERS.SYSTEM_ADMIN || actor.isSystemAdmin;

      // System admin can override authority checks
      if (isSystemAdmin) {
        return { valid: true };
      }

      // Get requester authority
      const requesterAuthority = request.requester?.authoritySnapshot || AUTHORITY_TIERS.BASIC_USER;

      // Reviewer authority must be >= requester authority
      if (actorAuthority < requesterAuthority) {
        return {
          valid: false,
          reason: `Reviewer authority (${actorAuthority}) must be >= requester authority (${requesterAuthority})`
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        reason: `Authority check error: ${error.message}`
      };
    }
  }

  /**
   * Check if user is the requester
   * @private
   */
  _isRequester(userId, request) {
    const userIdStr = userId.toString();
    const requesterId = request.requester?.userId?.toString();
    return requesterId === userIdStr;
  }

  /**
   * Check if user is the reviewer
   * @private
   */
  _isReviewer(userId, request) {
    const userIdStr = userId.toString();
    const reviewerId = request.reviewer?.userId?.toString();
    return reviewerId === userIdStr;
  }

  /**
   * Get available actions for user on request
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @param {Object} context - Context { locationId }
   * @returns {Promise<string[]>} Array of available actions
   */
  async getAvailableActions(userId, request, context = {}) {
    const available = [REQUEST_ACTIONS.VIEW]; // Always allow view

    const currentState = request.status || request.Status;
    const possibleActions = RequestStateService.getAvailableActions(currentState);

    for (const action of possibleActions) {
      const validation = await this.validateAction(userId, action, request, context);
      if (validation.valid) {
        available.push(action);
      }
    }

    return available;
  }
}

module.exports = new ActionValidatorService();

