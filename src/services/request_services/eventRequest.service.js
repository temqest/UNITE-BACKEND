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
  async validateSchedulingRules(coordinatorId, eventData, excludeRequestId = null) {
    const validationResults = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
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
        if (endDate.getTime() < startDate.getTime()) {
          return { isValid: false, errors: ['End_Date must be on/after Start_Date'], warnings: [] };
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

      // 3. Check coordinator has pending request limit
      const pendingCount = await EventRequest.countDocuments({
        Coordinator_ID: coordinatorId,
        Status: 'Pending_Admin_Review'
      });
      const pendingCheck = systemSettings.validatePendingRequestsLimit(pendingCount);
      if (!pendingCheck.isValid) {
        validationResults.isValid = false;
        validationResults.errors.push(pendingCheck.message);
      }

      // 4. Check for overlapping requests (same coordinator, same date)
      if (systemSettings.getSetting('preventOverlappingRequests')) {
        const hasOverlap = await this.checkCoordinatorOverlappingRequests(
          coordinatorId,
          startDate,
          excludeRequestId
        );
        if (hasOverlap) {
          validationResults.isValid = false;
          validationResults.errors.push('You already have an event request for this date');
        }
      }

      // 5. Check double booking (same location, same date)
      if (systemSettings.getSetting('preventDoubleBooking')) {
        const isDoubleBooked = await this.checkDoubleBooking(
          startDate,
          eventData.Location,
          excludeRequestId ? await Event.findOne({ Request_ID: excludeRequestId }) : null
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

      // Validate all scheduling rules
      const validation = await this.validateSchedulingRules(coordinatorId, eventData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Generate IDs
      const eventId = this.generateEventID();
      const requestId = this.generateRequestID();

      // Create event category-specific data
      let categoryData = null;
      if (eventData.categoryType === 'BloodDrive') {
        categoryData = new BloodDrive({
          BloodDrive_ID: eventId,
          Target_Donation: eventData.Target_Donation,
          VenueType: eventData.VenueType
        });
        await categoryData.save();
      } else if (eventData.categoryType === 'Advocacy') {
        categoryData = new Advocacy({
          Advocacy_ID: eventId,
          Topic: eventData.Topic,
          TargetAudience: eventData.TargetAudience,
          ExpectedAudienceSize: eventData.ExpectedAudienceSize,
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

      // Create main event
      const event = new Event({
        Event_ID: eventId,
        Event_Title: eventData.Event_Title,
        Location: eventData.Location,
        Start_Date: new Date(eventData.Start_Date),
        End_Date: eventData.End_Date ? new Date(eventData.End_Date) : undefined,
        MadeByCoordinatorID: coordinatorId,
        // If this request was created by a stakeholder, persist that too
        MadeByStakeholderID: eventData.MadeByStakeholderID || undefined,
        Email: eventData.Email,
        Phone_Number: eventData.Phone_Number,
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
        Status: 'Pending_Admin_Review'
      });
      await request.save();

      // Create history entry
      const bloodbankStaff = await require('../../models/index').BloodbankStaff.findOne({ ID: coordinatorId });
      const coordinatorName = bloodbankStaff ? `${bloodbankStaff.First_Name} ${bloodbankStaff.Last_Name}` : null;
      
      await EventRequestHistory.createRequestHistory(
        requestId,
        eventId,
        coordinatorId,
        coordinatorName
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

      return {
        success: true,
        message: 'Event request submitted successfully',
        request: {
          Request_ID: request.Request_ID,
          Event_ID: event.Event_ID,
          Status: request.Status,
          created_at: request.createdAt
        },
        event: event,
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

      // Validate scheduling rules (use coordinatorId when present, otherwise bypass overlap checks)
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
        categoryData = new Advocacy({
          Advocacy_ID: eventId,
          Topic: eventData.Topic,
          TargetAudience: eventData.TargetAudience,
          ExpectedAudienceSize: eventData.ExpectedAudienceSize,
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
        Start_Date: new Date(eventData.Start_Date),
        End_Date: eventData.End_Date ? new Date(eventData.End_Date) : undefined,
        MadeByCoordinatorID: coordinatorId || undefined,
        Email: eventData.Email,
        Phone_Number: eventData.Phone_Number,
        ApprovedByAdminID: creatorRole === 'Admin' ? creatorId : undefined,
        Status: 'Approved'
      });
      await event.save();

      return {
        success: true,
        message: 'Event created and published successfully',
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
          }
        }
      };

    } catch (error) {
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
  async updateEventRequest(requestId, coordinatorId, updateData) {
    try {
      const request = await this._findRequest(requestId);
      if (!request) {
        throw new Error('Event request not found');
      }

      // Only allow updates if request is pending
      if (request.Status !== 'Pending_Admin_Review') {
        throw new Error('Cannot update request. Request is no longer pending.');
      }

      // Verify coordinator owns this request
      if (request.Coordinator_ID !== coordinatorId) {
        throw new Error('Unauthorized: Coordinator does not own this request');
      }

      const event = await Event.findOne({ Event_ID: request.Event_ID });
      if (!event) {
        throw new Error('Event not found');
      }

      // If date is being updated, revalidate
      if (updateData.Start_Date) {
        const validation = await this.validateSchedulingRules(coordinatorId, updateData, requestId);
        if (!validation.isValid) {
          throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
        }
        event.Start_Date = updateData.Start_Date;
      }

      // Update event fields
      if (updateData.Event_Title) event.Event_Title = updateData.Event_Title;
      if (updateData.Location) event.Location = updateData.Location;
      if (updateData.Email) event.Email = updateData.Email;
      if (updateData.Phone_Number) event.Phone_Number = updateData.Phone_Number;
      
      await event.save();

      // Update category-specific data if provided
      if (updateData.categoryType === 'BloodDrive' && updateData.Target_Donation) {
        await BloodDrive.updateOne(
          { BloodDrive_ID: event.Event_ID },
          { Target_Donation: updateData.Target_Donation, VenueType: updateData.VenueType }
        );
      } else if (updateData.categoryType === 'Advocacy') {
        const advocacyData = {};
        if (updateData.Topic) advocacyData.Topic = updateData.Topic;
        if (updateData.TargetAudience) advocacyData.TargetAudience = updateData.TargetAudience;
        if (updateData.ExpectedAudienceSize) advocacyData.ExpectedAudienceSize = updateData.ExpectedAudienceSize;
        if (updateData.PartnerOrganization) advocacyData.PartnerOrganization = updateData.PartnerOrganization;
        
        await Advocacy.updateOne({ Advocacy_ID: event.Event_ID }, advocacyData);
      } else if (updateData.categoryType === 'Training') {
        const trainingData = {};
        if (updateData.TrainingType) trainingData.TrainingType = updateData.TrainingType;
        if (updateData.MaxParticipants) trainingData.MaxParticipants = updateData.MaxParticipants;
        
        await Training.updateOne({ Training_ID: event.Event_ID }, trainingData);
      }

      return {
        success: true,
        message: 'Event request updated successfully',
        request: request,
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

      if (request.Status !== 'Pending_Admin_Review') {
        throw new Error('Request is not pending admin review');
      }

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

      // Update request with admin/coordinator decision
      // Record the acting user in Admin_ID for audit (even if actor is a coordinator)
      request.Admin_ID = adminId;
      request.AdminAction = action;
      request.AdminNote = note;
      request.RescheduledDate = rescheduledDate;
      request.AdminActionDate = new Date();

      if (action === 'Rescheduled' && !rescheduledDate) {
        throw new Error('Rescheduled date is required when rescheduling');
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
          event.Status = 'Rescheduled';
        } else if (action === 'Rejected') {
          event.Status = 'Rejected';
        } else if (action === 'Accepted') {
          // Admin accepted, awaiting stakeholder confirmation. Keep event
          // in Pending state to avoid publishing prematurely.
          event.Status = 'Pending';
        }
        event.ApprovedByAdminID = adminId;
        await event.save();
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

      // Send notification to coordinator
      await Notification.createAdminActionNotification(
        request.Coordinator_ID,
        requestId,
        request.Event_ID,
        action,
        note,
        rescheduledDate
      );

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
        await Notification.createAdminActionNotification(
          request.Coordinator_ID,
          request.Request_ID,
          request.Event_ID,
          action,
          null,
          null
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
        return {
          ...r.toObject(),
          event: event ? event.toObject() : null,
          coordinator: coordinator ? {
            ...coordinator.toObject(),
            staff: staff ? { First_Name: staff.First_Name, Last_Name: staff.Last_Name, Email: staff.Email } : null
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

