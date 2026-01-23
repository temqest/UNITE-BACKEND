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
      // Special case: In APPROVED state, requesters with permission can reschedule/edit their own events
      // This allows coordinators to reschedule/edit their own approved events
      if (isRequester && normalizedState !== REQUEST_STATES.REVIEW_RESCHEDULED) {
        // In non-reschedule states, requesters cannot review their own requests
        // BUT: Allow RESCHEDULE and EDIT in APPROVED state (coordinators can reschedule/edit their own approved events)
        const blockedActions = [REQUEST_ACTIONS.ACCEPT, REQUEST_ACTIONS.REJECT];
        // Only block RESCHEDULE and EDIT if NOT in APPROVED state
        if (normalizedState !== REQUEST_STATES.APPROVED) {
          blockedActions.push(REQUEST_ACTIONS.RESCHEDULE, REQUEST_ACTIONS.EDIT);
        }
        
        if (blockedActions.includes(action)) {
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
        
        // 1. PENDING_REVIEW state: Coordinators use accept/reject, NOT confirm
        // Stakeholders cannot confirm in this state - they use decline action instead
        if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
          return {
            valid: false,
            reason: 'Confirm action is not available in pending-review state. Coordinators use accept/reject, Stakeholders use decline.'
          };
        }
        // 2. REVIEW_RESCHEDULED state: Stakeholder can confirm reschedule proposals from Coordinator/Admin
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
        // 3. APPROVED state: Confirm is NOT allowed (event already approved and created)
        // Stakeholders can only edit/reschedule approved events
        else if (normalizedState === REQUEST_STATES.APPROVED) {
          return {
            valid: false,
            reason: 'Confirm action is not allowed for approved requests. The event has already been approved and created.'
          };
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
      return false;
    }
    
    const userIdStr = this._normalizeUserId(userId);
    if (!userIdStr) {
      return false;
    }
    
    const requesterUserId = request.requester.userId;
    const requesterId = this._normalizeUserId(requesterUserId);
    
    if (!requesterId) {
      return false;
    }
    
    return requesterId === userIdStr;
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
        // Still check authority hierarchy, but explicit assignment allows review
        const authorityCheck = await this._checkAuthorityHierarchy(userId, request);
        if (authorityCheck.valid) {
          return true;
        } else {
          // For explicit assignments, we're more lenient - allow if user has reasonable authority
          const actor = await User.findById(userId).select('authority').lean();
          const requesterAuthority = request.requester?.authoritySnapshot || AUTHORITY_TIERS.BASIC_USER;
          if (actor && actor.authority >= AUTHORITY_TIERS.STAKEHOLDER) {
            // Explicit assignment allows review even if authority hierarchy doesn't match
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
    
    // Normalize userId early - needed for both APPROVED state check and active responder check
    let userIdStr;
    try {
      userIdStr = this._normalizeUserId(userId);
    } catch (error) {
      console.error(`[ACTION VALIDATOR] Error normalizing userId: ${error.message}`);
      return available; // Only view on error
    }
    
    if (!userIdStr) {
      return available; // Only view
    }
    
    // Special handling for APPROVED state: requester/reviewer/admins can still act even without active responder
    // APPROVED requests don't have an active responder in the traditional sense, but requester/reviewer should still be able to edit/manage
    let isRequester = false;
    let isReviewer = false;
    let userAuthority = AUTHORITY_TIERS.BASIC_USER;
    
    if (normalizedState === REQUEST_STATES.APPROVED) {
      try {
        isRequester = this._isRequester(userIdStr, requestObj);
        isReviewer = this._isReviewer(userIdStr, requestObj);
        
        // Get user authority for admin check
        const User = require('../../models/index').User;
        const user = await User.findById(userIdStr).select('authority').lean();
        userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
        
        // For APPROVED state, if user is requester, reviewer, or admin, allow them to proceed
        // even without an active responder
        if (isRequester || isReviewer || userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
          // Continue to action computation below - don't return early
        } else {
          // Not requester, reviewer, or admin - only view
          return available;
        }
      } catch (error) {
        console.error(`[ACTION VALIDATOR] Error checking requester/reviewer for APPROVED state: ${error.message}`);
        // Fall through to active responder check
      }
    }
    
    // If no active responder and not APPROVED state (or not requester/reviewer/admin), only view
    if (!activeResponder || !activeResponder.userId) {
      // Only return early if not APPROVED state (APPROVED was handled above)
      if (normalizedState !== REQUEST_STATES.APPROVED) {
        return available;
      }
      // For APPROVED, we already checked requester/reviewer/admin above, so continue
    }
    
    // Check if user is the active responder
    // CRITICAL: Normalize both userIds to strings for reliable comparison
    // userId comes from JWT/token (string), activeResponder.userId is ObjectId from DB
    let responderId;
    
    // For APPROVED state without active responder, we've already checked requester/reviewer/admin above
    // Skip active responder check if we're in APPROVED state and already determined user can proceed
    if (normalizedState === REQUEST_STATES.APPROVED && (!activeResponder || !activeResponder.userId)) {
      // We've already validated the user can proceed (requester/reviewer/admin check above)
      // Skip to action computation
      responderId = null; // No active responder for APPROVED
    } else {
      // Normal state: check active responder
      try {
        if (activeResponder && activeResponder.userId) {
          const responderUserId = activeResponder.userId;
          responderId = this._normalizeUserId(responderUserId);
        }
      } catch (error) {
        console.error(`[ACTION VALIDATOR] Error normalizing responder userId: ${error.message}`, {
          error: error.stack,
          originalUserId: userId,
          responderUserId: activeResponder?.userId
        });
        // For APPROVED state, continue even if responder normalization fails
        if (normalizedState !== REQUEST_STATES.APPROVED) {
          return available; // Only view on error
        }
      }

      if (!userIdStr || (!responderId && normalizedState !== REQUEST_STATES.APPROVED)) {
        // For APPROVED state, we've already validated user can proceed, so continue
        if (normalizedState !== REQUEST_STATES.APPROVED) {
          return available; // Only view
        }
      }
    }

    // Now both are strings, comparison is reliable
    // For APPROVED state without active responder, we've already validated user can proceed
    let isActiveResponder = false;
    if (normalizedState === REQUEST_STATES.APPROVED && (!activeResponder || !activeResponder.userId)) {
      // For APPROVED state, if we got here, user is requester/reviewer/admin (validated above)
      isActiveResponder = true; // Treat as active responder to allow action computation
    } else if (responderId) {
      isActiveResponder = userIdStr === responderId;
    }

    // Special case: For coordinator-to-admin requests, handle Admin actions
    // Core principle: activeResponder.relationship === 'reviewer' means "ANY Admin can respond"
    // not "only the assigned reviewer can respond"
    // Skip this check for APPROVED state (already handled above)
    if (!isActiveResponder && normalizedState !== REQUEST_STATES.APPROVED && requestObj.reviewer?.assignmentRule === 'coordinator-to-admin' && activeResponder) {
      const user = await User.findById(userIdStr).select('authority').lean();
      const userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
      
      if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
        if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
          // PENDING_REVIEW: Any Admin can act as reviewer
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
          
          // If activeResponder.relationship === 'reviewer', ANY Admin can respond
          // UNLESS this Admin was the one who rescheduled (then they're View only)
          if (activeResponderRelationship === 'reviewer') {
            // Admin can respond UNLESS they rescheduled last
            if (lastActorId && lastActorId !== userIdStr) {
              isActiveResponder = true;
            }
            // If lastActorId is null/undefined, log warning but don't block
            if (!lastActorId) {
              console.warn(`[ACTION VALIDATOR] lastActorId is null/undefined for request ${requestObj.Request_ID}`);
            }
          }
        }
      }
    }

    // Secondary reviewer: Admin can act on Stakeholder → Coordinator requests
    // Admins (authority >= 80) are allowed as secondary reviewers for S→C requests only
    if (!isActiveResponder && normalizedState !== REQUEST_STATES.APPROVED) {
      // Check if this is a Stakeholder → Coordinator request
      const isStakeholderToCoordinator = 
        requestObj.reviewer?.assignmentRule === 'stakeholder-to-coordinator' ||
        (requestObj.initiatorRole === 'Stakeholder' && requestObj.reviewerRole === 'Coordinator') ||
        (requestObj.requester?.role === 'Stakeholder' && requestObj.reviewer?.role === 'Coordinator');
      
      if (isStakeholderToCoordinator && activeResponder && activeResponder.relationship === 'reviewer') {
        // Get user authority if not already fetched
        let userAuthority;
        try {
          const user = await User.findById(userIdStr).select('authority').lean();
          userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
        } catch (error) {
          console.error(`[ACTION VALIDATOR] Error getting user authority for secondary reviewer check: ${error.message}`);
          userAuthority = AUTHORITY_TIERS.BASIC_USER;
        }
        
        // Admins (authority >= 80) can act as secondary reviewers
        if (userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN) {
          // For PENDING_REVIEW: Admin can approve/reject/reschedule
          if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
            isActiveResponder = true;
            console.log(`[ACTION VALIDATOR] Admin (${userIdStr}, authority ${userAuthority}) allowed as secondary reviewer for S→C request ${requestObj.Request_ID}`);
          }
          // For REVIEW_RESCHEDULED: Admin can participate in reschedule negotiation
          else if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
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
            
            // Admin can respond unless they rescheduled last
            if (!lastActorId || lastActorId !== userIdStr) {
              isActiveResponder = true;
              console.log(`[ACTION VALIDATOR] Admin (${userIdStr}, authority ${userAuthority}) allowed as secondary reviewer for S→C reschedule ${requestObj.Request_ID}`);
            }
          }
        }
      }
    }

    // For APPROVED state, allow requester/reviewer/admin to proceed even if not active responder
    // (APPROVED requests don't have an active responder, but requester/reviewer should still be able to edit/manage)
    // For APPROVED state, isActiveResponder is already set to true above if user is requester/reviewer/admin
    let shouldProceed = isActiveResponder;
    
    if (!shouldProceed) {
      return available; // Only view
    }
    
    // Get user authority if not already fetched (for APPROVED state we may have already fetched it)
    if (!userAuthority || userAuthority === AUTHORITY_TIERS.BASIC_USER) {
      // User IS active responder - get their authority
      // Use normalized userIdStr for the query to avoid issues
      // Note: We may have already fetched user above for coordinator-to-admin check, but fetch again for consistency
      const user = await User.findById(userIdStr).select('authority').lean();
      if (!user) {
        // If user not found (shouldn't happen), return view only
        return available; // Only view
      }
      userAuthority = user?.authority || AUTHORITY_TIERS.BASIC_USER;
    }
    
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
    
    // Special handling for approved state: requester/reviewer/admin/coordinator can edit, manage-staff, reschedule, cancel
    if (normalizedState === REQUEST_STATES.APPROVED) {
      // Re-check isRequester/isReviewer if not already set (for cases where we bypassed active responder check)
      if (typeof isRequester === 'undefined' || typeof isReviewer === 'undefined') {
        isRequester = this._isRequester(userIdStr, requestObj);
        isReviewer = this._isReviewer(userIdStr, requestObj);
      }
      
      const locationId = this._extractLocationId(requestObj, context);
      const isCoordinator = userAuthority >= AUTHORITY_TIERS.COORDINATOR && userAuthority < AUTHORITY_TIERS.OPERATIONAL_ADMIN;
      
      // Check permissions first to determine eligibility (permission-based, not role-hardcoded)
      let hasReschedulePermission = false;
      let hasEditPermission = false;
      let hasManageStaffPermission = false;
      let hasCancelPermission = false;
      
      // Check permissions with location context first
      if (locationId) {
        hasReschedulePermission = await permissionService.checkPermission(userIdStr, 'request', 'reschedule', { locationId });
        hasEditPermission = await permissionService.checkPermission(userIdStr, 'event', 'update', { locationId });
        hasManageStaffPermission = await permissionService.checkPermission(userIdStr, 'event', 'manage-staff', { locationId });
        hasCancelPermission = await permissionService.checkPermission(userIdStr, 'request', 'cancel', { locationId });
      }
      
      // Fallback to system-level permissions
      if (!hasReschedulePermission) {
        hasReschedulePermission = await permissionService.checkPermission(userIdStr, 'request', 'reschedule', {});
      }
      if (!hasEditPermission) {
        hasEditPermission = await permissionService.checkPermission(userIdStr, 'event', 'update', {});
      }
      if (!hasManageStaffPermission) {
        hasManageStaffPermission = await permissionService.checkPermission(userIdStr, 'event', 'manage-staff', {});
      }
      if (!hasCancelPermission) {
        hasCancelPermission = await permissionService.checkPermission(userIdStr, 'request', 'cancel', {});
      }
      
      // Determine if user should have access to approved event actions
      // Allow if: requester, reviewer, admin, OR coordinator with any of the required permissions
      const shouldHaveAccess = isRequester || 
                              isReviewer || 
                              userAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN ||
                              (isCoordinator && 
                               (hasReschedulePermission || hasEditPermission || hasManageStaffPermission || hasCancelPermission));
      
      if (shouldHaveAccess) {
        // Add actions based on permissions (not role)
        if (hasEditPermission) {
          available.push(REQUEST_ACTIONS.EDIT);
        }
        
        if (hasManageStaffPermission) {
          available.push('manage-staff');
        }
        
        // Reschedule: check both permission AND validateAction
        if (hasReschedulePermission) {
          const rescheduleValidation = await this.validateAction(userId, REQUEST_ACTIONS.RESCHEDULE, request, context);
          if (rescheduleValidation.valid) {
            available.push(REQUEST_ACTIONS.RESCHEDULE);
          }
        }
        
        // Cancel: check both permission AND validateAction
        if (hasCancelPermission) {
          const cancelValidation = await this.validateAction(userId, REQUEST_ACTIONS.CANCEL, request, context);
          if (cancelValidation.valid) {
            available.push(REQUEST_ACTIONS.CANCEL);
          }
        }
      }
    }
    
    return available;
  }
}

module.exports = new ActionValidatorService();

