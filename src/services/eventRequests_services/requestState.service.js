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
      [REQUEST_ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED, // Intermediate state before auto-publish
      [REQUEST_ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED, // Intermediate state
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED
    },
    [REQUEST_STATES.REVIEW_ACCEPTED]: {
      // Auto-transition to approved (handled by service, no user action needed)
      // But allow confirm as explicit action
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED // Finalize acceptance
    },
    [REQUEST_STATES.REVIEW_RESCHEDULED]: {
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED, // Auto-publish on confirm
      [REQUEST_ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED, // Accept rescheduled request → review-accepted (needs confirmation)
      [REQUEST_ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED, // Can reject from rescheduled
      [REQUEST_ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED // Loop allowed (requester can counter-reschedule)
    },
    [REQUEST_STATES.REVIEW_REJECTED]: {
      [REQUEST_ACTIONS.CONFIRM]: REQUEST_STATES.REJECTED, // Finalize rejection
      [REQUEST_ACTIONS.DECLINE]: REQUEST_STATES.REJECTED // Alternative way to finalize
    },
    [REQUEST_STATES.APPROVED]: {
      [REQUEST_ACTIONS.CANCEL]: REQUEST_STATES.CANCELLED
    },
    [REQUEST_STATES.REJECTED]: {
      // No transitions from rejected
    },
    [REQUEST_STATES.CANCELLED]: {
      // No transitions from cancelled
    },
    [REQUEST_STATES.COMPLETED]: {
      // Final state, no transitions
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
    const legacyMap = {
      'pending': REQUEST_STATES.PENDING_REVIEW,
      'pending_admin_review': REQUEST_STATES.PENDING_REVIEW,
      'pending_coordinator_review': REQUEST_STATES.PENDING_REVIEW,
      'pending_stakeholder_review': REQUEST_STATES.PENDING_REVIEW,
      'accepted_by_admin': REQUEST_STATES.APPROVED,
      'review_accepted': REQUEST_STATES.APPROVED,
      'rejected_by_admin': REQUEST_STATES.REJECTED,
      'review_rejected': REQUEST_STATES.REJECTED,
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
}

module.exports = RequestStateService;

