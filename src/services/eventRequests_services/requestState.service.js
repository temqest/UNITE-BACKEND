/**
 * Request State Service
 * 
 * Manages state transitions for event requests with clean, predictable flow
 */

const { REQUEST_STATES, REQUEST_ACTIONS } = require('../../utils/eventRequests/requestConstants');

class RequestStateService {
  /**
   * State transition rules
   * Maps current state + action → new state
   */
  static TRANSITIONS = {
    [REQUEST_STATES.PENDING_REVIEW]: {
      [REQUEST_ACTIONS.ACCEPT]: REQUEST_STATES.APPROVED, // Directly approve and publish on accept
      [REQUEST_ACTIONS.REJECT]: REQUEST_STATES.REJECTED, // Directly reject - no intermediate state
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED, // Stakeholder confirm (same as accept) - directly approve and publish
      [REQUEST_ACTIONS.DECLINE]: REQUEST_STATES.REJECTED, // Stakeholder decline (same as reject) - directly reject
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED
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
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED // Allow stakeholders to confirm approved requests (no state change, just acknowledgment)
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
      if (request.lastAction && request.lastAction.actorId) {
        const lastActorId = request.lastAction.actorId.toString();
        const requesterId = request.requester?.userId?.toString();
        const reviewerId = request.reviewer?.userId?.toString();

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
      }

      // Fallback: if rescheduleProposal exists, receiver is the other party
      if (request.rescheduleProposal && request.rescheduleProposal.proposedBy) {
        const proposerId = request.rescheduleProposal.proposedBy.userId?.toString();
        const requesterId = request.requester?.userId?.toString();
        const reviewerId = request.reviewer?.userId?.toString();

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
   * @param {Object} request - Request document (will be modified)
   * @param {string} action - Action that was performed
   * @param {string|ObjectId} actorId - User who performed the action
   * @param {Object} context - Additional context { requesterId, reviewerId }
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
      if (isRequester && reviewerId) {
        // Requester rescheduled, reviewer becomes active responder
        const reviewerUserId = request.reviewer.userId._id || request.reviewer.userId;
        request.activeResponder = {
          userId: reviewerUserId,
          relationship: 'reviewer',
          authority: request.reviewer.authoritySnapshot || null
        };
      } else if (isReviewer && requesterId) {
        // Reviewer rescheduled, requester becomes active responder
        const requesterUserId = request.requester.userId._id || request.requester.userId;
        request.activeResponder = {
          userId: requesterUserId,
          relationship: 'requester',
          authority: request.requester.authoritySnapshot || null
        };
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
}

module.exports = RequestStateService;

