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
  District
} = require('../../models/index');
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
        Coordinator_ID: coordinatorId,
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
        Status: { $in: ['Approved', 'Completed', 'Accepted'] }
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

      // If actor is Admin or Coordinator, bypass validation rules entirely
      if (actorRole && (String(actorRole).toLowerCase() === 'admin' || String(actorRole).toLowerCase() === 'coordinator')) {
        return { isValid: true, errors: [], warnings: [] };
      }

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

      // 1. Check advance booking limit (1 month/30 days)
      const advanceBooking = systemSettings.validateAdvanceBooking(startDate);
      if (!advanceBooking.isValid) {
        validationResults.isValid = false;
        validationResults.errors.push(advanceBooking.message);
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
        if (Array.isArray(blockedWeekdays) && blockedWeekdays.includes(startDate.getDay())) {
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
            MadeByStakeholderID: actorId,
            Status: 'Pending_Admin_Review'
          });
        } else {
          // Default: count pending for the coordinator
          pendingCount = await EventRequest.countDocuments({
            Coordinator_ID: coordinatorId,
            Status: 'Pending_Admin_Review'
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
          const requests = await EventRequest.find({ MadeByStakeholderID: actorId, Status: { $nin: ['Rejected', 'Rejected_By_Admin'] } });
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
        Status: { $in: ['Approved', 'Completed'] }
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
  computeAllowedActions(actorRole, actorId, requestDoc, eventDoc) {
    try {
      const role = actorRole ? String(actorRole).toLowerCase() : null;
      const event = eventDoc || (requestDoc ? requestDoc.event : null) || {};
      const req = requestDoc || {};

      const isPublished = event && (String(event.Status) === 'Approved' || String(event.Status) === 'Completed');

      // Published: all users see view, edit, manage-staff, resched
      if (isPublished) {
        return ['view', 'edit', 'manage-staff', 'resched'];
      }

      // Not published: behavior differs by role
      if (role === 'admin' || role === 'coordinator') {
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
  computeActionFlags(actorRole, actorId, requestDoc, eventDoc) {
    try {
      const allowed = this.computeAllowedActions(actorRole, actorId, requestDoc, eventDoc) || [];
      const has = (a) => allowed.includes(a);
      return {
        canView: has('view'),
        canEdit: has('edit'),
        canManageStaff: has('manage-staff'),
        canReschedule: has('resched') || has('reschedule') || has('resched'),
        canAccept: has('accept') || has('Accepted') || has('approve'),
        canReject: has('reject') || has('reject') === true,
        // convenience: any admin-like controls
        canAdminAction: has('accept') || has('reject') || has('resched')
      };
    } catch (e) {
      return {
        canView: true,
        canEdit: false,
        canManageStaff: false,
        canReschedule: false,
        canAccept: false,
        canReject: false,
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
        Status: { $in: ['Approved', 'Completed'] }
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
   * Coordinator submits event request
   * @param {string} coordinatorId 
   * @param {Object} eventData 
   * @returns {Object} Created request
   */
  async createEventRequest(coordinatorId, eventData) {
    try {
      // Validate coordinator exists
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
      if (!coordinator) {
        throw new Error('Coordinator not found');
      }

  // Validate all scheduling rules. Allow callers to pass an optional excludeRequestId
  // when creating a change request for an existing request so validation can ignore
  // the original request/event (avoids false-positive overlaps/double-booking).
  const excludeRequestId = eventData && (eventData.excludeRequestId || eventData.exclude_request_id || null);
  const validation = await this.validateSchedulingRules(coordinatorId, eventData, excludeRequestId);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Generate IDs
      const eventId = this.generateEventID();
      const requestId = this.generateRequestID();

      // Determine category type. If not provided (change-request case) try to infer
      // from the existing request/event referenced by excludeRequestId.
      let categoryType = eventData.categoryType || eventData.Category || null;
      if (!categoryType && excludeRequestId) {
        try {
          const existingReq = await this._findRequest(excludeRequestId);
          if (existingReq && existingReq.Event_ID) {
            const existingEvent = await Event.findOne({ Event_ID: existingReq.Event_ID }).catch(() => null);
            categoryType = existingEvent?.Category || existingReq.Category || categoryType;
          }
        } catch (e) {
          // ignore inference failures
        }
      }

      // Create event category-specific data
      let categoryData = null;
      if (categoryType === 'BloodDrive' || eventData.categoryType === 'BloodDrive') {
        categoryData = new BloodDrive({
          BloodDrive_ID: eventId,
          Target_Donation: eventData.Target_Donation,
          VenueType: eventData.VenueType
        });
        await categoryData.save();
      } else if (categoryType === 'Advocacy' || eventData.categoryType === 'Advocacy') {
        // Normalize expected audience size from multiple possible input names
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
      } else if (categoryType === 'Training' || eventData.categoryType === 'Training') {
        categoryData = new Training({
          Training_ID: eventId,
          TrainingType: eventData.TrainingType,
          MaxParticipants: eventData.MaxParticipants
        });
        await categoryData.save();
      } else {
        throw new Error('Invalid event category type');
      }

      // Create main event
      const event = new Event({
        Event_ID: eventId,
        Event_Title: eventData.Event_Title,
        Location: eventData.Location,
        // Persist description when provided (accept multiple possible input names)
        Event_Description: eventData.Event_Description || eventData.eventDescription || eventData.Description || undefined,
        Start_Date: new Date(eventData.Start_Date),
        End_Date: eventData.End_Date ? new Date(eventData.End_Date) : undefined,
        MadeByCoordinatorID: coordinatorId,
        // If this request was created by a stakeholder, persist that too
        MadeByStakeholderID: eventData.MadeByStakeholderID || undefined,
        Email: eventData.Email,
        Phone_Number: eventData.Phone_Number,
        // Persist category type so frontend can display the event type
        Category: categoryType || eventData.categoryType || eventData.Category || undefined,
        Status: 'Pending'
      });
      await event.save();

      // Create event request
      const request = new EventRequest({
        Request_ID: requestId,
        Event_ID: eventId,
        Coordinator_ID: coordinatorId,
        // Keep trace of which stakeholder created the request (if any)
        MadeByStakeholderID: eventData.MadeByStakeholderID || undefined,
        // Persist event category/type on the request to aid UI and audits
        Category: categoryType || eventData.categoryType || eventData.Category || undefined,
        Status: 'Pending_Admin_Review'
      });
      await request.save();

      // Create history entry
      const models = require('../../models/index');
      const bloodbankStaff = await models.BloodbankStaff.findOne({ ID: coordinatorId }).catch(() => null);
      const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;

      // If this request was created by a stakeholder, prefer using the stakeholder's
      // full name as the "created by" label so coordinators can easily see who
      // submitted the request. Otherwise use the coordinator/staff name.
      let createdByName = coordinatorName;
      if (eventData.MadeByStakeholderID) {
        try {
          const stakeholder = await models.Stakeholder.findOne({ Stakeholder_ID: eventData.MadeByStakeholderID }).catch(() => null);
          if (stakeholder) {
            const sfirst = stakeholder.First_Name || stakeholder.FirstName || stakeholder.First || '';
            const slast = stakeholder.Last_Name || stakeholder.LastName || stakeholder.Last || '';
            const full = `${(sfirst || '').toString().trim()} ${(slast || '').toString().trim()}`.trim();
            if (full) createdByName = full;
          }
        } catch (e) {
          // ignore lookup failures and fall back to coordinatorName
        }
      }

      await EventRequestHistory.createRequestHistory(
        requestId,
        eventId,
        coordinatorId,
        createdByName
      );

      // Send notification to admin
      // Get all admins
      const admins = await SystemAdmin.find();
      for (const admin of admins) {
        await Notification.createNewRequestNotification(
          admin.Admin_ID,
          requestId,
          eventId,
          coordinatorId
        );
      }

      // Attach createdByName to returned payloads so frontend can display creator
      const returnedRequest = {
        Request_ID: request.Request_ID,
        Event_ID: event.Event_ID,
        Status: request.Status,
        created_at: request.createdAt,
        createdByName: createdByName || null,
        MadeByStakeholderID: request.MadeByStakeholderID || null
      };

      // Do not modify persisted schemas here (avoid adding ad-hoc properties to DB records),
      // but include createdByName on the returned event object for UI convenience.
      const returnedEvent = event.toObject ? { ...event.toObject(), createdByName: createdByName || null } : { ...event, createdByName: createdByName || null };

      return {
        success: true,
        message: 'Event request submitted successfully',
        request: returnedRequest,
        event: returnedEvent,
        category: categoryData,
        warnings: validation.warnings
      };

    } catch (error) {
      throw new Error(`Failed to create event request: ${error.message}`);
    }
  }

  /**
   * Create an event immediately (auto-published) when created by admin or coordinator
   * - Reuses the same scheduling validation rules
   * - Creates category data and main Event only (no EventRequest)
   */
  async createImmediateEvent(creatorId, creatorRole, eventData) {
    try {
      // Validate creator (admin or coordinator)
      if (creatorRole !== 'Admin' && creatorRole !== 'Coordinator') {
        throw new Error('Unauthorized: Only Admin or Coordinator can auto-publish events');
      }

      const coordinatorId = creatorRole === 'Coordinator' ? creatorId : (eventData.MadeByCoordinatorID || null);
      if (creatorRole === 'Coordinator') {
        const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
        if (!coordinator) throw new Error('Coordinator not found');
      }

      // Tag actor info (so validateSchedulingRules can skip checks for admin/coordinator)
      eventData._actorRole = creatorRole;
      eventData._actorId = creatorId;
      // Validate scheduling rules (validateSchedulingRules will bypass for admin/coordinator)
      const validation = await this.validateSchedulingRules(coordinatorId || 'ADMIN', eventData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Generate event ID
      const eventId = this.generateEventID();

      // Create category-specific data
      let categoryData = null;
      if (eventData.categoryType === 'BloodDrive') {
        categoryData = new BloodDrive({
          BloodDrive_ID: eventId,
          Target_Donation: eventData.Target_Donation,
          VenueType: eventData.VenueType
        });
        await categoryData.save();
      } else if (eventData.categoryType === 'Advocacy') {
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
      } else if (eventData.categoryType === 'Training') {
        categoryData = new Training({
          Training_ID: eventId,
          TrainingType: eventData.TrainingType,
          MaxParticipants: eventData.MaxParticipants
        });
        await categoryData.save();
      } else {
        throw new Error('Invalid event category type');
      }

      // Create main event with Approved/Completed status (auto-publish)
      const event = new Event({
        Event_ID: eventId,
        Event_Title: eventData.Event_Title,
        Location: eventData.Location,
        // Persist description when provided (accept multiple possible input names)
        Event_Description: eventData.Event_Description || eventData.eventDescription || eventData.Description || undefined,
        Start_Date: new Date(eventData.Start_Date),
        End_Date: eventData.End_Date ? new Date(eventData.End_Date) : undefined,
        MadeByCoordinatorID: coordinatorId || undefined,
        Email: eventData.Email,
        Phone_Number: eventData.Phone_Number,
        ApprovedByAdminID: creatorRole === 'Admin' ? creatorId : undefined,
        // Persist category so frontend can read the event type
        Category: eventData.categoryType || eventData.Category || undefined,
        Status: 'Approved'
      });
      await event.save();

      // Also create an EventRequest record for audit/history and notifications
      // Even though the event is auto-published, keep a request trail and mark it as auto-approved.
      const requestId = this.generateRequestID();

      // Determine coordinator id to attach to the request. Prefer explicit coordinatorId (if creator is Coordinator),
      // then any MadeByCoordinatorID in payload, otherwise fall back to the creatorId (best-effort).
      const requestCoordinatorId = coordinatorId || eventData.MadeByCoordinatorID || creatorId;

      const request = new EventRequest({
        Request_ID: requestId,
        Event_ID: eventId,
        Coordinator_ID: requestCoordinatorId,
        MadeByStakeholderID: eventData.MadeByStakeholderID || undefined,
        Admin_ID: creatorRole === 'Admin' ? creatorId : undefined,
        // Persist category on auto-approved requests as well
        Category: eventData.categoryType || eventData.Category || undefined,
        AdminAction: 'Accepted',
        AdminNote: null,
        AdminActionDate: new Date(),
        // Mark coordinator final action as approved so the request moves to Completed
        CoordinatorFinalAction: 'Approved',
        CoordinatorFinalActionDate: new Date(),
        Status: 'Completed'
      });

      await request.save();

      // Create history entries: admin action + coordinator approval (auto)
      try {
        // Admin history (actor = Admin)
        await EventRequestHistory.createAdminActionHistory(
          requestId,
          eventId,
          creatorId,
          null,
          'Accepted',
          null,
          event.Start_Date
        );

        // Coordinator approval history (actor = Coordinator)
        const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: requestCoordinatorId }).catch(() => null);
        const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
        await EventRequestHistory.createCoordinatorActionHistory(
          requestId,
          eventId,
          requestCoordinatorId,
          coordinatorName,
          'Approved',
          'Accepted_By_Admin'
        );
      } catch (e) {
        // Swallow history creation failures to avoid blocking event creation
      }

      // Notify the appropriate recipient about the auto-approved request (if id exists)
      try {
        if (requestCoordinatorId) {
          const recipientId = request.MadeByStakeholderID ? request.MadeByStakeholderID : requestCoordinatorId;
          const recipientType = request.MadeByStakeholderID ? 'Stakeholder' : 'Coordinator';
          await Notification.createAdminActionNotification(
            recipientId,
            requestId,
            eventId,
            'Accepted',
            null,
            null,
            recipientType
          );
        }
      } catch (e) {
        // swallow notification errors
      }

      return {
        success: true,
        message: 'Event created and published successfully',
        request: {
          Request_ID: request.Request_ID,
          Event_ID: event.Event_ID,
          Status: request.Status,
          created_at: request.createdAt
        },
        event,
        category: categoryData,
        warnings: validation.warnings
      };
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
      console.log('[Service] getEventRequestById called', { requestId });
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
      const coordinator = await Coordinator.findOne({ Coordinator_ID: request.Coordinator_ID });
      const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: request.Coordinator_ID });

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

      return {
        success: true,
        request: {
          ...request.toObject(),
          event: event.toObject(),
          category: categoryData,
          coordinator: {
            ...coordinator.toObject(),
            staff: staff ? {
              First_Name: staff.First_Name,
              Last_Name: staff.Last_Name,
              Email: staff.Email,
              Phone_Number: staff.Phone_Number
            } : null
          },
          // include normalized staff assignment list for convenience
          staff: staffAssignments
        }
      };

    } catch (error) {
      // Log full error for easier debugging (stack + message)
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
      try {
        console.log('[Service] updateEventRequest called', {
          requestId,
          coordinatorId,
          actorIsAdmin,
          requestStatus: request.Status,
          requestCoordinatorId: request.Coordinator_ID,
          updateDataKeys: updateData ? Object.keys(updateData) : null
        });
      } catch (e) {
        // swallow logging errors
      }

      // Authorization rules:
      // - Admins may update any request
      // - Coordinators may update requests they own (Coordinator_ID)
      // - Stakeholders may update requests they created (MadeByStakeholderID)
      if (!actorIsAdmin && !actorIsCoordinator && !actorIsStakeholder) {
        throw new Error('Unauthorized: invalid actor');
      }

      // If actor is stakeholder, allow submitting change requests while the
      // request is pending admin review. Historically we required the
      // stakeholder to be the original creator (MadeByStakeholderID), but in
      // this system requests may be created by any actor and stakeholders
      // should still be able to propose edits. Therefore we no longer block
      // by strict ownership; we only enforce that the request is still
      // pending admin review.
      if (actorIsStakeholder) {
        // Allow stakeholder updates. If the request was already processed (e.g., Completed)
        // then convert it back to Pending_Admin_Review so the stakeholder's changes
        // will be re-evaluated by admins/coordinators. Clear previous admin/coordinator
        // approvals so the flow requires fresh review.
        if (request.Status !== 'Pending_Admin_Review') {
          request.AdminAction = null;
          request.AdminNote = null;
          request.RescheduledDate = null;
          request.AdminActionDate = null;
          request.CoordinatorFinalAction = null;
          request.CoordinatorFinalActionDate = null;
          request.StakeholderFinalAction = null;
          request.StakeholderFinalActionDate = null;
          request.Status = 'Pending_Admin_Review';
        }

        // Record stakeholder as proposer if missing (audit)
        if (!request.MadeByStakeholderID) {
          request.MadeByStakeholderID = actorId;
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
        if (request.Coordinator_ID !== actorId) {
          throw new Error('Unauthorized: Coordinator does not own this request');
        }
        // Coordinators may update pending requests or act like admins; allow update even if not pending
      }

      const event = await Event.findOne({ Event_ID: request.Event_ID });
      if (!event) {
        throw new Error('Event not found');
      }

      // If date/time is being updated, revalidate and apply
      if (updateData.Start_Date) {
        // Validate scheduling with provided start/end
        // When an admin is performing the update we must validate against the request's coordinator
        // (not the adminId). Use the request.Coordinator_ID for scheduling checks when actorIsAdmin.
  const schedulingCoordinatorId = request.Coordinator_ID;
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
    console.log('[Service] resolved categoryType for update', { requestId, categoryType });

    // Remove control/actor fields from updateData copy so we don't accidentally persist them into category docs
    if (updateData.adminId) delete updateData.adminId;
    if (updateData.coordinatorId) delete updateData.coordinatorId;

  // Update category-specific data if provided (use resolved categoryType)
  if (categoryType === 'BloodDrive' && (updateData.Target_Donation !== undefined && updateData.Target_Donation !== null)) {
        console.log('[Service] updating BloodDrive', { eventId: event.Event_ID, Target_Donation: updateData.Target_Donation, VenueType: updateData.VenueType });
        const bdRes = await BloodDrive.updateOne(
          { BloodDrive_ID: event.Event_ID },
          { Target_Donation: updateData.Target_Donation, VenueType: updateData.VenueType }
        );
        console.log('[Service] BloodDrive.updateOne result', bdRes);
        const bdDoc = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID }).catch(() => null);
        console.log('[Service] BloodDrive after update', bdDoc ? bdDoc.toObject() : null);
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
        console.log('[Service] updating Advocacy', { eventId: event.Event_ID, advocacyData });
        const advRes = await Advocacy.updateOne({ Advocacy_ID: event.Event_ID }, advocacyData);
        console.log('[Service] Advocacy.updateOne result', advRes);
        const advDoc = await Advocacy.findOne({ Advocacy_ID: event.Event_ID }).catch(() => null);
        console.log('[Service] Advocacy after update', advDoc ? advDoc.toObject() : null);
  } else if (categoryType === 'Training') {
        const trainingData = {};
        if (updateData.TrainingType) trainingData.TrainingType = updateData.TrainingType;
        if (updateData.MaxParticipants) trainingData.MaxParticipants = updateData.MaxParticipants;
  console.log('[Service] updating Training', { eventId: event.Event_ID, trainingData });
  const trRes = await Training.updateOne({ Training_ID: event.Event_ID }, trainingData);
  console.log('[Service] Training.updateOne result', trRes);
  const trDoc = await Training.findOne({ Training_ID: event.Event_ID }).catch(() => null);
  console.log('[Service] Training after update', trDoc ? trDoc.toObject() : null);
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

      console.log('[Service] updateEventRequest returning', { requestId, event: freshEvent ? freshEvent.toObject() : null, category: categoryData });

      // If the actor is admin or coordinator, auto-approve the updated request/event
      // but only when the request was NOT created by a stakeholder. If the
      // request was created by a stakeholder, admins/coordinators must not
      // finalize it — the stakeholder must confirm any reschedule/changes.
      if (actorIsAdmin || actorIsCoordinator) {
        try {
          const approverId = actorId;
          if (freshEvent) {
            // If stakeholder created the request, do not auto-publish the event
            const createdByStakeholder = !!request.MadeByStakeholderID;
            if (createdByStakeholder) {
              freshEvent.Status = 'Pending';
            } else {
              freshEvent.Status = 'Approved';
            }
            freshEvent.ApprovedByAdminID = approverId;
            await freshEvent.save();
          }
          // mark request as completed only when not stakeholder-created
          const createdByStakeholder = !!request.MadeByStakeholderID;
          if (!createdByStakeholder) {
            request.Status = 'Completed';
            if (!request.CoordinatorFinalAction) {
              request.CoordinatorFinalAction = 'Approved';
              request.CoordinatorFinalActionDate = new Date();
            }
          }
          request.Admin_ID = approverId;
          await request.save();
        } catch (e) {
          // swallow approval errors to avoid blocking update
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
   * Admin accepts the request
   * @param {string} adminId 
   * @param {string} requestId 
   * @param {Object} adminAction 
   * @returns {Object} Result
   */
  async adminAcceptRequest(adminId, requestId, adminAction = {}) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      // Note: reschedule actions should be allowed even if the request has
      // already been processed/approved. Other admin actions (Accepted/Rejected)
      // should still only be allowed when the request is pending admin review.

      // Validate actor: try SystemAdmin first, then Coordinator (coordinators may act as admins)
      let actorRole = 'Admin';
      let actorRecord = await SystemAdmin.findOne({ Admin_ID: adminId });
      if (!actorRecord) {
        // Allow coordinators to perform admin actions in this system (they have admin-like privileges)
        const coordActor = await Coordinator.findOne({ Coordinator_ID: adminId });
        if (!coordActor) {
          throw new Error('Admin not found');
        }
        actorRole = 'Coordinator';
        actorRecord = coordActor;
      }

      const action = adminAction.action || 'Accepted'; // Accepted, Rejected, Rescheduled
      const note = adminAction.note || null;
      const rescheduledDate = adminAction.rescheduledDate || null;

      // Only block non-reschedule actions when the request is not pending admin review
      if (action !== 'Rescheduled' && request.Status !== 'Pending_Admin_Review') {
        throw new Error('Request is not pending admin review');
      }

      // Update request with admin/coordinator decision
      // Record the acting user in Admin_ID for audit (even if actor is a coordinator)
      request.Admin_ID = adminId;
      // For audit we still keep the original action in history, but when a
      // System Admin or Coordinator performs a reschedule we treat that as an
      // approved action in the request record (AdminAction='Accepted') because
      // their decisions are final and do not require additional approvals.
      request.AdminAction = action;
      if ((action === 'Rescheduled' || action === 'Accepted') && (actorRole === 'Admin' || actorRole === 'Coordinator')) {
        request.AdminAction = 'Accepted';
      }
      request.AdminNote = note;
      request.RescheduledDate = rescheduledDate;
      request.AdminActionDate = new Date();

      if (action === 'Rescheduled' && !rescheduledDate) {
        throw new Error('Rescheduled date is required when rescheduling');
      }

      // If rescheduling, ensure note is provided and rescheduled date is not in the past
      if (action === 'Rescheduled') {
        if (!note || (typeof note === 'string' && note.trim().length === 0)) {
          throw new Error('Admin Note is required when rescheduling');
        }

        // Validate rescheduledDate is a valid date and not before today (date-only comparison)
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

      // NOTE: coordinators are allowed to act like admins, but their action
      // should not auto-finalize the request. The stakeholder must still
      // confirm before the event is published. Do not set CoordinatorFinalAction
      // here — that field is reserved for explicit coordinator confirmations.

      await request.save();

      // Update event status
      const event = await Event.findOne({ Event_ID: request.Event_ID });
      if (event) {
        // Map admin action to an event status, but do NOT mark as 'Approved'
        // when an admin/coordinator accepts. Final approval (Approved) must
        // happen only after stakeholder confirmation.
        if (action === 'Rescheduled') {
          // Determine whether this request was created by a stakeholder.
          const createdByStakeholder = !!request.MadeByStakeholderID;

          // If an Admin or Coordinator performs the reschedule:
          // - If the request was created by a stakeholder, DO NOT auto-approve.
          //   Leave the request awaiting stakeholder confirmation and set event
          //   to 'Pending' so it's not published yet.
          // - If the request was NOT created by a stakeholder (i.e., created by
          //   admin/coordinator), auto-approve the event and complete the request.
          if (actorRole === 'Admin' || actorRole === 'Coordinator') {
            const createdByStakeholder = !!request.MadeByStakeholderID;
            if (createdByStakeholder) {
              // Admin rescheduled a stakeholder-owned request: require stakeholder confirmation
              event.Status = 'Pending';
            } else {
              // Admin/coordinator-owned request — auto-approve
              event.Status = 'Approved';
            }
          } else {
            // Non-admin actors (if allowed) keep previous rescheduled marker
            event.Status = 'Rescheduled';
          }
              // Apply the rescheduled date to the event's Start_Date while preserving the original time (if any).
              // Also update End_Date to the same new day preserving its original time portion so the
              // full event range moves together when rescheduling.
              if (rescheduledDate) {
                try {
                  const rs = new Date(rescheduledDate);
                  const currentStart = event.Start_Date ? new Date(event.Start_Date) : null;
                  if (currentStart) {
                    // Keep hours/minutes/seconds from currentStart, but set Y/M/D to rescheduled date
                    currentStart.setFullYear(rs.getFullYear(), rs.getMonth(), rs.getDate());
                    event.Start_Date = currentStart;
                  } else {
                    // No existing start time; set start to rescheduled date at midnight
                    event.Start_Date = new Date(rs);
                  }

                  // If End_Date exists, shift its Y/M/D to the rescheduled date preserving the time
                  if (event.End_Date) {
                    try {
                      const currentEnd = new Date(event.End_Date);
                      currentEnd.setFullYear(rs.getFullYear(), rs.getMonth(), rs.getDate());
                      event.End_Date = currentEnd;
                    } catch (e) {
                      // If End_Date parse fails, fallback to leaving it unchanged
                    }
                  }
                } catch (e) {
                  // If parsing fails, surface an error by throwing so caller knows
                  throw new Error('Invalid rescheduled date');
                }
              }
        } else if (action === 'Rejected') {
          event.Status = 'Rejected';
        } else if (action === 'Accepted') {
          // Admin accepted, awaiting stakeholder confirmation. Keep event
          // in Pending state to avoid publishing prematurely.
          event.Status = 'Pending';
  }
        event.ApprovedByAdminID = adminId;
        await event.save();

        // For admin/coordinator actions, treat their decision as final and
        // complete the request only when the request was NOT created by a stakeholder.
        if (actorRole === 'Admin' || actorRole === 'Coordinator') {
          try {
            const createdByStakeholder = !!request.MadeByStakeholderID;
            if (!createdByStakeholder) {
              // Mark request completed and set coordinator final action based on the admin action
              request.Status = 'Completed';
              if (!request.CoordinatorFinalAction) {
                if (action === 'Rejected') {
                  request.CoordinatorFinalAction = 'Rejected';
                } else {
                  // Accepted or Rescheduled -> treat as approved by coordinator for audit
                  request.CoordinatorFinalAction = 'Approved';
                }
                request.CoordinatorFinalActionDate = new Date();
              }
            } else {
              // Admin acted on a stakeholder-created request: do NOT finalize.
              // Leave AdminAction present (so stakeholder can respond) but keep
              // the request open for stakeholder confirmation.
            }
            await request.save();
          } catch (e) {
            // swallow to avoid blocking the main flow
          }
        } else {
          // Non-admin actors: just persist admin action without completing the request
          await request.save();
        }
      }

      // Create history entry
      const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: adminId });
      const adminName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
      
      await EventRequestHistory.createAdminActionHistory(
        requestId,
        request.Event_ID,
        adminId,
        adminName,
        action,
        note,
        rescheduledDate,
        event ? event.Start_Date : null
      );

        // Send notification to the appropriate recipient (stakeholder if request was created by stakeholder)
        try {
          const recipientId = request.MadeByStakeholderID ? request.MadeByStakeholderID : request.Coordinator_ID;
          const recipientType = request.MadeByStakeholderID ? 'Stakeholder' : 'Coordinator';
          await Notification.createAdminActionNotification(
            recipientId,
            requestId,
            request.Event_ID,
            action,
            note,
            rescheduledDate,
            recipientType
          );
        } catch (e) {
          // swallow notification errors
        }

      return {
        success: true,
        message: `Request ${action.toLowerCase()} successfully`,
        request: request
      };

    } catch (error) {
      throw new Error(`Failed to process admin action: ${error.message}`);
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
      if (event.Status !== 'Approved' && event.Status !== 'Completed') {
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

      // Verify coordinator owns this request
      if (request.Coordinator_ID !== coordinatorId) {
        throw new Error('Unauthorized: Coordinator does not own this request');
      }

      // Check if admin has already acted
      if (!request.AdminAction) {
        throw new Error('Admin has not yet acted on this request');
      }

      // Check if coordinator has already responded
      if (request.CoordinatorFinalAction) {
        throw new Error('Coordinator has already responded to this request');
      }

      // Validate action
      const validActions = ['Approved', 'Accepted', 'Rejected'];
      if (!validActions.includes(action)) {
        throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
      }

      // Update request
      request.CoordinatorFinalAction = action;
      request.CoordinatorFinalActionDate = new Date();
      await request.save();

      // Create history entry
      const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: coordinatorId });
      const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
      
      await EventRequestHistory.createCoordinatorActionHistory(
        requestId,
        request.Event_ID,
        coordinatorId,
        coordinatorName,
        action,
        request.Status
      );

      // Send notification to admin
      if (request.Admin_ID) {
        await Notification.createCoordinatorActionNotification(
          request.Admin_ID,
          requestId,
          request.Event_ID,
          action
        );
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

      // Verify stakeholder created the request (if MadeByStakeholderID exists)
      if (request.MadeByStakeholderID && request.MadeByStakeholderID !== stakeholderId) {
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
        event.Status = 'Approved';
        await event.save();
      }
      request.Status = 'Completed';

      await request.save();

      // Create history entry for stakeholder action if history helper exists
      const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: stakeholderId }).catch(() => null);
      const stakeholderName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
      try {
        if (typeof EventRequestHistory.createCoordinatorActionHistory === 'function') {
          await EventRequestHistory.createCoordinatorActionHistory(
            request.Request_ID,
            request.Event_ID,
            stakeholderId,
            stakeholderName,
            action,
            request.Status
          );
        }
      } catch (e) {
        // ignore history creation failures
      }

      // Send notification to the coordinator (recipient: Coordinator)
      try {
        const recipientId = request.MadeByStakeholderID ? request.MadeByStakeholderID : request.Coordinator_ID;
        const recipientType = request.MadeByStakeholderID ? 'Stakeholder' : 'Coordinator';
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
   * Cancel/Delete pending request
   * @param {string} requestId 
   * @param {string} coordinatorId 
   * @returns {Object} Result
   */
  async cancelEventRequest(requestId, coordinatorId) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Request not found');
      }

      // Only allow cancellation if pending
      if (request.Status !== 'Pending_Admin_Review') {
        throw new Error('Cannot cancel request. Request is no longer pending.');
      }

      // Verify coordinator owns this request
      if (request.Coordinator_ID !== coordinatorId) {
        throw new Error('Unauthorized: Coordinator does not own this request');
      }

      // Delete related data
      await Event.deleteOne({ Event_ID: request.Event_ID });
      await BloodDrive.deleteOne({ BloodDrive_ID: request.Event_ID });
      await Advocacy.deleteOne({ Advocacy_ID: request.Event_ID });
      await Training.deleteOne({ Training_ID: request.Event_ID });
      await EventRequestHistory.deleteMany({ Request_ID: requestId });
      await EventRequest.deleteOne({ Request_ID: requestId });

      return {
        success: true,
        message: 'Request cancelled successfully'
      };

    } catch (error) {
      throw new Error(`Failed to cancel request: ${error.message}`);
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
      // 1) EventRequest.Coordinator_ID === coordinatorId
      // 2) Event.MadeByCoordinatorID === coordinatorId (legacy where EventRequest.Coordinator_ID missing)
      // 3) Stakeholders who belong to this coordinator created requests (MadeByStakeholderID)

      const orClauses = [{ Coordinator_ID: coordinatorId }];

      // (2) Events created by the coordinator
      const eventIdsForCoordinator = await Event.find({ MadeByCoordinatorID: coordinatorId }).select('Event_ID');
      const eventIdList = Array.isArray(eventIdsForCoordinator) ? eventIdsForCoordinator.map(e => e.Event_ID) : [];
      if (eventIdList.length > 0) {
        orClauses.push({ Event_ID: { $in: eventIdList } });
      }

      // (3) Stakeholders that belong to this coordinator may have created requests
      // where MadeByStakeholderID is populated but Coordinator_ID is missing.
      const stakeholderDocs = await require('../../models/index').Stakeholder.find({ Coordinator_ID: coordinatorId }).select('Stakeholder_ID');
      const stakeholderIds = Array.isArray(stakeholderDocs) ? stakeholderDocs.map(s => s.Stakeholder_ID) : [];
      if (stakeholderIds.length > 0) {
        orClauses.push({ MadeByStakeholderID: { $in: stakeholderIds } });
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

      const requests = await EventRequest.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

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

      const query = { MadeByStakeholderID: stakeholderId };

      const requests = await EventRequest.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

      const total = await EventRequest.countDocuments(query);

      // Optionally enrich each request with event and coordinator staff
      const enriched = await Promise.all(requests.map(async (r) => {
        const event = await Event.findOne({ Event_ID: r.Event_ID });
        const coordinator = await Coordinator.findOne({ Coordinator_ID: r.Coordinator_ID });
        const staff = await require('../../models/index').BloodbankStaff.findOne({ ID: r.Coordinator_ID }).catch(() => null);
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
          ...r.toObject(),
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

      const query = { Status: 'Pending_Admin_Review' };

      if (filters.date_from || filters.date_to) {
        query.createdAt = {};
        if (filters.date_from) query.createdAt.$gte = new Date(filters.date_from);
        if (filters.date_to) query.createdAt.$lte = new Date(filters.date_to);
      }

      const requests = await EventRequest.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: 1 }); // Oldest first

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
        query.Coordinator_ID = filters.coordinator;
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

      const requests = await EventRequest.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

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
      const requests = await EventRequest.find({})
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

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
}

module.exports = new EventRequestService();

