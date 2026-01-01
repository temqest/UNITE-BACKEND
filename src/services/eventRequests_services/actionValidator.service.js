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
      // Ensure request is a plain object to avoid circular reference issues
      // If it's a Mongoose document, convert to plain object
      let requestObj = request;
      if (request && typeof request.toObject === 'function') {
        try {
          requestObj = request.toObject({ virtuals: false, getters: false });
        } catch (e) {
          // If toObject fails, try to work with the document directly
          requestObj = request;
        }
      }

      // 1. Check if action is valid for current state
      const currentState = requestObj.status || requestObj.Status;
      
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
      const isRequester = this._isRequester(userId, requestObj);
      const normalizedState = RequestStateService.normalizeState(currentState);
      
      // In review-rescheduled state, use active responder logic
      if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
        const activeResponder = RequestStateService.getActiveResponder(requestObj);
        if (activeResponder && activeResponder.userId) {
          const userIdStr = userId.toString();
          const responderId = activeResponder.userId.toString();
          
          // Special case: For coordinator-to-admin requests, handle Admin actions
          // Core principle: activeResponder.relationship === 'reviewer' means "ANY Admin can respond"
          let isActiveResponder = userIdStr === responderId;
          
          if (!isActiveResponder && requestObj.reviewer?.assignmentRule === 'coordinator-to-admin') {
            const User = require('../../models/index').User;
            const user = await User.findById(userIdStr).select('authority').lean();
            const userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
            
            if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
              const activeResponderRelationship = activeResponder.relationship;
              
              // Extract lastActorId with proper ObjectId handling
              let lastActorId = null;
              if (requestObj.lastAction?.actorId) {
                if (typeof requestObj.lastAction.actorId === 'object' && requestObj.lastAction.actorId.toString) {
                  lastActorId = requestObj.lastAction.actorId.toString();
                } else if (typeof requestObj.lastAction.actorId === 'string') {
                  lastActorId = requestObj.lastAction.actorId;
                } else if (requestObj.lastAction.actorId._id) {
                  lastActorId = requestObj.lastAction.actorId._id.toString();
                }
              }
              
              // If activeResponder.relationship === 'reviewer', ANY Admin can respond
              // UNLESS this Admin was the one who rescheduled (then they're View only)
              if (activeResponderRelationship === 'reviewer') {
                if (lastActorId && lastActorId !== userIdStr) {
                  // Admin can respond (did NOT reschedule last)
                  isActiveResponder = true;
                }
                // If lastActorId === userIdStr, Admin rescheduled last, they remain View only
              }
            }
          }
          
          // If user is NOT the active responder, they can only view
          if (!isActiveResponder && action !== REQUEST_ACTIONS.VIEW) {
            return {
              valid: false,
              reason: 'Only the active responder can perform actions on this request'
            };
          }
          
          // If user IS the active responder, allow them to respond (confirm/decline/accept/reject/reschedule)
          // This handles the turn-based negotiation
          if (isActiveResponder && [
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
      
      // Special handling for REJECT action: accept both request.review and request.decline permissions
      // Coordinators typically have request.review, stakeholders have request.decline
      if (action === REQUEST_ACTIONS.REJECT) {
        // Try request.review first (for coordinators)
        if (locationId) {
          hasPermission = await permissionService.checkPermission(
            userId,
            permission.resource,
            permission.action,
            { locationId }
          );
        }
        
        if (!hasPermission) {
          hasPermission = await permissionService.checkPermission(
            userId,
            permission.resource,
            permission.action,
            {} // No location context - check for system-level permissions
          );
        }
        
        // If request.review not found, try request.decline (for stakeholders)
        if (!hasPermission) {
          if (locationId) {
            hasPermission = await permissionService.checkPermission(
              userId,
              'request',
              'decline',
              { locationId }
            );
          }
          
          if (!hasPermission) {
            hasPermission = await permissionService.checkPermission(
              userId,
              'request',
              'decline',
              {} // No location context - check for system-level permissions
            );
          }
        }
      } else {
        // For other actions, use standard permission check
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
      }

      // If receiver in reschedule negotiation, allow even without explicit permission
      // They still need to pass authority hierarchy check
      if (!hasPermission && !isReceiverInRescheduleNegotiation) {
        return {
          valid: false,
          reason: `User does not have ${permission.resource}.${permission.action} permission${action === REQUEST_ACTIONS.REJECT ? ' or request.decline permission' : ''}`
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
        
        // Check state-specific confirm rules in order of priority
        
        // 1. PENDING_REVIEW state: Reviewers (stakeholders/coordinators/admins) can confirm
        // This is the primary use case: reviewer confirms/accepts the request
        if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
          // If user is requester, they can't confirm in pending-review (they're waiting for reviewer)
          if (isRequester) {
            return {
              valid: false,
              reason: 'Requesters cannot confirm requests in pending-review state. Please wait for reviewer decision.'
            };
          }
          
          // Check if user is the assigned reviewer or can review
          const isReviewer = this._isReviewer(userId, requestObj);
          const canReview = await this._canReview(userId, requestObj, context);
          
          if (!isReviewer && !canReview) {
            console.warn(`[ACTION VALIDATOR] Confirm in pending-review: User is not reviewer`, {
              userId: this._normalizeUserId(userId),
              requestId: requestObj.Request_ID,
              isRequester,
              isReviewer,
              canReview
            });
            return {
              valid: false,
              reason: 'Only the assigned reviewer can confirm requests in pending-review state'
            };
          }
          
          // Reviewer can confirm - permission check will be done below
          console.debug(`[ACTION VALIDATOR] Confirm in pending-review: Reviewer can confirm`, {
            userId: this._normalizeUserId(userId),
            requestId: requestObj.Request_ID,
            isReviewer,
            canReview
          });
        }
        // 2. REVIEW_RESCHEDULED state: Either requester or reviewer can confirm based on active responder
        else if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
          const activeResponder = RequestStateService.getActiveResponder(requestObj);
          if (activeResponder && activeResponder.userId) {
            const normalizedUserId = this._normalizeUserId(userId);
            const responderId = this._normalizeUserId(activeResponder.userId);
            
            if (normalizedUserId !== responderId) {
              return {
                valid: false,
                reason: 'Only the active responder can confirm rescheduled requests'
              };
            }
          } else {
            // Fallback: check if user can review
            const canReview = await this._canReview(userId, requestObj, context);
            if (!canReview && !isRequester) {
              return {
                valid: false,
                reason: 'Only requester or qualified reviewer can confirm rescheduled requests'
              };
            }
          }
        }
        // 3. APPROVED state: Only requester can confirm (acknowledgment)
        else if (normalizedState === REQUEST_STATES.APPROVED) {
          // Only requester (stakeholder) can confirm approved requests
          // Re-check isRequester with normalized userId to ensure accurate comparison
          const normalizedUserId = this._normalizeUserId(userId);
          const requesterId = this._normalizeUserId(requestObj.requester?.userId);
          
          if (!normalizedUserId || !requesterId || normalizedUserId !== requesterId) {
            // Check if user is the reviewer (who might have just confirmed it)
            const reviewerId = this._normalizeUserId(requestObj.reviewer?.userId);
            const isReviewer = normalizedUserId && reviewerId && normalizedUserId === reviewerId;
            
            console.warn(`[ACTION VALIDATOR] Confirm on approved: User is not requester`, {
              userId: normalizedUserId,
              requesterId,
              reviewerId,
              isReviewer,
              requestId: requestObj.Request_ID,
              requesterUserId: requestObj.requester?.userId,
              reviewerUserId: requestObj.reviewer?.userId,
              currentState: normalizedState
            });
            
            // If user is the reviewer and request was just approved, provide helpful message
            if (isReviewer) {
              return {
                valid: false,
                reason: 'This request has already been confirmed and approved. Only the requester can acknowledge approved requests.'
              };
            }
            
            return {
              valid: false,
              reason: 'Only the requester can confirm an approved request'
            };
          }
          // Requester can confirm - permission check will be done below
        }
        // 4. Other states: Not allowed
        else {
          return {
            valid: false,
            reason: `Confirm action is not allowed for requests in '${normalizedState}' state`
          };
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
          const isReviewer = this._isReviewer(userId, requestObj);
          const canReview = await this._canReview(userId, requestObj, context);
          
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
    if (!request.requester || !userId) {
      console.debug(`[ACTION VALIDATOR] _isRequester: Missing requester or userId`, {
        hasRequester: !!request.requester,
        hasUserId: !!userId
      });
      return false;
    }
    
    const userIdStr = this._normalizeUserId(userId);
    if (!userIdStr) {
      console.debug(`[ACTION VALIDATOR] _isRequester: Failed to normalize userId`, { userId });
      return false;
    }
    
    const requesterUserId = request.requester.userId;
    const requesterId = this._normalizeUserId(requesterUserId);
    
    if (!requesterId) {
      console.debug(`[ACTION VALIDATOR] _isRequester: Failed to normalize requesterUserId`, { 
        requesterUserId,
        requesterUserIdType: typeof requesterUserId,
        requesterUserIdIsObject: typeof requesterUserId === 'object'
      });
      return false;
    }
    
    const isMatch = requesterId === userIdStr;
    console.debug(`[ACTION VALIDATOR] _isRequester: Comparison result`, {
      userIdStr,
      requesterId,
      isMatch,
      requestId: request.Request_ID
    });
    
    return isMatch;
  }

  /**
   * Check if user is the reviewer
   * Handles both populated and non-populated userId fields
   * @private
   */
  _isReviewer(userId, request) {
    if (!request.reviewer || !userId) return false;
    
    const userIdStr = this._normalizeUserId(userId);
    if (!userIdStr) return false;
    
    const reviewerUserId = request.reviewer.userId;
    const reviewerId = this._normalizeUserId(reviewerUserId);
    
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
   * Normalize userId to string for comparison
   * Handles: string ObjectIds, ObjectId instances, populated ObjectIds, MongoDB Extended JSON format
   * 
   * Based on database structure: userId can be:
   * - String from JWT/token: "6954219d24e8d1a40a5b766a"
   * - ObjectId instance from Mongoose: ObjectId("6954219d24e8d1a40a5b766a")
   * - Populated ObjectId with _id property: { _id: ObjectId("...") }
   * - MongoDB Extended JSON: { "$oid": "6954219d24e8d1a40a5b766a" }
   * @private
   * @param {string|ObjectId|Object} userId - User ID in various formats
   * @param {number} depth - Recursion depth guard (prevents infinite loops)
   * @returns {string|null} Normalized userId as string, or null if invalid
   */
  _normalizeUserId(userId, depth = 0) {
    // Prevent infinite recursion
    if (depth > 5) {
      console.warn(`[ACTION VALIDATOR] _normalizeUserId recursion depth exceeded, returning null`);
      return null;
    }
    
    if (!userId && userId !== 0) return null;
    
    // Handle MongoDB Extended JSON format: { "$oid": "..." }
    if (typeof userId === 'object' && userId !== null && userId.$oid) {
      return String(userId.$oid);
    }
    
    // If it's already a string, validate and return
    if (typeof userId === 'string') {
      // Validate it looks like an ObjectId (24 hex chars)
      if (/^[a-f0-9]{24}$/i.test(userId.trim())) {
        return userId.trim();
      }
      return userId; // Return as-is even if not valid ObjectId format
    }
    
    // If it's not an object at this point, try to convert to string
    if (typeof userId !== 'object' || userId === null) {
      const str = String(userId);
      return /^[a-f0-9]{24}$/i.test(str) ? str : str;
    }
    
    // If it has _id property (populated ObjectId), recurse with depth guard
    // But check if _id is different from userId to avoid circular references
    if (userId._id && userId._id !== userId) {
      return this._normalizeUserId(userId._id, depth + 1);
    }
    
    // If it's an ObjectId instance, convert to string
    if (userId.toString && typeof userId.toString === 'function') {
      try {
        const str = userId.toString();
        // ObjectId.toString() returns the hex string directly
        if (/^[a-f0-9]{24}$/i.test(str)) {
          return str;
        }
      } catch (e) {
        // toString() failed, fall through to last resort
      }
    }
    
    // Last resort: try to convert to string
    try {
      const str = String(userId);
      return /^[a-f0-9]{24}$/i.test(str) ? str : str;
    } catch (e) {
      console.warn(`[ACTION VALIDATOR] Failed to normalize userId:`, e);
      return null;
    }
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

    // Ensure request is a plain object to avoid circular reference issues
    // If it's a Mongoose document, convert to plain object
    let requestObj = request;
    if (request && typeof request.toObject === 'function') {
      try {
        requestObj = request.toObject({ virtuals: false, getters: false });
      } catch (e) {
        // If toObject fails, try to work with the document directly
        requestObj = request;
      }
    }

    const currentState = requestObj.status || requestObj.Status;
    const normalizedState = RequestStateService.normalizeState(currentState);
    
    // Final states: only view (and delete for admins with permission)
    if (RequestStateService.isFinalState(normalizedState)) {
      // Check delete permission for admins
      try {
        // Normalize userId first to avoid issues
        const normalizedUserId = this._normalizeUserId(userId);
        if (!normalizedUserId) {
          return available; // Can't determine user, only view
        }
        const user = await User.findById(normalizedUserId).select('authority').lean();
        const userAuthority = user?.authority || 20;
        
        if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
          const locationId = this._extractLocationId(requestObj, context);
          let canDelete = false;
          
          if (locationId) {
            canDelete = await permissionService.checkPermission(
              normalizedUserId,
              'request',
              'delete',
              { locationId }
            );
          }
          
          if (!canDelete) {
            canDelete = await permissionService.checkPermission(
              normalizedUserId,
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
    
    // Get active responder - use requestObj to avoid circular references
    const activeResponder = RequestStateService.getActiveResponder(requestObj);
    
    // If no active responder, only view
    if (!activeResponder || !activeResponder.userId) {
      return available;
    }
    
    // Check if user is the active responder
    // CRITICAL: Normalize both userIds to strings for reliable comparison
    // userId comes from JWT/token (string), activeResponder.userId is ObjectId from DB
    let userIdStr;
    let responderId;
    
    try {
      userIdStr = this._normalizeUserId(userId);
      const responderUserId = activeResponder.userId;
      responderId = this._normalizeUserId(responderUserId);
    } catch (error) {
      console.error(`[ACTION VALIDATOR] Error normalizing userIds: ${error.message}`, {
        error: error.stack,
        originalUserId: userId,
        responderUserId: activeResponder.userId
      });
      return available; // Only view on error
    }

    if (!userIdStr || !responderId) {
      console.warn(`[ACTION VALIDATOR] Missing userId or responderId`, {
        originalUserId: userId,
        normalizedUserId: userIdStr,
        originalResponderUserId: activeResponder.userId,
        normalizedResponderId: responderId,
        activeResponder,
        requestId: requestObj.Request_ID
      });
      return available; // Only view
    }

    // Now both are strings, comparison is reliable
    let isActiveResponder = userIdStr === responderId;

    // Special case: For coordinator-to-admin requests, handle Admin actions
    // Core principle: activeResponder.relationship === 'reviewer' means "ANY Admin can respond"
    // not "only the assigned reviewer can respond"
    if (!isActiveResponder && requestObj.reviewer?.assignmentRule === 'coordinator-to-admin') {
      console.log(`[ACTION VALIDATOR] Entering coordinator-to-admin special case`, {
        userId: userIdStr,
        requestId: requestObj.Request_ID,
        assignmentRule: requestObj.reviewer?.assignmentRule,
        normalizedState,
        currentIsActiveResponder: isActiveResponder,
        activeResponder: activeResponder ? {
          userId: activeResponder.userId?.toString(),
          relationship: activeResponder.relationship
        } : null
      });
      
      const user = await User.findById(userIdStr).select('authority').lean();
      const userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
      
      console.log(`[ACTION VALIDATOR] User authority check`, {
        userId: userIdStr,
        userAuthority,
        isAdmin: userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN,
        threshold: AUTHORITY_TIERS.OPERATIONAL_ADMIN
      });
      
      if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
          // PENDING_REVIEW: Any Admin can act as reviewer
          console.log(`[ACTION VALIDATOR] User is admin reviewing coordinator-to-admin request (PENDING_REVIEW)`, {
            userId: userIdStr,
            userAuthority,
            requestId: requestObj.Request_ID,
            assignmentRule: requestObj.reviewer.assignmentRule,
            state: normalizedState
          });
          isActiveResponder = true; // Treat admin as active responder
        } else if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
          // REVIEW_RESCHEDULED: Simplified logic for reschedule loop
          // Extract lastActorId with proper ObjectId handling
          let lastActorId = null;
          if (requestObj.lastAction?.actorId) {
            // Handle both ObjectId objects and string IDs
            if (typeof requestObj.lastAction.actorId === 'object' && requestObj.lastAction.actorId.toString) {
              lastActorId = requestObj.lastAction.actorId.toString();
            } else if (typeof requestObj.lastAction.actorId === 'string') {
              lastActorId = requestObj.lastAction.actorId;
            } else if (requestObj.lastAction.actorId._id) {
              lastActorId = requestObj.lastAction.actorId._id.toString();
            }
          }
          
          const activeResponderRelationship = activeResponder?.relationship || null;
          const requesterId = requestObj.requester?.userId?.toString() || null;
          
          console.log(`[ACTION VALIDATOR] REVIEW_RESCHEDULED state analysis`, {
            userId: userIdStr,
            userAuthority,
            requestId: requestObj.Request_ID,
            lastActorId,
            lastActionExists: !!requestObj.lastAction,
            lastActionActorIdType: requestObj.lastAction?.actorId ? typeof requestObj.lastAction.actorId : 'null',
            activeResponderRelationship,
            activeResponderUserId: activeResponder?.userId?.toString(),
            requesterId,
            conditionCheck: {
              isReviewerRelationship: activeResponderRelationship === 'reviewer',
              lastActorIdNotEqualToUserId: lastActorId !== userIdStr,
              willSetActiveResponder: activeResponderRelationship === 'reviewer' && lastActorId !== userIdStr
            }
          });
          
          // If activeResponder.relationship === 'reviewer', ANY Admin can respond
          // UNLESS this Admin was the one who rescheduled (then they're View only)
          if (activeResponderRelationship === 'reviewer') {
            // Admin can respond UNLESS they rescheduled last
            if (lastActorId && lastActorId !== userIdStr) {
              console.log(`[ACTION VALIDATOR] ✅ Admin can respond (activeResponder.relationship === 'reviewer' and Admin did NOT reschedule last)`, {
                userId: userIdStr,
                userAuthority,
                requestId: requestObj.Request_ID,
                lastActorId,
                activeResponderRelationship,
                activeResponderUserId: activeResponder?.userId?.toString(),
                condition: `lastActorId (${lastActorId}) !== userIdStr (${userIdStr})`
              });
              isActiveResponder = true;
            } else if (lastActorId === userIdStr) {
              // Admin rescheduled last, they remain View only (requester is active responder)
              console.log(`[ACTION VALIDATOR] ❌ Admin rescheduled last, they are View only (requester is active responder)`, {
                userId: userIdStr,
                userAuthority,
                requestId: requestObj.Request_ID,
                lastActorId,
                activeResponderRelationship,
                condition: `lastActorId (${lastActorId}) === userIdStr (${userIdStr})`
              });
            } else {
              // lastActorId is null or undefined - log warning
              console.warn(`[ACTION VALIDATOR] ⚠️ lastActorId is null/undefined, cannot determine if Admin rescheduled`, {
                userId: userIdStr,
                requestId: requestObj.Request_ID,
                lastAction: requestObj.lastAction,
                activeResponderRelationship
              });
            }
          } else {
            console.log(`[ACTION VALIDATOR] Active responder relationship is not 'reviewer'`, {
              userId: userIdStr,
              requestId: requestObj.Request_ID,
              activeResponderRelationship,
              expected: 'reviewer'
            });
          }
          // If activeResponder.relationship === 'requester', only requester can respond
          // (This is handled by the initial userIdStr === responderId check above)
        }
      } else {
        console.log(`[ACTION VALIDATOR] User is not Admin (authority < ${AUTHORITY_TIERS.OPERATIONAL_ADMIN})`, {
          userId: userIdStr,
          userAuthority,
          threshold: AUTHORITY_TIERS.OPERATIONAL_ADMIN
        });
      }
      
      console.log(`[ACTION VALIDATOR] Exiting coordinator-to-admin special case`, {
        userId: userIdStr,
        requestId: requestObj.Request_ID,
        finalIsActiveResponder: isActiveResponder
      });
    }

    if (!isActiveResponder) {
      console.debug(`[ACTION VALIDATOR] User is not active responder`, {
        userId: userIdStr,
        responderId,
        requestId: requestObj.Request_ID,
        activeResponderRelationship: activeResponder.relationship
      });
      return available; // Only view
    }

    console.debug(`[ACTION VALIDATOR] User IS active responder`, {
      userId: userIdStr,
      responderId,
      requestId: requestObj.Request_ID,
      relationship: activeResponder.relationship
    });
    
    // User IS active responder - get their authority
    // Use normalized userIdStr for the query to avoid issues
    // Note: We may have already fetched user above for coordinator-to-admin check, but fetch again for consistency
    let user = await User.findById(userIdStr).select('authority').lean();
    if (!user) {
      // If user not found (shouldn't happen), try to get from cache or return view only
      console.warn(`[ACTION VALIDATOR] User not found: ${userIdStr}`);
      return available; // Only view
    }
    const userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
    
    // Get base actions for current state
    const baseActions = RequestStateService.getAvailableActions(normalizedState);
    
    console.log(`[ACTION VALIDATOR] Computing actions for active responder`, {
      userId: userIdStr,
      requestId: requestObj.Request_ID,
      normalizedState,
      userAuthority,
      baseActions,
      isActiveResponder: true
    });
    
    // Map actions based on authority (accept/reject vs confirm/decline)
    const mappedActions = this._mapActionsByAuthority(userAuthority, baseActions);
    
    console.log(`[ACTION VALIDATOR] Mapped actions by authority`, {
      userId: userIdStr,
      requestId: requestObj.Request_ID,
      mappedActions,
      userAuthority
    });
    
    // Check permissions for each action and add if valid
    for (const action of mappedActions) {
      if (action === REQUEST_ACTIONS.VIEW) continue; // Already added
      
      const validation = await this.validateAction(userId, action, request, context);
      console.log(`[ACTION VALIDATOR] Action validation result`, {
        userId: userIdStr,
        requestId: requestObj.Request_ID,
        action,
        valid: validation.valid,
        reason: validation.reason || 'N/A'
      });
      if (validation.valid) {
        available.push(action);
      }
    }
    
    console.log(`[ACTION VALIDATOR] Final available actions`, {
      userId: userIdStr,
      requestId: requestObj.Request_ID,
      availableActions: available,
      availableActionsCount: available.length
    });
    
    // Special handling for pending-review: requester can cancel and edit
    if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
      const isRequester = this._isRequester(userIdStr, requestObj);
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
      const isRequester = this._isRequester(userIdStr, requestObj);
      const isReviewer = this._isReviewer(userIdStr, requestObj);
      
      if (isRequester || isReviewer) {
        const locationId = this._extractLocationId(requestObj, context);
        
        // Edit action
        let canEditEvent = false;
        if (locationId) {
          canEditEvent = await permissionService.checkPermission(
            userIdStr,
            'event',
            'update',
            { locationId }
          );
        }
        if (!canEditEvent) {
          canEditEvent = await permissionService.checkPermission(
            userIdStr,
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
            userIdStr,
            'event',
            'manage-staff',
            { locationId }
          );
        }
        if (!canManageStaff) {
          canManageStaff = await permissionService.checkPermission(
            userIdStr,
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
    
    console.log(`[ACTION VALIDATOR] Returning available actions`, {
      userId: userIdStr,
      requestId: requestObj.Request_ID || requestObj.RequestId || requestObj._id,
      availableActions: available,
      availableActionsCount: available.length,
      isActiveResponder: true
    });
    
    return available;
  }
}

module.exports = new ActionValidatorService();

