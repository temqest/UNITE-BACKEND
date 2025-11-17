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
            Status: 'Pending_Admin_Review'
          });
        } else {
          // Default: count pending for the coordinator
          pendingCount = await EventRequest.countDocuments({
            coordinator_id: coordinatorId,
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

      // Handle different pending statuses based on workflow
      const status = String(req.Status || '').toLowerCase();

      if (status === 'pending_stakeholder_review') {
        // Only stakeholders can act on stakeholder review requests
        if (role === 'stakeholder' && req.stakeholder_id === actorId) {
          return ['view', 'accept', 'reject'];
        }
        return ['view']; // Others can only view
      }

      if (status === 'pending_coordinator_review') {
        // Only coordinators can act on coordinator review requests
        if (role === 'coordinator' && req.coordinator_id === actorId) {
          return ['view', 'accept', 'reject'];
        }
        return ['view']; // Others can only view
      }

      if (status === 'pending_admin_review') {
        // Admins and coordinators can act on admin review requests
        if (role === 'admin' || role === 'systemadmin' || role === 'coordinator') {
          return ['view', 'resched', 'accept', 'reject'];
        }
        return ['view']; // Others can only view
      }

      // Check for cancelled status
      if (status.includes('cancel')) {
        return ['view', 'delete'];
      }

      // Check for rejected status
      if (status.includes('reject')) {
        return ['view', 'delete'];
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
        canReject: has('reject') || has('reject') === true,
        // convenience: any admin-like controls
        canAdminAction: has('accept') || has('reject') || has('resched') || has('cancel')
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

      // Determine creator information from eventData._actorRole and _actorId
      const creatorRole = eventData._actorRole || 'Coordinator'; // Default to Coordinator if not specified
      const creatorId = eventData._actorId || coordinatorId; // Default to coordinatorId if not specified

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

      // Create main event with new simplified structure
      const event = new Event({
        Event_ID: eventId,
        Event_Title: eventData.Event_Title,
        Location: eventData.Location,
        // Persist description when provided (accept multiple possible input names)
        Event_Description: eventData.Event_Description || eventData.eventDescription || eventData.Description || undefined,
        Start_Date: new Date(eventData.Start_Date),
        End_Date: eventData.End_Date ? new Date(eventData.End_Date) : undefined,
        // Required fields for Event model
        Email: eventData.Email,
        Phone_Number: eventData.Phone_Number,
        // New simplified structure
        coordinator_id: coordinatorId,
        stakeholder_id: eventData.stakeholder_id || eventData.Stakeholder_ID || undefined,
        made_by_id: creatorId,
        made_by_role: creatorRole,
        // Persist category type so frontend can display the event type
        Category: categoryType || eventData.categoryType || eventData.Category || undefined,
        Status: 'Pending'
      });
      await event.save();

      // Create event request with new simplified structure
      const request = new EventRequest({
        Request_ID: requestId,
        Event_ID: eventId,
        // New simplified structure
        coordinator_id: coordinatorId,
        stakeholder_id: eventData.stakeholder_id || eventData.Stakeholder_ID || undefined,
        made_by_id: creatorId,
        made_by_role: creatorRole,
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
      if (eventData.stakeholder_id) {
        try {
          const stakeholder = await models.Stakeholder.findOne({ Stakeholder_ID: eventData.stakeholder_id ? eventData.stakeholder_id.toString().trim() : eventData.stakeholder_id }).catch(() => null);
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
        stakeholder_id: request.stakeholder_id || null
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
   * Create an event through the approval workflow (no auto-publishing)
   * All events now go through approval process regardless of creator role
   */
  async createImmediateEvent(creatorId, creatorRole, eventData) {
    try {
      // Validate creator (admin or coordinator)
      if (creatorRole !== 'SystemAdmin' && creatorRole !== 'Coordinator') {
        throw new Error('Unauthorized: Only Admin or Coordinator can create events');
      }

      const coordinatorId = creatorRole === 'Coordinator' ? creatorId : (eventData.coordinator_id || eventData.MadeByCoordinatorID || null);
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

      // Determine initial status based on the new approval workflow
      const stakeholderId = eventData.stakeholder_id || eventData.Stakeholder_ID || null;
      let requestInitialStatus = 'Pending_Admin_Review';

      // Apply the new approval workflow logic:
      // 1. If stakeholder creates event: needs admin review first
      // 2. If sys admin creates event with stakeholder: needs stakeholder acceptance first
      // 3. If sys admin creates event without stakeholder: needs coordinator approval
      // 4. If coordinator creates event with stakeholder: needs stakeholder acceptance first
      // 5. If coordinator creates event without stakeholder: needs admin approval

      if (stakeholderId) {
        // Events with stakeholders: stakeholder review first (unless created by stakeholder)
        if (creatorRole === 'Stakeholder') {
          requestInitialStatus = 'Pending_Admin_Review'; // Stakeholder created: admin review first
        } else {
          requestInitialStatus = 'Pending_Stakeholder_Review'; // Admin/Coordinator created with stakeholder: stakeholder review first
        }
      } else {
        // Events without stakeholders: depends on creator role
        if (creatorRole === 'SystemAdmin') {
          requestInitialStatus = 'Pending_Coordinator_Review'; // Admin created without stakeholder: coordinator review
        } else if (creatorRole === 'Coordinator') {
          requestInitialStatus = 'Pending_Admin_Review'; // Coordinator created without stakeholder: admin review
        }
      }

      // Create main event with Approved/Completed status (auto-publish) based on workflow
      const event = new Event({
        Event_ID: eventId,
        Event_Title: eventData.Event_Title,
        Location: eventData.Location,
        // Persist description when provided (accept multiple possible input names)
        Event_Description: eventData.Event_Description || eventData.eventDescription || eventData.Description || undefined,
        Start_Date: new Date(eventData.Start_Date),
        End_Date: eventData.End_Date ? new Date(eventData.End_Date) : undefined,
        // Required fields for Event model
        Email: eventData.Email,
        Phone_Number: eventData.Phone_Number,
        // New simplified structure
        coordinator_id: coordinatorId,
        stakeholder_id: stakeholderId,
        made_by_id: creatorId,
        made_by_role: creatorRole,
        // Persist category so frontend can read the event type
        Category: eventData.categoryType || eventData.Category || undefined,
        Status: 'Pending' // Event status is always 'Pending' initially - approval happens at request level
      });
      await event.save();

      // Create an EventRequest record for audit/history and notifications
      // Even though the event may be auto-published, keep a request trail
      const requestId = this.generateRequestID();

      const request = new EventRequest({
        Request_ID: requestId,
        Event_ID: eventId,
        // New simplified structure
        coordinator_id: coordinatorId,
        stakeholder_id: stakeholderId,
        made_by_id: creatorId,
        made_by_role: creatorRole,
        // Persist category on auto-approved requests as well
        Category: eventData.categoryType || eventData.Category || undefined,
        Status: requestInitialStatus
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
        const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: coordinatorId }).catch(() => null);
        const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
        await EventRequestHistory.createCoordinatorActionHistory(
          requestId,
          eventId,
          coordinatorId,
          coordinatorName,
          'Completed',
          'Accepted_By_Admin'
        );
      } catch (e) {
        // Swallow history creation failures to avoid blocking event creation
      }

      // Notify the appropriate recipient based on the workflow
      try {
        let recipientId = null;
        let recipientType = null;

        if (requestInitialStatus === 'Pending_Stakeholder_Review') {
          // Notify stakeholder
          recipientId = stakeholderId;
          recipientType = 'Stakeholder';
        } else if (requestInitialStatus === 'Pending_Coordinator_Review') {
          // Notify coordinator
          recipientId = coordinatorId;
          recipientType = 'Coordinator';
        } else if (requestInitialStatus === 'Pending_Admin_Review') {
          // Notify all admins
          const admins = await SystemAdmin.find();
          for (const admin of admins) {
            await Notification.createNewRequestNotification(
              admin.Admin_ID,
              requestId,
              eventId,
              coordinatorId
            );
          }
          // Skip the general notification below since we handled admins specifically
          recipientId = null;
        }

        // Send notification for stakeholder/coordinator review
        if (recipientId && recipientType) {
          await Notification.createAdminActionNotification(
            recipientId,
            requestId,
            eventId,
            'Submitted', // Action type for new requests
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
        message: 'Event request submitted successfully and awaits approval',
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

      return {
        success: true,
        request: {
          ...request.toObject(),
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
          const pendingStatuses = ['Pending_Admin_Review', 'Pending_Coordinator_Review', 'Pending_Stakeholder_Review'];
          if (!pendingStatuses.includes(request.Status)) {
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
            if (stakeholderId && madeByRole !== 'Stakeholder') {
              request.Status = 'Pending_Stakeholder_Review';
            } else if (!stakeholderId && madeByRole === 'SystemAdmin') {
              request.Status = 'Pending_Coordinator_Review';
            } else {
              request.Status = 'Pending_Admin_Review';
            }
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

      

      // If the actor is admin or coordinator, auto-approve the updated request/event
      // but only when the request was NOT created by a stakeholder. If the
      // request was created by a stakeholder, admins/coordinators must not
      // finalize it — the stakeholder must confirm any reschedule/changes.
      if (actorIsAdmin || actorIsCoordinator) {
        try {
          const approverId = actorId;
          if (freshEvent) {
            // If stakeholder created the request, do not auto-publish the event
            const createdByStakeholder = !!request.stakeholder_id;
            if (createdByStakeholder) {
              freshEvent.Status = 'Pending';
            } else {
              freshEvent.Status = 'Completed';
            }
            freshEvent.ApprovedByAdminID = approverId;
            await freshEvent.save();
          }
          // mark request as completed only when not stakeholder-created
          const createdByStakeholder = !!request.stakeholder_id;
          if (!createdByStakeholder) {
            request.Status = 'Completed';
            if (!request.CoordinatorFinalAction) {
              request.CoordinatorFinalAction = 'Completed';
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
      const note = actionData.note || null;
      const rescheduledDate = actionData.rescheduledDate || null;

      // Validate actor permissions based on request status
      const status = request.Status;
      console.log('processRequestAction: actorRole=', actorRole, 'status=', status);
      let isAuthorized = false;

    if (actorRole === 'SystemAdmin' || actorRole === 'Admin') {
      // Admins can act on admin review requests, stakeholder reschedules, and cancel any event
      isAuthorized = status === 'Pending_Admin_Review' || status === 'Rescheduled_By_Stakeholder' || action === 'Cancelled';
    } else if (actorRole === 'Coordinator') {
      // Coordinators can act on coordinator review requests, admin review requests, stakeholder reschedules, and cancel any event
      isAuthorized = status === 'Pending_Coordinator_Review' || status === 'Pending_Admin_Review' || status === 'Rescheduled_By_Stakeholder' || action === 'Cancelled';
      // For coordinator review, verify ownership
      if (status === 'Pending_Coordinator_Review' && request.coordinator_id !== actorId) {
        throw new Error('Unauthorized: Coordinator does not own this request');
      }
    } else if (actorRole === 'Stakeholder') {
      // Stakeholders can act on stakeholder review requests, accepted admin actions, reschedule or cancel their own completed events
      isAuthorized = status === 'Pending_Stakeholder_Review' || status === 'Accepted_By_Admin' || (action === 'Rescheduled' && request.stakeholder_id === actorId) || (action === 'Cancelled' && request.stakeholder_id === actorId);
      // Also allow reschedule on completed/approved requests if they own the request
      if (action === 'Rescheduled' && request.stakeholder_id === actorId) {
        isAuthorized = true;
      }
      // Verify ownership
      console.log('Stakeholder check: request.stakeholder_id=', request.stakeholder_id, 'actorId=', actorId);
      if (request.stakeholder_id !== actorId) {
        throw new Error('Unauthorized: Stakeholder does not own this request');
      }
    }      if (!isAuthorized) {
        throw new Error(`Unauthorized: ${actorRole} cannot act on requests with status ${status}`);
      }

      // Only block non-reschedule and non-cancel actions when the request is not in a pending state or rescheduled by stakeholder
      const pendingStatuses = ['Pending_Admin_Review', 'Pending_Coordinator_Review', 'Pending_Stakeholder_Review'];
      const allowedStatusesForActions = [...pendingStatuses, 'Rescheduled_By_Stakeholder'];
      if (action !== 'Rescheduled' && action !== 'Cancelled' && !allowedStatusesForActions.includes(request.Status)) {
        throw new Error('Request is not pending review');
      }

      // Update request based on actor type
      if (actorRole === 'SystemAdmin' || actorRole === 'Admin') {
        // Admin action
        request.Admin_ID = actorId;
        request.AdminAction = action;
        request.AdminNote = note;
        request.RescheduledDate = rescheduledDate;
        request.AdminActionDate = new Date();
      } else if (actorRole === 'Coordinator') {
        // Coordinator action
        if (status === 'Pending_Coordinator_Review') {
          request.CoordinatorFinalAction = action;
          request.CoordinatorFinalActionDate = new Date();
        } else {
          // Acting as admin
          request.Admin_ID = actorId;
          request.AdminAction = action;
          request.AdminNote = note;
          request.RescheduledDate = rescheduledDate;
          request.AdminActionDate = new Date();
        }
      } else if (actorRole === 'Stakeholder') {
        // Stakeholder action - they can accept, reschedule, or cancel approved events
        if (action !== 'Accepted' && action !== 'Rescheduled' && action !== 'Cancelled') {
          throw new Error('Stakeholders can only accept, reschedule, or cancel requests');
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
      if (event) {
        if (action === 'Rescheduled') {
          // Handle rescheduling logic
          const createdByStakeholder = !!request.stakeholder_id;
          if (actorRole === 'SystemAdmin' || actorRole === 'Admin' || actorRole === 'Coordinator') {
            if (createdByStakeholder) {
              event.Status = 'Pending';
            } else {
              event.Status = 'Completed';
            }
          } else {
            event.Status = 'Rescheduled';
          }

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
        } else if (action === 'Rejected') {
          event.Status = 'Rejected';
        } else if (action === 'Cancelled') {
          event.Status = 'Rejected';
        } else if (action === 'Accepted') {
          // Different logic based on actor and workflow
          if (actorRole === 'Stakeholder') {
            // Stakeholder accepted: event is approved
            event.Status = 'Completed';
            request.Status = 'Completed';
          } else if (status === 'Rescheduled_By_Stakeholder') {
            // Admin/Coordinator accepted stakeholder reschedule: event is approved
            event.Status = 'Completed';
            request.Status = 'Completed';
          } else {
            // Admin/Coordinator accepted regular request: keep pending for next step
            event.Status = 'Pending';
          }
        }

        event.ApprovedByAdminID = actorId;
        await event.save();

        // Handle request completion for admin/coordinator actions
        if (actorRole === 'SystemAdmin' || actorRole === 'Admin' || actorRole === 'Coordinator') {
          const createdByStakeholder = !!request.stakeholder_id;
          if (status === 'Rescheduled_By_Stakeholder' && action === 'Accepted') {
            // Accepting stakeholder reschedule: complete the request
            request.Status = 'Completed';
            if (!request.CoordinatorFinalAction) {
              request.CoordinatorFinalAction = 'Completed';
              request.CoordinatorFinalActionDate = new Date();
            }
          } else if (action === 'Rejected') {
            // Admin/coordinator rejected: request is rejected regardless of creator
            request.Status = 'Rejected';
            if (!request.CoordinatorFinalAction) {
              request.CoordinatorFinalAction = 'Rejected';
              request.CoordinatorFinalActionDate = new Date();
            }
          } else if (action === 'Cancelled') {
            // Admin/coordinator cancelled: request is cancelled
            console.log('=== PROCESS REQUEST ACTION DEBUG: Setting status to Cancelled ===');
            console.log('Request ID:', requestId);
            console.log('Actor Role:', actorRole);
            console.log('Action:', action);
            console.log('Previous Status:', request.Status);
            request.Status = 'Cancelled';
            console.log('New Status:', request.Status);
          } else if (!createdByStakeholder && action !== 'Rescheduled') {
            request.Status = 'Completed';
            if (!request.CoordinatorFinalAction) {
              if (action === 'Rejected') {
                request.CoordinatorFinalAction = 'Rejected';
              } else {
                request.CoordinatorFinalAction = 'Completed';
              }
              request.CoordinatorFinalActionDate = new Date();
            }
          } else if (createdByStakeholder && action !== 'Rescheduled' && action !== 'Rejected') {
            // Admin acted on stakeholder-created request: set to pending stakeholder review (only for acceptance)
            request.Status = 'Pending_Stakeholder_Review';
          }
          await request.save();
        }
      }

      // Create history entry
      if (actorRole === 'SystemAdmin' || actorRole === 'Admin' || actorRole === 'Coordinator') {
        const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
        const actorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
        
        await EventRequestHistory.createAdminActionHistory(
          requestId,
          request.Event_ID,
          actorId,
          actorName,
          action,
          note,
          rescheduledDate,
          event ? event.Start_Date : null
        );
      } else if (actorRole === 'Stakeholder') {
        const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
        const stakeholderName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
        try {
          if (typeof EventRequestHistory.createCoordinatorActionHistory === 'function') {
            await EventRequestHistory.createCoordinatorActionHistory(
              requestId,
              request.Event_ID,
              actorId,
              stakeholderName,
              action,
              request.Status
            );
          }
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
            // Coordinator accepted: no further notification needed (final approval)
          } else if (status === 'Pending_Admin_Review' && (actorRole === 'SystemAdmin' || actorRole === 'Admin' || actorRole === 'Coordinator')) {
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
            // For admin rejections, we might need to notify all admins or handle differently
            // For now, skip notification
          }
        }

        if (recipientId && recipientType) {
          await Notification.createAdminActionNotification(
            recipientId,
            requestId,
            request.Event_ID,
            action,
            note,
            rescheduledDate,
            recipientType
          );
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

      // Verify coordinator owns this request
      if (request.coordinator_id !== coordinatorId) {
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
      const validActions = ['Completed', 'Accepted', 'Rejected'];
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

      const query = { stakeholder_id: stakeholderId };

      const requests = await EventRequest.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });

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

      const query = { Status: { $in: ['Pending_Admin_Review', 'Pending_Coordinator_Review', 'Pending_Stakeholder_Review'] } };

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

      // Allow cancellation of pending requests or approved events
      const allowedStatuses = ['Pending_Admin_Review', 'Pending_Coordinator_Review', 'Pending_Stakeholder_Review', 'Completed'];
      if (!allowedStatuses.includes(request.Status)) {
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
          
          await EventRequestHistory.createAdminActionHistory(
            requestId,
            request.Event_ID,
            actorId,
            actorName,
            'Cancelled',
            note || 'Event cancelled by admin',
            null,
            event ? event.Start_Date : null
          );
        } else if (actorRole === 'Coordinator') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.createCoordinatorActionHistory(
            requestId,
            request.Event_ID,
            actorId,
            coordinatorName,
            'Cancelled',
            request.Status
          );
        } else if (actorRole === 'Stakeholder') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const stakeholderName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.createCoordinatorActionHistory(
            requestId,
            request.Event_ID,
            actorId,
            stakeholderName,
            'Cancelled',
            request.Status
          );
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
          
          await EventRequestHistory.createAdminActionHistory(
            requestId,
            request.Event_ID,
            actorId,
            actorName,
            'Cancelled',
            note || 'Request cancelled by admin',
            null,
            event ? event.Start_Date : null
          );
        } else if (actorRole === 'Coordinator') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.createCoordinatorActionHistory(
            requestId,
            request.Event_ID,
            actorId,
            coordinatorName,
            'Cancelled',
            request.Status
          );
        } else if (actorRole === 'Stakeholder') {
          const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: actorId });
          const stakeholderName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
          
          await EventRequestHistory.createCoordinatorActionHistory(
            requestId,
            request.Event_ID,
            actorId,
            stakeholderName,
            'Cancelled',
            request.Status
          );
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

      // Authorization checks based on actor role and request status
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
        throw new Error('Unauthorized: Only sys admins, coordinators (who own the request or handle the stakeholder), or the stakeholder who created this request can delete cancelled or rejected requests');
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
