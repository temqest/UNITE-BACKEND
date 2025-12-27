const {
  Event,
  EventRequest,
  BloodDrive,
  Advocacy,
  Training,
  EventStaff,
  User,
  Location
} = require('../../models/index');

// Register Location model with aliases for Province, District, Municipality
// This is needed because Event model references these names, but they're all Location model
const mongoose = require('mongoose');
const locationSchema = Location.schema;

if (!mongoose.models.Province) {
  mongoose.model('Province', locationSchema, Location.collection.name);
}
if (!mongoose.models.District) {
  mongoose.model('District', locationSchema, Location.collection.name);
}
if (!mongoose.models.Municipality) {
  mongoose.model('Municipality', locationSchema, Location.collection.name);
}

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
        .select('Event_ID Event_Title Start_Date End_Date Category coordinator_id stakeholder_id made_by_role made_by_id');

      const total = await Event.countDocuments(query);

      // map minimal fields for calendar
      const mapped = events.map(e => ({
        Event_ID: e.Event_ID,
        Title: e.Event_Title,
        Start_Date: e.Start_Date,
        End_Date: e.End_Date,
        Category: e.Category,
        coordinator_id: e.coordinator_id,
        stakeholder_id: e.stakeholder_id,
        made_by_role: e.made_by_role,
        made_by_id: e.made_by_id
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
      // Check all categories in parallel to reduce sequential queries
      const [bloodDrive, advocacy, training] = await Promise.all([
        BloodDrive.findOne({ BloodDrive_ID: eventId }),
        Advocacy.findOne({ Advocacy_ID: eventId }),
        Training.findOne({ Training_ID: eventId })
      ]);

      if (bloodDrive) {
        return {
          type: 'BloodDrive',
          data: bloodDrive.toObject()
        };
      }

      if (advocacy) {
        return {
          type: 'Advocacy',
          data: advocacy.toObject()
        };
      }

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
      // Try to find user by ObjectId or legacy userId
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(coordinatorId)) {
        user = await User.findById(coordinatorId);
      }
      if (!user) {
        user = await User.findOne({ userId: coordinatorId });
      }
      if (!user) {
        return null;
      }

      // Get user's locations
      const { UserLocation } = require('../../models');
      const userLocations = await UserLocation.find({ userId: user._id });
      const locationIds = userLocations.map(ul => ul.locationId.toString());

      return {
        id: user._id.toString(),
        userId: user.userId,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        locationIds: locationIds
      };

    } catch (error) {
      return null;
    }
  }

  /**
   * Get all approved events for calendar consumption
   * Returns properly populated events with location names, category data, and coordinator/stakeholder names
   * @param {Object} filters - Optional date_from/date_to filters
   * @returns {Object} Events array with populated data
   */
  async getAllEventsForCalendar(filters = {}) {
    try {
      const query = {
        Status: 'Approved'
      };

      // Apply date filters if provided
      if (filters.date_from || filters.date_to) {
        query.Start_Date = {};
        if (filters.date_from) {
          query.Start_Date.$gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          query.Start_Date.$lte = new Date(filters.date_to);
        }
      }

      // Fetch events with location population
      const events = await Event.find(query)
        .populate('province', 'name code')
        .populate('district', 'name code province')
        .populate('municipality', 'name code district province')
        .select('Event_ID Event_Title Start_Date End_Date Location Status coordinator_id stakeholder_id made_by_id made_by_role province district municipality Email Phone_Number Category')
        .sort({ Start_Date: 1 })
        .lean();

      // Collect unique coordinator and stakeholder IDs
      const coordinatorIds = Array.from(new Set(
        events.map(e => e.coordinator_id || e.coordinator?.toString()).filter(Boolean)
      ));
      const stakeholderIds = Array.from(new Set(
        events.map(e => e.stakeholder_id || e.stakeholder?.toString()).filter(Boolean)
      ));

      // Fetch coordinator and stakeholder users in batch
      const coordUsers = [];
      const stakeholderUsers = [];

      for (const coordId of coordinatorIds) {
        let user = null;
        if (require('mongoose').Types.ObjectId.isValid(coordId)) {
          user = await User.findById(coordId).lean();
        } else {
          user = await User.findByLegacyId(coordId).lean();
        }
        if (user) coordUsers.push(user);
      }

      for (const stakeId of stakeholderIds) {
        let user = null;
        if (require('mongoose').Types.ObjectId.isValid(stakeId)) {
          user = await User.findById(stakeId).lean();
        } else {
          user = await User.findByLegacyId(stakeId).lean();
        }
        if (user) stakeholderUsers.push(user);
      }

      // Create lookup maps
      const coordById = new Map();
      for (const u of coordUsers) {
        const id = u._id ? u._id.toString() : (u.userId || u.id);
        coordById.set(String(id), u);
      }

      const stakeholderById = new Map();
      for (const u of stakeholderUsers) {
        const id = u._id ? u._id.toString() : (u.userId || u.id);
        stakeholderById.set(String(id), u);
      }

      // Fetch categories in parallel (pass Event.Category as fallback)
      const eventDetailsService = require('./eventDetails.service');
      const categories = await Promise.all(
        events.map(ev => eventDetailsService.getEventCategory(ev.Event_ID, ev.Category))
      );

      // Map events to calendar format
      const mapped = events.map((e, idx) => {
        let coordId = e.coordinator_id;
        let stakeholderId = e.stakeholder_id || e.stakeholder?.toString();
        
        if (!coordId && !stakeholderId) {
          if (e.stakeholder_id || e.stakeholder) {
            stakeholderId = e.made_by_id;
          } else {
            coordId = e.made_by_id;
          }
        }

        const coord = coordId ? coordById.get(String(coordId)) : null;
        const stakeholder = stakeholderId ? stakeholderById.get(String(stakeholderId)) : null;

        const coordinatorName = coord
          ? (coord.fullName || `${coord.firstName || ''} ${coord.lastName || ''}`.trim() || coord.Name || coord.Coordinator_Name || null)
          : null;

        const category = categories[idx] || { type: 'Unknown', data: null };

        // Extract location names from populated refs
        const provinceName = e.province?.name || (typeof e.province === 'object' && e.province?.name) || null;
        const districtName = e.district?.name || (typeof e.district === 'object' && e.district?.name) || null;
        const municipalityName = e.municipality?.name || (typeof e.municipality === 'object' && e.municipality?.name) || null;

        return {
          Event_ID: e.Event_ID,
          Event_Title: e.Event_Title,
          Location: e.Location,
          Start_Date: e.Start_Date,
          End_Date: e.End_Date,
          Status: e.Status,
          province: provinceName,
          district: districtName,
          municipality: municipalityName,
          coordinator: {
            id: coordId || null,
            name: coordinatorName || null
          },
          stakeholder: stakeholder ? {
            id: stakeholder._id ? stakeholder._id.toString() : (stakeholder.userId || stakeholder.id),
            name: stakeholder.fullName || `${stakeholder.firstName || ''} ${stakeholder.lastName || ''}`.trim()
          } : null,
          category: category.type,
          categoryData: category.data || null,
          Email: e.Email,
          Phone_Number: e.Phone_Number
        };
      });

      return {
        success: true,
        data: mapped
      };

    } catch (error) {
      throw new Error(`Failed to get all events for calendar: ${error.message}`);
    }
  }

  /**
   * Get events for logged-in user based on role
   * - SysAdmin: All events
   * - Coordinator: Own events + stakeholder events in coverage area + organization events
   * - Stakeholder: Only own events
   * @param {string|ObjectId} userId - User ID
   * @param {Object} filters - Optional date_from/date_to filters
   * @returns {Object} Events array with populated data
   */
  async getUserEventsForCalendar(userId, filters = {}) {
    try {
      // Convert userId to string for consistent handling
      const userIdStr = String(userId);
      
      // Try to find user by ObjectId first, then by legacy ID
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userIdStr)) {
        user = await User.findById(userIdStr);
      }
      if (!user) {
        user = await User.findByLegacyId(userIdStr);
      }
      
      if (!user) {
        throw new Error(`User not found: ${userIdStr}`);
      }

      // Check if user is system admin
      const isSystemAdmin = user.isSystemAdmin || user.authority >= 100;
      
      if (isSystemAdmin) {
        // System admin sees all events - use getAllEventsForCalendar
        return await this.getAllEventsForCalendar(filters);
      }

      // Build base query for approved events
      const query = {
        Status: 'Approved'
      };

      // Apply date filters if provided
      if (filters.date_from || filters.date_to) {
        query.Start_Date = {};
        if (filters.date_from) {
          query.Start_Date.$gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          query.Start_Date.$lte = new Date(filters.date_to);
        }
      }

      // Check user role
      const userRoles = (user.roles || []).filter(r => r.isActive).map(r => r.roleCode || '').map(r => r.toLowerCase());
      const isCoordinator = userRoles.some(r => r.includes('coordinator'));
      const isStakeholder = userRoles.some(r => r.includes('stakeholder'));

      // Use user._id for queries (consistent ObjectId format)
      const userObjectId = user._id || userId;
      const userObjectIdStr = userObjectId.toString();
      
      if (isStakeholder) {
        // Stakeholder: Only own events
        query.$or = [
          { stakeholder_id: userObjectIdStr },
          { stakeholder_id: userObjectId },
          { made_by_id: userObjectIdStr },
          { made_by_id: userObjectId }
        ];
      } else if (isCoordinator) {
        // Coordinator: Own events + stakeholder events in coverage area + organization events
        const orClauses = [
          { coordinator_id: userObjectIdStr }, // Own events (string)
          { coordinator_id: userObjectId }, // Own events (ObjectId)
          { made_by_id: userObjectIdStr }, // Events created by coordinator (string)
          { made_by_id: userObjectId } // Events created by coordinator (ObjectId)
        ];

        // Get coordinator's coverage areas and municipalities
        let municipalityIds = [];
        let organizationIds = [];
        
        try {
          const coordinatorContextService = require('../users_services/coordinatorContext.service');
          const context = await coordinatorContextService.getCoordinatorContext(userObjectId);
          
          // Get municipality IDs from coverage areas
          municipalityIds = (context.coverageAreas || [])
            .flatMap(ca => ca.municipalityIds || [])
            .filter(Boolean)
            .map(id => id.toString());

          // Get organization IDs
          organizationIds = (context.organizations || [])
            .map(org => org._id.toString())
            .filter(Boolean);
        } catch (contextError) {
          // If context service fails, log but continue with just own events
          console.error('[getUserEventsForCalendar] Error getting coordinator context:', contextError.message);
          // Continue with just own events (orClauses already has coordinator_id and made_by_id)
        }

        // Add coverage area filter: events where stakeholder's location matches coordinator's coverage
        if (municipalityIds.length > 0) {
          try {
            // Find stakeholders in coordinator's coverage area
            const locationService = require('../utility_services/location.service');
            const userLocations = await locationService.getUserLocations(userObjectId);
            const locationIds = userLocations.map(loc => loc._id.toString());

            if (locationIds.length > 0) {
              // Get all users (stakeholders) in these locations
              const { UserLocation } = require('../../models');
              const stakeholderAssignments = await UserLocation.find({
                locationId: { $in: locationIds }
              }).select('userId').lean();
              
              const stakeholderIdsInCoverage = Array.from(new Set(
                stakeholderAssignments.map(a => a.userId.toString())
              ));

              if (stakeholderIdsInCoverage.length > 0) {
                orClauses.push({
                  stakeholder_id: { $in: stakeholderIdsInCoverage }
                });
              }
            }

            // Also match events by municipality if event has municipality field
            orClauses.push({
              municipality: { $in: municipalityIds }
            });
          } catch (locationError) {
            // If location service fails, log but continue
            console.error('[getUserEventsForCalendar] Error getting user locations:', locationError.message);
            // Still add municipality filter even if location lookup fails
            orClauses.push({
              municipality: { $in: municipalityIds }
            });
          }
        }

        // Add organization filter: events where stakeholder's organization matches
        if (organizationIds.length > 0) {
          // Find stakeholders in coordinator's organizations
          const stakeholdersInOrgs = await User.find({
            'organizations.organizationId': { $in: organizationIds },
            'roles.roleCode': { $regex: /stakeholder/i }
          }).select('_id').lean();

          const stakeholderIdsInOrgs = stakeholdersInOrgs.map(s => s._id.toString());

          if (stakeholderIdsInOrgs.length > 0) {
            orClauses.push({
              stakeholder_id: { $in: stakeholderIdsInOrgs }
            });
          }
        }

        query.$or = orClauses;
      } else {
        // Unknown role: only own events
        query.$or = [
          { made_by_id: userObjectIdStr },
          { made_by_id: userObjectId }
        ];
      }

      // Fetch events with location population
      const events = await Event.find(query)
        .populate('province', 'name code')
        .populate('district', 'name code province')
        .populate('municipality', 'name code district province')
        .select('Event_ID Event_Title Start_Date End_Date Location Status coordinator_id stakeholder_id made_by_id made_by_role province district municipality Email Phone_Number Category')
        .sort({ Start_Date: 1 })
        .lean();

      // Collect unique coordinator and stakeholder IDs
      const coordinatorIds = Array.from(new Set(
        events.map(e => e.coordinator_id || e.coordinator?.toString()).filter(Boolean)
      ));
      const stakeholderIds = Array.from(new Set(
        events.map(e => e.stakeholder_id || e.stakeholder?.toString()).filter(Boolean)
      ));

      // Fetch coordinator and stakeholder users in batch
      const coordUsers = [];
      const stakeholderUsers = [];

      for (const coordId of coordinatorIds) {
        let coordUser = null;
        if (require('mongoose').Types.ObjectId.isValid(coordId)) {
          coordUser = await User.findById(coordId).lean();
        } else {
          coordUser = await User.findByLegacyId(coordId).lean();
        }
        if (coordUser) coordUsers.push(coordUser);
      }

      for (const stakeId of stakeholderIds) {
        let stakeUser = null;
        if (require('mongoose').Types.ObjectId.isValid(stakeId)) {
          stakeUser = await User.findById(stakeId).lean();
        } else {
          stakeUser = await User.findByLegacyId(stakeId).lean();
        }
        if (stakeUser) stakeholderUsers.push(stakeUser);
      }

      // Create lookup maps
      const coordById = new Map();
      for (const u of coordUsers) {
        const id = u._id ? u._id.toString() : (u.userId || u.id);
        coordById.set(String(id), u);
      }

      const stakeholderById = new Map();
      for (const u of stakeholderUsers) {
        const id = u._id ? u._id.toString() : (u.userId || u.id);
        stakeholderById.set(String(id), u);
      }

      // Fetch categories in parallel (pass Event.Category as fallback)
      const eventDetailsService = require('./eventDetails.service');
      const categories = await Promise.all(
        events.map(ev => eventDetailsService.getEventCategory(ev.Event_ID, ev.Category))
      );

      // Map events to calendar format
      const mapped = events.map((e, idx) => {
        let coordId = e.coordinator_id;
        let stakeholderId = e.stakeholder_id || e.stakeholder?.toString();
        
        if (!coordId && !stakeholderId) {
          if (e.stakeholder_id || e.stakeholder) {
            stakeholderId = e.made_by_id;
          } else {
            coordId = e.made_by_id;
          }
        }

        const coord = coordId ? coordById.get(String(coordId)) : null;
        const stakeholder = stakeholderId ? stakeholderById.get(String(stakeholderId)) : null;

        const coordinatorName = coord
          ? (coord.fullName || `${coord.firstName || ''} ${coord.lastName || ''}`.trim() || coord.Name || coord.Coordinator_Name || null)
          : null;

        const category = categories[idx] || { type: 'Unknown', data: null };

        // Extract location names from populated refs
        const provinceName = e.province?.name || (typeof e.province === 'object' && e.province?.name) || null;
        const districtName = e.district?.name || (typeof e.district === 'object' && e.district?.name) || null;
        const municipalityName = e.municipality?.name || (typeof e.municipality === 'object' && e.municipality?.name) || null;

        return {
          Event_ID: e.Event_ID,
          Event_Title: e.Event_Title,
          Location: e.Location,
          Start_Date: e.Start_Date,
          End_Date: e.End_Date,
          Status: e.Status,
          province: provinceName,
          district: districtName,
          municipality: municipalityName,
          coordinator: {
            id: coordId || null,
            name: coordinatorName || null
          },
          stakeholder: stakeholder ? {
            id: stakeholder._id ? stakeholder._id.toString() : (stakeholder.userId || stakeholder.id),
            name: stakeholder.fullName || `${stakeholder.firstName || ''} ${stakeholder.lastName || ''}`.trim()
          } : null,
          category: category.type,
          categoryData: category.data || null,
          Email: e.Email,
          Phone_Number: e.Phone_Number
        };
      });

      return {
        success: true,
        data: mapped
      };

    } catch (error) {
      throw new Error(`Failed to get user events for calendar: ${error.message}`);
    }
  }
}

module.exports = new EventOverviewService();

