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

const ROLES = Object.freeze({
  SYSTEM_ADMIN: 'SystemAdmin',
  COORDINATOR: 'Coordinator',
  STAKEHOLDER: 'Stakeholder'
});

// Local copy of review decision constants (matches requestFlow.helpers)
const REVIEW_DECISIONS = Object.freeze({
  ACCEPT: 'accept',
  REJECT: 'reject',
  RESCHEDULE: 'reschedule'
});

/**
 * State Transition Rules
 */
const STATE_TRANSITIONS = {
  [REQUEST_STATES.PENDING_REVIEW]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW] 
    },
    transitions: {
      [ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED,
      [ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED,
      [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED
    },
    requesterActions: [ACTIONS.VIEW]
  },

  [REQUEST_STATES.REVIEW_ACCEPTED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW]
    },
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM] 
  },

  [REQUEST_STATES.REVIEW_REJECTED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.DELETE],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.CONFIRM]
    },
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.REJECTED,
      [ACTIONS.DELETE]: REQUEST_STATES.CLOSED
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM] 
  },

  [REQUEST_STATES.REVIEW_RESCHEDULED]: {
    // These defaults are overridden by specific logic in getAllowedActions based on who proposed
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW], 
      [ROLES.COORDINATOR]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.RESCHEDULE], 
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW] 
    },
    transitions: {
      [ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED,
      [ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED,
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED,
      [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.RESCHEDULE], 
    reviewerActions: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.RESCHEDULE] 
  },

  [REQUEST_STATES.AWAITING_CONFIRMATION]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW]
    },
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED,
      [ACTIONS.REJECT]: REQUEST_STATES.REJECTED
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.REJECT]
  },

  [REQUEST_STATES.APPROVED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.EDIT, ACTIONS.MANAGE_STAFF, ACTIONS.RESCHEDULE, ACTIONS.CANCEL],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW, ACTIONS.EDIT, ACTIONS.MANAGE_STAFF, ACTIONS.RESCHEDULE, ACTIONS.CANCEL],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.EDIT, ACTIONS.RESCHEDULE, ACTIONS.CANCEL]
    },
    transitions: {
      [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED,
      [ACTIONS.CANCEL]: REQUEST_STATES.CANCELLED
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.EDIT, ACTIONS.MANAGE_STAFF, ACTIONS.RESCHEDULE, ACTIONS.CANCEL]
  },

  [REQUEST_STATES.REJECTED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.DELETE],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW]
    },
    transitions: {
      [ACTIONS.DELETE]: REQUEST_STATES.CLOSED
    },
    requesterActions: [ACTIONS.VIEW]
  },

  [REQUEST_STATES.CANCELLED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.DELETE],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW]
    },
    transitions: {
      [ACTIONS.DELETE]: REQUEST_STATES.CLOSED
    },
    requesterActions: [ACTIONS.VIEW]
  },

  [REQUEST_STATES.CLOSED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW]
    },
    transitions: {},
    requesterActions: [ACTIONS.VIEW]
  }
};

/**
 * Reviewer Assignment Rules
 */
const REVIEWER_ASSIGNMENT_RULES = {
  [ROLES.SYSTEM_ADMIN]: {
    reviewerRole: ROLES.COORDINATOR,
    allowAdminOverride: true
  },
  [ROLES.COORDINATOR]: {
    reviewerRole: ROLES.SYSTEM_ADMIN,
    allowAdminOverride: true
  },
  [ROLES.STAKEHOLDER]: {
    reviewerRole: ROLES.COORDINATOR,
    allowAdminOverride: true,
    fallbackReviewer: ROLES.SYSTEM_ADMIN
  }
};

class RequestStateMachine {
  /**
   * Get allowed actions for a user in a given state
   */
  getAllowedActions(state, userRole, userId, request = {}) {
    const normalizedState = this.normalizeState(state);
    const normalizedRole = this.normalizeRole(userRole);
    
    if (!STATE_TRANSITIONS[normalizedState]) {
      return [ACTIONS.VIEW];
    }

    const stateConfig = STATE_TRANSITIONS[normalizedState];
    const isRequester = this.isRequester(userId, request);
    let isReviewer = this.isReviewer(userId, userRole, request);
    const isAdmin = normalizedRole === ROLES.SYSTEM_ADMIN;

    // --- Special Logic for Stakeholder Rescheduling Loop ---
    if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
      const rescheduleProposal = request.rescheduleProposal;
      const isStakeholderRequest = request.made_by_role === ROLES.STAKEHOLDER || !!request.stakeholder_id;

      if (isStakeholderRequest && rescheduleProposal && rescheduleProposal.proposedBy) {
        const proposerRole = this.normalizeRole(rescheduleProposal.proposedBy.role);
        const proposerId = rescheduleProposal.proposedBy.id;

        // 1. Proposer (Stakeholder or Coordinator) can only VIEW their own active proposal
        if (String(proposerId) === String(userId)) {
          return [ACTIONS.VIEW];
        }

        // 2. If STAKEHOLDER proposed -> Coordinator acts
        if (proposerRole === ROLES.STAKEHOLDER && normalizedRole === ROLES.COORDINATOR) {
          // Explicitly: View, Accept, Reschedule (No Reject per requirements)
          return [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.RESCHEDULE];
        }

        // 3. If COORDINATOR proposed (counter-offer) -> Stakeholder acts
        if (proposerRole === ROLES.COORDINATOR && normalizedRole === ROLES.STAKEHOLDER && String(request.stakeholder_id) === String(userId)) {
          // Stakeholder confirms (accepts) or counter-reschedules
          return [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.RESCHEDULE];
        }

        // 4. System Admin should not be involved in this loop automatically
        if (isAdmin) {
            // Only allow view unless they override
            return [ACTIONS.VIEW];
        }
      }
    }

    // --- Standard Logic Follows ---

    // Additional fallback for SystemAdmin-created requests
    const creatorRole = request.made_by_role || request.creator?.role;
    const normalizedCreatorRole = creatorRole ? this.normalizeRole(creatorRole) : null;
    const isSystemAdminRequest = normalizedCreatorRole === ROLES.SYSTEM_ADMIN;
    
    if (!isReviewer && isSystemAdminRequest && normalizedRole === ROLES.COORDINATOR) {
      if (request.coordinator_id && String(request.coordinator_id) === String(userId)) {
        isReviewer = true;
      }
    }
    
    // Fallback for Stakeholder requests: coordinators are reviewers
    if (!isReviewer && normalizedCreatorRole === ROLES.STAKEHOLDER && normalizedRole === ROLES.COORDINATOR) {
      if (request.coordinator_id && String(request.coordinator_id) === String(userId)) {
        isReviewer = true;
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
      
      if (isReviewer || justMadeDecision) {
        return [ACTIONS.VIEW];
      }
      
      if (isRequester && stateConfig.requesterActions) {
        return stateConfig.requesterActions;
      }
      return [ACTIONS.VIEW];
    }

    // Normal State Logic
    if (isRequester && stateConfig.requesterActions) {
      return stateConfig.requesterActions;
    }

    if (isReviewer) {
      if (stateConfig.allowedActions[normalizedRole]) {
        return stateConfig.allowedActions[normalizedRole];
      }
    }

    if (normalizedState === REQUEST_STATES.APPROVED) {
        if (stateConfig.allowedActions[normalizedRole]) {
            return stateConfig.allowedActions[normalizedRole];
        }
    }

    // Admin override (except in Stakeholder loop managed above)
    if (isAdmin && stateConfig.allowedActions[ROLES.SYSTEM_ADMIN] && !requiresRequesterConfirmation) {
      const assignmentRule = REVIEWER_ASSIGNMENT_RULES[normalizedCreatorRole];
      if (assignmentRule && assignmentRule.allowAdminOverride) {
        return stateConfig.allowedActions[ROLES.SYSTEM_ADMIN];
      }
    }

    return [ACTIONS.VIEW];
  }

  // ... (Rest of the class methods remain unchanged: getNextState, isValidTransition, etc.)

  getNextState(currentState, action) {
    const normalizedState = this.normalizeState(currentState);
    const stateConfig = STATE_TRANSITIONS[normalizedState];
    if (!stateConfig || !stateConfig.transitions) return null;
    return stateConfig.transitions[action] || null;
  }

  isValidTransition(currentState, action, userRole, userId, request = {}) {
    const allowedActions = this.getAllowedActions(currentState, userRole, userId, request);
    return allowedActions.includes(action);
  }

  isRequester(userId, request) {
    if (!userId || !request) return false;
    const madeById = request.made_by_id || request.creator?.id;
    if (madeById && String(madeById) === String(userId)) return true;
    // If stakeholder_id explicitly matches the user, treat as requester
    if (request.stakeholder_id && String(request.stakeholder_id) === String(userId)) return true;

    const requesterRole = request.made_by_role || request.creator?.role;
    const normalizedRequesterRole = this.normalizeRole(requesterRole);
    if (normalizedRequesterRole === ROLES.STAKEHOLDER) {
      if (request.stakeholder_id && String(request.stakeholder_id) === String(userId)) {
        return true;
      }
    }
    return false;
  }

  isReviewer(userId, userRole, request) {
    if (!userId || !request) return false;
    const normalizedRole = this.normalizeRole(userRole);
    const reviewer = request.reviewer;
    
    // Explicit reviewer match
    if (reviewer && reviewer.id && String(reviewer.id) === String(userId)) return true;

    // Stakeholder-created request logic: Coordinator is Reviewer
    const creatorRole = request.made_by_role || request.creator?.role;
    const isStakeholderRequest = this.normalizeRole(creatorRole) === ROLES.STAKEHOLDER;

    if (isStakeholderRequest && normalizedRole === ROLES.COORDINATOR) {
        if (request.coordinator_id && String(request.coordinator_id) === String(userId)) {
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
    if (!role) return null;
    const r = String(role).toLowerCase();
    if (r === 'admin' || r === 'systemadmin' || r === 'sysadmin') return ROLES.SYSTEM_ADMIN;
    if (r === 'coordinator') return ROLES.COORDINATOR;
    if (r === 'stakeholder') return ROLES.STAKEHOLDER;
    return role;
  }
}

module.exports = {
  RequestStateMachine,
  REQUEST_STATES,
  ACTIONS,
  ROLES,
  STATE_TRANSITIONS,
  REVIEWER_ASSIGNMENT_RULES
};
