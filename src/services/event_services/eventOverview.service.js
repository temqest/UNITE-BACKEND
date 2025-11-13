const {
  Event,
  EventRequest,
  BloodDrive,
  Advocacy,
  Training,
  EventStaff,
  Coordinator,
  BloodbankStaff
} = require('../../models/index');

class EventOverviewService {
  /**
   * Get all events with filtering, sorting, and pagination
   * For Overview Page with status badges
   * 
   * @param {Object} filters 
   * @param {Object} options 
   * @returns {Object} Events list
   */
  async getAllEvents(filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'Start_Date',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;

      // Build query
      const query = {};

      // Status filter
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query.Status = { $in: filters.status };
        } else {
          query.Status = filters.status;
        }
      } else {
        // Default: show all except rejected
        query.Status = { $ne: 'Rejected' };
      }

      // Date range filter
      if (filters.date_from || filters.date_to) {
        query.Start_Date = {};
        if (filters.date_from) {
          query.Start_Date.$gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          query.Start_Date.$lte = new Date(filters.date_to);
        }
      }

      // Coordinator filter
      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      // Location filter
      if (filters.location) {
        query.Location = { $regex: filters.location, $options: 'i' };
      }

      // Search filter (title)
      if (filters.search) {
        query.Event_Title = { $regex: filters.search, $options: 'i' };
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Get events
      const events = await Event.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort);

      const total = await Event.countDocuments(query);

      // Enrich events with category, coordinator, and request info
      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const category = await this.getEventCategory(event.Event_ID);
          const coordinator = await this.getCoordinatorInfo(event.MadeByCoordinatorID);
          const request = await EventRequest.findOne({ Event_ID: event.Event_ID });
          const staffCount = await EventStaff.countDocuments({ EventID: event.Event_ID });

          return {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Location: event.Location,
            Start_Date: event.Start_Date,
            Status: event.Status,
            Request_Status: request ? request.Status : null,
            category: category.type,
            categoryData: category.data,
            coordinator: coordinator,
            staffCount: staffCount,
            Email: event.Email,
            Phone_Number: event.Phone_Number,
            created_at: event.createdAt,
            updated_at: event.updatedAt
          };
        })
      );

      return {
        success: true,
        events: enrichedEvents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters: filters
      };

    } catch (error) {
      throw new Error(`Failed to get events: ${error.message}`);
    }
  }

  /**
   * Get events grouped by status
   * @param {Object} filters 
   * @returns {Object} Events grouped by status
   */
  async getEventsByStatus(filters = {}) {
    try {
      const query = {};

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      if (filters.date_from || filters.date_to) {
        query.Start_Date = {};
        if (filters.date_from) query.Start_Date.$gte = new Date(filters.date_from);
        if (filters.date_to) query.Start_Date.$lte = new Date(filters.date_to);
      }

      const allEvents = await Event.find(query);

      const grouped = {
        Pending: [],
        Approved: [],
        Rescheduled: [],
        Rejected: [],
        Completed: []
      };

      for (const event of allEvents) {
        const category = await this.getEventCategory(event.Event_ID);
        const coordinator = await this.getCoordinatorInfo(event.MadeByCoordinatorID);
        const request = await EventRequest.findOne({ Event_ID: event.Event_ID });

        const eventData = {
          Event_ID: event.Event_ID,
          Event_Title: event.Event_Title,
          Location: event.Location,
          Start_Date: event.Start_Date,
          Status: event.Status,
          Request_Status: request ? request.Status : null,
          category: category.type,
          coordinator: coordinator
        };

        if (grouped[event.Status]) {
          grouped[event.Status].push(eventData);
        }
      }

      // Add counts
      const counts = {};
      Object.keys(grouped).forEach(status => {
        counts[status] = grouped[status].length;
      });

      return {
        success: true,
        events: grouped,
        counts
      };

    } catch (error) {
      throw new Error(`Failed to get events by status: ${error.message}`);
    }
  }

  /**
   * Get upcoming events
   * @param {number} limit 
   * @param {Object} filters 
   * @returns {Object} Upcoming events
   */
  async getUpcomingEvents(limit = 10, filters = {}) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const query = {
        Start_Date: { $gte: today },
        Status: { $in: ['Approved', 'Completed'] }
      };

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      const events = await Event.find(query)
        .sort({ Start_Date: 1 })
        .limit(limit);

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const category = await this.getEventCategory(event.Event_ID);
          const coordinator = await this.getCoordinatorInfo(event.MadeByCoordinatorID);

          return {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Location: event.Location,
            Start_Date: event.Start_Date,
            Status: event.Status,
            category: category.type,
            coordinator: coordinator,
            daysUntil: Math.ceil((event.Start_Date - today) / (1000 * 60 * 60 * 24))
          };
        })
      );

      return {
        success: true,
        events: enrichedEvents,
        total: enrichedEvents.length
      };

    } catch (error) {
      throw new Error(`Failed to get upcoming events: ${error.message}`);
    }
  }

  /**
   * Get public events (Approved/Completed) for calendar/public listing
   * @param {Object} filters - date_from/date_to/category
   * @param {Object} options - page/limit
   */
  async getPublicEvents(filters = {}, options = {}) {
    try {
      const { page = 1, limit = 200 } = options;
      const skip = (page - 1) * limit;

      const query = {
        Status: { $in: ['Approved', 'Completed'] }
      };

      if (filters.date_from || filters.date_to) {
        query.Start_Date = {};
        if (filters.date_from) query.Start_Date.$gte = new Date(filters.date_from);
        if (filters.date_to) query.Start_Date.$lte = new Date(filters.date_to);
      }

      if (filters.category) {
        query.Category = filters.category;
      }

      const events = await Event.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ Start_Date: 1 })
        .select('Event_ID Event_Title Start_Date End_Date Category');

      const total = await Event.countDocuments(query);

      // map minimal fields for calendar
      const mapped = events.map(e => ({
        Event_ID: e.Event_ID,
        Title: e.Event_Title,
        Start_Date: e.Start_Date,
        End_Date: e.End_Date,
        Category: e.Category
      }));

      return {
        success: true,
        events: mapped,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      };
    } catch (error) {
      throw new Error(`Failed to get public events: ${error.message}`);
    }
  }

  /**
   * Get recent events
   * @param {number} limit 
   * @param {Object} filters 
   * @returns {Object} Recent events
   */
  async getRecentEvents(limit = 10, filters = {}) {
    try {
      const query = {};

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      if (filters.status) {
        query.Status = filters.status;
      }

      const events = await Event.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const category = await this.getEventCategory(event.Event_ID);
          const coordinator = await this.getCoordinatorInfo(event.MadeByCoordinatorID);

          return {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Location: event.Location,
            Start_Date: event.Start_Date,
            Status: event.Status,
            category: category.type,
            coordinator: coordinator,
            created_at: event.createdAt
          };
        })
      );

      return {
        success: true,
        events: enrichedEvents,
        total: enrichedEvents.length
      };

    } catch (error) {
      throw new Error(`Failed to get recent events: ${error.message}`);
    }
  }

  /**
   * Search events by various criteria
   * @param {string} searchTerm 
   * @param {Object} filters 
   * @param {Object} options 
   * @returns {Object} Search results
   */
  async searchEvents(searchTerm, filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'Start_Date',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;

      const query = {
        $or: [
          { Event_Title: { $regex: searchTerm, $options: 'i' } },
          { Location: { $regex: searchTerm, $options: 'i' } }
        ]
      };

      // Apply additional filters
      if (filters.status) {
        query.Status = filters.status;
      }

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      if (filters.date_from || filters.date_to) {
        query.Start_Date = {};
        if (filters.date_from) query.Start_Date.$gte = new Date(filters.date_from);
        if (filters.date_to) query.Start_Date.$lte = new Date(filters.date_to);
      }

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const events = await Event.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort);

      const total = await Event.countDocuments(query);

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const category = await this.getEventCategory(event.Event_ID);
          const coordinator = await this.getCoordinatorInfo(event.MadeByCoordinatorID);

          return {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Location: event.Location,
            Start_Date: event.Start_Date,
            Status: event.Status,
            category: category.type,
            coordinator: coordinator
          };
        })
      );

      return {
        success: true,
        searchTerm,
        events: enrichedEvents,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      throw new Error(`Failed to search events: ${error.message}`);
    }
  }

  /**
   * Get event category type and data
   * @param {string} eventId 
   * @returns {Object} Category info
   */
  async getEventCategory(eventId) {
    try {
      const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: eventId });
      if (bloodDrive) {
        return {
          type: 'BloodDrive',
          data: bloodDrive.toObject()
        };
      }

      const advocacy = await Advocacy.findOne({ Advocacy_ID: eventId });
      if (advocacy) {
        return {
          type: 'Advocacy',
          data: advocacy.toObject()
        };
      }

      const training = await Training.findOne({ Training_ID: eventId });
      if (training) {
        return {
          type: 'Training',
          data: training.toObject()
        };
      }

      return {
        type: 'Unknown',
        data: null
      };

    } catch (error) {
      return {
        type: 'Unknown',
        data: null
      };
    }
  }

  /**
   * Get coordinator information
   * @param {string} coordinatorId 
   * @returns {Object} Coordinator info
   */
  async getCoordinatorInfo(coordinatorId) {
    try {
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId });
      if (!coordinator) {
        return null;
      }

      const staff = await BloodbankStaff.findOne({ ID: coordinatorId });
      if (!staff) {
        return {
          id: coordinatorId,
          district_id: coordinator.District_ID
        };
      }

      return {
        id: coordinatorId,
        district_id: coordinator.District_ID,
        name: `${staff.First_Name} ${staff.Middle_Name || ''} ${staff.Last_Name}`.trim(),
        email: staff.Email,
        phone: staff.Phone_Number
      };

    } catch (error) {
      return null;
    }
  }
}

module.exports = new EventOverviewService();

