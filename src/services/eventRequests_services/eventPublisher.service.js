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
        throw new Error(`Event with Event_ID ${request.Event_ID} not found`);
      }

      // Update event status to published/active
      // Assuming event has a Status field that can be set to 'Published' or 'Active'
      event.Status = event.Status || 'Published';
      
      // Link event to request
      if (!event.Request_ID) {
        event.Request_ID = request.Request_ID;
      }

      // Update event with request details if needed
      if (request.requester) {
        // Update event creator information if needed
        if (!event.made_by_id) {
          event.made_by_id = request.requester.userId.toString();
        }
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
   * Check if event should be published (request is approved)
   * @param {string} requestStatus - Request status
   * @returns {boolean} True if event should be published
   */
  shouldPublishEvent(requestStatus) {
    return requestStatus === REQUEST_STATES.APPROVED;
  }
}

module.exports = new EventPublisherService();

