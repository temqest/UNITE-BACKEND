/**
 * v2.0 Event Service
 * 
 * Converts approved requests to scheduled Events.
 * Permission-based, role-agnostic implementation.
 */

const { Event, BloodDrive, Training, Advocacy } = require('../../models/index');
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');
const notificationEngine = require('../utility_services/notificationEngine.service');

class V2EventService {
  /**
   * Generate unique Event_ID
   * @returns {string} Generated Event_ID
   */
  generateEventId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `EVENT_${timestamp}_${random}`;
  }

  /**
   * Create event from approved request
   * 
   * @param {Object} request - Request document (must be in 'approved' state)
   * @param {Object} actorSnapshot - Optional actor snapshot for notifications
   * @returns {Promise<Object>} Created event
   */
  async createEventFromRequest(request, actorSnapshot = null) {
    try {
      if (!request) {
        throw new Error('Request is required');
      }

      // Verify request is approved
      const currentState = request.status || request.Status;
      if (currentState !== REQUEST_STATES.APPROVED) {
        throw new Error(`Request must be in 'approved' state to create event. Current state: ${currentState}`);
      }

      // Generate Event_ID if not present
      const eventId = request.Event_ID || this.generateEventId();
      
      // Check if event already exists
      let event = await Event.findOne({ Event_ID: eventId });
      
      if (event) {
        console.log(`[V2_EVENT_SERVICE] Event ${eventId} already exists, updating...`);
        return await this.updateEventFromRequest(eventId, request, actorSnapshot);
      }

      // Get dates
      const eventDate = request.Date || request.Start_Date;
      const startDate = request.Start_Date || request.Date;
      let endDate = request.End_Date;
      
      // Default End_Date to 2 hours after Start_Date if missing
      if (!endDate && startDate) {
        const start = new Date(startDate);
        endDate = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        console.log(`[V2_EVENT_SERVICE] End_Date not provided, defaulting to 2 hours after Start_Date: ${endDate.toISOString()}`);
      }

      // Create new event
      event = new Event({
        Event_ID: eventId,
        Request_ID: request.Request_ID,
        Event_Title: request.Event_Title,
        Location: request.Location,
        Start_Date: startDate,
        End_Date: endDate,
        Email: request.Email,
        Phone_Number: request.Phone_Number,
        Event_Description: request.Event_Description,
        Category: request.Category,
        // Location references
        province: request.province,
        district: request.district,
        municipality: request.municipalityId,
        // Creator information
        made_by_id: request.requester?.userId?.toString() || 'system',
        made_by_role: this._mapRoleToEventEnum(request.requester?.roleSnapshot || 'stakeholder'),
        // Coordinator and stakeholder
        coordinator_id: request.reviewer?.userId?.toString() || 
                        request.requester?.userId?.toString() || 
                        'system',
        stakeholder_id: request.requester?.authoritySnapshot < 60 
          ? request.requester?.userId?.toString() 
          : null,
        // Status
        Status: 'Approved'
      });

      await event.save();

      // Update request with Event_ID
      if (!request.Event_ID) {
        request.Event_ID = eventId;
        request.eventId = event._id;
        await request.save();
      }

      // Create category record if category is specified
      if (event.Category) {
        try {
          await this._createCategoryRecord(event.Event_ID, event.Category, request);
        } catch (categoryError) {
          console.error(`[V2_EVENT_SERVICE] Error creating category record: ${categoryError.message}`);
          // Don't fail event creation if category creation fails
        }
      }

      // Send notification
      try {
        let notificationActor = actorSnapshot;
        if (!notificationActor && request.reviewer && request.reviewer.userId) {
          const { User } = require('../../models/index');
          const reviewer = await User.findById(request.reviewer.userId);
          if (reviewer) {
            notificationActor = {
              userId: reviewer._id,
              name: `${reviewer.firstName || ''} ${reviewer.lastName || ''}`.trim() || reviewer.email,
              roleSnapshot: reviewer.roles?.[0]?.roleCode || null,
              authoritySnapshot: reviewer.authority || 20
            };
          }
        }
        
        if (notificationActor) {
          await notificationEngine.notifyEventPublished(event, request, notificationActor);
        }
      } catch (notificationError) {
        console.error(`[V2_EVENT_SERVICE] Error sending notification: ${notificationError.message}`);
        // Don't fail event creation if notification fails
      }

      console.log(`[V2_EVENT_SERVICE] Event ${event.Event_ID} created from request ${request.Request_ID}`);
      return event;
    } catch (error) {
      console.error(`[V2_EVENT_SERVICE] Error creating event from request: ${error.message}`);
      throw new Error(`Failed to create event from request: ${error.message}`);
    }
  }

  /**
   * Update existing event from request
   * 
   * @param {string} eventId - Event_ID
   * @param {Object} request - Request document
   * @param {Object} actorSnapshot - Optional actor snapshot
   * @returns {Promise<Object>} Updated event
   */
  async updateEventFromRequest(eventId, request, actorSnapshot = null) {
    try {
      const event = await Event.findOne({ Event_ID: eventId });
      
      if (!event) {
        throw new Error(`Event ${eventId} not found`);
      }

      // Update event fields from request
      if (request.Event_Title) event.Event_Title = request.Event_Title;
      if (request.Location) event.Location = request.Location;
      if (request.Start_Date) event.Start_Date = request.Start_Date;
      if (request.End_Date) event.End_Date = request.End_Date;
      if (request.Email !== undefined) event.Email = request.Email;
      if (request.Phone_Number !== undefined) event.Phone_Number = request.Phone_Number;
      if (request.Event_Description !== undefined) event.Event_Description = request.Event_Description;
      if (request.Category) event.Category = request.Category;
      if (request.province) event.province = request.province;
      if (request.district) event.district = request.district;
      if (request.municipalityId) event.municipality = request.municipalityId;
      
      // Ensure End_Date is set
      if (!event.End_Date && event.Start_Date) {
        event.End_Date = new Date(new Date(event.Start_Date).getTime() + 2 * 60 * 60 * 1000);
      }

      event.Status = 'Approved';
      await event.save();

      console.log(`[V2_EVENT_SERVICE] Event ${eventId} updated from request ${request.Request_ID}`);
      return event;
    } catch (error) {
      console.error(`[V2_EVENT_SERVICE] Error updating event from request: ${error.message}`);
      throw new Error(`Failed to update event from request: ${error.message}`);
    }
  }

  /**
   * Check if event should be created (request is approved)
   * 
   * @param {string} requestStatus - Request status
   * @returns {boolean} True if event should be created
   */
  shouldPublishEvent(requestStatus) {
    return requestStatus === REQUEST_STATES.APPROVED;
  }

  /**
   * Map role code to Event model enum value
   * @private
   * @param {string} roleCode - Role code
   * @returns {string} Event model enum value
   */
  _mapRoleToEventEnum(roleCode) {
    if (!roleCode) return 'Stakeholder';
    
    const roleMap = {
      'system-admin': 'SystemAdmin',
      'coordinator': 'Coordinator',
      'stakeholder': 'Stakeholder',
      'admin': 'SystemAdmin',
      'operational-admin': 'SystemAdmin'
    };
    
    return roleMap[roleCode.toLowerCase()] || 'Stakeholder';
  }

  /**
   * Create category-specific record (BloodDrive, Training, Advocacy)
   * @private
   * @param {string} eventId - Event_ID
   * @param {string} category - Category type
   * @param {Object} requestData - Request document with category data
   * @returns {Promise<Object|null>} Created category record or null
   */
  async _createCategoryRecord(eventId, category, requestData) {
    if (!eventId || !category) {
      return null;
    }

    const categoryType = String(category).trim();
    
    try {
      // Check if category record already exists
      let existingRecord = null;
      if (categoryType === 'BloodDrive' || categoryType.toLowerCase().includes('blood')) {
        existingRecord = await BloodDrive.findOne({ BloodDrive_ID: eventId });
        if (existingRecord) return existingRecord;
      } else if (categoryType === 'Training' || categoryType.toLowerCase().includes('train')) {
        existingRecord = await Training.findOne({ Training_ID: eventId });
        if (existingRecord) return existingRecord;
      } else if (categoryType === 'Advocacy' || categoryType.toLowerCase().includes('advoc')) {
        existingRecord = await Advocacy.findOne({ Advocacy_ID: eventId });
        if (existingRecord) return existingRecord;
      }

      // Create new category record
      if (categoryType === 'BloodDrive' || categoryType.toLowerCase().includes('blood')) {
        const targetDonation = requestData.Target_Donation;
        if (targetDonation === undefined || targetDonation === null) {
          console.warn(`[V2_EVENT_SERVICE] Cannot create BloodDrive: Target_Donation is required`);
          return null;
        }

        const bloodDrive = new BloodDrive({
          BloodDrive_ID: eventId,
          Target_Donation: Number(targetDonation),
          VenueType: requestData.VenueType || undefined
        });

        await bloodDrive.save();
        return bloodDrive;

      } else if (categoryType === 'Training' || categoryType.toLowerCase().includes('train')) {
        const maxParticipants = requestData.MaxParticipants;
        if (maxParticipants === undefined || maxParticipants === null) {
          console.warn(`[V2_EVENT_SERVICE] Cannot create Training: MaxParticipants is required`);
          return null;
        }

        const training = new Training({
          Training_ID: eventId,
          TrainingType: requestData.TrainingType || undefined,
          MaxParticipants: Number(maxParticipants)
        });

        await training.save();
        return training;

      } else if (categoryType === 'Advocacy' || categoryType.toLowerCase().includes('advoc')) {
        const topic = requestData.Topic;
        const targetAudience = requestData.TargetAudience;
        
        if (!topic && !targetAudience) {
          console.warn(`[V2_EVENT_SERVICE] Cannot create Advocacy: Topic or TargetAudience is required`);
          return null;
        }

        const expectedSize = requestData.ExpectedAudienceSize !== undefined && 
                           requestData.ExpectedAudienceSize !== null && 
                           requestData.ExpectedAudienceSize !== ''
          ? Number(requestData.ExpectedAudienceSize) 
          : undefined;

        const advocacy = new Advocacy({
          Advocacy_ID: eventId,
          Topic: topic || undefined,
          TargetAudience: targetAudience || undefined,
          ExpectedAudienceSize: expectedSize,
          PartnerOrganization: requestData.PartnerOrganization || undefined
        });

        await advocacy.save();
        return advocacy;
      }

      return null;
    } catch (error) {
      console.error(`[V2_EVENT_SERVICE] Error creating category record: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new V2EventService();
