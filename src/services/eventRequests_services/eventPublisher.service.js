/**
 * Event Publisher Service
 * 
 * Handles automatic event publishing when request is approved
 */

const { Event, BloodDrive, Training, Advocacy } = require('../../models/index');
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');

class EventPublisherService {
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
   * Publish event when request is approved
   * @param {Object} request - Request document
   * @returns {Promise<Object>} Published event
   */
  async publishEvent(request) {
    try {
      // Generate Event_ID if not present in request
      const eventId = request.Event_ID || this.generateEventId();
      
      // Update request with Event_ID if it was generated
      if (!request.Event_ID) {
        request.Event_ID = eventId;
        await request.save();
      }
      
      // Find or create event
      let event = await Event.findOne({ Event_ID: eventId });
      
      if (!event) {
        // Create new event from request data
        event = new Event({
          Event_ID: eventId,
          Event_Title: request.Event_Title,
          Location: request.Location,
          Start_Date: request.Date || request.Start_Date, // Map Date to Start_Date for Event model
          End_Date: request.End_Date || null, // Use End_Date from request if available
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
          // Coordinator and stakeholder (if available)
          // Note: Event model requires coordinator_id, so use reviewer or requester if reviewer not available
          coordinator_id: request.reviewer?.userId?.toString() || 
                          request.requester?.userId?.toString() || 
                          'system',
          stakeholder_id: request.requester?.authoritySnapshot < 60 ? request.requester?.userId?.toString() : null,
          // Status
          Status: 'Approved'
        });
      } else {
        // Update existing event with request data
        event.Event_Title = request.Event_Title || event.Event_Title;
        event.Location = request.Location || event.Location;
        event.Start_Date = request.Date || request.Start_Date || event.Start_Date;
        event.End_Date = request.End_Date || event.End_Date || null;
        event.Email = request.Email || event.Email;
        event.Phone_Number = request.Phone_Number || event.Phone_Number;
        event.Event_Description = request.Event_Description || event.Event_Description;
        event.Category = request.Category || event.Category;
        event.Status = 'Approved';
      }

      // Save event
      await event.save();

      // Create category record if category is specified
      let categoryRecord = null;
      let categoryWarning = null;
      
      if (event.Category) {
        try {
          categoryRecord = await this._createCategoryRecord(event.Event_ID, event.Category, request);
          if (categoryRecord) {
            console.log(`[EVENT PUBLISHER] Category record created for Event ${event.Event_ID}, Category: ${event.Category}`);
          } else {
            categoryWarning = `Category record creation skipped for Event ${event.Event_ID} (Category: ${event.Category}) - missing required fields`;
            console.warn(`[EVENT PUBLISHER] ${categoryWarning}`);
          }
        } catch (categoryError) {
          categoryWarning = `Category record creation failed for Event ${event.Event_ID} (Category: ${event.Category}): ${categoryError.message}`;
          console.error(`[EVENT PUBLISHER] ${categoryWarning}`);
          // Don't fail event creation if category creation fails - log warning instead
        }
      }

      // Update request with event reference
      request.eventId = event._id;
      await request.save();

      console.log(`[EVENT PUBLISHER] Event ${event.Event_ID} published for request ${request.Request_ID}`);
      if (categoryWarning) {
        console.warn(`[EVENT PUBLISHER] Warning: ${categoryWarning}`);
      }

      return event;
    } catch (error) {
      console.error(`[EVENT PUBLISHER] Error publishing event: ${error.message}`);
      throw new Error(`Failed to publish event: ${error.message}`);
    }
  }

  /**
   * Map role code to Event model enum value
   * @param {string} roleCode - Role code (lowercase)
   * @returns {string} Event model enum value (capitalized)
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
   * Create category record for event
   * @private
   * @param {string} eventId - Event_ID
   * @param {string} category - Category type (BloodDrive, Training, Advocacy)
   * @param {Object} requestData - Request document with category data
   * @returns {Promise<Object|null>} Created category record or null if validation fails
   */
  async _createCategoryRecord(eventId, category, requestData) {
    if (!eventId || !category) {
      console.warn(`[EVENT PUBLISHER] Cannot create category record: missing eventId or category`);
      return null;
    }

    const categoryType = String(category).trim();
    
    try {
      // Check if category record already exists
      let existingRecord = null;
      if (categoryType === 'BloodDrive' || categoryType.toLowerCase().includes('blood')) {
        existingRecord = await BloodDrive.findOne({ BloodDrive_ID: eventId });
        if (existingRecord) {
          console.log(`[EVENT PUBLISHER] BloodDrive record already exists for Event ${eventId}`);
          return existingRecord;
        }
      } else if (categoryType === 'Training' || categoryType.toLowerCase().includes('train')) {
        existingRecord = await Training.findOne({ Training_ID: eventId });
        if (existingRecord) {
          console.log(`[EVENT PUBLISHER] Training record already exists for Event ${eventId}`);
          return existingRecord;
        }
      } else if (categoryType === 'Advocacy' || categoryType.toLowerCase().includes('advoc')) {
        existingRecord = await Advocacy.findOne({ Advocacy_ID: eventId });
        if (existingRecord) {
          console.log(`[EVENT PUBLISHER] Advocacy record already exists for Event ${eventId}`);
          return existingRecord;
        }
      }

      // Create new category record based on type
      if (categoryType === 'BloodDrive' || categoryType.toLowerCase().includes('blood')) {
        // BloodDrive requires Target_Donation
        const targetDonation = requestData.Target_Donation;
        if (targetDonation === undefined || targetDonation === null) {
          console.warn(`[EVENT PUBLISHER] Cannot create BloodDrive record: Target_Donation is required but missing`);
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
        // Training requires MaxParticipants
        const maxParticipants = requestData.MaxParticipants;
        if (maxParticipants === undefined || maxParticipants === null) {
          console.warn(`[EVENT PUBLISHER] Cannot create Training record: MaxParticipants is required but missing`);
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
        // Advocacy fields are all optional, but we should have at least Topic or TargetAudience
        const topic = requestData.Topic;
        const targetAudience = requestData.TargetAudience;
        
        if (!topic && !targetAudience) {
          console.warn(`[EVENT PUBLISHER] Cannot create Advocacy record: Topic or TargetAudience is required but both are missing`);
          return null;
        }

        const expectedSizeRaw = requestData.ExpectedAudienceSize;
        const expectedSize = expectedSizeRaw !== undefined && expectedSizeRaw !== null && expectedSizeRaw !== '' 
          ? Number(expectedSizeRaw) 
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

      } else {
        console.warn(`[EVENT PUBLISHER] Unknown category type: ${categoryType}`);
        return null;
      }
    } catch (error) {
      console.error(`[EVENT PUBLISHER] Error creating category record for Event ${eventId}, Category ${categoryType}:`, error);
      throw error;
    }
  }

  /**
   * Check if event should be published (request is approved)
   * @param {string} requestStatus - Request status
   * @returns {boolean} True if event should be published
   */
  shouldPublishEvent(requestStatus) {
    return requestStatus === REQUEST_STATES.APPROVED;
  }
}

module.exports = new EventPublisherService();

