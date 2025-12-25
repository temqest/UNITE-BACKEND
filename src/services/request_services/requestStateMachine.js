/**
 * Request State Machine Engine
 * 
 * This module implements a rule-based state machine for request flows.
 * It eliminates hardcoded logic and provides a flexible, extensible architecture.
 */

const REQUEST_STATES = Object.freeze({
  PENDING_REVIEW: 'pending-review',
  REVIEW_ACCEPTED: 'review-accepted',
  REVIEW_REJECTED: 'review-rejected',
  REVIEW_RESCHEDULED: 'review-rescheduled',
  AWAITING_CONFIRMATION: 'awaiting-confirmation',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  CLOSED: 'closed'
});

const ACTIONS = Object.freeze({
  VIEW: 'view',
  ACCEPT: 'accept',
  REJECT: 'reject',
  RESCHEDULE: 'reschedule',
  CONFIRM: 'confirm',
  DECLINE: 'decline',
  EDIT: 'edit',
  MANAGE_STAFF: 'manage-staff',
  CANCEL: 'cancel',
  DELETE: 'delete'
});

// Local copy of review decision constants (matches requestFlow.helpers)
const REVIEW_DECISIONS = Object.freeze({
  ACCEPT: 'accept',
  REJECT: 'reject',
  RESCHEDULE: 'reschedule'
});

/**
 * State Transition Rules - Permission-Based
 * Actions are determined by permissions, not role names
 */
const STATE_TRANSITIONS = {
  [REQUEST_STATES.PENDING_REVIEW]: {
    // Reviewer actions: users with request.review permission can review
    reviewerActions: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE],
    // Requester actions
    requesterActions: [ACTIONS.VIEW],
    transitions: {
      [ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED,
      [ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED,
      [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED
    }
  },

  [REQUEST_STATES.REVIEW_ACCEPTED]: {
    reviewerActions: [ACTIONS.VIEW],
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM],
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED
    }
  },

  [REQUEST_STATES.REVIEW_REJECTED]: {
    // Users with request.delete permission can delete rejected requests
    reviewerActions: [ACTIONS.VIEW],
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM],
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.REJECTED,
      [ACTIONS.DELETE]: REQUEST_STATES.CLOSED
    }
  },

  [REQUEST_STATES.REVIEW_RESCHEDULED]: {
    // Reviewer can accept or counter-reschedule
    reviewerActions: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.RESCHEDULE],
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.RESCHEDULE],
    transitions: {
      [ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED,
      [ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED,
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED,
      [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED
    }
  },

  [REQUEST_STATES.AWAITING_CONFIRMATION]: {
    reviewerActions: [ACTIONS.VIEW],
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.REJECT],
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED,
      [ACTIONS.REJECT]: REQUEST_STATES.REJECTED
    }
  },

  [REQUEST_STATES.APPROVED]: {
    // Users with request.update permission can edit
    // Users with request.cancel permission can cancel
    reviewerActions: [ACTIONS.VIEW, ACTIONS.EDIT, ACTIONS.MANAGE_STAFF, ACTIONS.RESCHEDULE, ACTIONS.CANCEL],
    requesterActions: [ACTIONS.VIEW, ACTIONS.EDIT, ACTIONS.MANAGE_STAFF, ACTIONS.RESCHEDULE, ACTIONS.CANCEL],
    transitions: {
      [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED,
      [ACTIONS.CANCEL]: REQUEST_STATES.CANCELLED
    }
  },

  [REQUEST_STATES.REJECTED]: {
    reviewerActions: [ACTIONS.VIEW],
    requesterActions: [ACTIONS.VIEW],
    transitions: {
      [ACTIONS.DELETE]: REQUEST_STATES.CLOSED
    }
  },

  [REQUEST_STATES.CANCELLED]: {
    reviewerActions: [ACTIONS.VIEW],
    requesterActions: [ACTIONS.VIEW],
    transitions: {
      [ACTIONS.DELETE]: REQUEST_STATES.CLOSED
    }
  },

  [REQUEST_STATES.CLOSED]: {
    reviewerActions: [ACTIONS.VIEW],
    requesterActions: [ACTIONS.VIEW],
    transitions: {}
  }
};

/**
 * Permission mapping for actions
 * Maps actions to required permissions
 */
const ACTION_PERMISSIONS = {
  [ACTIONS.VIEW]: { resource: 'request', action: 'read' },
  [ACTIONS.ACCEPT]: { resource: 'request', action: 'approve' },
  [ACTIONS.REJECT]: { resource: 'request', action: 'reject' },
  [ACTIONS.RESCHEDULE]: { resource: 'request', action: 'reschedule' },
  [ACTIONS.CONFIRM]: { resource: 'request', action: 'confirm' },
  [ACTIONS.DECLINE]: { resource: 'request', action: 'decline' },
  [ACTIONS.EDIT]: { resource: 'request', action: 'update' },
  [ACTIONS.CANCEL]: { resource: 'request', action: 'cancel' },
  [ACTIONS.DELETE]: { resource: 'request', action: 'delete' },
  [ACTIONS.MANAGE_STAFF]: { resource: 'request', action: 'update' } // Staff management requires update permission
};

class RequestStateMachine {
  /**
   * Get allowed actions for a user in a given state (permission-based)
   * @param {string} state - Current request state
   * @param {string|null} userRole - User role (deprecated, kept for backward compatibility)
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request object
   * @returns {Promise<string[]>} Array of allowed action names
   */
  async getAllowedActions(state, userRole, userId, request = {}) {
    const permissionService = require('../users_services/permission.service');
    const normalizedState = this.normalizeState(state);
    
    if (!STATE_TRANSITIONS[normalizedState]) {
      return [ACTIONS.VIEW];
    }

    const stateConfig = STATE_TRANSITIONS[normalizedState];
    const isRequester = this.isRequester(userId, request);
    const isReviewer = this.isReviewer(userId, null, request); // userRole no longer needed
    
    // Get location context for permission checks
    const locationId = request.location?.district || request.district || request.locationId;
    
    // Check if user has system admin permissions (full access)
    const hasFullAccess = await permissionService.checkPermission(
      userId,
      '*',
      '*',
      { locationId }
    );

    // --- Special Logic for Rescheduling Loop ---
    // Check both normalized state and raw state to handle variations
    const rawState = String(request.Status || request.status || state || '').toLowerCase();
    const isRescheduledState = normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED || 
                               rawState.includes('resched') || 
                               rawState.includes('reschedule');
    
    if (isRescheduledState) {
      const rescheduleProposal = request.rescheduleProposal;
      
      // CRITICAL: If current user is the one who proposed the reschedule, they can only VIEW
      // This prevents users from accepting their own reschedule proposals
      if (rescheduleProposal && rescheduleProposal.proposedBy && rescheduleProposal.proposedBy.id) {
        const proposerId = rescheduleProposal.proposedBy.id;
        if (String(proposerId) === String(userId)) {
          return [ACTIONS.VIEW];
        }
      }
      
      // Check if there's a reschedule proposal and user is the recipient
      if (rescheduleProposal && rescheduleProposal.proposedBy) {
        const proposerId = rescheduleProposal.proposedBy.id;
        const isRecipient = !isRequester && isReviewer && String(proposerId) !== String(userId);
        
        if (isRecipient) {
          // Recipient can accept or counter-reschedule
          const canAccept = await permissionService.checkPermission(userId, 'request', 'approve', { locationId });
          const canReschedule = await permissionService.checkPermission(userId, 'request', 'reschedule', { locationId });
          
          const actions = [ACTIONS.VIEW];
          if (canAccept) actions.push(ACTIONS.ACCEPT);
          if (canReschedule) actions.push(ACTIONS.RESCHEDULE);
          return actions;
        }
        
        // If requester received a reschedule proposal, they can confirm or counter-reschedule
        if (isRequester && String(proposerId) !== String(userId)) {
          const canConfirm = await permissionService.checkPermission(userId, 'request', 'confirm', { locationId });
          const canReschedule = await permissionService.checkPermission(userId, 'request', 'reschedule', { locationId });
          
          const actions = [ACTIONS.VIEW];
          if (canConfirm) actions.push(ACTIONS.CONFIRM);
          if (canReschedule) actions.push(ACTIONS.RESCHEDULE);
          return actions;
        }
      }
    }

    // Handling States Requiring Requester Confirmation (Accepted, Rejected)
    const requiresRequesterConfirmation = [
      REQUEST_STATES.REVIEW_ACCEPTED,
      REQUEST_STATES.REVIEW_REJECTED,
      REQUEST_STATES.AWAITING_CONFIRMATION
    ].includes(normalizedState);

    if (requiresRequesterConfirmation) {
      // Check if this user just made the decision
      let justMadeDecision = false;
      if (request.decisionHistory && Array.isArray(request.decisionHistory) && request.decisionHistory.length > 0) {
        const mostRecentDecision = request.decisionHistory[request.decisionHistory.length - 1];
        if (mostRecentDecision && mostRecentDecision.actor && String(mostRecentDecision.actor.id) === String(userId)) {
          justMadeDecision = true;
        }
      }
      
      // If user is the reviewer who just made the decision, they can only view
      if (isReviewer || justMadeDecision) {
        // Exception: If reviewer is also the requester (or has full access), they can confirm
        if (isRequester || hasFullAccess) {
          const canConfirm = await permissionService.checkPermission(userId, 'request', 'confirm', { locationId });
          if (canConfirm && stateConfig.requesterActions) {
            return stateConfig.requesterActions;
          }
        }
        return [ACTIONS.VIEW];
      }
      
      // Requester can confirm/decline
      if (isRequester && stateConfig.requesterActions) {
        // Filter actions by permissions
        const filteredActions = await this._filterActionsByPermissions(
          stateConfig.requesterActions,
          userId,
          locationId,
          permissionService
        );
        return filteredActions.length > 0 ? filteredActions : [ACTIONS.VIEW];
      }
      
      return [ACTIONS.VIEW];
    }

    // Normal State Logic - Check requester first
    // CRITICAL: If user is the reschedule proposer, they should only get VIEW (already handled above, but double-check here)
    const rescheduleProposalCheck = request.rescheduleProposal && request.rescheduleProposal.proposedBy && request.rescheduleProposal.proposedBy.id;
    const isRescheduleProposer = rescheduleProposalCheck && String(request.rescheduleProposal.proposedBy.id) === String(userId);
    
    if (isRequester && stateConfig.requesterActions && !isRescheduleProposer) {
      // Filter requester actions by permissions
      const filteredActions = await this._filterActionsByPermissions(
        stateConfig.requesterActions,
        userId,
        locationId,
        permissionService
      );
      return filteredActions.length > 0 ? filteredActions : [ACTIONS.VIEW];
    }

    // Reviewer actions - check if user is reviewer and has required permissions
    if (isReviewer && !isRescheduleProposer && stateConfig.reviewerActions) {
      const filteredActions = await this._filterActionsByPermissions(
        stateConfig.reviewerActions,
        userId,
        locationId,
        permissionService
      );
      if (filteredActions.length > 0) {
        return filteredActions;
      }
    }

    // For approved state, check if user has update permissions
    if (normalizedState === REQUEST_STATES.APPROVED) {
      const canUpdate = await permissionService.checkPermission(userId, 'request', 'update', { locationId });
      const canCancel = await permissionService.checkPermission(userId, 'request', 'cancel', { locationId });
      const canReschedule = await permissionService.checkPermission(userId, 'request', 'reschedule', { locationId });
      
      const actions = [ACTIONS.VIEW];
      if (canUpdate) actions.push(ACTIONS.EDIT);
      if (canReschedule) actions.push(ACTIONS.RESCHEDULE);
      if (canCancel) actions.push(ACTIONS.CANCEL);
      
      if (actions.length > 1) {
        return actions;
      }
    }

    // Full access users can perform any action (except when restricted by state)
    if (hasFullAccess && !requiresRequesterConfirmation) {
      // Get all possible actions for this state
      const allActions = [
        ...(stateConfig.reviewerActions || []),
        ...(stateConfig.requesterActions || [])
      ];
      const uniqueActions = [...new Set(allActions)];
      return uniqueActions.length > 0 ? uniqueActions : [ACTIONS.VIEW];
    }

    return [ACTIONS.VIEW];
  }

  /**
   * Filter actions by user permissions
   * @private
   * @param {string[]} actions - List of actions to filter
   * @param {string|ObjectId} userId - User ID
   * @param {string|ObjectId} locationId - Location ID for context
   * @param {Object} permissionService - Permission service instance
   * @returns {Promise<string[]>} Filtered actions
   */
  async _filterActionsByPermissions(actions, userId, locationId, permissionService) {
    const filtered = [];
    for (const action of actions) {
      const perm = ACTION_PERMISSIONS[action];
      if (!perm) {
        // Unknown action, allow it (for backward compatibility)
        filtered.push(action);
        continue;
      }
      
      const hasPermission = await permissionService.checkPermission(
        userId,
        perm.resource,
        perm.action,
        { locationId }
      );
      
      if (hasPermission) {
        filtered.push(action);
      }
    }
    return filtered;
  }

  // ... (Rest of the class methods remain unchanged: getNextState, isValidTransition, etc.)

  getNextState(currentState, action) {
    const normalizedState = this.normalizeState(currentState);
    const stateConfig = STATE_TRANSITIONS[normalizedState];
    if (!stateConfig || !stateConfig.transitions) return null;
    return stateConfig.transitions[action] || null;
  }

  /**
   * Validate if a state transition is allowed
   * Combines permission checking, authority validation, and state machine rules
   * 
   * @param {string} currentState - Current request state
   * @param {string} action - Action to perform
   * @param {string|null} userRole - User role (deprecated, kept for backward compatibility)
   * @param {string|ObjectId} userId - User ID performing the action
   * @param {Object} request - Request document
   * @returns {Promise<boolean>} True if transition is valid, false otherwise
   */
  async isValidTransition(currentState, action, userRole, userId, request = {}) {
    // Use permission-based check with authority validation
    if (userId) {
      const canPerform = await this.canPerformAction(currentState, userId, action, request);
      if (canPerform !== null) {
        return canPerform;
      }
    }
    
    // Fallback: check if action is in allowed actions
    const allowedActions = await this.getAllowedActions(currentState, userRole, userId, request);
    return allowedActions.includes(action);
  }

  /**
   * Validate request creation - check REQUEST_CREATE permission
   * Called before a new request is created to ensure user has capability
   * 
   * @param {string|ObjectId} userId - User creating the request
   * @param {Object} context - Context { locationId, coordinatorId, stakeholderId, eventDetails, etc. }
   * @returns {Promise<{allowed: boolean, reason?: string}>} Validation result with optional error reason
   */
  async validateRequestCreation(userId, context = {}) {
    const permissionService = require('../users_services/permission.service');
    const User = require('../../models/index').User;

    try {
      // Get location context
      const locationId = context.locationId || context.district;

      // ========== 1. CHECK REQUEST_CREATE PERMISSION ==========
      const hasCreatePermission = await permissionService.checkPermission(
        userId,
        'request',
        'create',
        { locationId }
      );

      if (!hasCreatePermission) {
        console.warn(`[REQUEST_CREATE DENIED] User ${userId} lacks request:create permission`);
        return {
          allowed: false,
          reason: 'User does not have permission to create requests'
        };
      }

      // ========== 2. AUTHORITY HIERARCHY CHECK (Optional) ==========
      // If creating on behalf of someone else, requester authority should be >= the person they're creating for
      // This prevents lower-authority users from creating requests for higher-authority users
      
      // For now, we allow any user with REQUEST_CREATE to create
      // Future: add hierarchical checks for delegation scenarios

      return {
        allowed: true
      };
    } catch (error) {
      console.error(`Error validating request creation: ${error.message}`);
      return {
        allowed: false,
        reason: 'Error during permission validation'
      };
    }
  }

  /**
   * Validate request approval - check REQUEST_APPROVE permission
   * Called when approving/confirming a request to ensure user has capability
   * Includes authority hierarchy validation
   * 
   * @param {string|ObjectId} userId - User approving the request
   * @param {Object} request - Request document (with made_by_id, Status, etc.)
   * @returns {Promise<{allowed: boolean, reason?: string}>} Validation result with optional error reason
   */
  async validateRequestApproval(userId, request = {}) {
    const permissionService = require('../users_services/permission.service');
    const User = require('../../models/index').User;

    try {
      // Get location context
      const locationId = request.location?.district || request.district;

      // ========== 1. CHECK REQUEST_APPROVE PERMISSION ==========
      const hasApprovePermission = await permissionService.checkPermission(
        userId,
        'request',
        'approve',
        { locationId }
      );

      if (!hasApprovePermission) {
        console.warn(`[REQUEST_APPROVE DENIED] User ${userId} lacks request:approve permission`);
        return {
          allowed: false,
          reason: 'User does not have permission to approve requests'
        };
      }

      // ========== 2. AUTHORITY HIERARCHY CHECK ==========
      // Approver authority must be >= requester authority (unless system admin)
      const actor = await User.findById(userId).populate('roles');
      const requesterIdToCheck = request.made_by_id || request.requester?.id || request.requester?.userId;
      const requester = requesterIdToCheck ? await User.findById(requesterIdToCheck).populate('roles') : null;

      const actorAuthority = actor?.authority ?? 20;
      const requesterAuthority = requester?.authority ?? 20;
      const isSystemAdmin = actorAuthority >= 100;

      if (!isSystemAdmin && requesterAuthority > actorAuthority) {
        console.warn(`[AUTHORITY DENIED] User ${userId} (authority ${actorAuthority}) cannot approve request from user with authority ${requesterAuthority}`);
        return {
          allowed: false,
          reason: `Your authority level (${actorAuthority}) is insufficient to approve requests from users with authority ${requesterAuthority}`
        };
      }

      // Log if admin is overriding authority (audit trail)
      if (isSystemAdmin && requesterAuthority > actorAuthority) {
        console.log(`[ADMIN OVERRIDE] System admin ${userId} (authority ${actorAuthority}) approving request from user with authority ${requesterAuthority}`);
      }

      return {
        allowed: true
      };
    } catch (error) {
      console.error(`Error validating request approval: ${error.message}`);
      return {
        allowed: false,
        reason: 'Error during permission validation'
      };
    }
  }

  /**
   * Check if user can perform action using RBAC permissions
   * Now includes: Permission validation + Authority hierarchy validation
   * 
   * Permission checks ensure user has the capability (e.g., REQUEST_REVIEW)
   * Authority checks ensure reviewer is not lower authority than requester (unless admin)
   * System admin can override authority checks (logged for audit)
   * 
   * @param {string} state - Current request state
   * @param {string|ObjectId} userId - User ID
   * @param {string} action - Action to check
   * @param {Object} request - Request object with requester/reviewer/made_by_id
   * @returns {Promise<boolean>} True if user can perform action, false otherwise
   */
  async canPerformAction(state, userId, action, request = {}) {
    const permissionService = require('../users_services/permission.service');
    const User = require('../../models/index').User;
    
    const requiredPerm = ACTION_PERMISSIONS[action];
    if (!requiredPerm) {
      return false; // Unknown action
    }

    // Get location context
    const locationId = request.location?.district || request.district || request.locationId;

    // ========== 1. CHECK PERMISSION ==========
    // User must have the required permission to perform the action
    const hasPermission = await permissionService.checkPermission(
      userId,
      requiredPerm.resource,
      requiredPerm.action,
      { locationId, requestId: request._id }
    );

    if (!hasPermission) {
      console.warn(`[PERMISSION DENIED] User ${userId} lacks ${requiredPerm.resource}:${requiredPerm.action} for action ${action}`);
      return false;
    }

    // ========== 2. CHECK AUTHORITY HIERARCHY ==========
    // For review/approve actions: reviewer authority must be >= requester authority
    // Exception: System admin (authority >= 100) can always act
    const reviewActions = [ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE];
    const approveActions = [ACTIONS.CONFIRM]; // Confirmation is approver action
    
    if (reviewActions.includes(action) || approveActions.includes(action)) {
      // Get actor and requester user documents
      const actor = await User.findById(userId).populate('roles');
      const requesterIdToCheck = request.made_by_id || request.requester?.id || request.requester?.userId;
      const requester = requesterIdToCheck ? await User.findById(requesterIdToCheck).populate('roles') : null;

      const actorAuthority = actor?.authority ?? 20;
      const requesterAuthority = requester?.authority ?? 20;
      const isSystemAdmin = actorAuthority >= 100;

      // Authority validation: reviewer must not be lower authority than requester
      if (!isSystemAdmin && requesterAuthority > actorAuthority) {
        console.warn(`[AUTHORITY DENIED] User ${userId} (authority ${actorAuthority}) cannot ${action} request from user with authority ${requesterAuthority}`);
        return false;
      }

      // Log if admin is overriding authority (audit trail)
      if (isSystemAdmin && requesterAuthority > actorAuthority) {
        console.warn(`[ADMIN OVERRIDE] System admin ${userId} (authority ${actorAuthority}) overriding authority check on requester (authority ${requesterAuthority}) for action ${action}`);
      }
    }

    // Additional checks: requester can always cancel/confirm/decline their own requests
    if ([ACTIONS.CANCEL, ACTIONS.CONFIRM, ACTIONS.DECLINE].includes(action)) {
      const isRequester = this.isRequester(userId, request);
      if (isRequester) {
        return true;
      }
    }

    // Check state machine transition validity
    const normalizedState = this.normalizeState(state);
    const stateConfig = STATE_TRANSITIONS[normalizedState];
    if (!stateConfig || !stateConfig.transitions || !stateConfig.transitions[action]) {
      return false; // Invalid transition for this state
    }

    return true;
  }

  isRequester(userId, request) {
    if (!userId || !request) return false;
    const userIdStr = userId.toString();
    
    // Check new requester field
    if (request.requester?.userId) {
      if (request.requester.userId.toString() === userIdStr) return true;
    }
    if (request.requester?.id) {
      if (request.requester.id.toString() === userIdStr) return true;
    }
    
    // Legacy checks for backward compatibility
    const madeById = request.made_by_id || request.creator?.id;
    if (madeById && String(madeById) === userIdStr) return true;
    
    // Check if user is the stakeholder (for stakeholder-created requests)
    const stakeholderId = request.requester?.id || request.requester?.userId || request.stakeholder_id || request.stakeholderId;
    if (stakeholderId && String(stakeholderId) === userIdStr) {
      return true;
    }
    
    return false;
  }

  isReviewer(userId, userRole, request) {
    if (!userId || !request) return false;
    const userIdStr = userId.toString();
    const reviewer = request.reviewer;
    
    // Check new reviewer field (ObjectId)
    if (reviewer?.userId) {
      if (reviewer.userId.toString() === userIdStr) return true;
    }
    
    // Explicit reviewer match (legacy ID)
    if (reviewer && reviewer.id && String(reviewer.id) === userIdStr) return true;

    // Check if user is the stakeholder reviewer (for Coordinator-Stakeholder cases)
    // When Coordinator creates request WITH Stakeholder, Stakeholder is the primary reviewer
    const hasStakeholder = !!(request.stakeholder_id || request.stakeholderId);
    if (hasStakeholder) {
      const stakeholderId = request.reviewer?.id || request.reviewer?.userId || request.stakeholder_id || request.stakeholderId;
      if (stakeholderId && String(stakeholderId) === userIdStr) {
        return true;
      }
    }

    // Legacy fallback: Check coordinator_id for backward compatibility
    if (request.coordinator_id) {
      const coordinatorId = request.reviewer?.id || request.reviewer?.userId || request.coordinator_id;
      if (coordinatorId && String(coordinatorId) === userIdStr) {
        return true;
      }
    }

    return false;
  }

  normalizeState(state) {
    if (!state) return REQUEST_STATES.PENDING_REVIEW;
    const s = String(state).toLowerCase();
    if (s.includes('pending')) return REQUEST_STATES.PENDING_REVIEW;
    if (s.includes('review') && s.includes('accepted')) return REQUEST_STATES.REVIEW_ACCEPTED;
    if (s.includes('review') && s.includes('rejected')) return REQUEST_STATES.REVIEW_REJECTED;
    if (s.includes('review') && s.includes('resched')) return REQUEST_STATES.REVIEW_RESCHEDULED;
    if (s.includes('awaiting') || s.includes('confirmation')) return REQUEST_STATES.AWAITING_CONFIRMATION;
    if (s.includes('approved') || s.includes('completed')) return REQUEST_STATES.APPROVED;
    if (s.includes('rejected')) return REQUEST_STATES.REJECTED;
    if (s.includes('cancelled') || s.includes('canceled')) return REQUEST_STATES.CANCELLED;
    if (s.includes('closed')) return REQUEST_STATES.CLOSED;
    return state;
  }

  normalizeRole(role) {
    // This method is kept for backward compatibility but should not be used for logic decisions
    // Role normalization is only for data storage/display purposes
    if (!role) return null;
    const r = String(role).toLowerCase();
    // Map common role code variations to standard codes
    if (r === 'system-admin' || r === 'systemadmin' || r === 'sysadmin') return 'system-admin';
    if (r === 'coordinator') return 'coordinator';
    if (r === 'stakeholder') return 'stakeholder';
    // Return as-is if it's already a valid role code format
    return role;
  }
}

module.exports = {
  RequestStateMachine,
  REQUEST_STATES,
  ACTIONS,
  STATE_TRANSITIONS,
  ACTION_PERMISSIONS
};
