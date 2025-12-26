/**
 * Request Flow Engine
 * 
 * This is the primary engine for processing all request actions.
 * It uses the state machine as the single source of truth and minimizes legacy code usage.
 */

const { RequestStateMachine, REQUEST_STATES, ACTIONS } = require('./requestStateMachine');
const { EventRequest, Event, EventRequestHistory, Notification } = require('../../models/index');
const { REQUEST_STATUSES, REVIEW_DECISIONS, CREATOR_ACTIONS, buildDecisionSummary } = require('./requestFlow.helpers');

class RequestFlowEngine {
  constructor() {
    this.stateMachine = new RequestStateMachine();
  }

  /**
   * Normalize action input to state machine action
   */
  normalizeAction(actionInput, currentState) {
    if (!actionInput) return null;
    
    const input = String(actionInput).toLowerCase().trim();
    
    // CRITICAL: Prioritize confirm action - must check this FIRST
    // Check for explicit "confirm" keyword
    if (input.includes('confirm')) {
      return ACTIONS.CONFIRM;
    }
    
    // If in review-accepted or review-rejected states, "accepted" means CONFIRM (requester confirming)
    // BUT in review-rescheduled, "accept" means ACCEPT (reviewer accepting the reschedule proposal)
    if (currentState === REQUEST_STATES.REVIEW_ACCEPTED || currentState === REQUEST_STATES.REVIEW_REJECTED) {
      // In these states, "accepted" is a confirmation action by the requester
      if (input === 'accepted' || input.includes('accepted')) {
        return ACTIONS.CONFIRM;
      }
    }
    
    // In review-rescheduled state, "accept" defaults to ACCEPT
    // The distinction between ACCEPT (reviewer) and CONFIRM (requester) will be handled in processAction
    
    // Regular accept action
    if (input.includes('accept') || input === 'approve') {
      return ACTIONS.ACCEPT;
    }
    if (input.includes('reject') || input === 'deny' || input === 'rejected') {
      return ACTIONS.REJECT;
    }
    if (input.includes('resched') || input === 'reschedule' || input === 'rescheduled') {
      return ACTIONS.RESCHEDULE;
    }
    if (input.includes('cancel') || input === 'cancelled') {
      return ACTIONS.CANCEL;
    }
    
    return null;
  }

  /**
   * Process a request action using the state machine
   * This is the PRIMARY method for all request actions
   */
  async processAction(request, event, actorId, actorRole, actionData) {
    // Get current state
    const currentState = this.stateMachine.normalizeState(request.Status);
    
    // Normalize action
    const actionInput = String(actionData.action || '').toLowerCase().trim();
    let action = this.normalizeAction(actionInput, currentState);
    
    // Special handling for review-rescheduled state:
    // - If requester says "accept" or "accepted", it's CONFIRM (they're confirming the reschedule)
    // - If reviewer says "accept" or "accepted", it's ACCEPT (they're accepting the proposal)
    if (currentState === REQUEST_STATES.REVIEW_RESCHEDULED) {
      const isRequester = this.stateMachine.isRequester(actorId, request);
      // If user says "accept" or "accepted"
      if (actionInput.includes('accept') || actionInput === 'accepted') {
        if (isRequester) {
          // Requester accepting = CONFIRM
          action = ACTIONS.CONFIRM;
        } else {
          // Reviewer accepting = ACCEPT
          action = ACTIONS.ACCEPT;
        }
      }
    }
    
    if (!action) {
      throw new Error(`Invalid action: ${actionData.action}`);
    }
    
    // MODERNIZED: Role normalization removed - validation uses permissions + authority
    // actorRole is kept only for audit/display purposes, not for authorization
    
    // Validate transition (permission-based, not role-based)
    const isValid = await this.stateMachine.isValidTransition(currentState, action, actorRole, actorId, request);
    if (!isValid) {
      // Get allowed actions for better error message
      const allowedActions = await this.stateMachine.getAllowedActions(currentState, normalizedRole || actorRole, actorId, request);
      throw new Error(`Action '${action}' is not allowed in state '${currentState}' for role '${actorRole}' (normalized: ${normalizedRole}). Allowed actions: ${allowedActions.join(', ')}`);
    }

    // Get next state
    const nextState = this.stateMachine.getNextState(currentState, action);
    if (!nextState) {
      throw new Error(`No valid transition from state '${currentState}' with action '${action}'`);
    }

    // Build actor snapshot
    const actorSnapshot = await this.buildActorSnapshot(actorRole, actorId);

    // Validate action-specific requirements
    await this.validateAction(action, actionData, currentState);

    // Process the transition
    await this.executeTransition(request, event, currentState, nextState, action, actorSnapshot, actionData, actorRole);

    // Update statuses
    request.Status = nextState;
    
    // Update event status based on next state
    // IMPORTANT: Only set event status to final states (APPROVED, REJECTED, CANCELLED)
    // Keep event as "Pending" during intermediate states (REVIEW_ACCEPTED, REVIEW_REJECTED, etc.)
    if (nextState === REQUEST_STATES.APPROVED) {
      if (event) {
        event.Status = 'Completed';
        await event.save();
      }
    } else if (nextState === REQUEST_STATES.REJECTED || nextState === REQUEST_STATES.CANCELLED) {
      if (event) {
        event.Status = 'Rejected';
        await event.save();
      }
    } else {
      // For intermediate states (REVIEW_ACCEPTED, REVIEW_REJECTED, REVIEW_RESCHEDULED, etc.)
      // Keep event status as "Pending" until final confirmation
      // SPECIAL CASE: When rescheduling from APPROVED/Completed, always reset to Pending
      if (event && event.Status !== 'Pending') {
        const currentEventStatus = event.Status;
        // If rescheduling (transitioning to REVIEW_RESCHEDULED), always reset to Pending
        // This allows rescheduling of already approved/completed events
        if (nextState === REQUEST_STATES.REVIEW_RESCHEDULED && action === ACTIONS.RESCHEDULE) {
          event.Status = 'Pending';
          await event.save();
        } else if (currentEventStatus !== 'Completed' && currentEventStatus !== 'Rejected' && currentEventStatus !== 'Cancelled') {
          event.Status = 'Pending';
          await event.save();
        }
      }
    }

    // Save request
    await request.save();

    // Final verification: ensure event status is correct
    if (nextState === REQUEST_STATES.APPROVED && event) {
      const freshEvent = await Event.findOne({ Event_ID: event.Event_ID });
      if (freshEvent && freshEvent.Status !== 'Completed') {
        freshEvent.Status = 'Completed';
        await freshEvent.save();
      }
    } else if (nextState === REQUEST_STATES.REJECTED && event) {
      const freshEvent = await Event.findOne({ Event_ID: event.Event_ID });
      if (freshEvent && freshEvent.Status !== 'Rejected') {
        freshEvent.Status = 'Rejected';
        await freshEvent.save();
      }
    }

    return {
      success: true,
      message: `Request ${action} successfully`,
      request: request.toObject(),
      event: event ? event.toObject() : null
    };
  }

  /**
   * Validate action-specific requirements
   */
  async validateAction(action, actionData, currentState) {
    if (action === ACTIONS.RESCHEDULE) {
      if (!actionData.rescheduledDate) {
        throw new Error('Rescheduled date is required when rescheduling');
      }
      if (!actionData.note || (typeof actionData.note === 'string' && actionData.note.trim().length === 0)) {
        throw new Error('Note is required when rescheduling');
      }
      
      const rescheduledDate = new Date(actionData.rescheduledDate);
      if (isNaN(rescheduledDate.getTime())) {
        throw new Error('Invalid rescheduled date');
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const rsDay = new Date(rescheduledDate);
      rsDay.setHours(0, 0, 0, 0);
      if (rsDay.getTime() < today.getTime()) {
        throw new Error('Rescheduled date cannot be in the past');
      }
    }
  }

  /**
   * Execute the state transition
   */
  async executeTransition(request, event, currentState, nextState, action, actorSnapshot, actionData, actorRole) {
    const note = actionData.note || null;
    const rescheduledDate = actionData.rescheduledDate ? new Date(actionData.rescheduledDate) : null;

    // Record decision for reviewer actions
    if ([ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE].includes(action)) {
      let decisionType = null;
      if (action === ACTIONS.ACCEPT) decisionType = REVIEW_DECISIONS.ACCEPT;
      else if (action === ACTIONS.REJECT) decisionType = REVIEW_DECISIONS.REJECT;
      else if (action === ACTIONS.RESCHEDULE) decisionType = REVIEW_DECISIONS.RESCHEDULE;

      if (decisionType) {
        await this.recordDecision(
          request,
          {
            type: decisionType,
            notes: note,
            payload: action === ACTIONS.RESCHEDULE ? {
              proposedDate: rescheduledDate,
              proposedStartTime: actionData.proposedStartTime || null,
              proposedEndTime: actionData.proposedEndTime || null
            } : undefined
          },
          actorSnapshot,
          nextState
        );
      }
    }

    // Handle reschedule proposal
    // CRITICAL: Capture original date BEFORE updating event
    let originalEventDate = null;
    if (action === ACTIONS.RESCHEDULE && event && event.Start_Date) {
      originalEventDate = new Date(event.Start_Date);
    }
    
    if (action === ACTIONS.RESCHEDULE) {
      request.rescheduleProposal = {
        proposedDate: rescheduledDate,
        proposedStartTime: actionData.proposedStartTime || null,
        proposedEndTime: actionData.proposedEndTime || null,
        reviewerNotes: note,
        proposedAt: new Date(),
        proposedBy: actorSnapshot,
        originalDate: originalEventDate // Store original date in proposal
      };

      // Update reviewer assignment when rescheduling
      // Use reviewerAssignmentService to assign appropriate reviewer based on requester role
      const { reviewerAssignmentService } = require('./reviewerAssignment.service');
      const requesterId = request.requester?.id || request.requester?.userId || request.made_by_id;
      const requesterRoleSnapshot = request.requester?.roleSnapshot || request.creator?.role || request.made_by_role;
      
      if (requesterId) {
        try {
          const newReviewer = await reviewerAssignmentService.assignReviewer(requesterId, {
            requestType: 'eventRequest',
            locationId: request.location?.id || request.locationId,
            stakeholderId: request.requester?.id && requesterRoleSnapshot === 'stakeholder' ? request.requester.id : null
          });
          
          if (newReviewer) {
            request.reviewer = {
              id: newReviewer.id || newReviewer.userId,
              userId: newReviewer.userId,
              role: newReviewer.role || newReviewer.roleSnapshot,
              roleSnapshot: newReviewer.roleSnapshot || newReviewer.role,
              name: newReviewer.name,
              autoAssigned: true
            };
          }
        } catch (e) {
          // If assignment fails, keep existing reviewer
          console.error('Failed to assign reviewer on reschedule:', e);
        }
      }

      // Update event dates if rescheduling
      if (rescheduledDate && event && nextState === REQUEST_STATES.REVIEW_RESCHEDULED) {
        const currentStart = event.Start_Date ? new Date(event.Start_Date) : null;
        if (currentStart) {
          currentStart.setFullYear(rescheduledDate.getFullYear(), rescheduledDate.getMonth(), rescheduledDate.getDate());
          event.Start_Date = currentStart;
        }
        if (event.End_Date) {
          const currentEnd = new Date(event.End_Date);
          currentEnd.setFullYear(rescheduledDate.getFullYear(), rescheduledDate.getMonth(), rescheduledDate.getDate());
          event.End_Date = currentEnd;
        }
        // CRITICAL: Always reset event status to Pending when rescheduling
        // This allows rescheduling of already approved/completed events
        event.Status = 'Pending';
        await event.save();
      }
    }

    // Record status change
    await this.recordStatus(request, nextState, actorSnapshot, note);

    // Handle confirmation actions (for both approvals and rejections)
    if (action === ACTIONS.CONFIRM) {
      request.creatorConfirmation = {
        action: 'confirm',
        notes: note,
        confirmedAt: new Date(),
        actor: actorSnapshot
      };

      // Set final resolution based on next state
      if (nextState === REQUEST_STATES.APPROVED) {
        request.finalResolution = {
          outcome: 'approved',
          completedAt: new Date(),
          reason: note || null,
          publishedEventStatus: 'Completed'
        };
      } else if (nextState === REQUEST_STATES.REJECTED) {
        request.finalResolution = {
          outcome: 'rejected',
          completedAt: new Date(),
          reason: note || null,
          publishedEventStatus: 'Rejected'
        };
      }

      // Apply reschedule if present (only for approvals)
      if (nextState === REQUEST_STATES.APPROVED && request.rescheduleProposal && request.rescheduleProposal.proposedDate) {
        const proposed = request.rescheduleProposal;
        const newDate = new Date(proposed.proposedDate);
        if (!Number.isNaN(newDate.getTime()) && event) {
          const start = new Date(event.Start_Date);
          start.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
          event.Start_Date = start;
          if (event.End_Date) {
            const end = new Date(event.End_Date);
            end.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
            event.End_Date = end;
          }
          await event.save();
        }
        request.rescheduleProposal = null;
      }

      request.confirmationDueAt = null;

      // Log finalization
      const outcome = nextState === REQUEST_STATES.APPROVED ? 'approved' : 'rejected';
      await EventRequestHistory.logFinalization({
        requestId: request.Request_ID,
        eventId: request.Event_ID,
        actor: actorSnapshot,
        outcome: outcome,
        notes: note || null,
        // NEW: Audit trail fields (TODO: pass from service layer for full context)
        permissionUsed: action === ACTIONS.CONFIRM ? 'request.confirm' : null,
        reviewerAuthority: null, // TODO: Get from service layer
        requesterAuthority: null  // TODO: Get from service layer
      });
    }

    // Send notifications for reviewer actions (accept, reject, reschedule)
    if ([ACTIONS.ACCEPT, ACTIONS.REJECT, ACTIONS.RESCHEDULE].includes(action)) {
      let decisionType = null;
      if (action === ACTIONS.ACCEPT) decisionType = REVIEW_DECISIONS.ACCEPT;
      else if (action === ACTIONS.REJECT) decisionType = REVIEW_DECISIONS.REJECT;
      else if (action === ACTIONS.RESCHEDULE) decisionType = REVIEW_DECISIONS.RESCHEDULE;

      if (decisionType) {
        await this.notifyCreatorOfDecision(
          request,
          decisionType,
          note,
          action === ACTIONS.RESCHEDULE ? request.rescheduleProposal : null,
          actorSnapshot,
          event, // Pass event for context
          originalEventDate // Pass original date captured before event update
        );
      }
    }

    // Send notifications for confirmation actions (when event becomes approved/rejected)
    if (action === ACTIONS.CONFIRM && (nextState === REQUEST_STATES.APPROVED || nextState === REQUEST_STATES.REJECTED)) {
      // Sending event finalized notification - no verbose log
      await this.notifyEventFinalized(request, event, nextState, actorSnapshot, note);
    }
  }

  /**
   * Build actor snapshot - must be set by service
   */
  async buildActorSnapshot(role, id) {
    if (!this._buildActorSnapshotFn) {
      throw new Error('buildActorSnapshot function not set');
    }
    return await this._buildActorSnapshotFn(role, id);
  }

  /**
   * Set the buildActorSnapshot function from service
   */
  setBuildActorSnapshotFn(fn) {
    this._buildActorSnapshotFn = fn;
  }


  async recordStatus(request, newStatus, actorSnapshot, note) {
    request.statusHistory = Array.isArray(request.statusHistory) ? request.statusHistory : [];
    request.statusHistory.push({
      status: newStatus,
      note: note || null,
      changedAt: new Date(),
      actor: actorSnapshot || null
    });
    
    await EventRequestHistory.logStatusChange({
      requestId: request.Request_ID,
      eventId: request.Event_ID,
      previousStatus: request.Status,
      newStatus,
      actor: actorSnapshot || null,
      note: note || null,
      metadata: {},
      // NEW: Audit trail fields (TODO: pass from service layer for full context)
      permissionUsed: null, // TODO: Get from service layer
      reviewerAuthority: null, // TODO: Get from service layer
      requesterAuthority: null  // TODO: Get from service layer
    });
  }

  async recordDecision(request, decisionPayload, actorSnapshot, nextStatus) {
    request.decisionHistory = Array.isArray(request.decisionHistory) ? request.decisionHistory : [];
    request.decisionHistory.push({
      ...decisionPayload,
      decidedAt: new Date(),
      actor: actorSnapshot,
      resultStatus: nextStatus
    });

    await EventRequestHistory.logReviewDecision({
      requestId: request.Request_ID,
      eventId: request.Event_ID,
      decisionType: decisionPayload.type,
      actor: actorSnapshot,
      notes: decisionPayload.notes,
      previousStatus: request.Status,
      newStatus: nextStatus,
      metadata: decisionPayload.payload || {},
      // NEW: Audit trail fields
      permissionUsed: 'request.review', // Review decision uses request.review permission
      reviewerAuthority: null, // TODO: Get from service layer
      requesterAuthority: null  // TODO: Get from service layer
    });
  }

  async notifyCreatorOfDecision(request, decisionType, note, reschedulePayload, actorSnapshot, event = null, originalEventDate = null) {
    try {
      // For reschedules, notify the reviewer (not the proposer)
      // For accept/reject, notify the creator (requester)
      let recipientId = null;
      let recipientType = 'Coordinator';
      let originalDate = null;
      
      if (decisionType === REVIEW_DECISIONS.RESCHEDULE) {
        // Reschedule: notify the reviewer (the person who needs to review the proposal)
        // The reviewer is the person who should act on the reschedule, not the proposer
        if (request.reviewer && request.reviewer.id) {
          recipientId = request.reviewer.id;
          const reviewerRole = request.reviewer.role || 'Coordinator';
          if (String(reviewerRole).toLowerCase().includes('admin') || String(reviewerRole).toLowerCase().includes('system')) {
            recipientType = 'Admin';
          } else if (String(reviewerRole).toLowerCase().includes('stakeholder')) {
            recipientType = 'Stakeholder';
          } else {
            recipientType = 'Coordinator';
          }
          } else {
            // Fallback: use requester or reviewer from request
            if (request.requester?.id || request.requester?.userId) {
              recipientId = request.requester.id || request.requester.userId;
              recipientType = request.requester.roleSnapshot || request.requester.role || 'Coordinator';
            } else if (request.reviewer?.id || request.reviewer?.userId) {
              recipientId = request.reviewer.id || request.reviewer.userId;
              recipientType = request.reviewer.roleSnapshot || request.reviewer.role || 'Coordinator';
            } else {
              recipientId = request.made_by_id;
              recipientType = request.creator?.role || request.made_by_role || 'Coordinator';
            }
          }
        
        // Use original date from reschedule proposal or passed parameter
        if (reschedulePayload && reschedulePayload.originalDate) {
          originalDate = new Date(reschedulePayload.originalDate);
        } else if (originalEventDate) {
          originalDate = new Date(originalEventDate);
        } else if (event && event.Start_Date) {
          // Fallback: try to get from event (may be updated already)
          originalDate = new Date(event.Start_Date);
        }
      } else {
        // Accept/Reject: notify the creator (requester)
        recipientId = request.requester?.id || request.requester?.userId || request.made_by_id;
        if (!recipientId) return;
        
        recipientType = request.requester?.roleSnapshot || request.creator?.role || request.made_by_role || 'Coordinator';
        if (recipientType === 'SystemAdmin' || recipientType === 'system-admin') recipientType = 'Admin';
      }
      
      if (!recipientId) return;
      
      const actionMap = {
        [REVIEW_DECISIONS.ACCEPT]: 'Accepted',
        [REVIEW_DECISIONS.REJECT]: 'Rejected',
        [REVIEW_DECISIONS.RESCHEDULE]: 'Rescheduled'
      };
      
      // Get actor information from snapshot
      const actorRole = actorSnapshot?.role || 'Admin';
      const actorName = actorSnapshot?.name || null;
      
      // Determine if confirmation is needed
      let confirmationMessage = '';
      if (decisionType === REVIEW_DECISIONS.ACCEPT) {
        confirmationMessage = ' Please confirm to approve the event.';
      } else if (decisionType === REVIEW_DECISIONS.REJECT) {
        confirmationMessage = ' Please confirm to finalize the rejection.';
      } else if (decisionType === REVIEW_DECISIONS.RESCHEDULE) {
        confirmationMessage = ' Please confirm to approve the rescheduled date.';
      }
      
      await Notification.createAdminActionNotification(
        recipientId,
        request.Request_ID,
        request.Event_ID,
        actionMap[decisionType] || 'Accepted',
        (note || '') + confirmationMessage,
        reschedulePayload?.proposedDate || null,
        recipientType,
        originalDate, // Pass original date for reschedule notifications
        actorRole,
        actorName
      );
    } catch (e) {
      // swallow notification errors
      console.error('Failed to send creator decision notification:', e);
    }
  }

  async notifyEventFinalized(request, event, nextState, actorSnapshot, note) {
    try {
      // Only send notifications when event is approved (published/live)
      if (nextState !== REQUEST_STATES.APPROVED) {
        return;
      }

      // Find who actually approved the request (the reviewer who accepted it)
      // This is different from who confirmed it (the requester who confirmed)
      let approverRole = actorSnapshot?.role || 'Admin';
      let approverName = actorSnapshot?.name || null;
      
      // Check decisionHistory to find who accepted the request
      if (request.decisionHistory && Array.isArray(request.decisionHistory) && request.decisionHistory.length > 0) {
        // Find the most recent ACCEPT decision
        const acceptDecision = request.decisionHistory
          .slice()
          .reverse()
          .find(d => d.type === 'accept' || d.type === REVIEW_DECISIONS.ACCEPT);
        
        if (acceptDecision && acceptDecision.actor) {
          approverRole = acceptDecision.actor.role || approverRole;
          approverName = acceptDecision.actor.name || approverName;
        }
      }
      
      // Fallback: if reviewer is set and it's a SystemAdmin or Coordinator, use that
      if (!approverName && request.reviewer && request.reviewer.role) {
        const reviewerRole = String(request.reviewer.role).toLowerCase();
        if (reviewerRole.includes('admin') || reviewerRole.includes('system')) {
          approverRole = 'SystemAdmin';
          approverName = request.reviewer.name || null;
        } else if (reviewerRole.includes('coordinator')) {
          approverRole = 'Coordinator';
          approverName = request.reviewer.name || null;
        }
      }

      const eventTitle = event?.Event_Title || 'the event';
      
      // Collect all recipients to notify (using Map with id as key to avoid duplicates)
      const recipientsMap = new Map();
      
      // 1. Notify requester (creator)
      const requesterId = request.requester?.id || request.requester?.userId || request.made_by_id;
      const requesterRole = request.requester?.roleSnapshot || request.creator?.role || request.made_by_role;
      if (requesterId) {
        let requesterType = 'Coordinator';
        if (requesterRole && (String(requesterRole).toLowerCase().includes('admin') || String(requesterRole).toLowerCase().includes('system'))) {
          requesterType = 'Admin';
        } else if (requesterRole && String(requesterRole).toLowerCase().includes('stakeholder')) {
          requesterType = 'Stakeholder';
        }
        recipientsMap.set(requesterId.toString(), {
          id: requesterId,
          type: requesterType,
          role: requesterRole || 'Coordinator'
        });
      }
      
      // 2. Notify reviewer
      const reviewerId = request.reviewer?.id || request.reviewer?.userId;
      const reviewerRole = request.reviewer?.roleSnapshot || request.reviewer?.role;
      if (reviewerId && !recipientsMap.has(reviewerId.toString())) {
        let reviewerType = 'Coordinator';
        if (reviewerRole && (String(reviewerRole).toLowerCase().includes('admin') || String(reviewerRole).toLowerCase().includes('system'))) {
          reviewerType = 'Admin';
        } else if (reviewerRole && String(reviewerRole).toLowerCase().includes('stakeholder')) {
          reviewerType = 'Stakeholder';
        }
        recipientsMap.set(reviewerId.toString(), {
          id: reviewerId,
          type: reviewerType,
          role: reviewerRole || 'Coordinator'
        });
      }
      
      // Send notification to all recipients
      // Note: The message will be formatted by createAdminActionNotification based on the action
      
      console.log('[notifyEventFinalized] Sending notifications:', {
        recipientsCount: recipientsMap.size,
        approverRole,
        approverName,
        eventTitle,
        requestId: request.Request_ID,
        eventId: request.Event_ID
      });
      
      for (const recipient of recipientsMap.values()) {
        try {
          console.log('[notifyEventFinalized] Sending to recipient:', {
            recipientId: recipient.id,
            recipientType: recipient.type,
            approverRole,
            approverName
          });
          await Notification.createAdminActionNotification(
            recipient.id,
            request.Request_ID,
            request.Event_ID,
            'Approved', // Use 'Approved' action which will format the message correctly
            null, // note parameter - not needed for approval
            null, // rescheduledDate
            recipient.type,
            null, // originalDate
            approverRole, // Use approver role (who accepted), not confirmer role
            approverName // Use approver name (who accepted), not confirmer name
          );
          console.log('[notifyEventFinalized] Notification sent successfully to:', recipient.id);
        } catch (e) {
          // Continue with other recipients if one fails
          console.error(`Failed to send notification to ${recipient.type} ${recipient.id}:`, e);
        }
      }
    } catch (e) {
      // swallow notification errors
      console.error('Failed to send event finalized notification:', e);
    }
  }
}

module.exports = RequestFlowEngine;


