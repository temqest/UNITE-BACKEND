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

      // 2. Special cases for requesters in review-rescheduled state
      const isRequester = this._isRequester(userId, request);
      
      // 2a. Special handling for CONFIRM action - requester can always confirm reschedule proposals
      // This must be checked BEFORE permission check to allow requester to confirm without confirm permission
      if (action === REQUEST_ACTIONS.CONFIRM && isRequester) {
        const normalizedState = RequestStateService.normalizeState(currentState);
        
        // Confirm is NOT allowed for cancelled, rejected, or review-rejected states
        if (normalizedState === REQUEST_STATES.CANCELLED || 
            normalizedState === REQUEST_STATES.REJECTED || 
            normalizedState === REQUEST_STATES.REVIEW_REJECTED) {
          return {
            valid: false,
            reason: 'Confirm action is not allowed for cancelled or rejected requests'
          };
        }
        
        // Requester can confirm reschedule proposals in REVIEW_RESCHEDULED state
        // No permission check needed - requester has right to respond to reschedule proposals
        if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
          return { valid: true };
        }
      }
      
      if (currentState === REQUEST_STATES.REVIEW_RESCHEDULED) {
        // Requester can reschedule (counter-reschedule) without reschedule permission
        if (action === REQUEST_ACTIONS.RESCHEDULE && isRequester) {
          const locationId = this._extractLocationId(request, context);
          
          // Requester can counter-reschedule without reschedule permission
          // Still need basic read permission
          let hasReadPermission = false;
          
          if (locationId) {
            hasReadPermission = await permissionService.checkPermission(
              userId,
              'request',
              'read',
              { locationId }
            );
          }
          
          // Fallback to system-level permission check
          if (!hasReadPermission) {
            hasReadPermission = await permissionService.checkPermission(
              userId,
              'request',
              'read',
              {}
            );
          }
          
          if (!hasReadPermission) {
            return {
              valid: false,
              reason: 'User does not have request.read permission'
            };
          }
          
          // Skip authority hierarchy check for requester counter-reschedule
          return { valid: true };
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

      if (!hasPermission) {
        return {
          valid: false,
          reason: `User does not have ${permission.resource}.${permission.action} permission`
        };
      }

      // 4. Check authority hierarchy for review actions
      if ([REQUEST_ACTIONS.ACCEPT, REQUEST_ACTIONS.REJECT, REQUEST_ACTIONS.RESCHEDULE].includes(action)) {
        const authorityCheck = await this._checkAuthorityHierarchy(userId, request);
        if (!authorityCheck.valid) {
          return authorityCheck;
        }
      }

      // 5. Special checks for confirm action (for non-requesters only)
      // Note: Requester confirm handling is done earlier (section 2a) before permission check
      if (action === REQUEST_ACTIONS.CONFIRM && !isRequester) {
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
        
        // For non-requesters, check if user can review (has permission and authority)
        const canReview = await this._canReview(userId, request, context);
        if (!canReview) {
          return {
            valid: false,
            reason: 'Only requester or qualified reviewer can confirm'
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

      // Special case: If requester is admin (80+) and reviewer is coordinator (60),
      // allow it (admin requests go to coordinators for execution)
      if (requesterAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN && 
          actorAuthority >= AUTHORITY_TIERS.COORDINATOR && 
          actorAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        // Admin/System Admin requests can be reviewed by coordinators
        return { valid: true };
      }

      // Normal case: Reviewer authority must be >= requester authority
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
   * Get available actions for user on request
   * @param {string|ObjectId} userId - User ID
   * @param {Object} request - Request document
   * @param {Object} context - Context { locationId }
   * @returns {Promise<string[]>} Array of available actions
   */
  async getAvailableActions(userId, request, context = {}) {
    const available = [REQUEST_ACTIONS.VIEW]; // Always allow view

    const currentState = request.status || request.Status;
    const normalizedState = RequestStateService.normalizeState(currentState);
    
    // Special handling for pending-review state
    // In permission-based system: ANY user with request.review permission + appropriate authority can review
    // Not just the assigned reviewer
    if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
      const isRequester = this._isRequester(userId, request);
      const canReview = await this._canReview(userId, request, context);
      
      // Requester-specific actions
      if (isRequester) {
        // Requester can cancel their own request (if they have permission)
        const cancelValidation = await this.validateAction(userId, REQUEST_ACTIONS.CANCEL, request, context);
        if (cancelValidation.valid) {
          available.push(REQUEST_ACTIONS.CANCEL);
        }
        
        // Requester can edit their own request (if they have permission and state allows)
        const editValidation = await this.validateAction(userId, REQUEST_ACTIONS.EDIT, request, context);
        if (editValidation.valid) {
          available.push(REQUEST_ACTIONS.EDIT);
        }
      }
      
      // Review actions: ANY qualified reviewer can act (not just assigned reviewer)
      if (canReview) {
        // Check each review action
        const acceptValidation = await this.validateAction(userId, REQUEST_ACTIONS.ACCEPT, request, context);
        if (acceptValidation.valid) {
          available.push(REQUEST_ACTIONS.ACCEPT);
        }
        
        const rejectValidation = await this.validateAction(userId, REQUEST_ACTIONS.REJECT, request, context);
        if (rejectValidation.valid) {
          available.push(REQUEST_ACTIONS.REJECT);
        }
        
        const rescheduleValidation = await this.validateAction(userId, REQUEST_ACTIONS.RESCHEDULE, request, context);
        if (rescheduleValidation.valid) {
          available.push(REQUEST_ACTIONS.RESCHEDULE);
        }
      }
      
      return available;
    }
    
    // Special handling for review-rescheduled state (reschedule loop)
    if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
      const userIdStr = userId.toString();
      const isRequester = this._isRequester(userId, request);
      const isReviewer = this._isReviewer(userId, request);
      
      // Check who proposed the reschedule
      const rescheduleProposal = request.rescheduleProposal;
      let proposerId = null;
      
      if (rescheduleProposal?.proposedBy) {
        const proposedByUserId = rescheduleProposal.proposedBy.userId;
        // Handle populated object (has _id property)
        if (proposedByUserId && typeof proposedByUserId === 'object' && proposedByUserId._id) {
          proposerId = proposedByUserId._id.toString();
        } else {
          // Handle ObjectId or string
          proposerId = proposedByUserId?.toString() || rescheduleProposal.proposedBy.id?.toString();
        }
      }
      
      const isRescheduleProposer = proposerId === userIdStr;
      
      // If user is the one who proposed the reschedule, they can only view
      // (they already made their move, waiting for the other party to respond)
      if (isRescheduleProposer) {
        return [REQUEST_ACTIONS.VIEW];
      }
      
      // If user is NOT the proposer, they are the "other party" and can respond
      // The response actions depend on whether they are the requester or reviewer:
      // - Requester (stakeholder/admin): confirm, reschedule, view
      // - Reviewer (coordinator): accept, reject, reschedule, view
      
      if (isRequester) {
        // Requester (stakeholder or admin) can confirm or counter-reschedule
        const confirmValidation = await this.validateAction(userId, REQUEST_ACTIONS.CONFIRM, request, context);
        if (confirmValidation.valid) {
          available.push(REQUEST_ACTIONS.CONFIRM);
        }
        
        const rescheduleValidation = await this.validateAction(userId, REQUEST_ACTIONS.RESCHEDULE, request, context);
        if (rescheduleValidation.valid) {
          available.push(REQUEST_ACTIONS.RESCHEDULE);
        }
      } else {
        // For review-rescheduled state, check if user can review (permission-based, not just assigned reviewer)
        const canReview = await this._canReview(userId, request, context);
        if (canReview) {
          // Any qualified reviewer can accept, reject, or counter-reschedule
          const acceptValidation = await this.validateAction(userId, REQUEST_ACTIONS.ACCEPT, request, context);
          if (acceptValidation.valid) {
            available.push(REQUEST_ACTIONS.ACCEPT);
          }
          
          const rejectValidation = await this.validateAction(userId, REQUEST_ACTIONS.REJECT, request, context);
          if (rejectValidation.valid) {
            available.push(REQUEST_ACTIONS.REJECT);
          }
          
          const rescheduleValidation = await this.validateAction(userId, REQUEST_ACTIONS.RESCHEDULE, request, context);
          if (rescheduleValidation.valid) {
            available.push(REQUEST_ACTIONS.RESCHEDULE);
          }
        }
      }
      
      return available;
    }

    // Special handling for approved state
    // Approved events allow: view, edit, manage-staff, reschedule, cancel (based on permissions)
    if (normalizedState === REQUEST_STATES.APPROVED) {
      // Edit action - for approved events, check event.update permission (not request.update)
      // Approved events are published, so they use event permissions
      const locationId = this._extractLocationId(request, context);
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
          {} // Fallback to system-level permission
        );
      }
      
      if (canEditEvent) {
        available.push(REQUEST_ACTIONS.EDIT);
      }
      
      // Manage staff action - requires event.manage-staff permission
      // Reuse locationId from above
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
          {} // Fallback to system-level permission
        );
      }
      
      if (canManageStaff) {
        available.push('manage-staff');
      }
      
      // Reschedule action - requires request.reschedule permission
      // Note: Reschedule from approved state goes to review-rescheduled state
      const rescheduleValidation = await this.validateAction(userId, REQUEST_ACTIONS.RESCHEDULE, request, context);
      if (rescheduleValidation.valid) {
        available.push(REQUEST_ACTIONS.RESCHEDULE);
      }
      
      // Cancel action - requires request.cancel permission
      const cancelValidation = await this.validateAction(userId, REQUEST_ACTIONS.CANCEL, request, context);
      if (cancelValidation.valid) {
        available.push(REQUEST_ACTIONS.CANCEL);
      }
      
      return available;
    }

    // Special handling for cancelled state - only view and delete (for admins with permission)
    if (normalizedState === REQUEST_STATES.CANCELLED) {
      // Cancelled events are final - only view is allowed
      // No confirm, no edit, no other actions (except delete for admins with permission)
      
      // Check if user is admin (authority >= 80) and has delete permission
      try {
        const { User } = require('../../models/index');
        const user = await User.findById(userId).select('authority').lean();
        const userAuthority = user?.authority || 20;
        
        if (userAuthority >= 80) {
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
              {} // Fallback to system-level permission
            );
          }
          
          if (canDelete) {
            available.push(REQUEST_ACTIONS.DELETE);
          }
        }
      } catch (error) {
        // If check fails, just return view only
        console.error(`[ACTION VALIDATOR] Error checking delete permission: ${error.message}`);
      }
      
      return available;
    }

    // Special handling for review-rejected state (legacy intermediate state)
    // NOTE: New rejections go directly to REJECTED state, but this is kept for backward compatibility
    // Per user requirement, confirm should NOT be available for rejected events
    // Rejected events (even in intermediate state) are final - only view is allowed
    if (normalizedState === REQUEST_STATES.REVIEW_REJECTED) {
      // Check if user is admin (authority >= 80) and has delete permission (same as REJECTED)
      try {
        const { User } = require('../../models/index');
        const user = await User.findById(userId).select('authority').lean();
        const userAuthority = user?.authority || 20;
        
        if (userAuthority >= 80) {
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
              {} // Fallback to system-level permission
            );
          }
          
          if (canDelete) {
            available.push(REQUEST_ACTIONS.DELETE);
          }
        }
      } catch (error) {
        // If check fails, just return view only
        console.error(`[ACTION VALIDATOR] Error checking delete permission: ${error.message}`);
      }
      
      return available; // Only view (and delete if admin)
    }

    // Special handling for rejected state - only view and delete (for admins with permission)
    if (normalizedState === REQUEST_STATES.REJECTED) {
      // Rejected events are final - only view is allowed (except delete for admins with permission)
      
      // Check if user is admin (authority >= 80) and has delete permission
      try {
        const { User } = require('../../models/index');
        const user = await User.findById(userId).select('authority').lean();
        const userAuthority = user?.authority || 20;
        
        if (userAuthority >= 80) {
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
              {} // Fallback to system-level permission
            );
          }
          
          if (canDelete) {
            available.push(REQUEST_ACTIONS.DELETE);
          }
        }
      } catch (error) {
        // If check fails, just return view only
        console.error(`[ACTION VALIDATOR] Error checking delete permission: ${error.message}`);
      }
      
      return available;
    }

    // Normal state handling - check all possible actions
    // BUT: Never allow confirm for rejected/cancelled states
    // This is a safety check in case state normalization fails or state is unexpected
    if (normalizedState === REQUEST_STATES.REJECTED || 
        normalizedState === REQUEST_STATES.REVIEW_REJECTED || 
        normalizedState === REQUEST_STATES.CANCELLED) {
      // Rejected/cancelled states should have been caught by early returns above
      // But if we reach here, ensure confirm is never added
      return available; // Only view (and delete if admin) - no other actions
    }

    const possibleActions = RequestStateService.getAvailableActions(normalizedState);

    for (const action of possibleActions) {
      if (action === REQUEST_ACTIONS.VIEW) continue; // Already added
      
      // Additional safety: Block confirm for rejected/cancelled states even in normal handling
      if (action === REQUEST_ACTIONS.CONFIRM && 
          (normalizedState === REQUEST_STATES.REJECTED || 
           normalizedState === REQUEST_STATES.REVIEW_REJECTED || 
           normalizedState === REQUEST_STATES.CANCELLED)) {
        continue; // Skip confirm for rejected/cancelled states
      }
      
      const validation = await this.validateAction(userId, action, request, context);
      if (validation.valid) {
        available.push(action);
      }
    }

    return available;
  }
}

module.exports = new ActionValidatorService();

