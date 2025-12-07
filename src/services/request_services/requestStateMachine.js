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

/**
 * State Transition Rules
 * Each state defines:
 * - allowedActions: Map of role -> actions allowed in this state
 * - transitions: Map of action -> next state
 * - conditions: Optional conditions for transitions
 */
const STATE_TRANSITIONS = {
  [REQUEST_STATES.PENDING_REVIEW]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW] // Requester can only view
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
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.CONFIRM],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW, ACTIONS.CONFIRM],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.CONFIRM]
    },
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM]
  },

  [REQUEST_STATES.REVIEW_REJECTED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.DELETE], // Admin cannot confirm their own rejection - only requester confirms
      [ROLES.COORDINATOR]: [ACTIONS.VIEW], // Coordinator can only view if they are the reviewer who rejected
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.CONFIRM]
    },
    transitions: {
      [ACTIONS.CONFIRM]: REQUEST_STATES.REJECTED,
      [ACTIONS.DELETE]: REQUEST_STATES.CLOSED
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM] // Requester can confirm the rejection
  },

  [REQUEST_STATES.REVIEW_RESCHEDULED]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE, ACTIONS.CONFIRM],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE], // Coordinators can NEVER confirm - only requester confirms
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.RESCHEDULE]
    },
    transitions: {
      [ACTIONS.ACCEPT]: REQUEST_STATES.REVIEW_ACCEPTED, // Reviewer accepts → goes to review-accepted, requiring requester confirmation
      [ACTIONS.REJECT]: REQUEST_STATES.REVIEW_REJECTED, // Reviewer rejects → goes to review-rejected, requiring requester confirmation
      [ACTIONS.CONFIRM]: REQUEST_STATES.APPROVED, // Requester confirms → goes directly to approved
      [ACTIONS.RESCHEDULE]: REQUEST_STATES.REVIEW_RESCHEDULED // Loop back
    },
    requesterActions: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.RESCHEDULE], // Requester can view, confirm, or reschedule again
    reviewerActions: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE] // Reviewer can accept, reject, reschedule, or view
  },

  [REQUEST_STATES.AWAITING_CONFIRMATION]: {
    allowedActions: {
      [ROLES.SYSTEM_ADMIN]: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.REJECT],
      [ROLES.COORDINATOR]: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.REJECT],
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.REJECT]
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
 * Defines who becomes the reviewer based on the requester's role
 */
const REVIEWER_ASSIGNMENT_RULES = {
  [ROLES.SYSTEM_ADMIN]: {
    reviewerRole: ROLES.COORDINATOR,
    // Can be overridden by admin
    allowAdminOverride: true
  },
  [ROLES.COORDINATOR]: {
    reviewerRole: ROLES.SYSTEM_ADMIN,
    allowAdminOverride: true
  },
  [ROLES.STAKEHOLDER]: {
    reviewerRole: ROLES.COORDINATOR,
    // Admin can intervene as override reviewer
    allowAdminOverride: true,
    fallbackReviewer: ROLES.SYSTEM_ADMIN
  }
};

class RequestStateMachine {
  /**
   * Get allowed actions for a user in a given state
   * @param {string} state - Current request state
   * @param {string} userRole - User's role
   * @param {string} userId - User's ID
   * @param {Object} request - Request object with creator/reviewer info
   * @returns {string[]} Array of allowed actions
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
    const isAdmin = normalizedRole === ROLES.SYSTEM_ADMIN.toLowerCase();
    
    // Additional fallback for SystemAdmin-created requests: if coordinator_id matches and reviewer should be coordinator
    const creatorRole = request.made_by_role || request.creator?.role;
    const isSystemAdminRequest = creatorRole && this.normalizeRole(creatorRole) === ROLES.SYSTEM_ADMIN;
    if (!isReviewer && isSystemAdminRequest && normalizedRole === ROLES.COORDINATOR.toLowerCase()) {
      // For SystemAdmin requests, if user is coordinator and matches coordinator_id, they are the reviewer
      if (request.coordinator_id && String(request.coordinator_id) === String(userId)) {
        // Verify reviewer should be coordinator (check reviewer assignment rule)
        const assignmentRule = REVIEWER_ASSIGNMENT_RULES[ROLES.SYSTEM_ADMIN];
        if (assignmentRule && assignmentRule.reviewerRole === ROLES.COORDINATOR) {
          isReviewer = true;
        }
      }
    }

    // Special handling for REVIEW_RESCHEDULED state
    if (normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED) {
      const rescheduleProposal = request.rescheduleProposal;
      if (rescheduleProposal && rescheduleProposal.proposedBy) {
        const proposerId = rescheduleProposal.proposedBy.id;
        // If the current user is the proposer, they can only VIEW
        if (proposerId && String(proposerId) === String(userId)) {
          return [ACTIONS.VIEW];
        }
      }
      
      // If user is the requester (original creator), use requester actions
      if (isRequester && stateConfig.requesterActions) {
        return stateConfig.requesterActions;
      }
      
      // If user is the assigned reviewer, use reviewer actions (NOT requester actions)
      if (isReviewer && stateConfig.reviewerActions) {
        return stateConfig.reviewerActions;
      }
    }

    // Special handling for REVIEW_REJECTED state:
    // - If user is the reviewer who rejected, they can only VIEW (not confirm their own rejection)
    // - If user is the requester, they can VIEW and CONFIRM the rejection
    if (normalizedState === REQUEST_STATES.REVIEW_REJECTED) {
      // Check if this user is the one who rejected (check decisionHistory)
      const wasRejectedByThisUser = request.decisionHistory && Array.isArray(request.decisionHistory) &&
        request.decisionHistory.some(d => 
          (d.type === 'reject' || d.type === REVIEW_DECISIONS.REJECT) &&
          d.actor && String(d.actor.id) === String(userId)
        );
      
      // If user is the requester (not the reviewer who rejected), they can confirm
      if (isRequester && !wasRejectedByThisUser && stateConfig.requesterActions) {
        return stateConfig.requesterActions;
      }
      
      // If user is the reviewer who rejected, they can only VIEW
      if (isReviewer && wasRejectedByThisUser) {
        return [ACTIONS.VIEW];
      }
      
      // If user is reviewer but didn't reject, use reviewer actions
      if (isReviewer && !wasRejectedByThisUser) {
        if (stateConfig.allowedActions[normalizedRole]) {
          return stateConfig.allowedActions[normalizedRole];
        }
        const canonicalRole = normalizedRole === ROLES.SYSTEM_ADMIN.toLowerCase() ? ROLES.SYSTEM_ADMIN :
                             normalizedRole === ROLES.COORDINATOR.toLowerCase() ? ROLES.COORDINATOR :
                             normalizedRole === ROLES.STAKEHOLDER.toLowerCase() ? ROLES.STAKEHOLDER : null;
        if (canonicalRole && stateConfig.allowedActions[canonicalRole]) {
          return stateConfig.allowedActions[canonicalRole];
        }
      }
    }

    // If user is the requester, use requester actions
    if (isRequester && stateConfig.requesterActions) {
      return stateConfig.requesterActions;
    }

    // If user is the assigned reviewer, use reviewer actions
    if (isReviewer) {
      // Try exact role match first
      if (stateConfig.allowedActions[normalizedRole]) {
        return stateConfig.allowedActions[normalizedRole];
      }
      // Try canonical role format
      const canonicalRole = normalizedRole === ROLES.SYSTEM_ADMIN.toLowerCase() ? ROLES.SYSTEM_ADMIN :
                           normalizedRole === ROLES.COORDINATOR.toLowerCase() ? ROLES.COORDINATOR :
                           normalizedRole === ROLES.STAKEHOLDER.toLowerCase() ? ROLES.STAKEHOLDER : null;
      if (canonicalRole && stateConfig.allowedActions[canonicalRole]) {
        return stateConfig.allowedActions[canonicalRole];
      }
    }

    // Admin override: admins can act as reviewers if allowed
    if (isAdmin && stateConfig.allowedActions[ROLES.SYSTEM_ADMIN]) {
      // Check if admin override is allowed for this request type
      const creatorRole = this.normalizeRole(request.made_by_role || request.creator?.role);
      const assignmentRule = REVIEWER_ASSIGNMENT_RULES[creatorRole];
      if (assignmentRule && assignmentRule.allowAdminOverride) {
        return stateConfig.allowedActions[ROLES.SYSTEM_ADMIN];
      }
    }

    // Default: view only
    return [ACTIONS.VIEW];
  }

  /**
   * Get next state after performing an action
   * @param {string} currentState - Current request state
   * @param {string} action - Action being performed
   * @returns {string|null} Next state, or null if transition is invalid
   */
  getNextState(currentState, action) {
    const normalizedState = this.normalizeState(currentState);
    const stateConfig = STATE_TRANSITIONS[normalizedState];
    
    if (!stateConfig || !stateConfig.transitions) {
      return null;
    }

    return stateConfig.transitions[action] || null;
  }

  /**
   * Check if a transition is valid
   * @param {string} currentState - Current state
   * @param {string} action - Action to perform
   * @param {string} userRole - User's role
   * @param {string} userId - User's ID
   * @param {Object} request - Request object
   * @returns {boolean} True if transition is valid
   */
  isValidTransition(currentState, action, userRole, userId, request = {}) {
    const allowedActions = this.getAllowedActions(currentState, userRole, userId, request);
    return allowedActions.includes(action);
  }

  /**
   * Get reviewer role for a given requester role
   * @param {string} requesterRole - Role of the person creating the request
   * @returns {Object} Reviewer assignment configuration
   */
  getReviewerAssignment(requesterRole) {
    const normalizedRole = this.normalizeRole(requesterRole);
    return REVIEWER_ASSIGNMENT_RULES[normalizedRole] || {
      reviewerRole: ROLES.SYSTEM_ADMIN,
      allowAdminOverride: true
    };
  }

  /**
   * Check if user is the requester
   */
  isRequester(userId, request) {
    if (!userId || !request) return false;
    const madeById = request.made_by_id || request.creator?.id;
    return madeById && String(madeById) === String(userId);
  }

  /**
   * Check if user is the assigned reviewer
   */
  isReviewer(userId, userRole, request) {
    if (!userId || !request) return false;
    
    const normalizedRole = this.normalizeRole(userRole);
    const reviewer = request.reviewer;
    
    // IMPORTANT: For SystemAdmin-created requests, only coordinators can be reviewers
    // Stakeholders should never be reviewers for SystemAdmin-created requests
    const creatorRole = request.made_by_role || request.creator?.role;
    const isSystemAdminRequest = creatorRole && this.normalizeRole(creatorRole) === ROLES.SYSTEM_ADMIN;
    
    if (isSystemAdminRequest && normalizedRole === ROLES.STAKEHOLDER.toLowerCase()) {
      // Stakeholders cannot be reviewers for SystemAdmin-created requests
      return false;
    }
    
    // Check explicit reviewer assignment by ID
    if (reviewer && reviewer.id && String(reviewer.id) === String(userId)) {
      // Double-check: if this is a SystemAdmin request, reviewer must be coordinator
      if (isSystemAdminRequest && reviewer.role) {
        const normalizedReviewerRole = this.normalizeRole(reviewer.role);
        // normalizeRole returns ROLES.COORDINATOR ('Coordinator'), so compare to that, not lowercase
        if (normalizedReviewerRole !== ROLES.COORDINATOR) {
          console.log('[isReviewer] Reviewer role mismatch for SystemAdmin request:', {
            reviewerRole: reviewer.role,
            normalizedReviewerRole,
            expectedRole: ROLES.COORDINATOR,
            reviewerId: reviewer.id,
            userId
          });
          return false;
        }
      }
      return true;
    }

    // For SystemAdmin-created requests: check if coordinator_id matches and reviewer is coordinator
    if (isSystemAdminRequest && normalizedRole === ROLES.COORDINATOR.toLowerCase()) {
      // If reviewer is coordinator and coordinator_id matches, user is the reviewer
      if (reviewer && reviewer.role && this.normalizeRole(reviewer.role) === ROLES.COORDINATOR) {
        // Check if coordinator_id matches userId
        if (request.coordinator_id && String(request.coordinator_id) === String(userId)) {
          return true;
        }
        // Also check if reviewer.id matches (in case IDs are different formats)
        if (reviewer.id && String(reviewer.id) === String(userId)) {
          return true;
        }
      }
      // Fallback: if no reviewer is set but coordinator_id matches, assume coordinator is reviewer
      if (!reviewer && request.coordinator_id && String(request.coordinator_id) === String(userId)) {
        return true;
      }
    }

    // Check role-based reviewer assignment
    if (reviewer && reviewer.role) {
      const reviewerRole = this.normalizeRole(reviewer.role);
      if (reviewerRole === normalizedRole) {
        // For SystemAdmin requests, only coordinators can be reviewers
        if (isSystemAdminRequest && reviewerRole !== ROLES.COORDINATOR) {
          return false;
        }
        // Additional check: if reviewer has specific ID, match it
        if (reviewer.id) {
          return String(reviewer.id) === String(userId);
        }
        // If no specific ID, check if user matches the role-based assignment
        // For coordinators, also check coordinator_id
        if (reviewerRole === ROLES.COORDINATOR && request.coordinator_id) {
          return String(request.coordinator_id) === String(userId);
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize state to canonical form
   */
  normalizeState(state) {
    if (!state) return REQUEST_STATES.PENDING_REVIEW;
    
    const s = String(state).toLowerCase();
    
    // Map legacy states to new states
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

  /**
   * Normalize role to canonical form
   */
  normalizeRole(role) {
    if (!role) return null;
    
    const r = String(role).toLowerCase();
    if (r === 'admin' || r === 'systemadmin' || r === 'sysadmin') {
      return ROLES.SYSTEM_ADMIN;
    }
    if (r === 'coordinator') {
      return ROLES.COORDINATOR;
    }
    if (r === 'stakeholder') {
      return ROLES.STAKEHOLDER;
    }
    
    return role;
  }

  /**
   * Get all available states
   */
  getStates() {
    return Object.values(REQUEST_STATES);
  }

  /**
   * Get all available actions
   */
  getActions() {
    return Object.values(ACTIONS);
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

