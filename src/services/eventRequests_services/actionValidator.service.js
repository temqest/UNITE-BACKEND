/**
 * Action Validator Service
 * 
 * Validates request actions based on permissions and authority hierarchy
 */

const permissionService = require('../users_services/permission.service');
const { User } = require('../../models/index');
const { AUTHORITY_TIERS, REQUEST_ACTIONS, REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');
const RequestStateService = require('./requestState.service');

class ActionValidatorService {
  /**
   * Action to permission mapping
   */
  constructor() {
    this.ACTION_PERMISSIONS = {
      [REQUEST_ACTIONS.VIEW]: { resource: 'request', action: 'read' },
      [REQUEST_ACTIONS.ACCEPT]: { resource: 'request', action: 'review' },
      [REQUEST_ACTIONS.REJECT]: { resource: 'request', action: 'review' },
      [REQUEST_ACTIONS.RESCHEDULE]: { resource: 'request', action: 'reschedule' },
      [REQUEST_ACTIONS.CONFIRM]: { resource: 'request', action: 'confirm' },
      [REQUEST_ACTIONS.DECLINE]: { resource: 'request', action: 'decline' },
      [REQUEST_ACTIONS.CANCEL]: { resource: 'request', action: 'cancel' },
      [REQUEST_ACTIONS.DELETE]: { resource: 'request', action: 'delete' },
      [REQUEST_ACTIONS.EDIT]: { resource: 'request', action: 'update' },
      'manage-staff': { resource: 'event', action: 'manage-staff' } // Staff management uses event.manage-staff permission
    };
  }

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
      
      // Edit action doesn't change state - it's allowed on approved/pending requests
      // Skip transition check for edit action
      if (action !== REQUEST_ACTIONS.EDIT) {
        if (!RequestStateService.isValidTransition(currentState, action)) {
          return {
            valid: false,
            reason: `Action '${action}' is not valid for request in state '${currentState}'`
          };
        }
      } else {
        // For edit action, check if state allows editing
        const normalizedState = RequestStateService.normalizeState(currentState);
        // Edit is allowed on pending-review and approved states
        if (normalizedState !== REQUEST_STATES.PENDING_REVIEW && 
            normalizedState !== REQUEST_STATES.APPROVED) {
          return {
            valid: false,
            reason: `Edit action is not allowed for request in state '${currentState}'`
          };
        }
      }

      // 2. Check if user is active responder (simplified reschedule logic using lastAction)
      const isRequester = this._isRequester(userId, request);
      const normalizedState = RequestStateService.normalizeState(currentState);
      
      // In review-rescheduled state, use active responder logic
      if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
        const activeResponder = RequestStateService.getActiveResponder(request);
        if (activeResponder && activeResponder.userId) {
          const userIdStr = userId.toString();
          const responderId = activeResponder.userId.toString();
          
          // If user is NOT the active responder, they can only view
          if (userIdStr !== responderId && action !== REQUEST_ACTIONS.VIEW) {
            return {
              valid: false,
              reason: 'Only the active responder can perform actions on this request'
            };
          }
          
          // If user IS the active responder, allow them to respond (confirm/decline/accept/reject/reschedule)
          // This handles the turn-based negotiation
          if (userIdStr === responderId && [
            REQUEST_ACTIONS.ACCEPT,
            REQUEST_ACTIONS.REJECT,
            REQUEST_ACTIONS.CONFIRM,
            REQUEST_ACTIONS.DECLINE,
            REQUEST_ACTIONS.RESCHEDULE
          ].includes(action)) {
            // Active responder can respond - skip self-review check for reschedule negotiation
            // Permission and authority checks will be done below
          }
        }
      }
      
      // 2b. Prevent requesters from self-reviewing their own requests (except when they're active responder in reschedule)
      // Use authority-based check, not role-based
      if (isRequester && normalizedState !== REQUEST_STATES.REVIEW_RESCHEDULED) {
        // In non-reschedule states, requesters cannot review their own requests
        if ([REQUEST_ACTIONS.ACCEPT, REQUEST_ACTIONS.REJECT, REQUEST_ACTIONS.RESCHEDULE, REQUEST_ACTIONS.EDIT].includes(action)) {
          return {
            valid: false,
            reason: 'Requesters cannot review their own requests'
          };
        }
      }
      
      // 2c. Special handling for CONFIRM action - requester can confirm reschedule proposals when active responder
      if (action === REQUEST_ACTIONS.CONFIRM && isRequester) {
        // Confirm is NOT allowed for cancelled, rejected, or review-rejected states
        if (normalizedState === REQUEST_STATES.CANCELLED || 
            normalizedState === REQUEST_STATES.REJECTED || 
            normalizedState === REQUEST_STATES.REVIEW_REJECTED) {
          return {
            valid: false,
            reason: 'Confirm action is not allowed for cancelled or rejected requests'
          };
        }
        
        // Requester can confirm reschedule proposals in REVIEW_RESCHEDULED state if they're active responder
        if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
          const activeResponder = RequestStateService.getActiveResponder(request);
          if (activeResponder && activeResponder.userId && activeResponder.userId.toString() === userId.toString()) {
            // Active responder can confirm - skip permission check
            return { valid: true };
          }
        }
      }

      // 3. Check permission
      const permission = this.ACTION_PERMISSIONS[action];
      if (!permission) {
        return {
          valid: false,
          reason: `Unknown action: ${action}`
        };
      }

      // Special case: In review-rescheduled state, receivers (non-initiators) can respond to reschedule proposals
      // even without explicit request.review permission - this enables turn-based reschedule negotiation
      let isReceiverInRescheduleNegotiation = false;
      if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED && isRequester) {
        const rescheduleProposal = request.rescheduleProposal;
        if (rescheduleProposal?.proposedBy) {
          const proposedByUserId = rescheduleProposal.proposedBy.userId;
          let proposerId = null;
          if (proposedByUserId && typeof proposedByUserId === 'object' && proposedByUserId._id) {
            proposerId = proposedByUserId._id.toString();
          } else {
            proposerId = proposedByUserId?.toString();
          }
          const userIdStr = userId.toString();
          const isRescheduleInitiator = proposerId === userIdStr;
          
          // If requester is NOT the initiator, they're the receiver
          if (!isRescheduleInitiator && [
            REQUEST_ACTIONS.ACCEPT, 
            REQUEST_ACTIONS.REJECT, 
            REQUEST_ACTIONS.CONFIRM, 
            REQUEST_ACTIONS.DECLINE
          ].includes(action)) {
            isReceiverInRescheduleNegotiation = true;
          }
        }
      }

      const locationId = this._extractLocationId(request, context);
      
      // Check permission with location context first, then fallback to system-level
      let hasPermission = false;
      
      if (locationId) {
        hasPermission = await permissionService.checkPermission(
          userId,
          permission.resource,
          permission.action,
          { locationId }
        );
      }
      
      // If location-scoped check failed or no locationId, try without location scope
      // This allows system-level permissions to work even if location doesn't match
      if (!hasPermission) {
        hasPermission = await permissionService.checkPermission(
          userId,
          permission.resource,
          permission.action,
          {} // No location context - check for system-level permissions
        );
      }

      // If receiver in reschedule negotiation, allow even without explicit permission
      // They still need to pass authority hierarchy check
      if (!hasPermission && !isReceiverInRescheduleNegotiation) {
        return {
          valid: false,
          reason: `User does not have ${permission.resource}.${permission.action} permission`
        };
      }

      // 4. Check authority hierarchy for review actions
      // Note: CONFIRM and DECLINE are authority-based equivalents of ACCEPT and REJECT (for users with authority < 60)
      if ([REQUEST_ACTIONS.ACCEPT, REQUEST_ACTIONS.REJECT, REQUEST_ACTIONS.CONFIRM, REQUEST_ACTIONS.DECLINE, REQUEST_ACTIONS.RESCHEDULE].includes(action)) {
        const authorityCheck = await this._checkAuthorityHierarchy(userId, request);
        if (!authorityCheck.valid) {
          return authorityCheck;
        }
      }

      // 5. Special checks for confirm action
      // Note: Requester confirm handling is done earlier (section 2a) before permission check
      if (action === REQUEST_ACTIONS.CONFIRM) {
        const normalizedState = RequestStateService.normalizeState(currentState);
        
        // Confirm is NOT allowed for cancelled, rejected, or review-rejected states
        // Per user requirement: once rejected (even in intermediate state), confirm should never be available
        if (normalizedState === REQUEST_STATES.CANCELLED || 
            normalizedState === REQUEST_STATES.REJECTED || 
            normalizedState === REQUEST_STATES.REVIEW_REJECTED) {
          return {
            valid: false,
            reason: 'Confirm action is not allowed for cancelled or rejected requests'
          };
        }
        
        // For non-requesters in pending-review state, confirm is used by stakeholders as reviewer
        // Check if user is assigned reviewer or can review
        if (!isRequester && normalizedState === REQUEST_STATES.PENDING_REVIEW) {
          const isReviewer = this._isReviewer(userId, request);
          const canReview = await this._canReview(userId, request, context);
          
          // Allow if user is assigned reviewer (explicit assignment) or can review
          if (!isReviewer && !canReview) {
            return {
              valid: false,
              reason: 'Only assigned reviewer or qualified reviewer can confirm'
            };
          }
        } else if (!isRequester) {
          // For other states (review-rescheduled, etc.), check if user can review
          const canReview = await this._canReview(userId, request, context);
          if (!canReview) {
            return {
              valid: false,
              reason: 'Only requester or qualified reviewer can confirm'
            };
          }
        }
      }
      
      // 6. Special checks for decline action (authority-based equivalent of reject for users with authority < 60)
      if (action === REQUEST_ACTIONS.DECLINE) {
        const normalizedState = RequestStateService.normalizeState(currentState);
        
        // Decline is NOT allowed for cancelled, rejected states
        if (normalizedState === REQUEST_STATES.CANCELLED || 
            normalizedState === REQUEST_STATES.REJECTED) {
          return {
            valid: false,
            reason: 'Decline action is not allowed for cancelled or rejected requests'
          };
        }
        
        // For non-requesters, check if user is assigned reviewer or can review
        if (!isRequester) {
          const isReviewer = this._isReviewer(userId, request);
          const canReview = await this._canReview(userId, request, context);
          
          // Allow if user is assigned reviewer (explicit assignment) or can review
          if (!isReviewer && !canReview) {
            return {
              valid: false,
              reason: 'Only assigned reviewer or qualified reviewer can decline'
            };
          }
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
   * Generic authority-based check without role-specific special cases
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

      const requesterAuthority = request.requester?.authoritySnapshot || AUTHORITY_TIERS.BASIC_USER;

      // Check explicit assignment (coordinator-to-stakeholder, admin-to-coordinator, etc.)
      // Explicit assignment allows review regardless of authority hierarchy
      if (request.reviewer?.assignmentRule && this._isReviewer(userId, request)) {
        // Explicit assignment allows review - this handles special workflows
        return { valid: true };
      }

      // Normal rule: reviewer authority >= requester authority
      if (actorAuthority >= requesterAuthority) {
        return { valid: true };
      }

      return {
        valid: false,
        reason: `Reviewer authority (${actorAuthority}) must be >= requester authority (${requesterAuthority})`
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Authority check error: ${error.message}`
      };
    }
  }

  /**
   * Check if user is the requester
   * Handles both populated and non-populated userId fields
   * @private
   */
  _isRequester(userId, request) {
    if (!request.requester || !userId) return false;
    
    const userIdStr = userId.toString();
    const requesterUserId = request.requester.userId;
    
    // Handle populated object (has _id property)
    if (requesterUserId && typeof requesterUserId === 'object' && requesterUserId._id) {
      return requesterUserId._id.toString() === userIdStr;
    }
    
    // Handle ObjectId or string
    const requesterId = requesterUserId?.toString();
    return requesterId === userIdStr;
  }

  /**
   * Check if user is the reviewer
   * Handles both populated and non-populated userId fields
   * @private
   */
  _isReviewer(userId, request) {
    if (!request.reviewer || !userId) return false;
    
    const userIdStr = userId.toString();
    const reviewerUserId = request.reviewer.userId;
    
    // Handle populated object (has _id property)
    if (reviewerUserId && typeof reviewerUserId === 'object' && reviewerUserId._id) {
      return reviewerUserId._id.toString() === userIdStr;
    }
    
    // Handle ObjectId or string
    const reviewerId = reviewerUserId?.toString();
    return reviewerId === userIdStr;
  }

  /**
   * Get user authority level
   * @private
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<number>} User authority level
   */
  async _getUserAuthority(userId) {
    try {
      const actor = await User.findById(userId).select('authority').lean();
      return actor?.authority || AUTHORITY_TIERS.BASIC_USER;
    } catch (error) {
      console.error(`[ACTION VALIDATOR] Error getting user authority: ${error.message}`);
      return AUTHORITY_TIERS.BASIC_USER;
    }
  }

  /**
   * Map actions based on user authority level
   * Authority ≥ 60: use accept/reject
   * Authority 30-59: use confirm/decline
   * Authority < 30: use confirm/decline
   * @private
   * @param {number} authority - User authority level
   * @param {string[]} baseActions - Base action names
   * @returns {string[]} Mapped action names
   */
  _mapActionsByAuthority(authority, baseActions) {
    const mapped = [];
    
    for (const action of baseActions) {
      if (authority >= AUTHORITY_TIERS.COORDINATOR) {
        // Authority ≥ 60: use accept/reject
        if (action === REQUEST_ACTIONS.CONFIRM) {
          mapped.push(REQUEST_ACTIONS.ACCEPT);
        } else if (action === REQUEST_ACTIONS.DECLINE) {
          mapped.push(REQUEST_ACTIONS.REJECT);
        } else {
          mapped.push(action);
        }
      } else {
        // Authority < 60: use confirm/decline
        if (action === REQUEST_ACTIONS.ACCEPT) {
          mapped.push(REQUEST_ACTIONS.CONFIRM);
        } else if (action === REQUEST_ACTIONS.REJECT) {
          mapped.push(REQUEST_ACTIONS.DECLINE);
        } else {
          mapped.push(action);
        }
      }
    }
    
    // Remove duplicates
    return [...new Set(mapped)];
  }

  /**
   * Check if user can perform action on approved event
   * Capability-based: checks ownership (requester/reviewer) + permissions
   * @private
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @param {string} action - Action to check
   * @param {Object} context - Context { locationId }
   * @returns {Promise<boolean>} True if user can perform action
   */
  async _canPerformActionOnApprovedEvent(userId, request, action, context = {}) {
    const isRequester = this._isRequester(userId, request);
    const isReviewer = this._isReviewer(userId, request);
    const locationId = this._extractLocationId(request, context);
    
    // Requesters and reviewers have special access to approved events they're involved in
    if (isRequester || isReviewer) {
      // Check permission for the specific action
      const permission = this.ACTION_PERMISSIONS[action];
      if (!permission) {
        return false;
      }
      
      // Check permission with location context
      let hasPermission = false;
      if (locationId) {
        hasPermission = await permissionService.checkPermission(
          userId,
          permission.resource,
          permission.action,
          { locationId }
        );
      }
      
      // Fallback to system-level permission
      if (!hasPermission) {
        hasPermission = await permissionService.checkPermission(
          userId,
          permission.resource,
          permission.action,
          {}
        );
      }
      
      return hasPermission;
    }
    
    // For other users, require explicit event permissions
    // (This maintains security while allowing requesters/reviewers access)
    return false;
  }

  /**
   * Extract locationId from request or context, handling populated objects
   * @private
   * @param {Object} request - Request document
   * @param {Object} context - Context { locationId }
   * @returns {string|ObjectId|null} Location ID
   */
  _extractLocationId(request, context = {}) {
    // First try context
    if (context.locationId) {
      const loc = context.locationId;
      // Handle populated object
      if (loc && typeof loc === 'object' && loc._id) {
        return loc._id;
      }
      // Handle ObjectId or string
      return loc;
    }
    
    // Try request.district
    if (request.district) {
      const district = request.district;
      // Handle populated object
      if (district && typeof district === 'object' && district._id) {
        return district._id;
      }
      // Handle ObjectId or string
      return district;
    }
    
    // Try request.municipalityId
    if (request.municipalityId) {
      const municipality = request.municipalityId;
      // Handle populated object
      if (municipality && typeof municipality === 'object' && municipality._id) {
        return municipality._id;
      }
      // Handle ObjectId or string
      return municipality;
    }
    
    return null;
  }

  /**
   * Check if user can review this request (has permission and appropriate authority)
   * @private
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @param {Object} context - Context { locationId }
   * @returns {Promise<boolean>} True if user can review
   */
  async _canReview(userId, request, context = {}) {
    try {
      const locationId = this._extractLocationId(request, context);
      
      // Special case: If user is the assigned reviewer with explicit assignment rule,
      // allow them to review even without request.review permission
      // This handles special workflows where lower authority users are explicitly assigned as reviewers
      const isReviewer = this._isReviewer(userId, request);
      const assignmentRule = request.reviewer?.assignmentRule;
      
      if (isReviewer && assignmentRule) {
        console.log(`[ACTION VALIDATOR] User ${userId} is assigned reviewer with assignment rule: ${assignmentRule}, allowing review`);
        // Still check authority hierarchy, but explicit assignment allows review
        const authorityCheck = await this._checkAuthorityHierarchy(userId, request);
        if (authorityCheck.valid) {
          return true;
        } else {
          console.warn(`[ACTION VALIDATOR] Assigned reviewer ${userId} failed authority check: ${authorityCheck.reason}`);
          // For explicit assignments, we're more lenient - allow if user has reasonable authority
          const actor = await User.findById(userId).select('authority').lean();
          const requesterAuthority = request.requester?.authoritySnapshot || AUTHORITY_TIERS.BASIC_USER;
          if (actor && actor.authority >= AUTHORITY_TIERS.STAKEHOLDER) {
            // Explicit assignment allows review even if authority hierarchy doesn't match
            console.log(`[ACTION VALIDATOR] Allowing user (${actor.authority}) to review requester (${requesterAuthority}) request via explicit assignment`);
            return true;
          }
        }
      }
      
      // Check if user has request.review permission
      // Try with locationId first, then fallback to without locationId if location-scoped check fails
      let hasReviewPermission = false;
      
      if (locationId) {
        hasReviewPermission = await permissionService.checkPermission(
          userId,
          'request',
          'review',
          { locationId }
        );
      }
      
      // If location-scoped check failed or no locationId, try without location scope
      // This allows system-level permissions to work even if location doesn't match
      if (!hasReviewPermission) {
        hasReviewPermission = await permissionService.checkPermission(
          userId,
          'request',
          'review',
          {} // No location context - check for system-level permissions
        );
      }
      
      if (!hasReviewPermission) {
        return false;
      }
      
      // Check authority hierarchy
      const authorityCheck = await this._checkAuthorityHierarchy(userId, request);
      return authorityCheck.valid;
    } catch (error) {
      console.error(`[ACTION VALIDATOR] Error checking review capability: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if user is the active responder
   * @private
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @returns {boolean} True if user is active responder
   */
  _isActiveResponder(userId, request) {
    const activeResponder = RequestStateService.getActiveResponder(request);
    if (!activeResponder || !activeResponder.userId) {
      return false;
    }
    
    const userIdStr = userId.toString();
    const responderId = activeResponder.userId.toString();
    return userIdStr === responderId;
  }

  /**
   * Get available actions for user on request
   * Uses active responder logic: only active responder gets actionable controls
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @param {Object} context - Context { locationId }
   * @returns {Promise<string[]>} Array of available actions
   */
  async getAvailableActions(userId, request, context = {}) {
    const available = [REQUEST_ACTIONS.VIEW]; // Always allow view

    const currentState = request.status || request.Status;
    const normalizedState = RequestStateService.normalizeState(currentState);
    
    // Final states: only view (and delete for admins with permission)
    if (RequestStateService.isFinalState(normalizedState)) {
      // Check delete permission for admins
      try {
        const user = await User.findById(userId).select('authority').lean();
        const userAuthority = user?.authority || 20;
        
        if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
          const locationId = this._extractLocationId(request, context);
          let canDelete = false;
          
          if (locationId) {
            canDelete = await permissionService.checkPermission(
              userId,
              'request',
              'delete',
              { locationId }
            );
          }
          
          if (!canDelete) {
            canDelete = await permissionService.checkPermission(
              userId,
              'request',
              'delete',
              {}
            );
          }
          
          if (canDelete) {
            available.push(REQUEST_ACTIONS.DELETE);
          }
        }
      } catch (error) {
        console.error(`[ACTION VALIDATOR] Error checking delete permission: ${error.message}`);
      }
      
      return available;
    }
    
    // Get active responder
    const activeResponder = RequestStateService.getActiveResponder(request);
    
    // If no active responder, only view
    if (!activeResponder || !activeResponder.userId) {
      return available;
    }
    
    // Check if user is the active responder
    // Normalize userIds for comparison - handle both ObjectId and string cases
    const userIdStr = userId.toString();
    const responderUserId = activeResponder.userId;
    // Handle both populated ObjectId (_id property) and direct ObjectId
    const responderId = responderUserId?._id 
      ? responderUserId._id.toString() 
      : responderUserId?.toString() || String(responderUserId);
    
    const isActiveResponder = userIdStr === responderId || 
      (responderUserId && responderUserId.toString() === userIdStr);
    
    // If user is NOT active responder, only view
    if (!isActiveResponder) {
      return available;
    }
    
    // User IS active responder - get their authority
    const user = await User.findById(userId).select('authority').lean();
    const userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
    
    // Get base actions for current state
    const baseActions = RequestStateService.getAvailableActions(normalizedState);
    
    // Map actions based on authority (accept/reject vs confirm/decline)
    const mappedActions = this._mapActionsByAuthority(userAuthority, baseActions);
    
    // Check permissions for each action and add if valid
    for (const action of mappedActions) {
      if (action === REQUEST_ACTIONS.VIEW) continue; // Already added
      
      const validation = await this.validateAction(userId, action, request, context);
      if (validation.valid) {
        available.push(action);
      }
    }
    
    // Special handling for pending-review: requester can cancel and edit
    if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
      const isRequester = this._isRequester(userId, request);
      if (isRequester) {
        const cancelValidation = await this.validateAction(userId, REQUEST_ACTIONS.CANCEL, request, context);
        if (cancelValidation.valid) {
          available.push(REQUEST_ACTIONS.CANCEL);
        }
        
        const editValidation = await this.validateAction(userId, REQUEST_ACTIONS.EDIT, request, context);
        if (editValidation.valid) {
          available.push(REQUEST_ACTIONS.EDIT);
        }
      }
    }
    
    // Special handling for approved state: requester/reviewer can edit, manage-staff, reschedule, cancel
    if (normalizedState === REQUEST_STATES.APPROVED) {
      const isRequester = this._isRequester(userId, request);
      const isReviewer = this._isReviewer(userId, request);
      
      if (isRequester || isReviewer) {
        const locationId = this._extractLocationId(request, context);
        
        // Edit action
        let canEditEvent = false;
        if (locationId) {
          canEditEvent = await permissionService.checkPermission(
            userId,
            'event',
            'update',
            { locationId }
          );
        }
        if (!canEditEvent) {
          canEditEvent = await permissionService.checkPermission(
            userId,
            'event',
            'update',
            {}
          );
        }
        if (canEditEvent) {
          available.push(REQUEST_ACTIONS.EDIT);
        }
        
        // Manage staff action
        let canManageStaff = false;
        if (locationId) {
          canManageStaff = await permissionService.checkPermission(
            userId,
            'event',
            'manage-staff',
            { locationId }
          );
        }
        if (!canManageStaff) {
          canManageStaff = await permissionService.checkPermission(
            userId,
            'event',
            'manage-staff',
            {}
          );
        }
        if (canManageStaff) {
          available.push('manage-staff');
        }
      }
    }
    
    return available;
  }
}

module.exports = new ActionValidatorService();

