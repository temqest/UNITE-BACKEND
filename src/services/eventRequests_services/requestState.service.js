/**
 * Request State Service
 * 
 * Manages state transitions for event requests with clean, predictable flow
 */

const { REQUEST_STATES, REQUEST_ACTIONS, AUTHORITY_TIERS } = require('../../utils/eventRequests/requestConstants');
const PermissionBasedRescheduleService = require('./permissionBasedReschedule.service');

/**
 * Utility: Check if user is Admin or System Admin by role or StaffType
 */
function isAdminUser(user) {
  return (
    user.role === 'Admin' ||
    user.role === 'System Admin' ||
    user.StaffType === 80 ||
    user.StaffType === 100
  );
}

/**
 * Utility: Check if user can review this request (primary or secondary logic)
 * Admins can act as secondary reviewers ONLY for Stakeholder -> Coordinator requests
 */
function canUserReviewRequest({ request, user }) {
  if (!request || !user) return false;
  const { initiatorRole, reviewerRole } = request;
  
  // Coordinator is always primary reviewer
  if (user.role === reviewerRole) return true;
  
  // Admins (role 80/100) can act as secondary reviewer ONLY for Stakeholder -> Coordinator
  if (
    initiatorRole === 'Stakeholder' &&
    reviewerRole === 'Coordinator' &&
    isAdminUser(user)
  ) {
    return true;
  }
  return false;
}

class RequestStateService {
  /**
   * State transition rules
   * Maps current state + action → new state
   */
  static TRANSITIONS = {
    [REQUEST_STATES.PENDING_REVIEW]: {
      [REQUEST_ACTIONS.ACCEPT]: REQUEST_STATES.APPROVED, // Coordinator/Admin accept
      [REQUEST_ACTIONS.REJECT]: REQUEST_STATES.REJECTED, // Coordinator/Admin reject
      [REQUEST_ACTIONS.DECLINE]: REQUEST_STATES.REJECTED, // Stakeholder decline (equivalent to reject)
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED // Request reschedule
    },
    [REQUEST_STATES.REVIEW_RESCHEDULED]: {
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED, // Stakeholder confirm → auto-publish on confirm
      [REQUEST_ACTIONS.ACCEPT]: REQUEST_STATES.APPROVED, // Coordinator/Admin accept → directly approved and published
      [REQUEST_ACTIONS.REJECT]: REQUEST_STATES.REJECTED, // Coordinator/Admin reject → directly to rejected
      [REQUEST_ACTIONS.DECLINE]: REQUEST_STATES.REJECTED, // Stakeholder decline → directly to rejected
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED // Loop allowed (both parties can counter-reschedule)
    },
    [REQUEST_STATES.APPROVED]: {
      [REQUEST_ACTIONS.CANCEL]: REQUEST_STATES.CANCELLED,
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED, // Allow rescheduling approved events
      [REQUEST_ACTIONS.EDIT]: REQUEST_STATES.APPROVED, // Edit event details (stays approved)
      [REQUEST_ACTIONS.MANAGE_STAFF]: REQUEST_STATES.APPROVED // Manage event staff (stays approved)
      // Note: No CONFIRM action in APPROVED - event is already approved and created
    },
    [REQUEST_STATES.REJECTED]: {
      // No transitions from rejected (final state)
    },
    [REQUEST_STATES.CANCELLED]: {
      // No transitions from cancelled (final state)
    },
    [REQUEST_STATES.COMPLETED]: {
      // Final state, no transitions
    },
    // Legacy intermediate states (backward compatibility only)
    [REQUEST_STATES.REVIEW_ACCEPTED]: {
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED // Finalize acceptance
    },
    [REQUEST_STATES.REVIEW_REJECTED]: {
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.REJECTED, // Finalize rejection
      [REQUEST_ACTIONS.DECLINE]: REQUEST_STATES.REJECTED // Alternative way to finalize
    }
  };

  /**
   * Check if a state transition is valid
   * @param {string} currentState - Current request state
   * @param {string} action - Action to perform
   * @returns {boolean} True if transition is valid
   */
  static isValidTransition(currentState, action) {
    const normalizedState = this.normalizeState(currentState);
    const transitions = this.TRANSITIONS[normalizedState];
    
    if (!transitions) {
      return false;
    }
    
    return transitions.hasOwnProperty(action);
  }

  /**
   * Get the next state for a transition
   * @param {string} currentState - Current request state
   * @param {string} action - Action to perform
   * @returns {string|null} Next state or null if invalid
   */
  static getNextState(currentState, action) {
    const normalizedState = this.normalizeState(currentState);
    const transitions = this.TRANSITIONS[normalizedState];
    
    if (!transitions || !transitions[action]) {
      return null;
    }
    
    return transitions[action];
  }

  /**
   * Normalize state name (handle legacy states)
   * @param {string} state - State to normalize
   * @returns {string} Normalized state
   */
  static normalizeState(state) {
    if (!state) return REQUEST_STATES.PENDING_REVIEW;
    
    const normalized = String(state).toLowerCase().trim();
    
    // Map legacy states to new states
    // IMPORTANT: 'review-rejected' (with hyphen) is the intermediate state REVIEW_REJECTED
    // 'review_rejected' (with underscore) is a legacy final state that maps to REJECTED
    const legacyMap = {
      'pending': REQUEST_STATES.PENDING_REVIEW,
      'pending_admin_review': REQUEST_STATES.PENDING_REVIEW,
      'pending_coordinator_review': REQUEST_STATES.PENDING_REVIEW,
      'pending_stakeholder_review': REQUEST_STATES.PENDING_REVIEW,
      'accepted_by_admin': REQUEST_STATES.APPROVED,
      'review_accepted': REQUEST_STATES.APPROVED,
      'rejected_by_admin': REQUEST_STATES.REJECTED,
      'review_rejected': REQUEST_STATES.REJECTED, // Legacy final rejection state (underscore)
      'rescheduled_by_admin': REQUEST_STATES.REVIEW_RESCHEDULED,
      'rescheduled_by_coordinator': REQUEST_STATES.REVIEW_RESCHEDULED,
      'review_rescheduled': REQUEST_STATES.REVIEW_RESCHEDULED,
      'completed': REQUEST_STATES.COMPLETED,
      'cancelled': REQUEST_STATES.CANCELLED
    };
    
    if (legacyMap[normalized]) {
      return legacyMap[normalized];
    }
    
    // Check if it's already a valid new state
    if (Object.values(REQUEST_STATES).includes(normalized)) {
      return normalized;
    }
    
    // Default to pending-review
    return REQUEST_STATES.PENDING_REVIEW;
  }

  /**
   * Get available actions for a state
   * @param {string} state - Current state
   * @returns {string[]} Array of available actions
   */
  static getAvailableActions(state) {
    const normalizedState = this.normalizeState(state);
    const transitions = this.TRANSITIONS[normalizedState];
    
    if (!transitions) {
      return [REQUEST_ACTIONS.VIEW];
    }
    
    return Object.keys(transitions);
  }

  /**
   * Check if state is final (no more transitions possible)
   * @param {string} state - State to check
   * @returns {boolean} True if state is final
   */
  static isFinalState(state) {
    const normalizedState = this.normalizeState(state);
    return [
      REQUEST_STATES.COMPLETED,
      REQUEST_STATES.REJECTED,
      REQUEST_STATES.CANCELLED
    ].includes(normalizedState);
  }

  /**
   * Check if state allows editing
   * @param {string} state - State to check
   * @returns {boolean} True if editing is allowed
   */
  static canEdit(state) {
    const normalizedState = this.normalizeState(state);
    return normalizedState === REQUEST_STATES.PENDING_REVIEW;
  }

  /**
   * Check if state allows cancellation
   * @param {string} state - State to check
   * @returns {boolean} True if cancellation is allowed
   */
  static canCancel(state) {
    const normalizedState = this.normalizeState(state);
    return [
      REQUEST_STATES.PENDING_REVIEW,
      REQUEST_STATES.APPROVED
    ].includes(normalizedState);
  }

  /**
   * Get the active responder for a request
   * Determines who should respond based on state and last action
   * @param {Object} request - Request document
   * @returns {Object|null} { userId, relationship, authority } or null if final state
   */
  static getActiveResponder(request) {
    const normalizedState = this.normalizeState(request.status || request.Status);
    
    // Final states have no active responder
    if (this.isFinalState(normalizedState)) {
      return null;
    }

    // If activeResponder is already set, use it (but normalize userId)
    // NOTE: Keep as ObjectId here - conversion to string happens in actionValidator
    // This ensures consistency with database structure
    if (request.activeResponder && request.activeResponder.userId) {
      // Normalize userId - handle both populated and non-populated ObjectId
      // Extract the actual ObjectId (not string) for consistency
      let normalizedUserId = request.activeResponder.userId;
      
      // If it's a populated ObjectId with _id property, use that
      if (normalizedUserId._id) {
        normalizedUserId = normalizedUserId._id;
      }
      
      // Return ObjectId instance (not string) - actionValidator will normalize to string for comparison
      return {
        userId: normalizedUserId, // Keep as ObjectId
        relationship: request.activeResponder.relationship,
        authority: request.activeResponder.authority
      };
    }

    // Determine active responder based on state
    if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
      // Initial state: reviewer is active responder
      if (request.reviewer && request.reviewer.userId) {
        // Handle both populated and non-populated cases
        const reviewerUserId = request.reviewer.userId._id || request.reviewer.userId;
        return {
          userId: reviewerUserId,
          relationship: 'reviewer',
          authority: request.reviewer.authoritySnapshot || null
        };
      }
      return null; // No reviewer assigned
    }

    if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
      // Reschedule negotiation: receiver is active responder
      // Receiver is the one who did NOT initiate the reschedule
      const requesterId = request.requester?.userId?.toString();
      const reviewerId = request.reviewer?.userId?.toString();
      
      // Check for third-party reschedule (neither requester nor assigned reviewer)
      // Permission-based approach: If an Admin (authority >= 80) or any user with review
      // permissions rescheduled, requester becomes active responder
      if (request.reviewer?.assignmentRule === 'coordinator-to-admin') {
        let proposerId = null;
        let proposerAuthority = null;
        
        // Get proposer from lastAction or rescheduleProposal
        if (request.lastAction && request.lastAction.actorId) {
          proposerId = request.lastAction.actorId.toString();
        } else if (request.rescheduleProposal && request.rescheduleProposal.proposedBy) {
          proposerId = request.rescheduleProposal.proposedBy.userId?.toString();
          proposerAuthority = request.rescheduleProposal.proposedBy.authoritySnapshot;
        }
        
        // If proposer has admin-level authority (>= 80) and is not the requester or assigned reviewer
        // Route to requester (permission-based: admin has request.review, requester has request.create)
        if (proposerId && proposerAuthority >= AUTHORITY_TIERS.OPERATIONAL_ADMIN && 
            proposerId !== requesterId && proposerId !== reviewerId) {
          // Admin rescheduled, requester becomes active responder
          if (requesterId && request.requester && request.requester.userId) {
            const requesterUserId = request.requester.userId._id || request.requester.userId;
            return {
              userId: requesterUserId,
              relationship: 'requester',
              authority: request.requester.authoritySnapshot || null
            };
          }
        }
      }
      
      // Standard logic: determine from lastAction
      if (request.lastAction && request.lastAction.actorId) {
        const lastActorId = request.lastAction.actorId.toString();

        // If last actor was requester, reviewer is now active responder
        if (lastActorId === requesterId && reviewerId) {
          const reviewerUserId = request.reviewer.userId._id || request.reviewer.userId;
          return {
            userId: reviewerUserId,
            relationship: 'reviewer',
            authority: request.reviewer.authoritySnapshot || null
          };
        }
        // If last actor was reviewer, requester is now active responder
        if (lastActorId === reviewerId && requesterId) {
          const requesterUserId = request.requester.userId._id || request.requester.userId;
          return {
            userId: requesterUserId,
            relationship: 'requester',
            authority: request.requester.authoritySnapshot || null
          };
        }
        
        // Handle third-party reschedule (actor is neither requester nor assigned reviewer)
        // Permission-based logic: If actor has coordinator/admin authority (review permissions),
        // route back to the original requester
        if (lastActorId !== requesterId && lastActorId !== reviewerId) {
          // Check if last actor has review-level authority (coordinator >= 60, admin >= 80)
          // This is a proxy for having request.review or request.approve permissions
          if (request.rescheduleProposal?.proposedBy) {
            const proposerAuthority = request.rescheduleProposal.proposedBy.authoritySnapshot;
            const proposerId = request.rescheduleProposal.proposedBy.userId?.toString();
            
            // If last actor has review-level authority and matches proposer, route to requester
            if (proposerId === lastActorId && proposerAuthority >= AUTHORITY_TIERS.COORDINATOR) {
              // Reviewer (coordinator or admin) rescheduled, requester responds next
              if (requesterId && request.requester && request.requester.userId) {
                const requesterUserId = request.requester.userId._id || request.requester.userId;
                return {
                  userId: requesterUserId,
                  relationship: 'requester',
                  authority: request.requester.authoritySnapshot || null
                };
              }
            }
          }
        }
      }

      // Fallback: if rescheduleProposal exists, receiver is the other party
      if (request.rescheduleProposal && request.rescheduleProposal.proposedBy) {
        const proposerId = request.rescheduleProposal.proposedBy.userId?.toString();
        const proposerAuthority = request.rescheduleProposal.proposedBy.authoritySnapshot;

        // If requester proposed, reviewer is receiver
        if (proposerId === requesterId && reviewerId) {
          const reviewerUserId = request.reviewer.userId._id || request.reviewer.userId;
          return {
            userId: reviewerUserId,
            relationship: 'reviewer',
            authority: request.reviewer.authoritySnapshot || null
          };
        }
        // If reviewer proposed, requester is receiver
        if (proposerId === reviewerId && requesterId) {
          const requesterUserId = request.requester.userId._id || request.requester.userId;
          return {
            userId: requesterUserId,
            relationship: 'requester',
            authority: request.requester.authoritySnapshot || null
          };
        }
        
        // Handle third-party reschedule (neither requester nor assigned reviewer)
        // Permission-based approach: Any user with review permissions can reschedule
        // If they do, the original requester should respond next
        if (proposerId !== requesterId && proposerId !== reviewerId) {
          // Check if proposer has review permissions (via authority as proxy)
          // If proposer has review authority (>= 60 for coordinators, >= 80 for admins)
          if (proposerAuthority >= AUTHORITY_TIERS.COORDINATOR && requesterId) {
            // Reviewer (coordinator/admin) rescheduled, requester becomes active responder
            const requesterUserId = request.requester.userId._id || request.requester.userId;
            return {
              userId: requesterUserId,
              relationship: 'requester',
              authority: request.requester.authoritySnapshot || null
            };
          }
        }
      }

      // Default: if no lastAction, requester is receiver (reviewer initiated)
      if (request.requester && request.requester.userId) {
        const requesterUserId = request.requester.userId._id || request.requester.userId;
        return {
          userId: requesterUserId,
          relationship: 'requester',
          authority: request.requester.authoritySnapshot || null
        };
      }
    }

    return null;
  }

  /**
   * Update active responder after an action
   * 
   * RESCHEDULE LOOP HANDLING:
   * - Stakeholder → Coordinator/Admin → Stakeholder → loop continues
   * - All valid coordinators, assigned coordinator, and admins can participate
   * - Active responder alternates based on who initiated the reschedule
   * - Loop continues until someone accepts/confirms/rejects
   * 
   * @param {Object} request - Request document (will be modified)
   * @param {string} action - Action that was performed
   * @param {string|ObjectId} actorId - User who performed the action
   * @param {Object} context - Additional context { requesterId, reviewerId, actorAuthority }
   */
  static updateActiveResponder(request, action, actorId, context = {}) {
    const normalizedState = this.normalizeState(request.status || request.Status);
    
    // Update lastAction
    request.lastAction = {
      action: action,
      actorId: actorId,
      timestamp: new Date()
    };

    // Final states: no active responder
    if (this.isFinalState(normalizedState)) {
      request.activeResponder = null;
      return;
    }

    // Get requester and reviewer IDs
    const requesterId = context.requesterId || (request.requester?.userId?.toString());
    const reviewerId = context.reviewerId || (request.reviewer?.userId?.toString());
    const actorIdStr = actorId.toString();

    // Determine if actor is requester or reviewer
    const isRequester = requesterId && actorIdStr === requesterId;
    const isReviewer = reviewerId && actorIdStr === reviewerId;

    // Handle reschedule: receiver becomes active responder
    if (action === REQUEST_ACTIONS.RESCHEDULE) {
      // Permission-based approach: Determine next responder based on who acted and their permissions
      const actorAuthority = context.actorAuthority || null;
      
      // Case 1: Actor is neither the original requester nor assigned reviewer
      // This happens when a valid coordinator or admin (who has review permissions) reschedules
      if (!isRequester && !isReviewer) {
        // Get effective authority
        let effectiveAuthority = actorAuthority;
        if (!effectiveAuthority && request.rescheduleProposal && request.rescheduleProposal.proposedBy) {
          const proposedBy = request.rescheduleProposal.proposedBy;
          if (proposedBy.userId && proposedBy.userId.toString() === actorIdStr) {
            effectiveAuthority = proposedBy.authoritySnapshot;
          }
        }
        
        // If actor has review-level authority (coordinator or admin), route to requester
        // Permission logic: Anyone with request.review or request.approve can reschedule
        // When they do, the original requester (with request.create) should respond
        if (effectiveAuthority >= AUTHORITY_TIERS.COORDINATOR && requesterId) {
          console.log(`[REQUEST STATE] Reviewer (authority ${effectiveAuthority}) rescheduled, setting requester as active responder`, {
            actorId: actorIdStr,
            requesterId,
            reviewerId,
            requestId: request.Request_ID
          });
          const requesterUserId = request.requester.userId._id || request.requester.userId;
          request.activeResponder = {
            userId: requesterUserId,
            relationship: 'requester',
            authority: request.requester.authoritySnapshot || null
          };
          return;
        }
      }
      
      // Standard reschedule logic: requester ↔ reviewer swap
      if (isRequester && reviewerId) {
        // Requester rescheduled, reviewer becomes active responder
        const reviewerUserId = request.reviewer.userId._id || request.reviewer.userId;
        request.activeResponder = {
          userId: reviewerUserId,
          relationship: 'reviewer',
          authority: request.reviewer.authoritySnapshot || null
        };
        console.log(`[REQUEST STATE] Requester rescheduled, reviewer set as active responder`, {
          requesterId,
          reviewerId,
          requestId: request.Request_ID
        });
      } else if (isReviewer && requesterId) {
        // Reviewer rescheduled, requester becomes active responder
        const requesterUserId = request.requester.userId._id || request.requester.userId;
        request.activeResponder = {
          userId: requesterUserId,
          relationship: 'requester',
          authority: request.requester.authoritySnapshot || null
        };
        console.log(`[REQUEST STATE] Reviewer rescheduled, requester set as active responder`, {
          requesterId,
          reviewerId,
          requestId: request.Request_ID
        });
      } else {
        // Fallback: actor is neither requester nor assigned reviewer
        // Permission-based logic: Route back to requester by default
        // This handles cases where valid coordinators, admins, or other reviewers participate
        console.warn(`[REQUEST STATE] Reschedule by actor who is neither requester nor reviewer`, {
          actorId: actorIdStr,
          requesterId,
          reviewerId,
          requestId: request.Request_ID
        });
        
        // Default behavior: Route back to original requester
        // Assumption: Actor has review permissions, so requester should respond
        if (requesterId && request.requester) {
          const requesterUserId = request.requester.userId._id || request.requester.userId;
          request.activeResponder = {
            userId: requesterUserId,
            relationship: 'requester',
            authority: request.requester.authoritySnapshot || null
          };
          console.log(`[REQUEST STATE] Fallback: Set requester as active responder after reviewer reschedule`, {
            actorId: actorIdStr,
            requesterId,
            requestId: request.Request_ID
          });
        }
      }
      return;
    }

    // Accept/Reject/Confirm/Decline: final states, no active responder
    if ([REQUEST_ACTIONS.ACCEPT, REQUEST_ACTIONS.REJECT, REQUEST_ACTIONS.CONFIRM, REQUEST_ACTIONS.DECLINE].includes(action)) {
      request.activeResponder = null;
      return;
    }

    // For other actions, maintain current active responder or set based on state
    if (normalizedState === REQUEST_STATES.PENDING_REVIEW) {
      // Reviewer should be active responder
      if (reviewerId && request.reviewer && request.reviewer.userId) {
        const reviewerUserId = request.reviewer.userId._id || request.reviewer.userId;
        request.activeResponder = {
          userId: reviewerUserId,
          relationship: 'reviewer',
          authority: request.reviewer.authoritySnapshot || null
        };
      }
    }
  }

  /**
   * Initialize reschedule loop tracking (legacy compatibility)
   * Note: This is a stub for backward compatibility with existing code
   * The permission-based approach doesn't require explicit loop tracking
   * 
   * @param {Object} request - Request document
   * @param {string|ObjectId} userId - User who initiated reschedule
   * @param {string} proposerRole - Role of proposer (deprecated, not used)
   */
  static initializeRescheduleLoop(request, userId, proposerRole) {
    // Legacy method stub - no-op in permission-based approach
    // The rescheduleLoop field is deprecated; activeResponder handles loop tracking
    console.log(`[REQUEST STATE] initializeRescheduleLoop called (legacy stub)`, {
      requestId: request.Request_ID,
      userId: userId?.toString(),
      proposerRole
    });
    
    // If rescheduleLoop field exists on request, initialize it for compatibility
    if (request.schema && request.schema.paths && request.schema.paths.rescheduleLoop) {
      request.rescheduleLoop = {
        rescheduleCount: 1,
        lastProposerRole: proposerRole,
        initiatedAt: new Date()
      };
    }
  }

  /**
   * Update reschedule loop tracker (legacy compatibility)
   * Note: This is a stub for backward compatibility with existing code
   * The permission-based approach doesn't require explicit loop tracking
   * 
   * @param {Object} request - Request document
   * @param {string|ObjectId} userId - User who performed reschedule
   * @param {string} proposerRole - Role of proposer (deprecated, not used)
   */
  static updateRescheduleLoopTracker(request, userId, proposerRole) {
    // Legacy method stub - no-op in permission-based approach
    console.log(`[REQUEST STATE] updateRescheduleLoopTracker called (legacy stub)`, {
      requestId: request.Request_ID,
      userId: userId?.toString(),
      proposerRole
    });
    
    // If rescheduleLoop field exists, increment counter
    if (request.rescheduleLoop) {
      request.rescheduleLoop.rescheduleCount = (request.rescheduleLoop.rescheduleCount || 0) + 1;
      request.rescheduleLoop.lastProposerRole = proposerRole;
      request.rescheduleLoop.lastUpdatedAt = new Date();
    } else if (request.schema && request.schema.paths && request.schema.paths.rescheduleLoop) {
      // Initialize if field exists but not set
      request.rescheduleLoop = {
        rescheduleCount: 1,
        lastProposerRole: proposerRole,
        initiatedAt: new Date()
      };
    }
  }
}

// Export utility functions for secondary reviewer logic
RequestStateService.isAdminUser = isAdminUser;
RequestStateService.canUserReviewRequest = canUserReviewRequest;

module.exports = RequestStateService;