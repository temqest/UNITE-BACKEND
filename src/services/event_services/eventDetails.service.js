const {
  Event,
  EventRequest,
  EventRequestHistory,
  BloodDrive,
  Advocacy,
  Training,
  EventStaff
} = require('../../models/index');

class EventDetailsService {
  /**
   * Helper to extract district number from district name
   * @param {string} districtName 
   * @returns {number|null}
   */
  extractDistrictNumber(districtName) {
    if (!districtName || typeof districtName !== "string") return null;

    // Try to match "District X" where X is Roman numeral or number
    const match = districtName.match(/^District\s+(.+)$/i);
    if (!match) return null;

    const districtPart = match[1].trim();

    // Try to parse as number first
    const num = parseInt(districtPart, 10);
    if (!isNaN(num)) return num;

    // Try to convert Roman numeral
    try {
      const romanMap = {
        I: 1,
        V: 5,
        X: 10,
        L: 50,
        C: 100,
        D: 500,
        M: 1000,
      };

      let total = 0;
      for (let i = 0; i < districtPart.length; i++) {
        const current = romanMap[districtPart[i].toUpperCase()];
        const next = romanMap[districtPart[i + 1]?.toUpperCase()];
        if (current && next && current < next) {
          total -= current;
        } else if (current) {
          total += current;
        }
      }
      return total;
    } catch {
      return null;
    }
  }
  /**
   * Get complete event details by ID
   * @param {string} eventId 
   * @returns {Object} Full event details
   */
  async getEventDetails(eventId) {
    try {
      const event = await Event.findOne({ Event_ID: eventId });
      if (!event) {
        throw new Error('Event not found');
      }

      // Get category-specific data
      const category = await this.getEventCategory(event.Event_ID);
      
      // Get coordinator information
      const coordinator = await this.getCoordinatorInfo(event.coordinator_id);
      
      // Get stakeholder information
      const stakeholder = await this.getStakeholderInfo(event.stakeholder_id);
      
      // Get admin information (if approved) - using User model
      let admin = null;
      if (event.ApprovedByAdminID) {
        const { User } = require('../../models');
        let adminUser = null;
        if (require('mongoose').Types.ObjectId.isValid(event.ApprovedByAdminID)) {
          adminUser = await User.findById(event.ApprovedByAdminID);
        } else {
          adminUser = await User.findByLegacyId(event.ApprovedByAdminID);
        }
        if (adminUser && adminUser.isSystemAdmin) {
          admin = {
            id: adminUser._id.toString(),
            name: adminUser.fullName || `${adminUser.firstName} ${adminUser.lastName}`,
            email: adminUser.email,
            access_level: adminUser.metadata?.accessLevel || 'super'
          };
        }
      }

      // Get associated request
      const request = await EventRequest.findOne({ Event_ID: eventId });
      
      // Get request history
      const history = await EventRequestHistory.find({ Request_ID: request?.Request_ID || null })
        .sort({ ActionDate: -1 });

      // Get staff assignments
      const staffAssignments = await EventStaff.find({ EventID: eventId });

      // Get formatted history timeline
      const timeline = history.map(hist => ({
        action: hist.Action,
        actor: {
          id: hist.Actor_ID,
          type: hist.ActorType,
          name: hist.ActorName
        },
        note: hist.Note,
        previousStatus: hist.PreviousStatus,
        newStatus: hist.NewStatus,
        rescheduledDate: hist.RescheduledDate,
        originalDate: hist.OriginalDate,
        actionDate: hist.ActionDate,
        formattedDescription: hist.getFormattedDescription ? hist.getFormattedDescription() : null
      }));

      return {
        success: true,
        event: {
          Event_ID: event.Event_ID,
          Event_Title: event.Event_Title,
          // Include description fields returned from DB under common keys
          Event_Description: event.Event_Description || event.EventDescription || event.Description || '',
          Location: event.Location,
          Start_Date: event.Start_Date,
          End_Date: event.End_Date,
          Status: event.Status,
          Email: event.Email,
          Phone_Number: event.Phone_Number,
          StaffAssignmentID: event.StaffAssignmentID,
          category: category.type,
          categoryData: category.data,
          coordinator: coordinator,
          stakeholder: stakeholder,
          admin: admin,
          request: request ? {
            Request_ID: request.Request_ID,
            Status: request.Status,
            AdminAction: request.AdminAction,
            AdminNote: request.AdminNote,
            RescheduledDate: request.RescheduledDate,
            CoordinatorFinalAction: request.CoordinatorFinalAction,
            AdminActionDate: request.AdminActionDate,
            CoordinatorFinalActionDate: request.CoordinatorFinalActionDate
          } : null,
          staff: staffAssignments.map(s => ({
            EventID: s.EventID,
            Staff_FullName: s.Staff_FullName,
            Role: s.Role,
            assigned_at: s.createdAt
          })),
          history: timeline,
          created_at: event.createdAt,
          updated_at: event.updatedAt
        }
      };

    } catch (error) {
      throw new Error(`Failed to get event details: ${error.message}`);
    }
  }

  /**
   * Get event category type and data
   * @param {string} eventId 
   * @returns {Object} Category info
   */
  async getEventCategory(eventId, eventCategory = null) {
    try {
      // First try to find category-specific records
      const [bloodDrive, advocacy, training] = await Promise.all([
        BloodDrive.findOne({ BloodDrive_ID: eventId }).lean(),
        Advocacy.findOne({ Advocacy_ID: eventId }).lean(),
        Training.findOne({ Training_ID: eventId }).lean()
      ]);

      // Debug logging (always log to help diagnose)
      console.log(`[getEventCategory] Searching for Event_ID: ${eventId}, eventCategory: ${eventCategory}`);
      console.log(`[getEventCategory] Query results:`, {
        bloodDriveFound: !!bloodDrive,
        advocacyFound: !!advocacy,
        trainingFound: !!training,
        bloodDriveData: bloodDrive ? { Target_Donation: bloodDrive.Target_Donation, VenueType: bloodDrive.VenueType } : null
      });

      if (bloodDrive) {
        const categoryData = {
          Target_Donation: bloodDrive.Target_Donation,
          VenueType: bloodDrive.VenueType
        };
        
        console.log(`[getEventCategory] ✅ Found BloodDrive record! Returning data:`, categoryData);
        
        return {
          type: 'BloodDrive',
          data: categoryData
        };
      }

      if (advocacy) {
        const categoryData = {
          Topic: advocacy.Topic,
          TargetAudience: advocacy.TargetAudience,
          ExpectedAudienceSize: advocacy.ExpectedAudienceSize,
          PartnerOrganization: advocacy.PartnerOrganization
        };
        
        console.log(`[getEventCategory] ✅ Found Advocacy record! Returning data:`, categoryData);
        
        return {
          type: 'Advocacy',
          data: categoryData
        };
      }

      if (training) {
        const categoryData = {
          TrainingType: training.TrainingType,
          MaxParticipants: training.MaxParticipants
        };
        
        console.log(`[getEventCategory] ✅ Found Training record! Returning data:`, categoryData);
        
        return {
          type: 'Training',
          data: categoryData
        };
      }

      // If no category-specific record found, try to use Event's Category field as fallback
      // But also try to fetch the category record one more time using the known category type
      let categoryStr = null;
      
      if (eventCategory) {
        categoryStr = String(eventCategory).trim();
      } else {
        // Last resort: fetch Event document to check Category field
        try {
          const { Event } = require('../../models');
          const event = await Event.findOne({ Event_ID: eventId }).select('Category').lean();
          if (event && event.Category) {
            categoryStr = String(event.Category).trim();
          }
        } catch (eventFetchError) {
          // Ignore errors when fetching Event document
        }
      }

      // If we have a category type but no record found, try alternative search methods
      if (categoryStr && categoryStr !== 'Unknown') {
        console.log(`[getEventCategory] ⚠️ Found category type "${categoryStr}" from Event.Category but NO category record found for Event_ID: ${eventId}`);
        
        // Try to find the record with case-insensitive or partial matching as a last resort
        let alternativeRecord = null;
        try {
          if (categoryStr === 'BloodDrive' || categoryStr.toLowerCase().includes('blood')) {
            // Try case-insensitive search
            alternativeRecord = await BloodDrive.findOne({ 
              BloodDrive_ID: { $regex: new RegExp(`^${eventId}$`, 'i') } 
            }).lean();
            
            // If still not found, try to find any BloodDrive record (for debugging)
            if (!alternativeRecord) {
              const sampleRecords = await BloodDrive.find({}).select('BloodDrive_ID').limit(3).lean();
              console.log(`[getEventCategory] Sample BloodDrive_IDs in database:`, sampleRecords.map(r => r.BloodDrive_ID));
            }
          } else if (categoryStr === 'Advocacy' || categoryStr.toLowerCase().includes('advoc')) {
            alternativeRecord = await Advocacy.findOne({ 
              Advocacy_ID: { $regex: new RegExp(`^${eventId}$`, 'i') } 
            }).lean();
          } else if (categoryStr === 'Training' || categoryStr.toLowerCase().includes('train')) {
            alternativeRecord = await Training.findOne({ 
              Training_ID: { $regex: new RegExp(`^${eventId}$`, 'i') } 
            }).lean();
          }
          
          if (alternativeRecord) {
            console.log(`[getEventCategory] ✅ Found ${categoryStr} record with alternative search!`);
            // Extract data based on category type
            if (categoryStr === 'BloodDrive' || categoryStr.toLowerCase().includes('blood')) {
              return {
                type: 'BloodDrive',
                data: {
                  Target_Donation: alternativeRecord.Target_Donation,
                  VenueType: alternativeRecord.VenueType
                }
              };
            } else if (categoryStr === 'Advocacy' || categoryStr.toLowerCase().includes('advoc')) {
              return {
                type: 'Advocacy',
                data: {
                  Topic: alternativeRecord.Topic,
                  TargetAudience: alternativeRecord.TargetAudience,
                  ExpectedAudienceSize: alternativeRecord.ExpectedAudienceSize,
                  PartnerOrganization: alternativeRecord.PartnerOrganization
                }
              };
            } else if (categoryStr === 'Training' || categoryStr.toLowerCase().includes('train')) {
              return {
                type: 'Training',
                data: {
                  TrainingType: alternativeRecord.TrainingType,
                  MaxParticipants: alternativeRecord.MaxParticipants
                }
              };
            }
          }
        } catch (altSearchError) {
          console.error(`[getEventCategory] Error in alternative search:`, altSearchError);
        }
        
        console.log(`[getEventCategory] This means the ${categoryStr} record with ${categoryStr}_ID="${eventId}" does not exist in the database.`);
        console.log(`[getEventCategory] The category-specific record needs to be created for this event to display category data.`);
        
        // Return the category type with null data (record doesn't exist)
        return {
          type: categoryStr,
          data: null
        };
      }

      return {
        type: 'Unknown',
        data: null
      };

    } catch (error) {
      console.error('[getEventCategory] Error:', error);
      return {
        type: 'Unknown',
        data: null
      };
    }
  }

  /**
   * Get coordinator information using User model
   * @param {string} coordinatorId 
   * @returns {Object} Coordinator info
   */
  async getCoordinatorInfo(coordinatorId) {
    try {
      const { User } = require('../../models');
      let user = null;
      
      if (require('mongoose').Types.ObjectId.isValid(coordinatorId)) {
        user = await User.findById(coordinatorId);
      } else {
        user = await User.findByLegacyId(coordinatorId);
      }
      
      if (!user) {
        return null;
      }

      // Get user locations
      const locationService = require('../utility_services/location.service');
      const locations = await locationService.getUserLocations(user._id);

      return {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName || `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phoneNumber,
        locations: locations
      };

    } catch (error) {
      console.error('Error in getCoordinatorInfo:', error);
      return null;
    }
  }

  /**
   * Get stakeholder information using User model
   * @param {string} stakeholderId 
   * @returns {Object} Stakeholder info
   */
  async getStakeholderInfo(stakeholderId) {
    try {
      if (!stakeholderId) {
        return null;
      }

      const { User } = require('../../models');
      let user = null;
      
      if (require('mongoose').Types.ObjectId.isValid(stakeholderId)) {
        user = await User.findById(stakeholderId);
      } else {
        user = await User.findByLegacyId(stakeholderId);
      }
      
      if (!user) {
        return null;
      }

      // Get user locations
      const locationService = require('../utility_services/location.service');
      const locations = await locationService.getUserLocations(user._id);

      return {
        id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName || `${user.firstName} ${user.lastName}`,
        email: user.email,
        phone: user.phoneNumber,
        locations: locations
      };

    } catch (error) {
      console.error('Error in getStakeholderInfo:', error);
      return null;
    }
  }

  /**
   * Get event statistics for a specific event
   * @param {string} eventId 
   * @returns {Object} Event statistics
   */
  async getEventStatistics(eventId) {
    try {
      const event = await Event.findOne({ Event_ID: eventId });
      if (!event) {
        throw new Error('Event not found');
      }

      const request = await EventRequest.findOne({ Event_ID: eventId });
      const staffCount = await EventStaff.countDocuments({ EventID: eventId });
      const historyCount = await EventRequestHistory.countDocuments({ 
        Request_ID: request?.Request_ID || null 
      });

      // Calculate time from creation to completion
      let timeToCompletion = null;
      if (event.Status === 'Completed' && request?.CoordinatorFinalActionDate) {
        timeToCompletion = Math.ceil(
          (request.CoordinatorFinalActionDate - event.createdAt) / (1000 * 60 * 60 * 24)
        ); // Days
      }

      // Calculate time from creation to admin action
      let timeToAdminAction = null;
      if (request?.AdminActionDate) {
        timeToAdminAction = Math.ceil(
          (request.AdminActionDate - event.createdAt) / (1000 * 60 * 60 * 24)
        ); // Days
      }

      return {
        success: true,
        statistics: {
          event_id: eventId,
          status: event.Status,
          staff_count: staffCount,
          history_entries: historyCount,
          time_to_completion_days: timeToCompletion,
          time_to_admin_action_days: timeToAdminAction,
          created_at: event.createdAt,
          updated_at: event.updatedAt,
          start_date: event.Start_Date
        }
      };

    } catch (error) {
      throw new Error(`Failed to get event statistics: ${error.message}`);
    }
  }

  /**
   * Check if event has all required data
   * @param {string} eventId 
   * @returns {Object} Completeness check
   */
  async checkEventCompleteness(eventId) {
    try {
      const event = await Event.findOne({ Event_ID: eventId });
      if (!event) {
        throw new Error('Event not found');
      }

      const request = await EventRequest.findOne({ Event_ID: eventId });
      const staff = await EventStaff.find({ EventID: eventId });
      const category = await this.getEventCategory(eventId);

      const completeness = {
        basicInfo: !!(event.Event_Title && event.Location && event.Start_Date),
        coordinator: !!(event.MadeByCoordinatorID),
        category: !!(category.type !== 'Unknown'),
        request: !!request,
        staff: staff.length > 0,
        admin: !!event.ApprovedByAdminID,
        contactInfo: !!(event.Email && event.Phone_Number)
      };

      const totalChecks = Object.keys(completeness).length;
      const passedChecks = Object.values(completeness).filter(Boolean).length;
      const completenessPercentage = (passedChecks / totalChecks) * 100;

      return {
        success: true,
        completeness: {
          ...completeness,
          percentage: Math.round(completenessPercentage),
          isComplete: passedChecks === totalChecks,
          missing: Object.keys(completeness).filter(key => !completeness[key])
        }
      };

    } catch (error) {
      throw new Error(`Failed to check event completeness: ${error.message}`);
    }
  }

  /**
   * Get multiple events by Event_IDs in batch (efficient for UI batch fetch)
   * @param {Array<string>} ids
   * @returns {Object} Mapping of Event_ID -> minimal event info
   */
  async getEventsBatch(ids = []) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        return { success: true, events: [] };
      }

      // Fetch minimal event fields for requested ids with location population
      const events = await Event.find({ Event_ID: { $in: ids } })
        .populate('province', 'name code')
        .populate('district', 'name code province')
        .populate('municipality', 'name code district province')
        .select('Event_ID Event_Title Start_Date End_Date Location Status coordinator_id stakeholder_id made_by_id made_by_role stakeholder province district municipality Email Phone_Number')
        .lean();

      // Collect unique coordinator and stakeholder ids to resolve names in batch
      // Get coordinator and stakeholder IDs from events (role-agnostic)
      const coordinatorIds = Array.from(new Set(events.map(e => e.coordinator_id || e.coordinator?.toString()).filter(Boolean)));
      const stakeholderIds = Array.from(new Set(events.map(e => e.stakeholder_id || e.stakeholder?.toString()).filter(Boolean)));

      // Use User model instead of legacy models
      const { User } = require('../../models');
      const coordUsers = [];
      const stakeholderUsers = [];
      
      // Fetch coordinator users
      for (const coordId of coordinatorIds) {
        let user = null;
        if (require('mongoose').Types.ObjectId.isValid(coordId)) {
          user = await User.findById(coordId).lean();
        } else {
          user = await User.findByLegacyId(coordId).lean();
        }
        if (user) coordUsers.push(user);
      }
      
      // Fetch stakeholder users
      for (const stakeId of stakeholderIds) {
        let user = null;
        if (require('mongoose').Types.ObjectId.isValid(stakeId)) {
          user = await User.findById(stakeId).lean();
        } else {
          user = await User.findByLegacyId(stakeId).lean();
        }
        if (user) stakeholderUsers.push(user);
      }

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

      // Fetch categories in parallel to include category/type and categoryData
      const categories = await Promise.all(events.map(ev => this.getEventCategory(ev.Event_ID)));

      const mapped = events.map((e, idx) => {
        let coordId = e.coordinator_id;
        let stakeholderId = e.stakeholder_id || e.stakeholder?.toString();
        if (!coordId && !stakeholderId) {
          // Check if event has stakeholder (role-agnostic check)
          if (e.stakeholder_id || e.stakeholder) {
            stakeholderId = e.made_by_id;
          } else {
            coordId = e.made_by_id;
          }
        }
        const coord = coordId ? coordById.get(String(coordId)) : null;
        const stakeholder = stakeholderId ? stakeholderById.get(String(stakeholderId)) : null;

        // Resolve coordinator name from User model (coordById is already populated)
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
          MadeByCoordinatorID: coordId,
          MadeByStakeholderID: stakeholderId,
          province: provinceName,
          district: districtName,
          municipality: municipalityName,
          coordinator: {
            id: coordId || null,
            name: coordinatorName || null,
            district_number: coord ? (coord.district?.code || this.extractDistrictNumber(coord.district?.name) || null) : null,
            district_name: coord ? (coord.District_Name || null) : null
          },
          stakeholder: stakeholder ? ({
            id: stakeholder._id ? stakeholder._id.toString() : (stakeholder.userId || stakeholder.id),
            name: stakeholder.fullName || `${stakeholder.firstName || ''} ${stakeholder.lastName || ''}`.trim(),
            district_number: null // District info would need to come from UserLocation if needed
          }) : null,
          category: category.type,
          categoryData: category.data || null,
          Email: e.Email,
          Phone_Number: e.Phone_Number,
          raw: e
        };
      });

      return { success: true, events: mapped };

    } catch (error) {
      throw new Error(`Failed to get events batch: ${error.message}`);
    }
  }
}

module.exports = new EventDetailsService();

