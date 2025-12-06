const {
  EventRequest,
  EventRequestHistory,
  Event,
  Coordinator,
  SystemAdmin,
  BloodDrive,
  Advocacy,
  Training,
  EventStaff,
  Notification,
  District,
  Stakeholder,
  BloodbankStaff
} = require('../../models/index');
const {
  REQUEST_STATUSES,
  REVIEW_DECISIONS,
  CREATOR_ACTIONS,
  buildReviewSummary,
  buildDecisionSummary
} = require('./requestFlow.helpers');
const systemSettings = require('./systemSettings.service');

class EventRequestService {
  /**
   * Generate unique IDs
   */
  generateEventID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `EVENT_${timestamp}_${random}`;
  }

  generateRequestID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `REQ_${timestamp}_${random}`;
  }

  /**
   * Check if event date overlaps with existing events for same coordinator
   * @param {string} coordinatorId 
   * @param {Date} eventDate 
   * @returns {boolean} True if overlaps
   */
  async checkCoordinatorOverlappingRequests(coordinatorId, eventDate, excludeRequestId = null) {
    try {
      const startOfDay = new Date(eventDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(eventDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Find other events on the same date by same coordinator
      const query = {
        coordinator_id: coordinatorId,
        Status: { $nin: ['Rejected', 'Rejected_By_Admin'] },
        // We need to check by event date
      };

      if (excludeRequestId) {
        query.Request_ID = { $ne: excludeRequestId };
      }

      const requests = await EventRequest.find(query);
      
      // Check if any of these requests have events on the same date
      for (const request of requests) {
        const event = await Event.findOne({ Event_ID: request.Event_ID });
        if (event && event.Start_Date) {
          const requestEventDate = new Date(event.Start_Date);
          requestEventDate.setHours(0, 0, 0, 0);
          
          if (requestEventDate.getTime() === startOfDay.getTime()) {
            return true; // Overlap found
          }
        }
      }

      return false; // No overlap
    } catch (error) {
      throw new Error(`Failed to check overlaps: ${error.message}`);
    }
  }

  /**
   * Resolve an EventRequest by either Request_ID or Mongo _id
   * @param {string} requestId
   * @returns {Document|null}
   */
  async _findRequest(requestId) {
    if (!requestId) return null;
    // Try by Request_ID first
    let request = await EventRequest.findOne({ Request_ID: requestId });
    if (request) return request;
    // Try by Mongo _id
    try {
      request = await EventRequest.findById(requestId);
      if (request) return request;
    } catch (e) {
      // ignore invalid ObjectId errors
    }
    return null;
  }

  _normalizeRole(role) {
    if (!role) return null;
    const normalized = String(role).toLowerCase();
    if (normalized === 'admin' || normalized === 'systemadmin' || normalized === 'sysadmin' || normalized === 'sysad') {
      return 'SystemAdmin';
    }
    if (normalized === 'coordinator') return 'Coordinator';
    if (normalized === 'stakeholder') return 'Stakeholder';
    return role;
  }

  async _fetchBloodbankStaffName(staffId) {
    if (!staffId) return null;
    const staff = await BloodbankStaff.findOne({ ID: staffId }).lean().exec();
    if (!staff) return null;
    const first = staff.First_Name || staff.firstName || '';
    const last = staff.Last_Name || staff.lastName || '';
    return `${first} ${last}`.trim() || staff.FullName || null;
  }

  async _fetchStakeholderName(stakeholderId) {
    if (!stakeholderId) return null;
    const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: stakeholderId }).lean().exec();
    if (!stakeholder) return null;
    const first = stakeholder.firstName || stakeholder.First_Name || stakeholder.FirstName || '';
    const last = stakeholder.lastName || stakeholder.Last_Name || stakeholder.LastName || '';
    return `${first} ${last}`.trim() || stakeholder.organizationInstitution || null;
  }

  async _buildActorSnapshot(role, id) {
    if (!role || !id) return null;
    const normalizedRole = this._normalizeRole(role);
    let name = null;
    if (normalizedRole === 'Stakeholder') {
      name = await this._fetchStakeholderName(id);
    } else {
      name = await this._fetchBloodbankStaffName(id);
    }
    return {
      role: normalizedRole,
      id,
      name: name || null
    };
  }

  async _resolveCoordinatorName(coordinatorId) {
    return this._fetchBloodbankStaffName(coordinatorId);
  }

  _getReviewExpiryHours() {
    const hours = Number(systemSettings.getSetting('reviewAutoExpireHours'));
    return Number.isFinite(hours) && hours > 0 ? hours : 72;
  }

  _getConfirmationWindowHours() {
    const hours = Number(systemSettings.getSetting('reviewConfirmationWindowHours'));
    return Number.isFinite(hours) && hours > 0 ? hours : 48;
  }

  _computeExpiryDate(hours) {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + (hours || this._getReviewExpiryHours()));
    return expiry;
  }

  async _assignReviewerContext({ creatorRole, coordinatorId, stakeholderId, province, district }) {
    const normalizedCreator = this._normalizeRole(creatorRole);

    if (normalizedCreator === 'SystemAdmin') {
      if (!coordinatorId) {
        throw new Error('SystemAdmin-created requests must specify a coordinator reviewer');
      }
      const name = await this._resolveCoordinatorName(coordinatorId);
      return {
        id: coordinatorId,
        role: 'Coordinator',
        name: name || null,
        autoAssigned: true
      };
    }

    if (normalizedCreator === 'Coordinator') {
      const admin = await SystemAdmin.findOne().lean().exec();
      if (!admin) {
        throw new Error('No system administrator available to review requests');
      }
      const name = `${admin.First_Name || admin.firstName || ''} ${admin.Last_Name || admin.lastName || ''}`.trim() || admin.FullName || null;
      return {
        id: admin.Admin_ID,
        role: 'SystemAdmin',
        name: name || null,
        autoAssigned: true
      };
    }

    // Stakeholder-created request: prefer coordinator from district or assigned coordinator
    let targetCoordinatorId = coordinatorId;
    let resolvedProvince = province;
    let resolvedDistrict = district;

    if (!targetCoordinatorId && stakeholderId) {
      const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: stakeholderId }).lean().exec();
      if (stakeholder) {
        targetCoordinatorId = stakeholder.Coordinator_ID || stakeholder.coordinator_id || targetCoordinatorId;
        resolvedProvince = resolvedProvince || stakeholder.province;
        resolvedDistrict = resolvedDistrict || stakeholder.district;
      }
    }

    if (!targetCoordinatorId && resolvedDistrict) {
      const coordinator = await Coordinator.findOne({ district: resolvedDistrict }).lean().exec();
      if (coordinator) {
        targetCoordinatorId = coordinator.Coordinator_ID;
      }
    }

    if (targetCoordinatorId) {
      const name = await this._resolveCoordinatorName(targetCoordinatorId);
      return {
        id: targetCoordinatorId,
        role: 'Coordinator',
        name: name || null,
        autoAssigned: true
      };
    }

    const admin = await SystemAdmin.findOne().lean().exec();
    if (!admin) {
      throw new Error('No reviewer available to process this request');
    }

    const adminName = `${admin.First_Name || admin.firstName || ''} ${admin.Last_Name || admin.lastName || ''}`.trim() || admin.FullName || null;
    return {
      id: admin.Admin_ID,
      role: 'SystemAdmin',
      name: adminName || null,
      autoAssigned: true
    };
  }

  async _recordStatus(request, newStatus, actorSnapshot, note, metadata = {}, options = {}) {
    request.statusHistory = Array.isArray(request.statusHistory) ? request.statusHistory : [];
    request.statusHistory.push({
      status: newStatus,
      note: note || null,
      changedAt: new Date(),
      actor: actorSnapshot || null
    });
    const previousStatus = request.Status;
    request.Status = newStatus;
    if (!options.skipHistory) {
      await EventRequestHistory.logStatusChange({
        requestId: request.Request_ID,
        eventId: request.Event_ID,
        previousStatus,
        newStatus,
        actor: actorSnapshot || null,
        note: note || null,
        metadata
      });
    }
  }

  async _recordDecision(request, decisionPayload, actorSnapshot, nextStatus) {
    const resultStatus = nextStatus || decisionPayload.resultStatus || request.Status;
    request.decisionHistory = Array.isArray(request.decisionHistory) ? request.decisionHistory : [];
    request.decisionHistory.push(Object.assign(
      {
        decidedAt: new Date(),
        actor: actorSnapshot,
        resultStatus
      },
      decisionPayload
    ));

    await EventRequestHistory.logReviewDecision({
      requestId: request.Request_ID,
      eventId: request.Event_ID,
      decisionType: decisionPayload.type,
      actor: actorSnapshot,
      notes: decisionPayload.notes,
      previousStatus: request.Status,
      newStatus: resultStatus,
      metadata: decisionPayload.payload || {}
    });
  }

  async _markExpired(request, reason = 'Reviewer did not respond in time') {
    request.expiredAt = new Date();
    request.finalResolution = {
      outcome: 'expired',
      completedAt: request.expiredAt,
      reason
    };
    await this._recordStatus(request, REQUEST_STATUSES.EXPIRED, null, reason);
    await request.save();
    await EventRequestHistory.logExpiry({
      requestId: request.Request_ID,
      eventId: request.Event_ID,
      previousStatus: REQUEST_STATUSES.PENDING_REVIEW,
      note: reason
    });
  }

  async _expireStaleRequests() {
    const now = new Date();
    const staleRequests = await EventRequest.find({
      Status: REQUEST_STATUSES.PENDING_REVIEW,
      expiresAt: { $lte: now }
    });

    for (const request of staleRequests) {
      await this._markExpired(request);
    }
  }

  _validateReschedulePayload(payload) {
    if (!payload) {
      throw new Error('Reschedule payload is required');
    }
    const proposedDate = new Date(payload.proposedDate || payload.rescheduledDate || payload.newDate);
    if (Number.isNaN(proposedDate.getTime())) {
      throw new Error('Invalid reschedule date');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (proposedDate.getTime() < today.getTime()) {
      throw new Error('Reschedule date cannot be in the past');
    }

    const proposedStartTime = payload.proposedStartTime || payload.newStartTime;
    const proposedEndTime = payload.proposedEndTime || payload.newEndTime;
    if (!proposedStartTime || !proposedEndTime) {
      throw new Error('Reschedule requires both start and end times');
    }
    if (proposedStartTime >= proposedEndTime) {
      throw new Error('Reschedule end time must be later than start time');
    }

    return {
      proposedDate,
      proposedStartTime,
      proposedEndTime
    };
  }

  async _notifyCreatorOfDecision(request, decision, note, reschedulePayload) {
    try {
      const recipientId = request.made_by_id;
      if (!recipientId) return;
      let recipientType = request.creator?.role || 'Coordinator';
      if (recipientType === 'SystemAdmin') recipientType = 'Admin';
      const actionMap = {
        [REVIEW_DECISIONS.ACCEPT]: 'Accepted',
        [REVIEW_DECISIONS.REJECT]: 'Rejected',
        [REVIEW_DECISIONS.RESCHEDULE]: 'Rescheduled'
      };
      await Notification.createAdminActionNotification(
        recipientId,
        request.Request_ID,
        request.Event_ID,
        actionMap[decision] || 'Accepted',
        note || null,
        reschedulePayload?.proposedDate || null,
        recipientType
      );
    } catch (e) {
      // swallow notification errors to avoid blocking flow
    }
  }

  async _notifyReviewerOfConfirmation(request, action) {
    try {
      if (!request.reviewer || !request.reviewer.id) return;
      await Notification.createCoordinatorActionNotification(
        request.reviewer.id,
        request.Request_ID,
        request.Event_ID,
        action === CREATOR_ACTIONS.CONFIRM ? 'Approved' : 'Rejected'
      );
    } catch (e) {
      // ignore notification errors
    }
  }

  async _finalizeRequest(request, event, outcome, actorSnapshot, note, { applyReschedule = false } = {}) {
    if (applyReschedule && request.rescheduleProposal) {
      const proposed = request.rescheduleProposal;
      const newDate = new Date(proposed.proposedDate);
      if (!Number.isNaN(newDate.getTime())) {
        const start = new Date(event.Start_Date);
        start.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
        event.Start_Date = start;
        if (event.End_Date) {
          const end = new Date(event.End_Date);
          end.setFullYear(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
          event.End_Date = end;
        }
      }
    }

    if (outcome === 'approved') {
      event.Status = 'Completed';
    } else if (outcome === 'rejected' || outcome === 'cancelled') {
      event.Status = 'Rejected';
    }
    await event.save();

    request.finalResolution = {
      outcome,
      completedAt: new Date(),
      reason: note || null,
      publishedEventStatus: event.Status
    };
    if (applyReschedule) {
      request.rescheduleProposal = null;
    }
    request.confirmationDueAt = null;
    await this._recordStatus(request, REQUEST_STATUSES.COMPLETED, actorSnapshot, note);
    await request.save();
    await EventRequestHistory.logFinalization({
      requestId: request.Request_ID,
      eventId: request.Event_ID,
      actor: actorSnapshot,
      outcome,
      notes: note || null
    });
  }

  async _handleReviewerDecision(request, event, actorSnapshot, decisionInput) {
    const action = String(decisionInput.action || '').toLowerCase();
    let decisionType;
    if (action === 'accept' || action === 'accepted' || action === 'approve') {
      decisionType = REVIEW_DECISIONS.ACCEPT;
    } else if (action === 'reject' || action === 'rejected' || action === 'deny') {
      decisionType = REVIEW_DECISIONS.REJECT;
    } else if (action === 'reschedule' || action === 'rescheduled' || action === 'propose') {
      decisionType = REVIEW_DECISIONS.RESCHEDULE;
    } else {
      throw new Error('Invalid reviewer action');
    }

    if ((decisionType === REVIEW_DECISIONS.REJECT || decisionType === REVIEW_DECISIONS.RESCHEDULE) && !decisionInput.note) {
      throw new Error('Decision notes are required for rejection or reschedule');
    }

    let reschedulePayload = null;
    if (decisionType === REVIEW_DECISIONS.RESCHEDULE) {
      reschedulePayload = this._validateReschedulePayload(decisionInput.reschedulePayload || decisionInput);
    }

    const nextStatusMap = {
      [REVIEW_DECISIONS.ACCEPT]: REQUEST_STATUSES.REVIEW_ACCEPTED,
      [REVIEW_DECISIONS.REJECT]: REQUEST_STATUSES.REVIEW_REJECTED,
      [REVIEW_DECISIONS.RESCHEDULE]: REQUEST_STATUSES.REVIEW_RESCHEDULED
    };
    const nextStatus = nextStatusMap[decisionType];

    await this._recordDecision(
      request,
      {
        type: decisionType,
        notes: decisionInput.note || null,
        payload: reschedulePayload ? { ...reschedulePayload } : undefined
      },
      actorSnapshot,
      nextStatus
    );

    if (decisionType === REVIEW_DECISIONS.RESCHEDULE) {
      request.rescheduleProposal = {
        ...reschedulePayload,
        reviewerNotes: decisionInput.note || null,
        proposedAt: new Date(),
        proposedBy: actorSnapshot
      };
    } else {
      request.rescheduleProposal = null;
    }

    request.decisionSummary = buildDecisionSummary({
      reviewerName: actorSnapshot?.name || 'Reviewer',
      decision: decisionType,
      eventTitle: event.Event_Title,
      reschedulePayload: request.rescheduleProposal,
      notes: decisionInput.note || null
    });

    request.creatorConfirmation = null;
    request.confirmationDueAt = this._computeExpiryDate(this._getConfirmationWindowHours());
    await this._recordStatus(request, nextStatus, actorSnapshot, decisionInput.note || null, {}, { skipHistory: true });
    await request.save();
    await this._notifyCreatorOfDecision(request, decisionType, decisionInput.note || null, reschedulePayload);

    return {
      success: true,
      message: `Request ${decisionType}ed successfully`,
      request: request.toObject()
    };
  }

  async _handleCreatorResponse(request, event, actorSnapshot, actionInput) {
    const action = String(actionInput.action || '').toLowerCase();
    if (action === CREATOR_ACTIONS.REVISE) {
      request.revision = request.revision || { number: 1, supersedes: [] };
      request.revision.number = (request.revision.number || 1) + 1;
      request.revision.lastRevisedAt = new Date();
      request.revision.supersedes = Array.isArray(request.revision.supersedes) ? request.revision.supersedes : [];
      request.revision.supersedes.push(`${request.Status}:${request.revision.number}`);
      request.creatorConfirmation = {
        action: 'revise',
        notes: actionInput.note || null,
        confirmedAt: new Date(),
        actor: actorSnapshot
      };
      request.decisionSummary = null;
      request.confirmationDueAt = null;
      await this._recordStatus(request, REQUEST_STATUSES.PENDING_REVIEW, actorSnapshot, actionInput.note || null);
      await EventRequestHistory.logRevision({
        requestId: request.Request_ID,
        eventId: request.Event_ID,
        actor: actorSnapshot,
        revisionNumber: request.revision.number,
        note: actionInput.note || null
      });
      await request.save();
      return {
        success: true,
        message: 'Request sent back for re-review',
        request: request.toObject()
      };
    }

    if (action !== CREATOR_ACTIONS.CONFIRM && action !== CREATOR_ACTIONS.DECLINE) {
      throw new Error('Creator action must be confirm, decline, or revise');
    }

    const resolutionStatus = action === CREATOR_ACTIONS.CONFIRM
      ? REQUEST_STATUSES.CREATOR_CONFIRMED
      : REQUEST_STATUSES.CREATOR_DECLINED;
    await this._recordStatus(request, resolutionStatus, actorSnapshot, actionInput.note || null);
    request.creatorConfirmation = {
      action,
      notes: actionInput.note || null,
      confirmedAt: new Date(),
      actor: actorSnapshot
    };

    const isRescheduleAcceptance = request.Status === REQUEST_STATUSES.CREATOR_CONFIRMED
      && request.rescheduleProposal
      && action === CREATOR_ACTIONS.CONFIRM;

    const outcome = action === CREATOR_ACTIONS.CONFIRM && request.decisionHistory?.length
      ? (request.decisionHistory[request.decisionHistory.length - 1].type === REVIEW_DECISIONS.REJECT ? 'rejected' : 'approved')
      : (action === CREATOR_ACTIONS.CONFIRM ? 'approved' : 'rejected');

    await request.save();
    await this._notifyReviewerOfConfirmation(request, action);
    await this._finalizeRequest(
      request,
      event,
      outcome,
      actorSnapshot,
      actionInput.note || null,
      { applyReschedule: isRescheduleAcceptance }
    );

    return {
      success: true,
      message: 'Creator response recorded',
      request: request.toObject()
    };
  }

  /**
   * Check if date has double booking (location/venue)
   * @param {Date} eventDate 
   * @param {string} location 
   * @returns {boolean} True if double booked
   */
  async checkDoubleBooking(eventDate, location, excludeEventId = null) {
    try {
      const startOfDay = new Date(eventDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(eventDate);
      endOfDay.setHours(23, 59, 59, 999);

      const query = {
        Start_Date: { $gte: startOfDay, $lte: endOfDay },
        Location: location,
        Status: { $in: ['Completed', 'Completed', 'Accepted'] }
      };

      if (excludeEventId) {
        query.Event_ID = { $ne: excludeEventId };
      }

      const existingEvent = await Event.findOne(query);
      return !!existingEvent;
    } catch (error) {
      throw new Error(`Failed to check double booking: ${error.message}`);
    }
  }

  /**
   * Validate all scheduling rules before creating request
   * @param {string} coordinatorId 
   * @param {Object} eventData 
   * @returns {Object} Validation results
   */
  async validateSchedulingRules(coordinatorId, eventData, excludeRequestId = null, options = {}) {
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Determine actor role/id (controller may tag eventData with these)
      const actorRole = (options && options.actorRole) || (eventData && eventData._actorRole) || null;
      const actorId = (options && options.actorId) || (eventData && eventData._actorId) || null;

      // Normalize date to Date instance
      const startDate = new Date(eventData.Start_Date);
      if (isNaN(startDate.getTime())) {
        return { isValid: false, errors: ['Invalid Start_Date'], warnings: [] };
      }
      let endDate = null;
      if (eventData.End_Date) {
        endDate = new Date(eventData.End_Date);
        if (isNaN(endDate.getTime())) {
          return { isValid: false, errors: ['Invalid End_Date'], warnings: [] };
        }
        // If End_Date is before Start_Date, normalize instead of failing.
        // This handles cases where End_Date may be a date-only string (parsed as midnight)
        // or when users omit end time. In such cases treat the event as a single-day event
        // by setting endDate to startDate. Also emit a warning so callers can surface it.
        if (endDate.getTime() < startDate.getTime()) {
          endDate = new Date(startDate);
          validationResults.warnings.push('End_Date was before Start_Date; treating as same day');
        }
      }

      // 1. Check advance booking limit (always enforced, even for admins)
      const advanceBooking = systemSettings.validateAdvanceBooking(startDate);
      if (!advanceBooking.isValid) {
        validationResults.isValid = false;
        validationResults.errors.push(advanceBooking.message);
      }

      // If actor is Admin or Coordinator, bypass other validation rules
      if (actorRole && (String(actorRole).toLowerCase() === 'admin' || String(actorRole).toLowerCase() === 'coordinator')) {
        return validationResults; // Return with advance booking check result
      }

      // 2. Check weekend restriction
      const weekendCheck = systemSettings.validateWeekendRestriction(startDate);
      if (weekendCheck.requiresOverride) {
        // Weekend events need admin approval, but don't block creation
        validationResults.warnings.push(weekendCheck.message);
      }

      // 2b. Check permanently blocked weekdays and specific blocked dates
      try {
        const blockedWeekdays = systemSettings.getSetting('blockedWeekdays') || [];
        if (Array.isArray(blockedWeekdays) && blockedWeekdays.length >= 7 && blockedWeekdays[startDate.getDay()]) {
          validationResults.isValid = false;
          validationResults.errors.push('Selected weekday is blocked and not available for events');
        }

        const blockedDates = systemSettings.getSetting('blockedDates') || [];
        if (Array.isArray(blockedDates) && blockedDates.length > 0) {
          const iso = new Date(startDate);
          iso.setHours(0,0,0,0);
          const isoStr = iso.toISOString().slice(0,10);
          if (blockedDates.map(String).includes(isoStr)) {
            validationResults.isValid = false;
            validationResults.errors.push('Selected date is blocked and not available for events');
          }
        }
      } catch (e) {
        // ignore block-list check errors
      }

      // 3. Check coordinator has pending request limit
      // Optionally skip this check for admin/coordinator actors who auto-approve
      // their own actions (they shouldn't be limited by pending stakeholder requests).
      if (!options.skipPendingLimit) {
        let pendingCount = 0;
        // If actor is a stakeholder, count only their own pending requests
        if (actorRole && String(actorRole).toLowerCase() === 'stakeholder' && actorId) {
          pendingCount = await EventRequest.countDocuments({
            stakeholder_id: actorId,
            Status: REQUEST_STATUSES.PENDING_REVIEW
          });
        } else {
          // Default: count pending for the coordinator
          pendingCount = await EventRequest.countDocuments({
            coordinator_id: coordinatorId,
            Status: REQUEST_STATUSES.PENDING_REVIEW
          });
        }
        const pendingCheck = systemSettings.validatePendingRequestsLimit(pendingCount);
        if (!pendingCheck.isValid) {
          validationResults.isValid = false;
          validationResults.errors.push(pendingCheck.message);
        }
      }

      // 4. Check for overlapping requests (same coordinator, same date)
      if (systemSettings.getSetting('preventOverlappingRequests')) {
        let hasOverlap = false;
        // If actor is a stakeholder, only consider their own requests for overlap
        if (actorRole && String(actorRole).toLowerCase() === 'stakeholder' && actorId) {
          // Find requests created by this stakeholder
          const requests = await EventRequest.find({ stakeholder_id: actorId, Status: { $nin: ['Rejected', 'Rejected_By_Admin'] } });
          for (const request of requests) {
            const event = await Event.findOne({ Event_ID: request.Event_ID });
            if (event && event.Start_Date) {
              const requestEventDate = new Date(event.Start_Date);
              requestEventDate.setHours(0, 0, 0, 0);
              const startDay = new Date(startDate);
              startDay.setHours(0,0,0,0);
              if (requestEventDate.getTime() === startDay.getTime()) {
                hasOverlap = true;
                break;
              }
            }
          }
        } else {
          // Default: coordinator-level overlap check
          hasOverlap = await this.checkCoordinatorOverlappingRequests(
            coordinatorId,
            startDate,
            excludeRequestId
          );
        }

        if (hasOverlap) {
          validationResults.isValid = false;
          validationResults.errors.push('You already have an event request for this date');
        }
      }

      // 5. Check double booking (same location, same date)
      if (systemSettings.getSetting('preventDoubleBooking')) {
        // If caller provided an excludeRequestId (when updating an existing request),
        // resolve it to the linked Event_ID so checkDoubleBooking can exclude the
        // current event from the search. Previously we passed a full Event doc
        // which prevented proper exclusion and could cause false positives.
        let excludeEventId = null;
        if (excludeRequestId) {
          try {
            const existingReq = await this._findRequest(excludeRequestId);
            if (existingReq && existingReq.Event_ID) excludeEventId = existingReq.Event_ID;
          } catch (e) {
            // ignore resolution failures and proceed without exclusion
            excludeEventId = null;
          }
        }

        const isDoubleBooked = await this.checkDoubleBooking(
          startDate,
          eventData.Location,
          excludeEventId
        );

        if (isDoubleBooked) {
          validationResults.isValid = false;
          validationResults.errors.push('This location is already booked for this date');
        }
      }

      // 6. Additional checks for BloodDrive events
      if (eventData.categoryType === 'BloodDrive' && eventData.Target_Donation) {
        const totalBloodBags = await this.getTotalBloodBagsForDate(startDate);
        const maxAllowed = systemSettings.getSetting('maxBloodBagsPerDay');
        
        if (totalBloodBags + eventData.Target_Donation > maxAllowed) {
          validationResults.isValid = false;
          validationResults.errors.push(
            `Blood bag limit exceeded. ${maxAllowed - totalBloodBags} bags remaining for this date.`
          );
        }
      }

      // 7. Check daily event limit
      const eventsOnDate = await Event.countDocuments({
        Start_Date: {
          $gte: new Date(new Date(startDate).setHours(0, 0, 0, 0)),
          $lt: new Date(new Date(endDate || startDate).setHours(23, 59, 59, 999))
        },
        Status: { $in: ['Completed', 'Completed'] }
      });
      
      const maxEventsPerDay = systemSettings.getSetting('maxEventsPerDay');
      if (eventsOnDate >= maxEventsPerDay) {
        validationResults.isValid = false;
        validationResults.errors.push(
          `Maximum ${maxEventsPerDay} events allowed per day. This date is full.`
        );
      }

      return validationResults;

    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  /**
   * Compute allowed UI actions for a given actor and request/event state
   * @param {string|null} actorRole - 'Admin' | 'Coordinator' | 'Stakeholder' | null
   * @param {string|null} actorId - actor identifier
   * @param {Object} requestDoc - EventRequest mongoose doc or plain object
   * @param {Object} eventDoc - Event mongoose doc or plain object
   * @returns {string[]} allowed actions list
   */
  async computeAllowedActions(actorRole, actorId, requestDoc, eventDoc) {
    try {
      const role = actorRole ? String(actorRole).toLowerCase() : null;
      const event = eventDoc || (requestDoc ? requestDoc.event : null) || {};
      const req = requestDoc || {};

      const isPublished = event && (String(event.Status) === 'Completed' || String(event.Status) === 'Completed');

      // Published: all users see view, edit, manage-staff, resched
      // For approved events, also allow cancel for admins, stakeholders who created the request, and coordinators who own or manage
      if (isPublished) {
        const actions = ['view', 'edit', 'manage-staff', 'resched'];
        
        // Allow cancel for approved events
        const isAdmin = role === 'admin' || role === 'systemadmin';
        const isStakeholder = role === 'stakeholder' && req.stakeholder_id === actorId;
        let isCoordinator = false;
        if (role === 'coordinator') {
          isCoordinator = req.coordinator_id === actorId;
          if (!isCoordinator && req.stakeholder_id) {
            try {
              const Stakeholder = require('../../models/index').Stakeholder;
              const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: req.stakeholder_id });
              isCoordinator = stakeholder && stakeholder.Coordinator_ID === actorId;
            } catch (e) {
              // Ignore errors in stakeholder lookup
            }
          }
        }
        
        if (isAdmin || isStakeholder || isCoordinator) {
          actions.push('cancel');
        }
        
        return actions;
      }

      // Handle pending-review workflow. The request model uses a unified
      // `pending-review` status; use the `reviewer` field to determine who may act.
      const status = String(req.Status || '').toLowerCase();
      const isRescheduled = status.includes('resched') || status.includes('reschedule') || status.includes('rescheduled') || !!(req.rescheduleProposal && req.rescheduleProposal.proposedBy);
      if (status.includes('pending') || status.includes('review') || isRescheduled) {
        const reviewerRole = req.reviewer && req.reviewer.role ? String(req.reviewer.role).toLowerCase() : null;

        const isReviewAccepted = status.includes('review') && status.includes('accepted');

        // Special-case: handle reschedule proposals explicitly and symmetrically.
        // Universal rules:
        // - Requester (proposer) => view only
        // - Reviewer => view, accept, reject
        // Reviewer resolution uses request.reviewer snapshot where available,
        // otherwise falls back to coordinator_id/stakeholder_id. Admins may
        // also act as reviewers when appropriate.
        try {
          const resProp = req.rescheduleProposal || null;
          let proposerRole = null;
          let proposerId = null;
          if (resProp && resProp.proposedBy) {
            proposerRole = String(resProp.proposedBy.role || '').toLowerCase();
            proposerId = resProp.proposedBy.id || null;
          }

          // Account for CoordinatorFinalAction flag as a legacy reschedule marker
          const coordFinal = (req.CoordinatorFinalAction || req.coordinatorFinalAction || null);
          const coordFinalIsResched = coordFinal && String(coordFinal).toLowerCase().includes('resched');
          if (!proposerRole && coordFinalIsResched) {
            proposerRole = 'coordinator';
          }

          // If we have a legacy CoordinatorFinalAction reschedule marker but
          // no explicit proposer id, use the request.coordinator_id as the
          // proposer identifier so proposer checks work for legacy flows.
          if (!proposerId && coordFinalIsResched && req.coordinator_id) {
            proposerId = req.coordinator_id;
          }

          // Resolve reviewer snapshot or fallbacks
          const reviewerSnapshot = req.reviewer || null;
          const reviewerId = reviewerSnapshot && reviewerSnapshot.id ? reviewerSnapshot.id : (req.coordinator_id || req.stakeholder_id || null);
          const reviewerRoleRaw = reviewerSnapshot && reviewerSnapshot.role ? String(reviewerSnapshot.role).toLowerCase() : (req.coordinator_id ? 'coordinator' : (req.stakeholder_id ? 'stakeholder' : null));

          // If the current actor is the proposer, they must be view-only
          if (proposerId && String(proposerId) === String(actorId)) {
            return ['view'];
          }

          // If actor is the explicit reviewer (by id) they get reviewer rights
          // Reviewer rights include the ability to propose a reschedule (RS)
          // in the initial review step.
          if (reviewerId && String(reviewerId) === String(actorId)) {
            return ['view', 'accept', 'reject', 'resched'];
          }

          // If actor role matches resolved reviewer role, grant reviewer rights
          if (reviewerRoleRaw && reviewerRoleRaw === role) {
            return ['view', 'accept', 'reject', 'resched'];
          }

          // Allow system admins to act as reviewers for reschedules by default
          if (role === 'admin' || role === 'systemadmin') {
            return ['view', 'accept', 'reject', 'resched'];
          }

          // Fallback: everyone else can only view
          return ['view'];
        } catch (e) {
          // ignore and continue
        }

        // Special case: if the request is review-accepted (admin accepted a
        // coordinator-created request), only the assigned coordinator/reviewer
        // should be able to confirm; admins should no longer have accept/reject/resched.
        if (isReviewAccepted) {
          if (role === 'admin' || role === 'systemadmin') {
            return ['view'];
          }
          if (role === 'coordinator') {
              const isAssigned = req.coordinator_id && String(req.coordinator_id) === String(actorId);
              const isReviewer = req.reviewer && String(req.reviewer.id) === String(actorId);
              // In review-accepted state, allow the assigned coordinator to confirm
              // even if they are the original creator. This is the final confirmation step.
              if (isReviewer || isAssigned) {
                return ['view', 'confirm', 'reject'];
              }
            return ['view'];
          }
          // Everyone else: view only
          return ['view'];
        }

        // If this is a reschedule flow, determine who proposed the reschedule
        // and restrict who may accept it according to business rules:
        // - Admin proposed: coordinator assigned to the request must approve.
        // - Coordinator proposed: if no stakeholder involved -> sysadmin must approve;
        //   if stakeholder involved -> stakeholder must approve (sysadmin may also approve).
        // - Stakeholder proposed: coordinator or sysadmin must approve.
        if (isRescheduled) {
          const proposerRoleRaw = req.rescheduleProposal && req.rescheduleProposal.proposedBy && req.rescheduleProposal.proposedBy.role ? String(req.rescheduleProposal.proposedBy.role).toLowerCase() : null;
          const proposerRole = proposerRoleRaw || null;

          // helper: check if actor is assigned/reviewer coordinator
          const isAssigned = req.coordinator_id && String(req.coordinator_id) === String(actorId);
          const isReviewer = req.reviewer && String(req.reviewer.id) === String(actorId);

          // Admin proposed reschedule -> only assigned/reviewer coordinator may accept/reject
          if (proposerRole === 'systemadmin' || proposerRole === 'admin') {
            if (role === 'coordinator' && (isReviewer || isAssigned)) {
              return ['view', 'accept', 'reject'];
            }
            // Admins may view or propose another reschedule but should not accept their own proposal
            if (role === 'admin' || role === 'systemadmin') return ['view', 'resched'];
            return ['view'];
          }

          // Coordinator proposed reschedule
          if (proposerRole === 'coordinator') {
            const stakeholderPresent = !!req.stakeholder_id;
            // If no stakeholder: sys admin must approve
            if (!stakeholderPresent) {
              if (role === 'admin' || role === 'systemadmin') return ['view', 'accept', 'reject', 'resched'];
              return ['view'];
            }
            // If stakeholder involved: stakeholder should approve, but sysadmin may also approve
            if (role === 'stakeholder' && req.stakeholder_id && String(req.stakeholder_id) === String(actorId)) {
              return ['view', 'accept', 'reject'];
            }
            if (role === 'admin' || role === 'systemadmin') return ['view', 'accept', 'reject', 'resched'];
            return ['view'];
          }

          // Stakeholder proposed reschedule -> coordinator or sysadmin may approve
          if (proposerRole === 'stakeholder') {
            if (role === 'coordinator' && (isReviewer || isAssigned)) return ['view', 'accept', 'reject'];
            if (role === 'admin' || role === 'systemadmin') return ['view', 'accept', 'reject', 'resched'];
            return ['view'];
          }

          // Fallback: preserve previous permissive behavior for admins, otherwise view-only
          if (role === 'admin' || role === 'systemadmin') {
            return ['view', 'resched', 'accept', 'reject'];
          }
          return ['view'];
        }

        // If reviewer is stakeholder (or request has stakeholder), allow the
        // stakeholder and system admins to act. System admins should be able
        // to accept, reject, or propose a reschedule on stakeholder-created
        // requests (they act as a reviewer in that flow). Coordinators may
        // only act when explicitly assigned.
        if (reviewerRole === 'stakeholder' || (!reviewerRole && req.stakeholder_id && req.made_by_role === 'Stakeholder')) {
          // System admins/full admins can act on stakeholder requests
          if (role === 'admin' || role === 'systemadmin') {
            return ['view', 'resched', 'accept', 'reject'];
          }
          // Stakeholder who created the request may act on their own request
          if (role === 'stakeholder' && req.stakeholder_id === actorId) {
            return ['view', 'accept', 'reject'];
          }
          return ['view'];
        }

        // If reviewer is coordinator, only coordinator may act
        if (reviewerRole === 'coordinator' || (!reviewerRole && req.coordinator_id)) {
          // Allow coordinator if they are the assigned coordinator or the reviewer
          const isAssigned = req.coordinator_id && String(req.coordinator_id) === String(actorId);
          const isReviewer = req.reviewer && String(req.reviewer.id) === String(actorId);
          const isCreator = String(req.made_by_role || '').toLowerCase() === 'coordinator' && req.made_by_id && String(req.made_by_id) === String(actorId);
          // Coordinators assigned to review should be able to propose reschedules
          // in addition to accepting/rejecting. Preserve original creator rule.
          if (role === 'coordinator' && (isReviewer || (isAssigned && !isCreator))) {
            return ['view', 'resched', 'accept', 'reject'];
          }
          // Allow stakeholder to accept/reject coordinator's reschedule proposals
          if (role === 'stakeholder' && req.rescheduleProposal && req.rescheduleProposal.proposedBy && String(req.rescheduleProposal.proposedBy.role).toLowerCase() === 'coordinator' && req.stakeholder_id === actorId) {
            return ['view', 'accept', 'reject'];
          }
          return ['view'];
        }

        // Default pending/review: admins may act. Coordinators may act only when
        // they are the assigned coordinator or the assigned reviewer.
        if (role === 'admin' || role === 'systemadmin') {
          return ['view', 'resched', 'accept', 'reject'];
        }
        if (role === 'coordinator') {
          const isAssigned = req.coordinator_id && String(req.coordinator_id) === String(actorId);
          const isReviewer = req.reviewer && String(req.reviewer.id) === String(actorId);
          const isCreator = String(req.made_by_role || '').toLowerCase() === 'coordinator' && req.made_by_id && String(req.made_by_id) === String(actorId);
          if (isReviewer || (isAssigned && !isCreator)) {
            return ['view', 'resched', 'accept', 'reject'];
          }
        }
        return ['view'];
      }

      // Check for cancelled status
      if (status.includes('cancel')) {
        // Only system administrators (Admin role) should be allowed to delete cancelled requests.
        if (role === 'systemadmin' || role === 'admin') return ['view', 'delete'];
        return ['view'];
      }

      // Check for rejected status
      if (status.includes('reject')) {
        // Only system administrators (Admin role) should be allowed to delete rejected requests.
        if (role === 'systemadmin' || role === 'admin') return ['view', 'delete'];
        return ['view'];
      }

      // Legacy handling for other statuses
      if (role === 'admin' || role === 'systemadmin' || role === 'coordinator') {
        // admins/coordinators always see full approval controls before publish
        return ['view', 'resched', 'accept', 'reject'];
      }

      if (role === 'stakeholder') {
        const adminAction = req.AdminAction || null; // e.g., 'Accepted' | 'Rejected' | 'Rescheduled'
        const stakeholderAction = req.StakeholderFinalAction || null;

        // If admin hasn't acted yet, stakeholder only sees view
        if (!adminAction) {
          return ['view'];
        }

        // Admin has acted: stakeholder can respond
        if (String(adminAction).toLowerCase().includes('reject')) {
          // If admin rejected, stakeholder may accept to re-apply; if already acted, only view
          if (!stakeholderAction) return ['view', 'accept'];
          return ['view'];
        }

        // Admin accepted or rescheduled: stakeholder can accept or reject unless they've already acted
        if (!stakeholderAction) return ['view', 'accept', 'reject'];
        return ['view'];
      }

      // Unknown actor: only view by default
      return ['view'];
    } catch (e) {
      return ['view'];
    }
  }

  /**
   * Compute boolean flags for common UI actions based on allowedActions
   * @param {string|null} actorRole
   * @param {string|null} actorId
   * @param {Object} requestDoc
   * @param {Object} eventDoc
   * @returns {Object} flags like { canView, canEdit, canManageStaff, canReschedule, canAccept, canReject }
   */
  async computeActionFlags(actorRole, actorId, requestDoc, eventDoc) {
    try {
      const allowed = await this.computeAllowedActions(actorRole, actorId, requestDoc, eventDoc) || [];
      const has = (a) => allowed.includes(a);
      return {
        canView: has('view'),
        canEdit: has('edit'),
        canManageStaff: has('manage-staff'),
        canReschedule: has('resched') || has('reschedule') || has('resched'),
        canAccept: has('accept') || has('Accepted') || has('approve'),
        canReject: has('reject'),
        canConfirm: has('confirm'),
        // convenience: admin-level controls (reschedule/cancel/delete). Do
        // not treat accept/reject as admin-only controls to avoid showing
        // cancel in coordinator-only accept/reject flows.
        canAdminAction: has('resched') || has('cancel') || has('delete')
      };
    } catch (e) {
      return {
        canView: true,
        canEdit: false,
        canManageStaff: false,
        canReschedule: false,
        canAccept: false,
        canReject: false,
        canConfirm: false,
        canAdminAction: false
      };
    }
  }

  /**
   * Get total blood bags for a specific date
   * @param {Date} date 
   * @returns {number} Total blood bags
   */
  async getTotalBloodBagsForDate(date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Find all blood drive events on this date
      const events = await Event.find({
        Start_Date: { $gte: startOfDay, $lte: endOfDay },
        Status: { $in: ['Completed', 'Completed'] }
      });

      let totalBags = 0;
      for (const event of events) {
        const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID });
        if (bloodDrive) {
          totalBags += bloodDrive.Target_Donation || 0;
        }
      }

      return totalBags;

    } catch (error) {
      throw new Error(`Failed to get total blood bags: ${error.message}`);
    }
  }

  /**
   * Create an event request following the unified review flow
   */
  async createEventRequest(coordinatorId, eventData) {
    try {
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
      if (!coordinator) {
        throw new Error('Coordinator not found');
      }

      const excludeRequestId = eventData && (eventData.excludeRequestId || eventData.exclude_request_id || null);
      const normalizedCreatorRole = this._normalizeRole(eventData?._actorRole || eventData?.made_by_role || 'Coordinator');
      const creatorId = eventData?._actorId || eventData?.made_by_id || coordinatorId;

      const validation = await this.validateSchedulingRules(
        coordinatorId,
        eventData,
        excludeRequestId,
        { actorRole: normalizedCreatorRole, actorId: creatorId }
      );
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      const eventId = this.generateEventID();
      const requestId = this.generateRequestID();

      let categoryType = eventData.categoryType || eventData.Category || null;
      if (!categoryType && excludeRequestId) {
        const existingReq = await this._findRequest(excludeRequestId);
        if (existingReq && existingReq.Event_ID) {
          const existingEvent = await Event.findOne({ Event_ID: existingReq.Event_ID }).catch(() => null);
          categoryType = existingEvent?.Category || existingReq.Category || categoryType;
        }
      }
      if (!categoryType) {
        throw new Error('Event category type is required');
      }

      let categoryData = null;
      if (categoryType === 'BloodDrive') {
        categoryData = new BloodDrive({
          BloodDrive_ID: eventId,
          Target_Donation: eventData.Target_Donation,
          VenueType: eventData.VenueType
        });
        await categoryData.save();
      } else if (categoryType === 'Advocacy') {
        const expectedSizeRaw = eventData.ExpectedAudienceSize || eventData.numberOfParticipants || eventData.Expected_Audience_Size || eventData.expectedAudienceSize;
        const expectedSize = expectedSizeRaw !== undefined && expectedSizeRaw !== null && expectedSizeRaw !== '' ? parseInt(expectedSizeRaw, 10) : undefined;
        categoryData = new Advocacy({
          Advocacy_ID: eventId,
          Topic: eventData.Topic,
          TargetAudience: eventData.TargetAudience,
          ExpectedAudienceSize: expectedSize,
          PartnerOrganization: eventData.PartnerOrganization
        });
        await categoryData.save();
      } else if (categoryType === 'Training') {
        categoryData = new Training({
          Training_ID: eventId,
          TrainingType: eventData.TrainingType,
          MaxParticipants: eventData.MaxParticipants
        });
        await categoryData.save();
      } else {
        throw new Error('Unsupported event category type');
      }

      const stakeholderId = eventData.stakeholder_id || eventData.Stakeholder_ID || null;
      const stakeholderPresent = !!stakeholderId;

      const event = new Event({
        Event_ID: eventId,
        Event_Title: eventData.Event_Title,
        Location: eventData.Location,
        Event_Description: eventData.Event_Description || eventData.eventDescription || eventData.Description || undefined,
        Start_Date: new Date(eventData.Start_Date),
        End_Date: eventData.End_Date ? new Date(eventData.End_Date) : undefined,
        Email: eventData.Email,
        Phone_Number: eventData.Phone_Number,
        coordinator_id: coordinatorId,
        stakeholder_id: stakeholderId || undefined,
        made_by_id: creatorId,
        made_by_role: normalizedCreatorRole,
        Category: categoryType,
        Status: 'Pending'
      });
      await event.save();

      const creatorSnapshot = await this._buildActorSnapshot(normalizedCreatorRole, creatorId);
      const reviewer = await this._assignReviewerContext({
        creatorRole: normalizedCreatorRole,
        coordinatorId,
        stakeholderId,
        province: eventData.province || coordinator.province,
        district: eventData.district || coordinator.district
      });

      const eventForSummary = event.toObject();
      eventForSummary.categoryDoc = categoryData ? categoryData.toObject ? categoryData.toObject() : categoryData : null;
      const reviewSummary = buildReviewSummary({
        requestorName: creatorSnapshot?.name || 'The creator',
        event: eventForSummary
      });

      const expiresAt = this._computeExpiryDate(this._getReviewExpiryHours());
      const request = new EventRequest({
        Request_ID: requestId,
        Event_ID: eventId,
        coordinator_id: coordinatorId,
        stakeholder_id: stakeholderId || undefined,
        made_by_id: creatorId,
        made_by_role: normalizedCreatorRole,
        creator: creatorSnapshot,
        reviewer,
        stakeholderPresent,
        province: eventData.province || coordinator.province || null,
        district: eventData.district || coordinator.district || null,
        municipality: eventData.municipality || coordinator.municipality || null,
        Category: categoryType,
        Status: REQUEST_STATUSES.PENDING_REVIEW,
        statusHistory: [{
          status: REQUEST_STATUSES.PENDING_REVIEW,
          changedAt: new Date(),
          actor: creatorSnapshot
        }],
        reviewSummary,
        reviewDeadlineHours: this._getReviewExpiryHours(),
        expiresAt,
        summaryTemplate: categoryType
      });

      await request.save();
      await EventRequestHistory.logCreation({
        requestId,
        eventId,
        actor: creatorSnapshot,
        note: 'Event request submitted'
      });

      if (reviewer && reviewer.id) {
        // Pass reviewer.role so the notification is created for correct recipient type
        const recipientType = reviewer.role || null;
        await Notification.createNewRequestNotification(
          reviewer.id,
          requestId,
          eventId,
          coordinatorId,
          recipientType
        );
      }

      return {
        success: true,
        message: 'Event request submitted successfully',
        request: request.toObject(),
        event: eventForSummary,
        category: categoryData,
        warnings: validation.warnings
      };

    } catch (error) {
      throw new Error(`Failed to create event request: ${error.message}`);
    }
  }

  /**
   * Create an event through the approval workflow (no auto-publishing)
   * All events now go through approval process regardless of creator role
   */
  async createImmediateEvent(creatorId, creatorRole, eventData) {
    try {
      const normalizedRole = this._normalizeRole(creatorRole);
      if (normalizedRole !== 'SystemAdmin' && normalizedRole !== 'Coordinator') {
        throw new Error('Unauthorized: Only admins or coordinators can perform direct creation');
      }

      const coordinatorId = normalizedRole === 'Coordinator'
        ? creatorId
        : (eventData.coordinator_id || eventData.MadeByCoordinatorID || null);

      if (!coordinatorId) {
        throw new Error('Coordinator ID is required for direct event creation');
      }

      const enrichedData = Object.assign({}, eventData, {
        _actorRole: normalizedRole,
        _actorId: creatorId
      });

      return this.createEventRequest(coordinatorId, enrichedData);
    } catch (error) {
      throw new Error(`Failed to create event: ${error.message}`);
    }
  }

  /**
   * Get event request by ID with full details
   * @param {string} requestId 
   * @returns {Object} Request details
   */
  async getEventRequestById(requestId) {
    try {
      
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Event request not found');
      }

      const event = await Event.findOne({ Event_ID: request.Event_ID });
      if (!event) {
        throw new Error('Event not found');
      }

    // Fetch category documents for this event

      // Get category-specific data
      let categoryData = null;
      const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID });
      if (bloodDrive) {
        categoryData = { type: 'BloodDrive', ...bloodDrive.toObject() };
      } else {
        const advocacy = await Advocacy.findOne({ Advocacy_ID: event.Event_ID });
        if (advocacy) {
          categoryData = { type: 'Advocacy', ...advocacy.toObject() };
        } else {
          const training = await Training.findOne({ Training_ID: event.Event_ID });
          if (training) {
            categoryData = { type: 'Training', ...training.toObject() };
          }
        }
      }

      // Get coordinator info
      const coordinator = await Coordinator.findOne({ Coordinator_ID: request.coordinator_id });
      const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: request.coordinator_id });

      // Get stakeholder info if the request was made by a stakeholder
      let stakeholder = null;
      let stakeholderDistrict = null;
      if (request.made_by_role === 'Stakeholder' && request.stakeholder_id) {
        stakeholder = await require('../../models/index').Stakeholder.findOne({ Stakeholder_ID: request.stakeholder_id ? request.stakeholder_id.toString().trim() : request.stakeholder_id });
        if (stakeholder) {
          // Populate district information
          stakeholderDistrict = await require('../../models/index').District.findOne({ _id: stakeholder.district }).catch(() => null);
        }
      }

      // Also fetch any staff assignments for this event so the frontend can display them
      let staffAssignments = [];
      try {
        const eventStaffDocs = await EventStaff.find({ EventID: event.Event_ID });
        if (Array.isArray(eventStaffDocs)) {
          staffAssignments = eventStaffDocs.map((sd) => ({ FullName: sd.Staff_FullName, Role: sd.Role }));
        }
      } catch (e) {
        // swallow errors fetching staff to avoid breaking the whole request retrieval
        staffAssignments = [];
      }

      const humanLabel = require('./requestFlow.helpers').getHumanStatusLabel(request.Status, request);
      return {
        success: true,
        request: {
          ...request.toObject(),
          statusLabel: humanLabel,
          event: event.toObject(),
          category: categoryData,
          coordinator: coordinator ? {
            ...coordinator.toObject(),
            staff: staff ? {
              First_Name: staff.First_Name,
              Last_Name: staff.Last_Name,
              Email: staff.Email,
              Phone_Number: staff.Phone_Number
            } : null
          } : null,
          stakeholder: stakeholder ? {
            ...stakeholder.toObject(),
            staff: stakeholder ? {
              First_Name: stakeholder.firstName,
              Last_Name: stakeholder.lastName,
              Email: stakeholder.email,
              Phone_Number: stakeholder.phoneNumber
            } : null,
            District_Name: stakeholderDistrict ? stakeholderDistrict.name : undefined,
            District_Number: stakeholderDistrict ? stakeholderDistrict.code : undefined
          } : null,
          // include normalized staff assignment list for convenience
          staff: staffAssignments
        }
      };

    } catch (error) {
      // Log full error
      try { console.error('[Service] getEventRequestById error', { message: error.message, stack: error.stack }); } catch (e) {}
      throw new Error(`Failed to get event request: ${error.message}`);
    }
  }

  /**
   * Update pending event request (only if status is Pending_Admin_Review)
   * @param {string} requestId 
   * @param {string} coordinatorId 
   * @param {Object} updateData 
   * @returns {Object} Updated request
   */
  async updateEventRequest(requestId, actorId, updateData, actorIsAdmin = false, actorIsCoordinator = false, actorIsStakeholder = false) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Event request not found');
      }

      // Debug log: show what we're attempting to update and current request state
      

      // Authorization rules:
      // - Admins may update any request
      // - Coordinators may update requests they own (Coordinator_ID)
      // - Stakeholders may update requests they created (MadeByStakeholderID)
      if (!actorIsAdmin && !actorIsCoordinator && !actorIsStakeholder) {
        throw new Error('Unauthorized: invalid actor');
      }

      // If actor is stakeholder, allow submitting change requests while the
      // request is pending any review. Historically we required the
      // stakeholder to be the original creator (MadeByStakeholderID), but in
      // this system requests may be created by any actor and stakeholders
      // should still be able to propose edits. Therefore we no longer block
      // by strict ownership; we only enforce that the request is still
      // pending review.
      if (actorIsStakeholder) {
        // Check if this edit requires review based on the frontend flag
        const requiresReview = updateData.requiresReview === true;
        
        // Only reset status to pending review if this edit requires review
        if (requiresReview) {
          const isCurrentlyPending = String(request.Status || '').toLowerCase().includes('pending');
          if (!isCurrentlyPending) {
            request.AdminAction = null;
            request.AdminNote = null;
            request.RescheduledDate = null;
            request.AdminActionDate = null;
            request.CoordinatorFinalAction = null;
            request.CoordinatorFinalActionDate = null;
            request.StakeholderFinalAction = null;
            request.StakeholderFinalActionDate = null;
            // Reset to the initial status based on the workflow
            const stakeholderId = request.stakeholder_id;
            const madeByRole = request.made_by_role;
            // Set unified pending-review status; reviewer assignment determines who will act next
            request.Status = REQUEST_STATUSES.PENDING_REVIEW;
          }
        }

        // Record stakeholder as proposer if missing (audit)
        if (!request.stakeholder_id) {
          request.stakeholder_id = actorId;
        }

        // Persist the status/ownership changes before proceeding with event updates
        try {
          await request.save();
        } catch (e) {
          // don't block user with DB save quirks; we'll attempt to continue
        }
      }

      // If actor is coordinator, verify ownership
      if (actorIsCoordinator) {
        if (request.coordinator_id !== actorId) {
          throw new Error('Unauthorized: Coordinator does not own this request');
        }
        // Coordinators may update pending requests or act like admins; allow update even if not pending
      }

      const event = await Event.findOne({ Event_ID: request.Event_ID });
      if (!event) {
        throw new Error('Event not found');
      }

      // Store original data if not already stored (for showing changes in view modal)
      if (!request.originalData) {
        const categoryData = {};
        if (event.Category === 'BloodDrive') {
          const bd = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID });
          if (bd) categoryData.bloodDrive = bd.toObject();
        } else if (event.Category === 'Advocacy') {
          const adv = await Advocacy.findOne({ Advocacy_ID: event.Event_ID });
          if (adv) categoryData.advocacy = adv.toObject();
        } else if (event.Category === 'Training') {
          const tr = await Training.findOne({ Training_ID: event.Event_ID });
          if (tr) categoryData.training = tr.toObject();
        }
        request.originalData = {
          event: event.toObject(),
          category: categoryData
        };
        await request.save();
      }

      // If date/time is being updated, revalidate and apply
      if (updateData.Start_Date) {
        // Validate scheduling with provided start/end
        // When an admin is performing the update we must validate against the request's coordinator
        // (not the adminId). Use the request.Coordinator_ID for scheduling checks when actorIsAdmin.
  const schedulingCoordinatorId = request.coordinator_id;
  const skipPending = actorIsAdmin || actorIsCoordinator;
  const validation = await this.validateSchedulingRules(schedulingCoordinatorId, updateData, requestId, { skipPendingLimit: skipPending });
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
        // Normalize to Date instances
        event.Start_Date = new Date(updateData.Start_Date);
        if (updateData.End_Date) {
          event.End_Date = new Date(updateData.End_Date);
        }
      } else if (updateData.End_Date) {
        // Allow updating End_Date alone (no scheduling revalidation needed when start unchanged)
        try {
          event.End_Date = new Date(updateData.End_Date);
        } catch (e) {
          // If parsing fails, let it surface as invalid date in DB or to caller
          throw new Error('Invalid End_Date');
        }
      }

  // Update event fields (only when provided)
  if (updateData.Event_Title) event.Event_Title = updateData.Event_Title;
  if (updateData.Location) event.Location = updateData.Location;
  if (updateData.Email) event.Email = updateData.Email;
  if (updateData.Phone_Number) event.Phone_Number = updateData.Phone_Number;
  // Allow updating event description
  if (updateData.Event_Description !== undefined) event.Event_Description = updateData.Event_Description;

  await event.save();
    // Resolve category type for this update: prefer payload, then event, then request
    const categoryType = updateData && updateData.categoryType ? updateData.categoryType : (event.Category || request.Category);
    

    // Remove control/actor fields from updateData copy so we don't accidentally persist them into category docs
    if (updateData.adminId) delete updateData.adminId;
    if (updateData.coordinatorId) delete updateData.coordinatorId;

  // Update category-specific data if provided (use resolved categoryType)
  if (categoryType === 'BloodDrive' && (updateData.Target_Donation !== undefined && updateData.Target_Donation !== null)) {
        const bdRes = await BloodDrive.updateOne(
          { BloodDrive_ID: event.Event_ID },
          { Target_Donation: updateData.Target_Donation, VenueType: updateData.VenueType }
        );
        const bdDoc = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID }).catch(() => null);
  } else if (categoryType === 'Advocacy') {
        const advocacyData = {};
        if (updateData.Topic) advocacyData.Topic = updateData.Topic;
        if (updateData.TargetAudience) advocacyData.TargetAudience = updateData.TargetAudience;
        // accept multiple field names when updating
        const expectedRaw = updateData.ExpectedAudienceSize || updateData.numberOfParticipants || updateData.Expected_Audience_Size || updateData.expectedAudienceSize;
        if (expectedRaw !== undefined && expectedRaw !== null && expectedRaw !== '') {
          advocacyData.ExpectedAudienceSize = parseInt(expectedRaw, 10);
        }
        if (updateData.PartnerOrganization) advocacyData.PartnerOrganization = updateData.PartnerOrganization;
        const advRes = await Advocacy.updateOne({ Advocacy_ID: event.Event_ID }, advocacyData);
        const advDoc = await Advocacy.findOne({ Advocacy_ID: event.Event_ID }).catch(() => null);
  } else if (categoryType === 'Training') {
        const trainingData = {};
        if (updateData.TrainingType) trainingData.TrainingType = updateData.TrainingType;
        if (updateData.MaxParticipants) trainingData.MaxParticipants = updateData.MaxParticipants;
  const trRes = await Training.updateOne({ Training_ID: event.Event_ID }, trainingData);
  const trDoc = await Training.findOne({ Training_ID: event.Event_ID }).catch(() => null);
      }

      // Re-fetch the up-to-date event and category data to return to caller
      const freshEvent = await Event.findOne({ Event_ID: request.Event_ID });

      // Resolve category document
      let categoryData = null;
      const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: request.Event_ID });
      if (bloodDrive) {
        categoryData = { type: 'BloodDrive', ...bloodDrive.toObject() };
      } else {
        const advocacy = await Advocacy.findOne({ Advocacy_ID: request.Event_ID });
        if (advocacy) {
          categoryData = { type: 'Advocacy', ...advocacy.toObject() };
        } else {
          const training = await Training.findOne({ Training_ID: request.Event_ID });
          if (training) {
            categoryData = { type: 'Training', ...training.toObject() };
          }
        }
      }

      

      // NOTE: Editing/updating an event should NOT change its publish/review
      // status implicitly. Preserve the current `event.Status` and
      // `request.Status` when admins or coordinators perform updates.
      // Only set administrative metadata (e.g., Admin_ID/ApprovedByAdminID)
      // but do not transition the workflow state here.
      if (actorIsAdmin || actorIsCoordinator) {
        try {
          const approverId = actorId;
          if (freshEvent) {
            // Preserve whatever status the event currently has. Only record
            // which admin/coordinator performed this update.
            if (!freshEvent.ApprovedByAdminID) freshEvent.ApprovedByAdminID = approverId;
            await freshEvent.save();
          }
          // Record admin id on request for audit but do not change Status
          request.Admin_ID = approverId;
          await request.save();
        } catch (e) {
          // swallow metadata save errors to avoid blocking update
        }
      }

      return {
        success: true,
        message: 'Event request updated successfully',
        request: request,
        event: freshEvent,
        category: categoryData,
        updatedFields: updateData
      };

    } catch (error) {
      throw new Error(`Failed to update event request: ${error.message}`);
    }
  }

  /**
   * Process acceptance/rejection actions for requests (Admin, Coordinator, or Stakeholder)
   * @param {string} actorId 
   * @param {string} actorRole - 'SystemAdmin', 'Coordinator', or 'Stakeholder'
   * @param {string} requestId 
   * @param {Object} actionData 
   * @returns {Object} Result
   */
  async processRequestAction(actorId, actorRole, requestId, actionData = {}) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      const action = actionData.action || 'Accepted'; // Accepted, Rejected, Rescheduled
      const normalizedAction = String(action || '').toLowerCase();

      // Stakeholders are not allowed to cancel requests or events, but can reschedule, accept, reject, or cancel
      const actorRoleNorm = String(actorRole || '').toLowerCase();
      if (actorRoleNorm === 'stakeholder' && !['rescheduled', 'accepted', 'rejected', 'cancelled'].includes(normalizedAction)) {
        throw new Error('Unauthorized: Stakeholders are not allowed to cancel requests or events');
      }

      // Normalize actor role for consistent comparisons (accepts 'admin'|'Admin' etc.)
      const role = String(actorRole || '').toLowerCase();
      // Also normalize the `actorRole` parameter into a canonical capitalized form
      // so existing strict comparisons (e.g. actorRole === 'Admin') continue to work.
      const canonicalActorRole = (function() {
        if (role === 'systemadmin') return 'SystemAdmin';
        if (role === 'admin') return 'Admin';
        if (role === 'coordinator') return 'Coordinator';
        if (role === 'stakeholder') return 'Stakeholder';
        return actorRole;
      })();
      actorRole = canonicalActorRole;
      const note = actionData.note || null;
      const rescheduledDate = actionData.rescheduledDate || null;

      // Validate actor permissions based on request status
      const status = request.Status;
      console.log('processRequestAction: actorRole=', actorRole, 'status=', status);
      let isAuthorized = false;

      // Block proposers from accepting or rejecting their own reschedule
      // proposals. Do not block proposers from creating a reschedule (they
      // must be able to propose). Handle legacy CoordinatorFinalAction by
      // resolving proposerId from request.coordinator_id when necessary.
      try {
        const resProp = request.rescheduleProposal || null;
        let proposerId = resProp && resProp.proposedBy && resProp.proposedBy.id ? resProp.proposedBy.id : null;
        const coordFinal = request.CoordinatorFinalAction || request.coordinatorFinalAction || null;
        const coordFinalIsResched = coordFinal && String(coordFinal).toLowerCase().includes('resched');
        if (!proposerId && coordFinalIsResched && request.coordinator_id) proposerId = request.coordinator_id;

        // If the actor is the proposer (explicit proposal), disallow accept/reject only
        if (proposerId && String(proposerId) === String(actorId)) {
          if (normalizedAction.includes('accept') || normalizedAction.includes('reject')) {
            throw new Error('Unauthorized: proposer cannot accept or reject their own reschedule');
          }
        }
      } catch (e) {
        // rethrow authorization errors
        if (e && String(e.message).toLowerCase().includes('unauthorized')) throw e;
      }

      // Normalize status for comparisons (handle legacy variants like Pending_Admin_Review etc.)
      const lowerStatus = String(status || '').toLowerCase();

      if (role === 'systemadmin' || role === 'admin') {
        // Admins can act on pending review flows and may propose reschedules.
        // For reschedule flows, only allow admins to act when they are NOT the
        // proposer of the reschedule (they should not accept their own proposal).
        if (lowerStatus.includes('resched')) {
          const proposerRole = request.rescheduleProposal && request.rescheduleProposal.proposedBy && request.rescheduleProposal.proposedBy.role ? String(request.rescheduleProposal.proposedBy.role).toLowerCase() : null;
          if (proposerRole === 'systemadmin' || proposerRole === 'admin') {
            // Admin proposed this reschedule: allow proposing another reschedule or cancelling,
            // but do not allow accept/reject here.
            isAuthorized = normalizedAction.includes('resched') || action === 'Cancelled' || lowerStatus.includes('pending');
          } else {
            // Admin may act on reschedules proposed by others
            isAuthorized = true;
          }
        } else {
          // Allow admin actions when pending, cancelled, or proposing reschedule.
          // Additionally, if there's an outstanding rescheduleProposal (even when
          // the request.Status is 'Completed'), allow admins to act on it provided
          // they are not the proposer. This lets admins accept/reject reschedules
          // submitted earlier without requiring the request status to have been
          // updated to a resched state.
          const hasReschedProposal = !!(request.rescheduleProposal && request.rescheduleProposal.proposedBy && request.rescheduleProposal.proposedBy.id);
          const proposerId = hasReschedProposal ? String(request.rescheduleProposal.proposedBy.id) : null;
          const mayActOnProposal = hasReschedProposal && proposerId !== String(actorId);
          isAuthorized = lowerStatus.includes('pending') || action === 'Cancelled' || normalizedAction.includes('resched') || mayActOnProposal;
        }
      } else if (role === 'coordinator') {
        // Determine ownership/assignment up-front so we can authorize reschedule
        // proposals even when the request is already completed.
        let owns = false;
        // Direct coordinator assignment on the request
        if (request.coordinator_id && String(request.coordinator_id) === String(actorId)) owns = true;
        // Reviewer assignment (snapshot)
        if (!owns && request.reviewer && request.reviewer.role && String(request.reviewer.role).toLowerCase() === 'coordinator' && String(request.reviewer.id) === String(actorId)) owns = true;
        // Stakeholder belongs to this coordinator (legacy linkage)
        if (!owns && request.stakeholder_id) {
          try {
            const Stakeholder = require('../../models/index').Stakeholder;
            const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: request.stakeholder_id });
            if (stakeholder && (String(stakeholder.Coordinator_ID) === String(actorId) || String(stakeholder.coordinator_id) === String(actorId))) owns = true;
          } catch (e) {
            // ignore lookup errors
          }
        }

        // Coordinators can act on pending, review, or reschedule flows, and cancel.
        // Business rule: coordinators should be able to propose a reschedule even
        // on completed/approved events. Allow any coordinator to propose a
        // reschedule (the reviewer-selection logic later determines who must
        // approve). For other actions we still require the request to be in a
        // pending/review/resched state or the coordinator owns the request.
        isAuthorized = lowerStatus.includes('pending') || lowerStatus.includes('resched') || lowerStatus.includes('review') || action === 'Cancelled' || normalizedAction.includes('resched') || owns;

        // For pending or review statuses, enforce ownership/assignment checks.
        if (lowerStatus.includes('pending') || lowerStatus.includes('review')) {
          if (!owns) {
            throw new Error('Unauthorized: Coordinator does not own this request');
          }
        }

        // Prevent coordinators from approving reschedules they themselves proposed
        // especially when business rules require sysadmin approval (no stakeholder involved).
        if (lowerStatus.includes('resched') && request.rescheduleProposal && request.rescheduleProposal.proposedBy) {
          try {
            const proposerRole = String(request.rescheduleProposal.proposedBy.role || '').toLowerCase();
            const proposerId = request.rescheduleProposal.proposedBy.id;
            if (proposerRole === 'coordinator' && !request.stakeholder_id && String(proposerId) === String(actorId)) {
              throw new Error('Unauthorized: Coordinator reschedule requires system admin approval');
            }
          } catch (e) {
            // if anything odd, fall through to existing ownership checks
          }
        }

        // Prevent coordinators from acting twice if they've already set a final action (except when rescheduling)
        if (request.CoordinatorFinalAction && !String(request.CoordinatorFinalAction).toLowerCase().includes('resched') && action !== 'Rescheduled') {
          throw new Error('Coordinator has already acted on this request');
        }
      } else if (role === 'stakeholder') {
        // Stakeholders can act when the request is pending or accepted-by-admin flows, and may reschedule/cancel their own requests
        isAuthorized = lowerStatus.includes('pending') || lowerStatus.includes('accepted') || lowerStatus.includes('resched') || (action === 'Cancelled' && request.stakeholder_id === actorId);
        // Also allow reschedule on completed/approved requests if they own the request
        if (action === 'Rescheduled' && request.stakeholder_id === actorId) {
          isAuthorized = true;
        }
        // Verify ownership
        console.log('Stakeholder check: request.stakeholder_id=', request.stakeholder_id, 'actorId=', actorId);
        if (request.stakeholder_id && String(request.stakeholder_id) !== String(actorId)) {
          throw new Error('Unauthorized: Stakeholder does not own this request');
        }
      }

      if (!isAuthorized) {
        throw new Error(`Unauthorized: ${actorRole} cannot act on requests with status ${status}`);
      }

      // Only block non-reschedule and non-cancel actions when the request is not in a pending state or rescheduled
      const lowerReqStatus = String(request.Status || '').toLowerCase();
      const isPendingStatus = lowerReqStatus.includes('pending');
      const isRescheduleStatus = lowerReqStatus.includes('resched');
      if (action !== 'Rescheduled' && action !== 'Cancelled' && !isPendingStatus && !isRescheduleStatus) {
        throw new Error('Request is not pending review');
      }

      // Update request based on actor type
      if (role === 'systemadmin' || role === 'admin') {
        // Admin action
        request.Admin_ID = actorId;
        request.AdminAction = action;
        request.AdminNote = note;
        request.RescheduledDate = rescheduledDate;
        request.AdminActionDate = new Date();
        // Compose a decision summary for admin actions (include note)
        try {
          let actorName = null;
          try {
            const admin = await SystemAdmin.findOne().lean().exec();
            if (admin) actorName = `${admin.First_Name || ''} ${admin.Last_Name || ''}`.trim();
          } catch (e) {}
          const decisionKind = (normalizedAction.includes('resched') || normalizedAction.includes('reschedule') || normalizedAction.includes('rescheduled')) ? REVIEW_DECISIONS.RESCHEDULE : (normalizedAction.includes('reject') ? REVIEW_DECISIONS.REJECT : (normalizedAction.includes('accept') ? REVIEW_DECISIONS.ACCEPT : null));
          const reschedulePayload = (decisionKind === REVIEW_DECISIONS.RESCHEDULE) ? ({ proposedDate: rescheduledDate, reviewerNotes: note }) : null;
          if (decisionKind) {
            request.decisionSummary = buildDecisionSummary({
              reviewerName: actorName || (actorRole || 'Reviewer'),
              decision: decisionKind,
              eventTitle: event ? event.Event_Title : (request.Event_Title || ''),
              reschedulePayload,
              notes: note || null
            });
          }
        } catch (e) {
          // ignore
        }
      } else if (role === 'coordinator') {
        // Coordinator action
        // If this is a coordinator-review request (reviewer is coordinator and status is pending)
        const isCoordinatorReview = String(status || '').toLowerCase().includes('pending') && request.reviewer && request.reviewer.role === 'Coordinator';
        if (isCoordinatorReview) {
          request.CoordinatorFinalAction = action;
          request.CoordinatorFinalActionDate = new Date();
          // If coordinator is proposing a reschedule in a coordinator-review
          // flow, attach a rescheduleProposal and route the review back to the
          // original admin requester so they can accept/reject the proposal.
          try {
            if (action === 'Rescheduled') {
              const actorSnapshot = await this._buildActorSnapshot(actorRole, actorId);
              request.rescheduleProposal = {
                proposedDate: rescheduledDate ? new Date(rescheduledDate) : null,
                proposedStartTime: null,
                proposedEndTime: null,
                reviewerNotes: note || null,
                proposedAt: new Date(),
                proposedBy: actorSnapshot
              };
              // assign admin reviewer if original requester was admin
              if (request.made_by_role && String(request.made_by_role).toLowerCase().includes('admin') && request.made_by_id) {
                request.reviewer = { id: request.made_by_id, role: 'SystemAdmin', name: null };
              }
              request.Status = REQUEST_STATUSES.REVIEW_RESCHEDULED;
            }
          } catch (e) {
            // swallow attach errors
          }
        } else {
          // Acting as admin
          request.Admin_ID = actorId;
          request.AdminAction = action;
          request.AdminNote = note;
          request.RescheduledDate = rescheduledDate;
          request.AdminActionDate = new Date();
          // Compose decision summary when coordinator acts as admin
          try {
            let actorName = null;
            try {
              const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId }).lean().exec();
              if (staff) actorName = `${staff.First_Name || ''} ${staff.Last_Name || ''}`.trim();
            } catch (e) {}
            const decisionKind = (normalizedAction.includes('resched') || normalizedAction.includes('reschedule') || normalizedAction.includes('rescheduled')) ? REVIEW_DECISIONS.RESCHEDULE : (normalizedAction.includes('reject') ? REVIEW_DECISIONS.REJECT : (normalizedAction.includes('accept') ? REVIEW_DECISIONS.ACCEPT : null));
            const reschedulePayload = (decisionKind === REVIEW_DECISIONS.RESCHEDULE) ? ({ proposedDate: rescheduledDate, reviewerNotes: note }) : null;
            if (decisionKind) {
              request.decisionSummary = buildDecisionSummary({
                reviewerName: actorName || (actorRole || 'Reviewer'),
                decision: decisionKind,
                eventTitle: event ? event.Event_Title : (request.Event_Title || ''),
                reschedulePayload,
                notes: note || null
              });
            }
          } catch (e) {}
        }
      } else if (role === 'stakeholder') {
        // Stakeholder action - they can accept, reschedule, reject, or cancel approved events
        if (action !== 'Accepted' && action !== 'Rejected' && action !== 'Rescheduled' && action !== 'Cancelled') {
          throw new Error('Stakeholders can only accept, reschedule, reject, or cancel requests');
        }
        request.StakeholderFinalAction = action;
        request.StakeholderNote = note;
        request.StakeholderFinalActionDate = new Date();

        // Handle stakeholder cancellation
        if (action === 'Cancelled') {
          console.log('=== PROCESS REQUEST ACTION DEBUG: Stakeholder Setting status to Cancelled ===');
          console.log('Request ID:', requestId);
          console.log('Actor Role:', actorRole);
          console.log('Action:', action);
          console.log('Previous Status:', request.Status);
          request.Status = 'Cancelled';
          console.log('New Status:', request.Status);
          await request.save();
        }
      }

      if (action === 'Rescheduled' && !rescheduledDate) {
        throw new Error('Rescheduled date is required when rescheduling');
      }

      // Validation for rescheduling
      if (action === 'Rescheduled') {
        if (!note || (typeof note === 'string' && note.trim().length === 0)) {
          throw new Error('Note is required when rescheduling');
        }

        // Validate rescheduledDate
        const rsDate = new Date(rescheduledDate);
        if (isNaN(rsDate.getTime())) {
          throw new Error('Invalid rescheduled date');
        }
        const today = new Date();
        today.setHours(0,0,0,0);
        const rsDay = new Date(rsDate);
        rsDay.setHours(0,0,0,0);
        if (rsDay.getTime() < today.getTime()) {
          throw new Error('Rescheduled date cannot be before today');
        }
      }

      await request.save();

      // Update event status
      const event = await Event.findOne({ Event_ID: request.Event_ID });
      // capture original start date before any modifications so notifications
      // can show the before/after dates correctly
      const originalEventStart = event && event.Start_Date ? new Date(event.Start_Date) : null;
      let finalizedByAccept = false;
      if (event) {
          if (action === 'Rescheduled') {
          // Handle rescheduling logic
          // Whenever a reschedule is proposed by any actor (admin, coordinator,
          // or stakeholder), revoke the event's approved/completed status and
          // set it back to 'Pending' so the proposed schedule must be
          // reviewed/confirmed by the appropriate reviewer.
          event.Status = 'Pending';

          // Apply rescheduled date
          if (rescheduledDate) {
            const rs = new Date(rescheduledDate);
            const currentStart = event.Start_Date ? new Date(event.Start_Date) : null;
            if (currentStart) {
              currentStart.setFullYear(rs.getFullYear(), rs.getMonth(), rs.getDate());
              event.Start_Date = currentStart;
            } else {
              event.Start_Date = new Date(rs);
            }

            if (event.End_Date) {
              const currentEnd = new Date(event.End_Date);
              currentEnd.setFullYear(rs.getFullYear(), rs.getMonth(), rs.getDate());
              event.End_Date = currentEnd;
            }
            }
            // If a coordinator proposed a reschedule on an admin-created request,
            // move the request into the unified review-rescheduled status and
            // assign the original admin (made_by_id) as the reviewer so the
            // admin can accept/reject the proposal.
            try {
              const actorSnapshot = await this._buildActorSnapshot(actorRole, actorId);
              // Attach explicit rescheduleProposal on the request if missing
              if (!request.rescheduleProposal) {
                request.rescheduleProposal = {
                  proposedDate: rescheduledDate ? new Date(rescheduledDate) : null,
                  proposedStartTime: null,
                  proposedEndTime: null,
                  reviewerNotes: note || null,
                  proposedAt: new Date(),
                  proposedBy: actorSnapshot
                };
              }

              // If the coordinator proposed this and the original requester is an admin,
              // set the reviewer to the original admin so they can review the proposal.
              if (actorRole === 'Coordinator' && request.made_by_role && String(request.made_by_role).toLowerCase().includes('admin') && request.made_by_id) {
                request.reviewer = { id: request.made_by_id, role: 'SystemAdmin', name: null };
              }

              request.Status = REQUEST_STATUSES.REVIEW_RESCHEDULED;
              await request.save();
            } catch (e) {
              // ignore attach errors
            }
        } else if (action === 'Rejected') {
          event.Status = 'Rejected';
        } else if (action === 'Cancelled') {
          event.Status = 'Rejected';
        } else if (action === 'Accepted') {
          // Different logic based on actor and workflow
          if (actorRole === 'Stakeholder') {
            // Stakeholder accepted: event is approved
            event.Status = 'Completed';
            request.Status = REQUEST_STATUSES.COMPLETED;
          } else if (lowerStatus.includes('resched')) {
            // Admin/Coordinator accepted reschedule: event is approved
            event.Status = 'Completed';
            request.Status = REQUEST_STATUSES.COMPLETED;
          } else if (lowerStatus.includes('pending') && request.reviewer && request.reviewer.role === 'Coordinator' && actorRole === 'Coordinator') {
            // Coordinator accepted system admin's request (coordinator-review): event publishes immediately
            event.Status = 'Completed';
          } else if (lowerStatus.includes('pending') && actorRole === 'SystemAdmin' && request.CoordinatorFinalAction === 'Rescheduled') {
            // Admin accepted coordinator's reschedule: event publishes
            event.Status = 'Completed';
          } else if (lowerStatus.includes('pending') && actorRole === 'Coordinator') {
            // Coordinator accepted admin's request: event publishes immediately
            event.Status = 'Completed';
          } else if (lowerStatus.includes('resched') && actorRole === 'Coordinator') {
            // Coordinator accepted admin's reschedule: event is approved
            event.Status = 'Completed';
          } else if ((actorRole === 'SystemAdmin' || actorRole === 'Admin') && request.stakeholder_id) {
            // Admin accepted stakeholder-created request: event is approved
            event.Status = 'Completed';
          } else {
            // Admin/Coordinator accepted regular request: keep pending for next step
            event.Status = 'Pending';
          }
        }

        event.ApprovedByAdminID = actorId;
        await event.save();

        // If this action was a reschedule, ensure the request is moved into
        // the reschedule review flow so reviewers see and act on the proposal.
        if (action === 'Rescheduled') {
          try {
            // Capture a reschedule proposal on the request if not already present
            if (!request.rescheduleProposal) {
              request.rescheduleProposal = {
                proposedDate: rescheduledDate ? new Date(rescheduledDate) : null,
                proposedStartTime: null,
                proposedEndTime: null,
                reviewerNotes: note || null,
                proposedAt: new Date(),
                proposedBy: { id: actorId, role: actorRole, name: null }
              };
            }

            // Move request into the unified review-rescheduled status so the
            // frontend and reviewers treat this as a reschedule workflow.
            request.Status = REQUEST_STATUSES.REVIEW_RESCHEDULED;
            await request.save();
          } catch (e) {
            // Do not block the main flow if reschedule attachment fails
            console.warn('Failed to attach reschedule proposal to request:', e && e.message ? e.message : e);
          }
        }

        // Handle request completion for admin/coordinator actions
        if (role === 'systemadmin' || role === 'admin' || role === 'coordinator') {
          const createdByStakeholder = !!request.stakeholder_id;
          const createdByCoordinator = String(request.made_by_role || '').toLowerCase() === 'coordinator';
          // Special fix: when a coordinator proposed a reschedule (CoordinatorFinalAction
          // flagged or rescheduleProposal present) and the system admin accepts it,
          // ensure both the request and the event are finalized as completed.
          try {
            const coordFinal = request.CoordinatorFinalAction || request.coordinatorFinalAction || null;
            const coordFinalIsResched = coordFinal && String(coordFinal).toLowerCase().includes('resched');
            const proposal = request.rescheduleProposal || null;
            const proposalBy = proposal && proposal.proposedBy ? String(proposal.proposedBy.role || '').toLowerCase() : null;
            const isCoordProposal = proposalBy === 'coordinator' || coordFinalIsResched;
            if (isCoordProposal && (actorRole === 'SystemAdmin' || actorRole === 'Admin') && action === 'Accepted') {
              // finalize both event and request
              try {
                if (event) event.Status = 'Completed';
              } catch (e) {}
              request.Status = REQUEST_STATUSES.COMPLETED;
            }
          } catch (e) {}

          if (lowerStatus.includes('resched') && action === 'Accepted') {
            // Accepting reschedule: complete the request
            request.Status = REQUEST_STATUSES.COMPLETED;
          } else if (action === 'Rejected') {
            // Admin/coordinator rejected: request is rejected regardless of creator
            request.Status = 'Rejected';
            if (!request.CoordinatorFinalAction) {
              request.CoordinatorFinalAction = 'Rejected';
              request.CoordinatorFinalActionDate = new Date();
            }
          } else if (action === 'Cancelled') {
            // Admin/coordinator cancelled: request is cancelled
            request.Status = 'Cancelled';
          } else if (lowerStatus.includes('pending') && request.reviewer && request.reviewer.role === 'Coordinator' && actorRole === 'Coordinator') {
            // Coordinator acting on system admin's request (coordinator-review)
            if (action === 'Accepted') {
              // Coordinator accepted: event publishes immediately
              request.Status = REQUEST_STATUSES.COMPLETED;
              request.CoordinatorFinalAction = 'Accepted';
              request.CoordinatorFinalActionDate = new Date();
            } else if (action === 'Rejected') {
              // Coordinator rejected: send back to sys admin to accept the rejection
              request.Status = REQUEST_STATUSES.PENDING_REVIEW;
              request.CoordinatorFinalAction = 'Rejected';
              request.CoordinatorFinalActionDate = new Date();
            } else if (action === 'Rescheduled') {
              // Coordinator rescheduled: create a reschedule proposal and route
              // it to the original admin requester so they review the proposal.
              try {
                const actorSnapshot = await this._buildActorSnapshot(actorRole, actorId);
                request.rescheduleProposal = {
                  proposedDate: rescheduledDate ? new Date(rescheduledDate) : null,
                  proposedStartTime: null,
                  proposedEndTime: null,
                  reviewerNotes: note || null,
                  proposedAt: new Date(),
                  proposedBy: actorSnapshot
                };
                // set CoordinatorFinalAction metadata
                request.CoordinatorFinalAction = 'Rescheduled';
                request.CoordinatorFinalActionDate = new Date();
                // set unified review-rescheduled status and assign the original admin reviewer
                request.Status = REQUEST_STATUSES.REVIEW_RESCHEDULED;
                if (request.made_by_id) {
                  request.reviewer = { id: request.made_by_id, role: 'SystemAdmin', name: null };
                }
              } catch (e) {
                // fallback to previous behavior
                request.Status = REQUEST_STATUSES.PENDING_REVIEW;
                request.CoordinatorFinalAction = 'Rescheduled';
                request.CoordinatorFinalActionDate = new Date();
              }
            }
          } else if (status === 'Pending_Admin_Review' && actorRole === 'SystemAdmin' && request.CoordinatorFinalAction === 'Rejected') {
            // Sys admin accepting coordinator's rejection: complete the rejection
            request.Status = 'Rejected';
          } else if (status === 'Pending_Admin_Review' && actorRole === 'SystemAdmin' && request.CoordinatorFinalAction === 'Rescheduled') {
              // Sys admin reviewing coordinator's reschedule
              if (action === 'Accepted') {
                // Ensure there's a reschedule proposal attached so finalize can apply it.
                try {
                  if (!request.rescheduleProposal) {
                    // Prefer explicit RescheduledDate recorded earlier, otherwise use incoming action data
                    const proposedDate = request.RescheduledDate || rescheduledDate || null;
                    request.rescheduleProposal = {
                      proposedDate: proposedDate ? new Date(proposedDate) : null,
                      proposedStartTime: null,
                      proposedEndTime: null,
                      reviewerNotes: request.CoordinatorFinalActionDate ? (request.CoordinatorFinalActionDate.toString()) : (note || null),
                      proposedAt: request.CoordinatorFinalActionDate || new Date(),
                      proposedBy: { id: request.coordinator_id || null, role: 'Coordinator', name: null }
                    };
                  }
                  const actorSnapshot = await this._buildActorSnapshot(actorRole, actorId);
                  await this._finalizeRequest(request, event, 'approved', actorSnapshot, note, { applyReschedule: true });
                } catch (e) {
                  // fallback: mark completed and continue
                  request.Status = REQUEST_STATUSES.COMPLETED;
                }
              } else if (action === 'Rejected') {
                request.Status = 'Rejected';
              }
          } else if (lowerStatus.includes('pending') && actorRole === 'Coordinator') {
            // Coordinator acting on admin's request
            if (action === 'Accepted') {
              request.Status = REQUEST_STATUSES.COMPLETED;
              request.CoordinatorFinalAction = 'Accepted';
              request.CoordinatorFinalActionDate = new Date();
            } else if (action === 'Rejected') {
              request.Status = REQUEST_STATUSES.PENDING_REVIEW;
              request.CoordinatorFinalAction = 'Rejected';
              request.CoordinatorFinalActionDate = new Date();
            } else if (action === 'Rescheduled') {
              // Coordinator proposes a reschedule on an admin-created request.
              // Attach rescheduleProposal and route to admin for review.
              try {
                const actorSnapshot = await this._buildActorSnapshot(actorRole, actorId);
                request.rescheduleProposal = {
                  proposedDate: rescheduledDate ? new Date(rescheduledDate) : null,
                  proposedStartTime: null,
                  proposedEndTime: null,
                  reviewerNotes: note || null,
                  proposedAt: new Date(),
                  proposedBy: actorSnapshot
                };
                request.CoordinatorFinalAction = 'Rescheduled';
                request.CoordinatorFinalActionDate = new Date();
                request.Status = REQUEST_STATUSES.REVIEW_RESCHEDULED;
                if (request.made_by_id) {
                  request.reviewer = { id: request.made_by_id, role: 'SystemAdmin', name: null };
                }
              } catch (e) {
                request.Status = REQUEST_STATUSES.PENDING_REVIEW;
                request.CoordinatorFinalAction = 'Rescheduled';
                request.CoordinatorFinalActionDate = new Date();
              }
            }
          } else if ((String(status || '').toLowerCase().includes('resched') || status === 'Rescheduled_By_Admin') && actorRole === 'Coordinator') {
            // Coordinator acting on admin's reschedule
            // Coordinators may only Accept or Reject an admin reschedule; they
            // may not propose another reschedule when admin already rescheduled.
            if (action === 'Accepted') {
              request.Status = REQUEST_STATUSES.COMPLETED;
              request.CoordinatorFinalAction = 'Accepted';
              request.CoordinatorFinalActionDate = new Date();
            } else if (action === 'Rejected') {
              request.Status = 'Pending_Admin_Review';
              request.CoordinatorFinalAction = 'Rejected';
              request.CoordinatorFinalActionDate = new Date();
            } else if (action === 'Rescheduled') {
              throw new Error('Coordinators may not propose a reschedule when admin has already rescheduled. Please Accept or Reject the proposed schedule.');
            }
          } else if (action === 'Rescheduled' && (actorRole === 'SystemAdmin' || actorRole === 'Admin')) {
            // Admin rescheduling any request: record a reschedule proposal and
            // set canonical review-rescheduled status so reviewers (coordinators)
            // see the correct human label and limited actions. Also assign the
            // coordinator as the reviewer snapshot so the UI knows who must act.
            const coordinatorReviewer = request.coordinator_id ? {
              id: request.coordinator_id,
              role: 'Coordinator',
              name: await this._resolveCoordinatorName(request.coordinator_id),
              autoAssigned: true
            } : (request.reviewer || null);

            request.rescheduleProposal = {
              proposedDate: rescheduledDate ? new Date(rescheduledDate) : null,
              proposedStartTime: null,
              proposedEndTime: null,
              reviewerNotes: note || null,
              proposedAt: new Date(),
              proposedBy: { id: actorId, role: actorRole, name: null }
            };

            request.reviewer = coordinatorReviewer;
            request.Status = REQUEST_STATUSES.REVIEW_RESCHEDULED;

            // Compose a human-readable decision summary so the frontend can
            // display the admin's note and proposed schedule in the request message.
            try {
              const actorNameLookup = (async () => {
                try {
                  if (actorRole === 'SystemAdmin' || actorRole === 'Admin') {
                    const admin = await SystemAdmin.findOne().lean().exec();
                    if (admin) return `${admin.First_Name || ''} ${admin.Last_Name || ''}`.trim();
                  }
                  if (actorRole === 'Coordinator') {
                    const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId }).lean().exec();
                    if (staff) return `${staff.First_Name || ''} ${staff.Last_Name || ''}`.trim();
                  }
                } catch (e) {}
                return null;
              })();
              const actorName = await actorNameLookup;
              request.decisionSummary = buildDecisionSummary({
                reviewerName: actorName || (actorRole || 'Reviewer'),
                decision: REVIEW_DECISIONS.RESCHEDULE,
                eventTitle: event ? event.Event_Title : (request.Event_Title || ''),
                reschedulePayload: request.rescheduleProposal,
                notes: note || null
              });
            } catch (e) {
              // ignore summary errors
            }
          } else if (createdByCoordinator && (actorRole === 'SystemAdmin' || actorRole === 'Admin') && (action === 'Accepted' || normalizedAction === 'accepted')) {
            // Admin accepted a coordinator-created request: mark as review-accepted and wait for coordinator confirmation
            request.Status = REQUEST_STATUSES.REVIEW_ACCEPTED;
          } else if (!createdByStakeholder && !createdByCoordinator && action !== 'Rescheduled' && status !== 'Pending_Coordinator_Review' && status !== 'Pending_Admin_Review') {
            // Non-stakeholder, non-coordinator created requests: admin/coordinator acceptance completes the request
            request.Status = REQUEST_STATUSES.COMPLETED;
          } else if (createdByStakeholder && action !== 'Rescheduled' && action !== 'Rejected') {
            // Admin acted on stakeholder-created request: finalize the request (admin actions are final for stakeholder requests)
            request.Status = REQUEST_STATUSES.COMPLETED;
          }
          // Clear any attached reschedule proposal if this action finalizes the flow.
          if ((action === 'Accepted' || action === 'Rejected' || action === 'Cancelled') && request.rescheduleProposal) {
            request.rescheduleProposal = null;
          }

          // If admin accepted a reschedule that has a proposal attached, apply it and finalize
          try {
            if (action === 'Accepted' && request.rescheduleProposal && (actorRole === 'SystemAdmin' || actorRole === 'Admin' || actorRole === 'Coordinator')) {
              // Only the reviewer should finalize; ensure actor is the resolved reviewer
              const reviewerId = request.reviewer && request.reviewer.id ? String(request.reviewer.id) : null;
              const isReviewerActor = reviewerId ? String(reviewerId) === String(actorId) : false;
              if (isReviewerActor || actorRole === 'SystemAdmin' || actorRole === 'Admin') {
                const actorSnapshot = await this._buildActorSnapshot(actorRole, actorId);
                await this._finalizeRequest(request, event, 'approved', actorSnapshot, note, { applyReschedule: true });
                finalizedByAccept = true;
              }
            }
          } catch (e) {
            // swallow finalize errors, continue to normal save path
            console.warn('Failed to finalize reschedule on accept:', e && e.message ? e.message : e);
          }

          // Ensure reschedule proposals consistently set unified review state
          try {
            if (request.rescheduleProposal && String(request.Status || '').toLowerCase() !== String(REQUEST_STATUSES.REVIEW_RESCHEDULED).toLowerCase()) {
              request.Status = REQUEST_STATUSES.REVIEW_RESCHEDULED;
              // If proposer is coordinator and original requester was an admin,
              // route reviewer to the original admin so they can review the proposal.
              const propRole = request.rescheduleProposal && request.rescheduleProposal.proposedBy && request.rescheduleProposal.proposedBy.role ? String(request.rescheduleProposal.proposedBy.role).toLowerCase() : null;
              if (propRole === 'coordinator' && request.made_by_role && String(request.made_by_role).toLowerCase().includes('admin') && request.made_by_id) {
                request.reviewer = { id: request.made_by_id, role: 'SystemAdmin', name: null };
              } else if (!request.reviewer || !request.reviewer.id) {
                // fallback to coordinator as reviewer
                if (request.coordinator_id) request.reviewer = { id: request.coordinator_id, role: 'Coordinator', name: null };
              }
            }
          } catch (e) {
            // ignore normalization errors
          }

          if (!finalizedByAccept) {
            await request.save();
          }
        }
      }

      // Create history entry
      if (role === 'systemadmin' || role === 'admin' || role === 'coordinator') {
        const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
        const actorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
        
        await EventRequestHistory.logStatusChange({
          requestId: requestId,
          eventId: request.Event_ID,
          previousStatus: status || null,
          newStatus: request.Status || null,
          actor: { id: actorId, role: actorRole, name: actorName },
          note: note || null,
          metadata: { rescheduledDate: rescheduledDate || null, scheduledAt: event ? event.Start_Date : null }
        });
      } else if (actorRole === 'Stakeholder') {
        let stakeholderName = null;
        try {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          if (bloodbankStaff) {
            stakeholderName = `${bloodbankStaff.First_Name || ''} ${bloodbankStaff.Last_Name || ''}`.trim();
          } else {
            // Try Stakeholder model
            const Stakeholder = require('../../models/index').Stakeholder;
            const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: actorId });
            if (stakeholder) {
              stakeholderName = stakeholder.Stakeholder_Name || stakeholder.name || null;
            }
          }
        } catch (e) {}
        try {
          await EventRequestHistory.logCreatorResponse({
            requestId: requestId,
            eventId: request.Event_ID,
            actor: { id: actorId, role: actorRole, name: stakeholderName },
            action: action,
            previousStatus: status || null,
            newStatus: request.Status || null,
            notes: note || null
          });
        } catch (e) {
          // ignore history creation failures
        }
      }

      // Send notification to the next recipient in the workflow
      try {
        let recipientId = null;
        let recipientType = null;

        if (action === 'Accepted') {
          // Determine next recipient based on workflow
          if (status === 'Pending_Stakeholder_Review' && actorRole === 'Stakeholder') {
            // Stakeholder accepted: notify coordinator
            recipientId = request.coordinator_id;
            recipientType = 'Coordinator';
          } else if (status === 'Pending_Coordinator_Review' && actorRole === 'Coordinator') {
            // Coordinator accepted system admin's request: no notification needed (event published)
            recipientId = null;
          } else if (status === 'Pending_Admin_Review' && (role === 'systemadmin' || role === 'admin' || role === 'coordinator')) {
            // Admin accepted: notify next in chain
            if (request.stakeholder_id) {
              recipientId = request.stakeholder_id;
              recipientType = 'Stakeholder';
            } else {
              recipientId = request.coordinator_id;
              recipientType = 'Coordinator';
            }
          }
        } else if (action === 'Rejected') {
          // Notify the creator about rejection
          if (request.made_by_role === 'Coordinator') {
            recipientId = request.coordinator_id;
            recipientType = 'Coordinator';
          } else if (request.made_by_role === 'SystemAdmin') {
            // For admin rejections, notify the admin who created the request
            if (request.made_by_id) {
              recipientId = request.made_by_id;
              recipientType = 'Admin';
            }
          }
        } else if (action === 'Cancelled') {
          // Notify the creator about cancellation
          if (request.stakeholder_id) {
            recipientId = request.stakeholder_id;
            recipientType = 'Stakeholder';
          } else if (request.made_by_role === 'Coordinator') {
            recipientId = request.coordinator_id;
            recipientType = 'Coordinator';
          } else if (request.made_by_role === 'SystemAdmin') {
            // For admin cancellations, notify the admin who created the request
            if (request.made_by_id) {
              recipientId = request.made_by_id;
              recipientType = 'Admin';
            }
          }
        } else if (action === 'Rescheduled') {
          // Notify the appropriate reviewer/owner for the reschedule proposal.
          // Prefer the assigned reviewer snapshot, then the coordinator, then stakeholder.
          try {
            if (request.reviewer && request.reviewer.id && String(request.reviewer.id) !== String(actorId)) {
              recipientId = request.reviewer.id;
              // normalize reviewer role for recipientType
              recipientType = (request.reviewer.role === 'SystemAdmin' || String(request.reviewer.role).toLowerCase() === 'admin') ? 'Admin' : (request.reviewer.role || 'Coordinator');
            } else if (request.coordinator_id && String(request.coordinator_id) !== String(actorId)) {
              recipientId = request.coordinator_id;
              recipientType = 'Coordinator';
            } else if (request.stakeholder_id && String(request.stakeholder_id) !== String(actorId)) {
              recipientId = request.stakeholder_id;
              recipientType = 'Stakeholder';
            } else {
              // fallback: don't notify the actor (avoid notifying the user who performed the action)
              recipientId = null;
              recipientType = null;
            }
          } catch (e) {
            // if anything goes wrong, fall back to not notifying
            recipientId = null;
            recipientType = null;
          }
        }

        if (recipientId && recipientType) {
          try {
            console.log('Notification: sending', { recipientId, recipientType, action, requestId, eventId: request.Event_ID });
            await Notification.createAdminActionNotification(
              recipientId,
              requestId,
              request.Event_ID,
              action,
              note,
              rescheduledDate,
              recipientType,
              originalEventStart
            );
          } catch (e) {
            console.error('Notification: failed to create admin action notification', e && e.message ? e.message : e);
          }
        }

        // Always notify the original requester (creator) about the final decision
        try {
          const creatorId = request.stakeholder_id || request.made_by_id || request.coordinator_id || null;
          // resolve actor name once
          let actorName = null;
          try {
            const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId }).lean().exec();
            if (staff) actorName = `${staff.First_Name || ''} ${staff.Last_Name || ''}`.trim();
          } catch (e) {}
          const actorLabel = actorRole || null;
          // determine recipientType based on which id we selected
          let creatorRecipientType = 'Coordinator';
          if (creatorId && request.stakeholder_id && String(creatorId) === String(request.stakeholder_id)) creatorRecipientType = 'Stakeholder';
          else if (request.made_by_role && String(request.made_by_role).toLowerCase().includes('admin')) creatorRecipientType = 'Admin';

          // Prefer notifying the proposer of a reschedule (if present and different
          // from the current actor). Otherwise fall back to the original requester.
          let notifyRecipientId = null;
          let notifyRecipientType = null;

          try {
            if (request.rescheduleProposal && request.rescheduleProposal.proposedBy && request.rescheduleProposal.proposedBy.id) {
              const proposer = request.rescheduleProposal.proposedBy;
              if (String(proposer.id) !== String(actorId)) {
                notifyRecipientId = proposer.id;
                const pr = String(proposer.role || '').toLowerCase();
                if (pr.includes('admin') || pr.includes('system')) notifyRecipientType = 'Admin';
                else if (pr.includes('stakeholder')) notifyRecipientType = 'Stakeholder';
                else notifyRecipientType = 'Coordinator';
                console.log('Notification: choosing reschedule proposer as creator recipient', { notifyRecipientId, notifyRecipientType, proposer });
              }
            }
          } catch (e) {
            // ignore proposer resolution errors and fall back
          }

          if (!notifyRecipientId) {
            // pick original requester but avoid notifying the actor
            const fallbackId = request.made_by_id || request.stakeholder_id || request.coordinator_id || null;
            if (fallbackId && String(fallbackId) !== String(actorId)) {
              notifyRecipientId = fallbackId;
              if (fallbackId && request.stakeholder_id && String(fallbackId) === String(request.stakeholder_id)) notifyRecipientType = 'Stakeholder';
              else if (request.made_by_role && String(request.made_by_role).toLowerCase().includes('admin')) notifyRecipientType = 'Admin';
              else notifyRecipientType = 'Coordinator';
              console.log('Notification: falling back to original requester as creator recipient', { notifyRecipientId, notifyRecipientType });
            }
          }

          // Decide whether to notify based on normalizedAction and resolved recipient
          const shouldNotifyCreator = Boolean(notifyRecipientId && String(normalizedAction || '').includes('accept')) ||
            Boolean(notifyRecipientId && String(normalizedAction || '').includes('resched')) ||
            Boolean(notifyRecipientId && String(normalizedAction || '').includes('reject')) ||
            Boolean(notifyRecipientId && String(normalizedAction || '').includes('cancel'));

          console.log('Notification: creator notify check', { notifyRecipientId, actorId, action, normalizedAction, shouldNotifyCreator, notifyRecipientType });

          if (shouldNotifyCreator) {
            try {
              await Notification.createReviewerDecisionNotification(
                notifyRecipientId,
                requestId,
                request.Event_ID,
                action,
                actorLabel,
                actorName,
                rescheduledDate || null,
                originalEventStart || null,
                notifyRecipientType
              );
              console.log('Notification: creator reviewer-decision notification sent', { notifyRecipientId, requestId });
            } catch (e) {
              console.error('Notification: failed to send creator reviewer decision notification', e && e.message ? e.message : e);
            }
          } else {
            console.log('Notification: skipping creator notification', { notifyRecipientId, actorId, action, normalizedAction });
          }
        } catch (e) {
          console.error('Notification: failed during creator notification check', e && e.message ? e.message : e);
        }
      } catch (e) {
        // swallow notification errors
      }

      return {
        success: true,
        message: `Request ${action.toLowerCase()} successfully`,
        request: request
      };

    } catch (error) {
      throw new Error(`Failed to process request action: ${error.message}`);
    }
  }

  /**
   * Assign staff to event (Admin only)
   * @param {string} adminId 
   * @param {string} eventId 
   * @param {Array} staffMembers 
   * @returns {Object} Result
   */
  async assignStaffToEvent(adminId, eventId, staffMembers) {
    try {
      // Verify admin
      const admin = await SystemAdmin.findOne({ Admin_ID: adminId });
      if (!admin) {
        throw new Error('Admin not found. Only admins can assign staff.');
      }

      // Verify event exists
      const event = await Event.findOne({ Event_ID: eventId });
      if (!event) {
        throw new Error('Event not found');
      }

      // Check if event is approved
      if (event.Status !== 'Completed' && event.Status !== 'Completed') {
        throw new Error('Staff can only be assigned to approved events');
      }

      // Remove existing staff assignments
      await EventStaff.deleteMany({ EventID: eventId });

      // Create new staff assignments
      const staffList = [];
      for (const staff of staffMembers) {
        const eventStaff = new EventStaff({
          EventID: eventId,
          Staff_FullName: staff.FullName,
          Role: staff.Role
        });
        await eventStaff.save();
        staffList.push(eventStaff);
      }

      // Generate staff assignment ID
      const staffAssignmentId = `STAFF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      event.StaffAssignmentID = staffAssignmentId;
      await event.save();

      return {
        success: true,
        message: 'Staff assigned successfully',
        event: event,
        staff: staffList
      };

    } catch (error) {
      throw new Error(`Failed to assign staff: ${error.message}`);
    }
  }

  /**
   * Coordinator confirms admin's decision
   * @param {string} coordinatorId 
   * @param {string} requestId 
   * @param {string} action 
   * @returns {Object} Result
   */
  async coordinatorConfirmRequest(coordinatorId, requestId, action) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      // Verify coordinator owns this request or is the assigned reviewer
      const isOwnerCoordinator = request.coordinator_id && String(request.coordinator_id) === String(coordinatorId);
      const isReviewerCoordinator = request.reviewer && String(request.reviewer.id) === String(coordinatorId);
      if (!isOwnerCoordinator && !isReviewerCoordinator) {
        throw new Error('Unauthorized: Coordinator does not own or review this request');
      }

      // Check if admin has already acted. Accept multiple signals of admin action:
      // - explicit AdminAction field
      // - Admin_ID or AdminActionDate set
      // - request.Status set to REVIEW_ACCEPTED (admin accepted and awaiting coordinator confirmation)
      const adminActed = Boolean(
        request.AdminAction || request.Admin_ID || request.AdminActionDate || (String(request.Status || '').toLowerCase().includes('review') && String(request.Status || '').toLowerCase().includes('accepted'))
      );
      if (!adminActed) {
        throw new Error('Admin has not yet acted on this request');
      }

      // Check if coordinator has already responded
      if (request.CoordinatorFinalAction) {
        throw new Error('Coordinator has already responded to this request');
      }

      // Validate action
      const validActions = ['Accepted', 'Rejected'];
      if (!validActions.includes(action)) {
        throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
      }

      // Update request
      const previousStatus = request.Status;
      request.CoordinatorFinalAction = action;
      request.CoordinatorFinalActionDate = new Date();
      await request.save();

      // Create history entry
      const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: coordinatorId });
      const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
      try {
        const decisionType = (String(action || '').toLowerCase() === 'accepted') ? REVIEW_DECISIONS.ACCEPT : REVIEW_DECISIONS.REJECT;
        await EventRequestHistory.logReviewDecision({
          requestId: requestId,
          eventId: request.Event_ID,
          decisionType,
          actor: { id: coordinatorId, role: 'Coordinator', name: coordinatorName },
          notes: null,
          previousStatus: previousStatus || null,
          newStatus: request.Status || null,
          metadata: {}
        });
      } catch (e) {
        // ignore history creation failures
      }

      // If coordinator accepted, finalize the request and publish the event
      if (String(action).toLowerCase() === 'accepted') {
        try {
          const actorSnapshot = await this._buildActorSnapshot('Coordinator', coordinatorId);
          // Approve linked event
          const event = await Event.findOne({ Event_ID: request.Event_ID });
          if (event) {
            event.Status = 'Completed';
            event.ApprovedByAdminID = coordinatorId;
            await event.save();
          }

          // Record status and finalize
          await this._recordStatus(request, REQUEST_STATUSES.COMPLETED, actorSnapshot, null);
          request.Status = REQUEST_STATUSES.COMPLETED;
          await request.save();

          // Log finalization
          try {
            await EventRequestHistory.logFinalization({
              requestId: request.Request_ID,
              eventId: request.Event_ID,
              actor: actorSnapshot,
              outcome: 'approved',
              notes: null
            });
          } catch (e) {
            // ignore history failures
          }
        } catch (e) {
          // swallow finalization errors but keep the coordinator confirmation saved
          console.warn('Failed to finalize request after coordinator confirmation:', e.message);
        }
      }

      // Send notification to admin
      if (request.Admin_ID) {
        try {
          console.log('coordinatorConfirmRequest: sending coordinator->admin notification', { adminId: request.Admin_ID, requestId, eventId: request.Event_ID, action });
          await Notification.createCoordinatorActionNotification(
            request.Admin_ID,
            requestId,
            request.Event_ID,
            action
          );
          console.log('coordinatorConfirmRequest: coordinator->admin notification sent', { adminId: request.Admin_ID });
        } catch (e) {
          console.error('coordinatorConfirmRequest: failed to send coordinator->admin notification', e && e.message ? e.message : e);
        }
      }

      // Also notify the original requester (creator) about the coordinator decision
      try {
        // Prefer notifying the proposer of any outstanding reschedule (if different from the coordinator),
        // otherwise fall back to the original requester (made_by_id / stakeholder_id / coordinator_id).
        let notifyCreatorId = null;
        let notifyCreatorType = null;

        try {
          if (request.rescheduleProposal && request.rescheduleProposal.proposedBy && request.rescheduleProposal.proposedBy.id) {
            const proposer = request.rescheduleProposal.proposedBy;
            if (String(proposer.id) !== String(coordinatorId)) {
              notifyCreatorId = proposer.id;
              const pr = String(proposer.role || '').toLowerCase();
              if (pr.includes('admin') || pr.includes('system')) notifyCreatorType = 'Admin';
              else if (pr.includes('stakeholder')) notifyCreatorType = 'Stakeholder';
              else notifyCreatorType = 'Coordinator';
              console.log('coordinatorConfirmRequest: chosen proposer as notify target', { notifyCreatorId, notifyCreatorType, proposer });
            }
          }
        } catch (e) {
          // ignore proposer resolution issues
        }

        if (!notifyCreatorId) {
          const fallback = request.made_by_id || request.stakeholder_id || request.coordinator_id || null;
          if (fallback && String(fallback) !== String(coordinatorId)) {
            notifyCreatorId = fallback;
            if (fallback && request.stakeholder_id && String(fallback) === String(request.stakeholder_id)) notifyCreatorType = 'Stakeholder';
            else if (request.made_by_role && String(request.made_by_role).toLowerCase().includes('admin')) notifyCreatorType = 'Admin';
            else notifyCreatorType = 'Coordinator';
            console.log('coordinatorConfirmRequest: falling back to original requester as notify target', { notifyCreatorId, notifyCreatorType });
          }
        }

        console.log('coordinatorConfirmRequest: creator resolution', { notifyCreatorId, stakeholder_id: request.stakeholder_id, made_by_id: request.made_by_id, coordinator_id: request.coordinator_id, made_by_role: request.made_by_role });

        if (notifyCreatorId) {
          console.log('coordinatorConfirmRequest: sending creator reviewer-decision notification', { notifyCreatorId, notifyCreatorType, requestId, eventId: request.Event_ID, action });
          await Notification.createReviewerDecisionNotification(
            notifyCreatorId,
            requestId,
            request.Event_ID,
            action,
            'Coordinator',
            coordinatorName || null,
            null,
            null,
            notifyCreatorType
          );
          console.log('coordinatorConfirmRequest: creator reviewer-decision notification sent', { notifyCreatorId });
        } else {
          console.log('coordinatorConfirmRequest: no creator to notify or creator equals coordinator', { notifyCreatorId });
        }
      } catch (e) {
        console.error('coordinatorConfirmRequest: failed to notify creator after coordinatorConfirmRequest', e && e.message ? e.message : e);
      }

      return {
        success: true,
        message: 'Confirmation recorded successfully',
        request: request
      };

    } catch (error) {
      throw new Error(`Failed to confirm request: ${error.message}`);
    }
  }

  /**
   * Stakeholder confirms admin/coordinator decision
   * @param {string} stakeholderId
   * @param {string} requestId
   * @param {string} action ('Accepted' | 'Rejected')
   */
  async stakeholderConfirmRequest(stakeholderId, requestId, action) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      // Verify stakeholder created the request (if stakeholder_id exists)
      if (request.stakeholder_id && request.stakeholder_id !== stakeholderId) {
        throw new Error('Unauthorized: Stakeholder did not create this request');
      }

      // Ensure an admin or coordinator action has happened before stakeholder confirms
      if (!request.AdminAction && !request.AdminActionDate && !request.CoordinatorFinalAction) {
        throw new Error('Admin or coordinator must review the request before stakeholder confirmation');
      }

      // Only allow acceptance as the stakeholder final step. Stakeholders
      // may only confirm acceptance; explicit rejection flows should be
      // handled via admin/coordinator actions.
      const validActions = ['Accepted'];
      if (!validActions.includes(action)) {
        throw new Error(`Invalid action. Stakeholders may only perform: ${validActions.join(', ')}`);
      }

      // Update request with stakeholder decision
      request.StakeholderFinalAction = action;
      request.StakeholderFinalActionDate = new Date();

      // Finalize the event and request on stakeholder acceptance
      // Approve the linked event
      const event = await Event.findOne({ Event_ID: request.Event_ID });
      if (event) {
        event.Status = 'Completed';
        await event.save();
      }
      request.Status = REQUEST_STATUSES.COMPLETED;

      await request.save();

      // Create history entry for stakeholder action if history helper exists
      const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: stakeholderId }).catch(() => null);
      const stakeholderName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
      try {
        await EventRequestHistory.logCreatorResponse({
          requestId: request.Request_ID,
          eventId: request.Event_ID,
          actor: { id: stakeholderId, role: 'Stakeholder', name: stakeholderName },
          action: action,
          previousStatus: null,
          newStatus: request.Status || null,
          notes: null
        });
      } catch (e) {
        // ignore history creation failures
      }

      // Send notification to the coordinator (recipient: Coordinator)
      try {
        const recipientId = request.stakeholder_id ? request.stakeholder_id : request.coordinator_id;
        const recipientType = request.stakeholder_id ? 'Stakeholder' : 'Coordinator';
        await Notification.createAdminActionNotification(
          recipientId,
          request.Request_ID,
          request.Event_ID,
          action,
          null,
          null,
          recipientType
        );
      } catch (e) {
        // swallow notification errors
      }

      // Also notify the admin who handled this request (if any)
      if (request.Admin_ID) {
        try {
          await Notification.createCoordinatorActionNotification(
            request.Admin_ID,
            request.Request_ID,
            request.Event_ID,
            action
          );
        } catch (e) {
          // swallow notification errors
        }
      }

      return {
        success: true,
        message: 'Stakeholder confirmation recorded',
        request: request
      };
    } catch (error) {
      throw new Error(`Failed to record stakeholder confirmation: ${error.message}`);
    }
  }

  /**
   * Get all requests for coordinator
   * @param {string} coordinatorId 
   * @param {Object} filters 
   * @param {number} page 
   * @param {number} limit 
   * @returns {Object} Requests list
   */
  async getCoordinatorRequests(coordinatorId, filters = {}, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;

      // Some older/legacy requests may not have Coordinator_ID populated on
      // the EventRequest document but the linked Event may have
      // MadeByCoordinatorID. To be resilient, query for requests where
      // either the EventRequest.Coordinator_ID matches OR the linked Event
      // was created by the coordinator.
      // Gather possible ways a request could be linked to this coordinator:
      // 1) EventRequest.coordinator_id === coordinatorId
      // 2) Event.MadeByCoordinatorID === coordinatorId (legacy where EventRequest.coordinator_id missing)
      // 3) Stakeholders who belong to this coordinator created requests (stakeholder_id)

      const orClauses = [{ coordinator_id: coordinatorId }];

      // (2) Events created by the coordinator
      const eventIdsForCoordinator = await Event.find({ MadeByCoordinatorID: coordinatorId }).select('Event_ID');
      const eventIdList = Array.isArray(eventIdsForCoordinator) ? eventIdsForCoordinator.map(e => e.Event_ID) : [];
      if (eventIdList.length > 0) {
        orClauses.push({ Event_ID: { $in: eventIdList } });
      }

      // (3) Stakeholders that belong to this coordinator may have created requests
      // where stakeholder_id is populated but coordinator_id is missing.
      const stakeholderDocs = await require('../../models/index').Stakeholder.find({ Coordinator_ID: coordinatorId }).select('Stakeholder_ID');
      const stakeholderIds = Array.isArray(stakeholderDocs) ? stakeholderDocs.map(s => s.Stakeholder_ID) : [];
      if (stakeholderIds.length > 0) {
        orClauses.push({ stakeholder_id: { $in: stakeholderIds } });
      }

      const query = { $or: orClauses };
      
      if (filters.status) {
        query.Status = filters.status;
      }

      if (filters.date_from || filters.date_to) {
        query.createdAt = {};
        if (filters.date_from) query.createdAt.$gte = new Date(filters.date_from);
        if (filters.date_to) query.createdAt.$lte = new Date(filters.date_to);
      }

      // Use aggregation to compute a status priority so results are ordered
      // Pending -> Approved -> Rejected, then by newest createdAt.
      const pipeline = [
        { $match: query },
        { $addFields: {
          status_priority: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "pending" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "review" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "accept|approved|complete" } }, then: 1 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "reject" } }, then: 2 }
              ],
              default: 3
            }
          }
        } },
        { $sort: { status_priority: 1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ];

      const requests = await EventRequest.aggregate(pipeline).exec();

      const total = await EventRequest.countDocuments(query);

      return {
        success: true,
        requests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get requests: ${error.message}`);
    }
  }

  /**
   * Get all requests created by a stakeholder
   * @param {string} stakeholderId
   * @param {number} page
   * @param {number} limit
   */
  async getRequestsByStakeholder(stakeholderId, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;

      const query = { stakeholder_id: stakeholderId };

      const pipeline = [
        { $match: query },
        { $addFields: {
          status_priority: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "pending" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "review" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "accept|approved|complete" } }, then: 1 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "reject" } }, then: 2 }
              ],
              default: 3
            }
          }
        } },
        { $sort: { status_priority: 1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ];

      const requests = await EventRequest.aggregate(pipeline).exec();

      const total = await EventRequest.countDocuments(query);

      // Optionally enrich each request with event and coordinator staff
      const enriched = await Promise.all(requests.map(async (r) => {
        const event = await Event.findOne({ Event_ID: r.Event_ID });
        const coordinator = await Coordinator.findOne({ Coordinator_ID: r.coordinator_id });
        const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.coordinator_id }).catch(() => null);
        // attempt to resolve district info from coordinator.District_ID
        let districtInfo = null;
        try {
          if (coordinator && coordinator.District_ID) {
            districtInfo = await require('../../models/index').District.findOne({ District_ID: coordinator.District_ID }).catch(() => null);
          }
        } catch (e) {
          districtInfo = null;
        }

        return {
          ...r,
          event: event ? event.toObject() : null,
          coordinator: coordinator ? {
            ...coordinator.toObject(),
            staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null,
            District_Name: districtInfo ? districtInfo.District_Name : undefined,
            District_Number: districtInfo ? districtInfo.District_Number : undefined
          } : null
        };
      }));

      return {
        success: true,
        requests: enriched,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get stakeholder requests: ${error.message}`);
    }
  }

  /**
   * Get all pending requests for admin
   * @param {Object} filters 
   * @param {number} page 
   * @param {number} limit 
   * @returns {Object} Requests list
   */
  async getPendingRequests(filters = {}, page = 1, limit = 10) {
    try {
      const skip = (page - 1) * limit;

      const query = { Status: REQUEST_STATUSES.PENDING_REVIEW };

      if (filters.date_from || filters.date_to) {
        query.createdAt = {};
        if (filters.date_from) query.createdAt.$gte = new Date(filters.date_from);
        if (filters.date_to) query.createdAt.$lte = new Date(filters.date_to);
      }

      const pipeline = [
        { $match: query },
        { $addFields: {
          status_priority: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "pending" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "review" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "accept|approved|complete" } }, then: 1 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "reject" } }, then: 2 }
              ],
              default: 3
            }
          }
        } },
        // For pending requests keep oldest-first within pending
        { $sort: { status_priority: 1, createdAt: 1 } },
        { $skip: skip },
        { $limit: limit }
      ];

      const requests = await EventRequest.aggregate(pipeline).exec();

      const total = await EventRequest.countDocuments(query);

      return {
        success: true,
        requests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to get pending requests: ${error.message}`);
    }
  }

  /**
   * Get filtered requests for admin/global view
   * Supports filtering by status, date range, coordinator and simple search
   * @param {Object} filters
   * @param {number} page
   * @param {number} limit
   */
  async getFilteredRequests(filters = {}, page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;

      const query = {};

      if (filters.status) {
        query.Status = filters.status;
      }

      if (filters.coordinator) {
        query.coordinator_id = filters.coordinator;
      }

      if (filters.date_from || filters.date_to) {
        query.createdAt = {};
        if (filters.date_from) query.createdAt.$gte = new Date(filters.date_from);
        if (filters.date_to) query.createdAt.$lte = new Date(filters.date_to);
      }

      // Simple search: try to match request id or event title
      let eventIdMatches = null;
      if (filters.search) {
        const regex = new RegExp(String(filters.search), 'i');
        // Find events with matching title
        const matchedEvents = await Event.find({ Event_Title: { $regex: regex } }).select('Event_ID');
        eventIdMatches = Array.isArray(matchedEvents) ? matchedEvents.map(e => e.Event_ID) : [];
        // Build $or condition to match Request_ID or linked Event title
        query.$or = [{ Request_ID: { $regex: regex } }];
        if (eventIdMatches.length > 0) query.$or.push({ Event_ID: { $in: eventIdMatches } });
      }

      const pipeline = [
        { $match: query },
        { $addFields: {
          status_priority: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "pending" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "review" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "accept|approved|complete" } }, then: 1 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "reject" } }, then: 2 }
              ],
              default: 3
            }
          }
        } },
        { $sort: { status_priority: 1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ];

      const requests = await EventRequest.aggregate(pipeline).exec();

      const total = await EventRequest.countDocuments(query);

      return {
        success: true,
        requests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get filtered requests: ${error.message}`);
    }
  }

  /**
   * Get all requests (admin history view)
   * @param {number} page
   * @param {number} limit
   */
  async getAllRequests(page = 1, limit = 50) {
    try {
      const skip = (page - 1) * limit;
      const pipeline = [
        { $match: {} },
        { $addFields: {
          status_priority: {
            $switch: {
              branches: [
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "pending" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "review" } }, then: 0 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "accept|approved|complete" } }, then: 1 },
                { case: { $regexMatch: { input: { $toLower: "$Status" }, regex: "reject" } }, then: 2 }
              ],
              default: 3
            }
          }
        } },
        { $sort: { status_priority: 1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ];

      const requests = await EventRequest.aggregate(pipeline).exec();

      const total = await EventRequest.countDocuments({});

      return {
        success: true,
        requests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new Error(`Failed to get all requests: ${error.message}`);
    }
  }

  /**
   * Cancel/Delete pending request or cancel approved event
   * @param {string} requestId 
   * @param {string} actorRole - Role of the actor (Coordinator, SystemAdmin, Admin, Stakeholder)
   * @param {string} actorId - ID of the actor performing the cancellation
   * @returns {Object} Result
   */
  async cancelEventRequest(requestId, actorRole, actorId, note = null) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      // Normalize actor role and disallow Stakeholders from cancelling
      const actorRoleNorm = String(actorRole || '').toLowerCase();
      if (actorRoleNorm === 'stakeholder') {
        throw new Error('Unauthorized: Stakeholders are not allowed to cancel requests or events');
      }

      // Allow cancellation of pending requests or approved events
      const lowerStatus = String(request.Status || '').toLowerCase();
      const isPending = lowerStatus.includes('pending');
      const isRescheduled = lowerStatus.includes('resched');
      const isCompleted = lowerStatus.includes('completed') || lowerStatus === REQUEST_STATUSES.COMPLETED;
      if (!isPending && !isRescheduled && !isCompleted) {
        throw new Error('Cannot cancel request. Request status does not allow cancellation.');
      }

      // Authorization checks based on actor role and request status
      if (request.Status === 'Completed') {
        // For approved events, sys admins, coordinators (own or handle stakeholder), stakeholders (own) can cancel
        const isAdmin = actorRole === 'SystemAdmin' || actorRole === 'Admin';
        const isStakeholder = actorRole === 'Stakeholder' && request.stakeholder_id === actorId;
        
        let isCoordinator = false;
        if (actorRole === 'Coordinator') {
          isCoordinator = request.coordinator_id === actorId;
          if (!isCoordinator && request.stakeholder_id) {
            try {
              const Stakeholder = require('../../models/index').Stakeholder;
              const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: request.stakeholder_id });
              isCoordinator = stakeholder && stakeholder.Coordinator_ID === actorId;
            } catch (e) {
              // Ignore errors in stakeholder lookup
            }
          }
        }
        
        if (!isAdmin && !isStakeholder && !isCoordinator) {
          throw new Error('Unauthorized: Only sys admins, coordinators (who own the event or handle the stakeholder), or the stakeholder who created this event can cancel approved events');
        }
      } else {
        // For pending requests, sys admins, coordinators (own or handle stakeholder), stakeholders (own) can cancel
        const isAdmin = actorRole === 'SystemAdmin' || actorRole === 'Admin';
        const isStakeholder = actorRole === 'Stakeholder' && request.stakeholder_id === actorId;
        
        let isCoordinator = false;
        if (actorRole === 'Coordinator') {
          isCoordinator = request.coordinator_id === actorId;
          if (!isCoordinator && request.stakeholder_id) {
            try {
              const Stakeholder = require('../../models/index').Stakeholder;
              const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: request.stakeholder_id });
              isCoordinator = stakeholder && stakeholder.Coordinator_ID === actorId;
            } catch (e) {
              // Ignore errors in stakeholder lookup
            }
          }
        }
        
        if (!isAdmin && !isStakeholder && !isCoordinator) {
          throw new Error('Unauthorized: Only sys admins, coordinators (who own the request or handle the stakeholder), or the stakeholder who created this request can cancel pending requests');
        }
      }

      // Handle cancellation based on request status
      if (request.Status === 'Completed') {
        // For approved events: update event status to 'Cancelled' but keep the request record
        const event = await Event.findOne({ Event_ID: request.Event_ID });
        if (event) {
          event.Status = 'Cancelled';
          await event.save();
        }
        
        // Update request status to 'Cancelled' and store cancellation note
        request.Status = 'Cancelled';
        if (note) {
          request.AdminNote = note; // Store cancellation note in AdminNote field
        }
        await request.save();
        
        console.log('cancelEventRequest: Set request status to Cancelled for completed event, requestId=', requestId, 'final status=', request.Status);
        
        // Create history entry
        if (actorRole === 'SystemAdmin' || actorRole === 'Admin') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const actorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.logStatusChange({
            requestId: requestId,
            eventId: request.Event_ID,
            previousStatus: previousStatus || null,
            newStatus: request.Status || null,
            actor: { id: actorId, role: actorRole, name: actorName },
            note: note || 'Event cancelled by admin',
            metadata: { scheduledAt: event ? event.Start_Date : null }
          });
        } else if (actorRole === 'Coordinator') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.logStatusChange({
            requestId: requestId,
            eventId: request.Event_ID,
            previousStatus: previousStatus || null,
            newStatus: request.Status || null,
            actor: { id: actorId, role: actorRole, name: coordinatorName },
            note: 'Cancelled',
            metadata: {}
          });
        } else if (actorRole === 'Stakeholder') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const stakeholderName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.logCreatorResponse({
            requestId: requestId,
            eventId: request.Event_ID,
            actor: { id: actorId, role: actorRole, name: stakeholderName },
            action: 'Cancelled',
            previousStatus: previousStatus || null,
            newStatus: request.Status || null,
            notes: note || null
          });
        }
        
        // Send cancellation notifications
        try {
          const Notification = require('../../models/index').Notification;
          
          // Notify coordinator
          await Notification.createAdminCancellationNotification(
            request.coordinator_id,
            requestId,
            request.Event_ID,
            note || 'Event cancelled'
          );
          
          // Notify stakeholder if they created the request
          if (request.stakeholder_id) {
            await Notification.createStakeholderCancellationNotification(
              request.stakeholder_id,
              requestId,
              request.Event_ID,
              note || 'Event cancelled'
            );
          }
        } catch (notificationError) {
          console.warn('Error sending cancellation notifications:', notificationError);
        }

        // If a coordinator cancelled this request, notify all system admins
        if (actorRole === 'Coordinator') {
          try {
            const models = require('../../models/index');
            const SystemAdmin = models.SystemAdmin;
            const Notification = models.Notification;
            const admins = await SystemAdmin.find({}).select('Admin_ID').lean().exec();
            if (admins && admins.length) {
              for (const a of admins) {
                try {
                  await Notification.createCoordinatorActionNotification(
                    a.Admin_ID,
                    requestId,
                    request.Event_ID,
                    'Cancelled'
                  );
                } catch (innerErr) {
                  console.warn('Failed to notify admin', a && a.Admin_ID, innerErr);
                }
              }
            }
          } catch (adminNotifyErr) {
            console.warn('Error notifying system admins of coordinator cancellation:', adminNotifyErr);
          }
        }

        // If a coordinator cancelled this event/request, notify all system admins
        if (actorRole === 'Coordinator') {
          try {
            const models = require('../../models/index');
            const SystemAdmin = models.SystemAdmin;
            const Notification = models.Notification;
            const admins = await SystemAdmin.find({}).select('Admin_ID').lean().exec();
            if (admins && admins.length) {
              for (const a of admins) {
                try {
                  await Notification.createCoordinatorActionNotification(
                    a.Admin_ID,
                    requestId,
                    request.Event_ID,
                    'Cancelled'
                  );
                } catch (innerErr) {
                  console.warn('Failed to notify admin', a && a.Admin_ID, innerErr);
                }
              }
            }
          } catch (adminNotifyErr) {
            console.warn('Error notifying system admins of coordinator cancellation:', adminNotifyErr);
          }
        }
        
        return {
          success: true,
          message: 'Event cancelled successfully',
          request: request
        };
      } else {
        // For pending requests: set status to 'Cancelled' instead of deleting
        const event = await Event.findOne({ Event_ID: request.Event_ID });
        if (event) {
          event.Status = 'Cancelled';
          await event.save();
        }
        
        // Update request status to 'Cancelled' and store cancellation note
        request.Status = 'Cancelled';
        if (note) {
          request.AdminNote = note; // Store cancellation note in AdminNote field
        }
        await request.save();
        
        console.log('cancelEventRequest: Set request status to Cancelled for pending request, requestId=', requestId, 'final status=', request.Status);
        
        // Create history entry
        if (actorRole === 'SystemAdmin' || actorRole === 'Admin') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const actorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.logStatusChange({
            requestId: requestId,
            eventId: request.Event_ID,
            previousStatus: previousStatus || null,
            newStatus: request.Status || null,
            actor: { id: actorId, role: actorRole, name: actorName },
            note: note || 'Request cancelled by admin',
            metadata: { scheduledAt: event ? event.Start_Date : null }
          });
        } else if (actorRole === 'Coordinator') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.logStatusChange({
            requestId: requestId,
            eventId: request.Event_ID,
            previousStatus: previousStatus || null,
            newStatus: request.Status || null,
            actor: { id: actorId, role: actorRole, name: coordinatorName },
            note: 'Cancelled',
            metadata: {}
          });
        } else if (actorRole === 'Stakeholder') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const stakeholderName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.logCreatorResponse({
            requestId: requestId,
            eventId: request.Event_ID,
            actor: { id: actorId, role: actorRole, name: stakeholderName },
            action: 'Cancelled',
            previousStatus: previousStatus || null,
            newStatus: request.Status || null,
            notes: note || null
          });
        }
        
        // Send cancellation notifications
        try {
          const Notification = require('../../models/index').Notification;
          
          // Notify coordinator
          await Notification.createAdminCancellationNotification(
            request.coordinator_id,
            requestId,
            request.Event_ID,
            note || 'Request cancelled'
          );
          
          // Notify stakeholder if they created the request
          if (request.stakeholder_id) {
            await Notification.createStakeholderCancellationNotification(
              request.stakeholder_id,
              requestId,
              request.Event_ID,
              note || 'Request cancelled'
            );
          }
        } catch (notificationError) {
          console.warn('Error sending cancellation notifications:', notificationError);
        }
        
        return {
          success: true,
          message: 'Request cancelled successfully',
          request: request
        };
      }

    } catch (error) {
      throw new Error(`Failed to cancel request: ${error.message}`);
    }
  }

  /**
   * Delete a cancelled or rejected event request and associated data
   * @param {string} requestId
   * @param {string} actorRole
   * @param {string} actorId
   * @returns {Object} Result
   */
  async deleteEventRequest(requestId, actorRole, actorId) {
    try {
      console.log('=== DELETE EVENT REQUEST DEBUG ===');
      console.log('Request ID:', requestId);
      console.log('Actor Role:', actorRole);
      console.log('Actor ID:', actorId);

      const request = await this._findRequest(requestId);
      if (!request) {
        console.log('ERROR: Request not found');
        throw new Error('Request not found');
      }

      console.log('Found request with Status:', request.Status);
      console.log('Request object:', JSON.stringify(request, null, 2));

      // Debug logging
      console.log('deleteEventRequest: requestId=', requestId, 'current Status=', request.Status, 'allowedStatuses=', ['Cancelled', 'Rejected']);

      // Only allow deletion of cancelled or rejected requests
      const allowedStatuses = ['Cancelled', 'Rejected'];
      if (!allowedStatuses.includes(request.Status)) {
        console.log('deleteEventRequest: Status not allowed. Current status:', request.Status);
        console.log('Allowed statuses:', allowedStatuses);
        console.log('Request details:', {
          Request_ID: request.Request_ID,
          Status: request.Status,
          AdminAction: request.AdminAction,
          StakeholderFinalAction: request.StakeholderFinalAction,
          CoordinatorFinalAction: request.CoordinatorFinalAction
        });
        throw new Error('Cannot delete request. Only cancelled or rejected requests can be deleted.');
      }

      // Authorization: Only System Administrators / Admin role may permanently delete cancelled/rejected requests
      const actorRoleNorm = String(actorRole || '').toLowerCase();
      const isSysAdmin = actorRoleNorm === 'systemadmin' || actorRoleNorm === 'admin';
      if (!isSysAdmin) {
        throw new Error('Unauthorized: Only system administrators can permanently delete cancelled or rejected requests');
      }

      // Notify involved parties about permanent deletion before removing records
      try {
        const Notification = require('../../models/index').Notification;
        // Notify coordinator
        if (request.coordinator_id) {
          try {
            await Notification.createRequestDeletionNotification(
              request.coordinator_id,
              requestId,
              request.Event_ID
            );
          } catch (nerr) {
            console.warn('Failed to notify coordinator about deletion', nerr);
          }
        }
        // Notify stakeholder
        if (request.stakeholder_id) {
          try {
            await Notification.createStakeholderDeletionNotification(
              request.stakeholder_id,
              requestId,
              request.Event_ID
            );
          } catch (nerr) {
            console.warn('Failed to notify stakeholder about deletion', nerr);
          }
        }
      } catch (notifyErr) {
        console.warn('Error while sending deletion notifications:', notifyErr);
      }

      // Delete everything associated with the request
      await Event.deleteOne({ Event_ID: request.Event_ID });
      await BloodDrive.deleteOne({ BloodDrive_ID: request.Event_ID });
      await Advocacy.deleteOne({ Advocacy_ID: request.Event_ID });
      await Training.deleteOne({ Training_ID: request.Event_ID });
      await EventRequestHistory.deleteMany({ Request_ID: requestId });
      await EventRequest.deleteOne({ Request_ID: requestId });

      return {
        success: true,
        message: 'Request deleted successfully'
      };

    } catch (error) {
      throw new Error(`Failed to delete request: ${error.message}`);
    }
  }
}

module.exports = new EventRequestService();
