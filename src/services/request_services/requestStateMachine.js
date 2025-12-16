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
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE] // Stakeholders can review when assigned as reviewer
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
      [ROLES.STAKEHOLDER]: [ACTIONS.VIEW, ACTIONS.EDIT, ACTIONS.RESCHEDULE] // Removed CANCEL - only Admin/Coord can cancel
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
    
    // Debug logging for Coordinator-Stakeholder cases
    const creatorRole = request.made_by_role || request.creator?.role;
    const normalizedCreatorRole = creatorRole ? this.normalizeRole(creatorRole) : null;
    const isCoordinatorRequest = normalizedCreatorRole === ROLES.COORDINATOR;
    const hasStakeholder = !!(request.stakeholder_id || request.stakeholderId);
    const isCoordinatorStakeholderCase = isCoordinatorRequest && hasStakeholder;
    
    if (isCoordinatorStakeholderCase && normalizedRole === ROLES.STAKEHOLDER && process.env.NODE_ENV !== 'production') {
      const stakeholderId = request.stakeholder_id || request.stakeholderId;
      console.log('[getAllowedActions] Coordinator-Stakeholder case detected:', {
        state,
        normalizedState,
        userRole,
        normalizedRole,
        userId,
        stakeholderId,
        reviewer: request.reviewer,
        isReviewer,
        isRequester,
        hasStakeholderActions: !!stateConfig.allowedActions[ROLES.STAKEHOLDER]
      });
    }

    // --- Special Logic for Rescheduling Loop ---
    // Check both normalized state and raw state to handle variations
    const rawState = String(request.Status || request.status || state || '').toLowerCase();
    const isRescheduledState = normalizedState === REQUEST_STATES.REVIEW_RESCHEDULED || 
                               rawState.includes('resched') || 
                               rawState.includes('reschedule');
    
    if (isRescheduledState) {
      const rescheduleProposal = request.rescheduleProposal;
      
      // CRITICAL: If current user is the one who proposed the reschedule, they can only VIEW
      // This prevents Coordinator/Admin from accepting their own reschedule proposals
      if (rescheduleProposal && rescheduleProposal.proposedBy && rescheduleProposal.proposedBy.id) {
        const proposerId = rescheduleProposal.proposedBy.id;
        if (String(proposerId) === String(userId)) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[getAllowedActions] User is the reschedule proposer -> Only VIEW allowed:', {
              proposerId,
              userId,
              proposerRole: rescheduleProposal.proposedBy.role,
              userRole: normalizedRole
            });
          }
          return [ACTIONS.VIEW];
        }
      }
      
      const hasStakeholder = !!(request.stakeholder_id || request.stakeholderId);
      const isStakeholderRequest = normalizedCreatorRole === ROLES.STAKEHOLDER;
      const isCoordinatorStakeholderCase = normalizedCreatorRole === ROLES.COORDINATOR && hasStakeholder;

      if (process.env.NODE_ENV !== 'production' && isCoordinatorStakeholderCase && normalizedRole === ROLES.STAKEHOLDER) {
        console.log('[getAllowedActions] Reschedule state check:', {
          normalizedState,
          rawState,
          isRescheduledState,
          hasRescheduleProposal: !!rescheduleProposal,
          proposerRole: rescheduleProposal?.proposedBy?.role,
          isCoordinatorStakeholderCase
        });
      }

      // Handle reschedule proposals for both Stakeholder-created requests and Coordinator-Stakeholder cases
      if ((isStakeholderRequest || isCoordinatorStakeholderCase) && rescheduleProposal && rescheduleProposal.proposedBy) {
        const proposerRole = this.normalizeRole(rescheduleProposal.proposedBy.role);
        const proposerId = rescheduleProposal.proposedBy.id;

        // Note: The proposer check is already handled above, so this section handles the recipient of the proposal

        // 2. If STAKEHOLDER proposed -> Coordinator acts (or Admin in Coordinator-Stakeholder cases)
        if (proposerRole === ROLES.STAKEHOLDER && normalizedRole === ROLES.COORDINATOR) {
          // Explicitly: View, Accept, Reschedule (No Reject per requirements)
          return [ACTIONS.VIEW, ACTIONS.ACCEPT, ACTIONS.RESCHEDULE];
        }

        // 3. If COORDINATOR proposed (counter-offer) -> Stakeholder acts
        // This applies to both Stakeholder-created requests AND Coordinator-Stakeholder cases
        if (proposerRole === ROLES.COORDINATOR && normalizedRole === ROLES.STAKEHOLDER) {
          const stakeholderId = request.stakeholder_id || request.stakeholderId;
          // Check if this user is the stakeholder (for both Stakeholder-created and Coordinator-Stakeholder cases)
          if (stakeholderId && String(stakeholderId) === String(userId)) {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[getAllowedActions] Coordinator proposed reschedule -> Stakeholder can confirm/reschedule:', {
                proposerRole,
                normalizedRole,
                stakeholderId,
                userId,
                isCoordinatorStakeholderCase,
                rescheduleProposal: rescheduleProposal.proposedBy
              });
            }
            // Stakeholder confirms (accepts) or counter-reschedules
            return [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.RESCHEDULE];
          } else {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[getAllowedActions] Coordinator proposed reschedule but stakeholder ID mismatch:', {
                stakeholderId,
                userId,
                requestStakeholderId: request.stakeholder_id,
                requestStakeholderIdAlt: request.stakeholderId
              });
            }
          }
        } else {
          if (process.env.NODE_ENV !== 'production' && isCoordinatorStakeholderCase && normalizedRole === ROLES.STAKEHOLDER) {
            console.log('[getAllowedActions] Reschedule proposal check failed:', {
              proposerRole,
              normalizedRole,
              expectedProposerRole: ROLES.COORDINATOR,
              expectedUserRole: ROLES.STAKEHOLDER
            });
          }
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
    // Note: creatorRole and normalizedCreatorRole are already declared above for debug logging
    const isSystemAdminRequest = normalizedCreatorRole === ROLES.SYSTEM_ADMIN;
    
    if (!isReviewer && isSystemAdminRequest && normalizedRole === ROLES.COORDINATOR) {
      if (request.coordinator_id && String(request.coordinator_id) === String(userId)) {
        isReviewer = true;
      }
    }
    
    // NEW: Check if this is a Coordinator-Stakeholder case and user is the Stakeholder reviewer
    // Note: isCoordinatorRequest, hasStakeholder, and isCoordinatorStakeholderCase are already declared above
    if (!isReviewer) {
      if (isCoordinatorStakeholderCase && normalizedRole === ROLES.STAKEHOLDER) {
        const stakeholderId = request.stakeholder_id || request.stakeholderId;
        if (stakeholderId && String(stakeholderId) === String(userId)) {
          isReviewer = true;
        }
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
      
      // Allow Admin to confirm in review-accepted state if:
      // 1. Requester is Admin (admin-created request reviewed by Coordinator) → Admin can confirm
      // 2. Requester is Coordinator and Admin is the reviewer (coordinator-created request reviewed by Admin) → Admin can confirm
      // This check must happen BEFORE the isReviewer check to allow Admin reviewers to confirm
      const isAdminRequester = normalizedCreatorRole === ROLES.SYSTEM_ADMIN;
      const isCoordinatorRequester = normalizedCreatorRole === ROLES.COORDINATOR;
      // Check if the current Admin user IS the reviewer (by ID match)
      const isAdminReviewer = isAdmin && request.reviewer && request.reviewer.id && 
                              String(request.reviewer.id) === String(userId) &&
                              request.reviewer.role && 
                              (String(request.reviewer.role).toLowerCase() === 'systemadmin' || 
                               String(request.reviewer.role).toLowerCase() === 'admin');
      
      if (isAdmin && stateConfig.requesterActions && stateConfig.requesterActions.includes(ACTIONS.CONFIRM)) {
        if (isAdminRequester || (isCoordinatorRequester && isAdminReviewer)) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('[getAllowedActions] Admin can confirm in review-accepted:', {
              isAdminRequester,
              isCoordinatorRequester,
              isAdminReviewer,
              reviewerId: request.reviewer?.id,
              userId,
              reviewerRole: request.reviewer?.role
            });
          }
          return stateConfig.requesterActions;
        }
      }
      
      // If user is the reviewer who just made the decision, they can only view (unless Admin exception above)
      if ((isReviewer || justMadeDecision) && !(isAdmin && (isAdminRequester || (isCoordinatorRequester && isAdminReviewer)))) {
        return [ACTIONS.VIEW];
      }
      
      if (isRequester && stateConfig.requesterActions) {
        return stateConfig.requesterActions;
      }
      return [ACTIONS.VIEW];
    }

    // CRITICAL: Coordinator-Stakeholder involvement case - CHECK THIS FIRST (before requester check)
    // When Coordinator creates request WITH Stakeholder, Stakeholder is primary reviewer
    // System Admin can still view and act, but Stakeholder has priority
    // Note: isCoordinatorRequest, hasStakeholder, and isCoordinatorStakeholderCase are already declared above
    
    // CRITICAL: For Coordinator-Stakeholder cases, Stakeholder must get reviewer actions when they are the reviewer
    // This MUST happen before the requester check to prevent Stakeholder from being treated as requester
    // This takes priority over the general isReviewer check to ensure correct actions
    if (isCoordinatorStakeholderCase && normalizedRole === ROLES.STAKEHOLDER) {
      const stakeholderId = request.stakeholder_id || request.stakeholderId;
      if (stakeholderId && String(stakeholderId) === String(userId)) {
        // Check if there's a reschedule proposal from Coordinator - Stakeholder should be able to CONFIRM
        const rescheduleProposal = request.rescheduleProposal;
        const hasCoordinatorProposal = rescheduleProposal && 
                                       rescheduleProposal.proposedBy && 
                                       this.normalizeRole(rescheduleProposal.proposedBy.role) === ROLES.COORDINATOR &&
                                       String(rescheduleProposal.proposedBy.id) !== String(userId);
        
        // Check if Stakeholder is the assigned reviewer
        const reviewerRole = request.reviewer?.role ? String(request.reviewer.role).toLowerCase() : null;
        const reviewerId = request.reviewer?.id ? String(request.reviewer.id) : null;
        const isStakeholderReviewer = (reviewerRole === 'stakeholder' || reviewerRole?.includes('stakeholder')) && 
                                      (reviewerId === String(stakeholderId) || reviewerId === String(userId) || !reviewerId);
        
        // Check the actual request status (not just normalized state) to handle edge cases
        const requestStatus = String(request.Status || request.status || state || '').toLowerCase();
        const isPendingOrReviewState = normalizedState === REQUEST_STATES.PENDING_REVIEW || 
                                       String(normalizedState).toLowerCase().includes('pending') ||
                                       String(requestStatus).includes('pending') ||
                                       (String(normalizedState).toLowerCase().includes('review') && 
                                        !String(normalizedState).toLowerCase().includes('accepted') &&
                                        !String(normalizedState).toLowerCase().includes('rejected')) ||
                                       (String(requestStatus).includes('review') && 
                                        !String(requestStatus).includes('accepted') &&
                                        !String(requestStatus).includes('rejected'));
        
        // Check if request is already finalized (accepted/rejected/completed) - don't give reviewer actions in those cases
        const isFinalized = String(requestStatus).includes('accepted') || 
                           String(requestStatus).includes('rejected') ||
                           String(requestStatus).includes('completed') ||
                           String(requestStatus).includes('approved') ||
                           normalizedState === REQUEST_STATES.APPROVED ||
                           normalizedState === REQUEST_STATES.REJECTED;
        
        // Special case: If Coordinator proposed a reschedule, Stakeholder should get CONFIRM and RESCHEDULE actions
        if (hasCoordinatorProposal && !isFinalized) {
          // For reschedule proposals, Stakeholder needs CONFIRM to accept Coordinator's proposal and RESCHEDULE to counter-propose
          const actions = [ACTIONS.VIEW, ACTIONS.CONFIRM, ACTIONS.RESCHEDULE];
          if (process.env.NODE_ENV !== 'production') {
            console.log('[getAllowedActions] Coordinator-Stakeholder with Coordinator reschedule proposal -> Returning actions with CONFIRM:', {
              actions,
              rescheduleProposal: rescheduleProposal.proposedBy
            });
          }
          return actions;
        }
        
        // If Stakeholder is the reviewer AND it's a pending/review state (not finalized), give reviewer actions
        // OR if Stakeholder is explicitly set as reviewer (regardless of state, unless already finalized)
        // Note: In Coordinator-Stakeholder cases, Coordinator is the requester, not Stakeholder, so we don't need to check !isRequester
        if (process.env.NODE_ENV !== 'production') {
          console.log('[getAllowedActions] Coordinator-Stakeholder condition check:', {
            isStakeholderReviewer,
            isPendingOrReviewState,
            isFinalized,
            hasCoordinatorProposal,
            conditionMet: (isStakeholderReviewer || isPendingOrReviewState) && !isFinalized
          });
        }
        
        if ((isStakeholderReviewer || isPendingOrReviewState) && !isFinalized) {
          // Get PENDING_REVIEW state config to ensure we return reviewer actions
          const pendingReviewConfig = STATE_TRANSITIONS[REQUEST_STATES.PENDING_REVIEW];
          if (pendingReviewConfig && pendingReviewConfig.allowedActions[ROLES.STAKEHOLDER]) {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[getAllowedActions] Returning Stakeholder reviewer actions for Coordinator-Stakeholder case:', {
                state,
                normalizedState,
                requestStatus,
                isPendingOrReviewState,
                isStakeholderReviewer,
                reviewer: request.reviewer,
                actions: pendingReviewConfig.allowedActions[ROLES.STAKEHOLDER]
              });
            }
            return pendingReviewConfig.allowedActions[ROLES.STAKEHOLDER];
          }
          // Fallback: use coordinator actions as template for reviewer actions
          if (pendingReviewConfig && pendingReviewConfig.allowedActions[ROLES.COORDINATOR]) {
            if (process.env.NODE_ENV !== 'production') {
              console.log('[getAllowedActions] Using Coordinator actions as fallback for Stakeholder reviewer');
            }
            return pendingReviewConfig.allowedActions[ROLES.COORDINATOR];
          }
        }
        // For other states, use normal role-based actions
        if (stateConfig.allowedActions[ROLES.STAKEHOLDER]) {
          return stateConfig.allowedActions[ROLES.STAKEHOLDER];
        }
        // Fallback: if no specific stakeholder actions defined, use coordinator actions as template
        if (stateConfig.allowedActions[ROLES.COORDINATOR]) {
          return stateConfig.allowedActions[ROLES.COORDINATOR];
        }
      }
    }

    // Normal State Logic - Check requester AFTER Coordinator-Stakeholder case
    // In Coordinator-Stakeholder cases, Stakeholder is reviewer (not requester), so skip requester check for them
    // CRITICAL: If user is the reschedule proposer, they should only get VIEW (already handled above, but double-check here)
    const rescheduleProposalCheck = request.rescheduleProposal && request.rescheduleProposal.proposedBy && request.rescheduleProposal.proposedBy.id;
    const isRescheduleProposer = rescheduleProposalCheck && String(request.rescheduleProposal.proposedBy.id) === String(userId);
    
    if (isRequester && stateConfig.requesterActions && !(isCoordinatorStakeholderCase && normalizedRole === ROLES.STAKEHOLDER) && !isRescheduleProposer) {
      return stateConfig.requesterActions;
    }

    if (isReviewer && !isRescheduleProposer) {
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
    // In Coordinator-Stakeholder cases, System Admin can still act as secondary authority
    // but Stakeholder (as primary reviewer) has priority in the flow
    if (isAdmin && stateConfig.allowedActions[ROLES.SYSTEM_ADMIN] && !requiresRequesterConfirmation) {
      const assignmentRule = REVIEWER_ASSIGNMENT_RULES[normalizedCreatorRole];
      // For Coordinator-Stakeholder cases, Admin can always act as secondary authority
      // For other cases, check allowAdminOverride flag
      if (isCoordinatorStakeholderCase || (assignmentRule && assignmentRule.allowAdminOverride)) {
        // System Admin can act as secondary authority in all cases, including Coordinator-Stakeholder
        // The Stakeholder's priority is maintained through reviewer assignment and notification routing
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

    // NEW: Coordinator-Stakeholder involvement case
    // When Coordinator creates request WITH Stakeholder, Stakeholder is the primary reviewer
    const creatorRole = request.made_by_role || request.creator?.role;
    const normalizedCreatorRole = this.normalizeRole(creatorRole);
    const isCoordinatorRequest = normalizedCreatorRole === ROLES.COORDINATOR;
    const hasStakeholder = !!(request.stakeholder_id || request.stakeholderId);
    
    if (isCoordinatorRequest && hasStakeholder && normalizedRole === ROLES.STAKEHOLDER) {
      // Stakeholder is the primary reviewer in Coordinator-Stakeholder cases
      const stakeholderId = request.stakeholder_id || request.stakeholderId;
      if (stakeholderId && String(stakeholderId) === String(userId)) {
        return true;
      }
    }

    // Stakeholder-created request logic: Coordinator is Reviewer
    const isStakeholderRequest = normalizedCreatorRole === ROLES.STAKEHOLDER;

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
