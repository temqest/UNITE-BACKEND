/**
 * Event Publisher Service
 * 
 * Handles automatic event publishing when request is approved
 */

const { Event } = require('../../models/index');
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');

class EventPublisherService {
  /**
   * Publish event when request is approved
   * @param {Object} request - Request document
   * @returns {Promise<Object>} Published event
   */
  async publishEvent(request) {
    try {
      // Find or create event
      let event = await Event.findOne({ Event_ID: request.Event_ID });
      
      if (!event) {
        // Create new event from request data
        event = new Event({
          Event_ID: request.Event_ID,
          Event_Title: request.Event_Title,
          Location: request.Location,
          Start_Date: request.Date || request.Start_Date, // Map Date to Start_Date for Event model
          End_Date: null, // No end date needed
          Email: request.Email,
          Phone_Number: request.Phone_Number,
          Event_Description: request.Event_Description,
          Category: request.Category,
          // Location references
          province: request.province,
          district: request.district,
          municipality: request.municipalityId,
          // Creator information
          made_by_id: request.requester?.userId?.toString() || request.requester?.userId?.toString(),
          made_by_role: this._mapRoleToEventEnum(request.requester?.roleSnapshot || 'stakeholder'),
          // Coordinator and stakeholder (if available)
          coordinator_id: request.reviewer?.userId?.toString() || null,
          stakeholder_id: request.requester?.authoritySnapshot < 60 ? request.requester?.userId?.toString() : null,
          // Status
          Status: 'Approved'
        });
      } else {
        // Update existing event with request data
        event.Event_Title = request.Event_Title || event.Event_Title;
        event.Location = request.Location || event.Location;
        event.Start_Date = request.Date || request.Start_Date || event.Start_Date;
        event.End_Date = null; // No end date needed
        event.Email = request.Email || event.Email;
        event.Phone_Number = request.Phone_Number || event.Phone_Number;
        event.Event_Description = request.Event_Description || event.Event_Description;
        event.Category = request.Category || event.Category;
        event.Status = 'Approved';
      }

      // Save event
      await event.save();

      // Update request with event reference
      request.eventId = event._id;
      await request.save();

      console.log(`[EVENT PUBLISHER] Event ${event.Event_ID} published for request ${request.Request_ID}`);

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
   * Check if event should be published (request is approved)
   * @param {string} requestStatus - Request status
   * @returns {boolean} True if event should be published
   */
  shouldPublishEvent(requestStatus) {
    return requestStatus === REQUEST_STATES.APPROVED;
  }
}

module.exports = new EventPublisherService();

