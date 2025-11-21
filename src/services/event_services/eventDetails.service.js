const {
  Event,
  EventRequest,
  EventRequestHistory,
  BloodDrive,
  Advocacy,
  Training,
  EventStaff,
  Coordinator,
  Stakeholder,
  BloodbankStaff,
  SystemAdmin
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
      
      // Get admin information (if approved)
      let admin = null;
      if (event.ApprovedByAdminID) {
        const adminRecord = await SystemAdmin.findOne({ Admin_ID: event.ApprovedByAdminID });
        if (adminRecord) {
          const adminStaff = await BloodbankStaff.findOne({ ID: event.ApprovedByAdminID });
          if (adminStaff) {
            admin = {
              id: event.ApprovedByAdminID,
              name: `${adminStaff.First_Name} ${adminStaff.Last_Name}`,
              email: adminStaff.Email,
              access_level: adminRecord.AccessLevel
            };
          }
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
  async getEventCategory(eventId) {
    try {
      const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: eventId });
      if (bloodDrive) {
        return {
          type: 'BloodDrive',
          data: {
            Target_Donation: bloodDrive.Target_Donation,
            VenueType: bloodDrive.VenueType
          }
        };
      }

      const advocacy = await Advocacy.findOne({ Advocacy_ID: eventId });
      if (advocacy) {
        return {
          type: 'Advocacy',
          data: {
            Topic: advocacy.Topic,
            TargetAudience: advocacy.TargetAudience,
            ExpectedAudienceSize: advocacy.ExpectedAudienceSize,
            PartnerOrganization: advocacy.PartnerOrganization
          }
        };
      }

      const training = await Training.findOne({ Training_ID: eventId });
      if (training) {
        return {
          type: 'Training',
          data: {
            TrainingType: training.TrainingType,
            MaxParticipants: training.MaxParticipants
          }
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
      const coordinator = await Coordinator.findOne({ Coordinator_ID: coordinatorId })
        .populate('district', 'name') // Populate district name
        .populate('province', 'name'); // Also populate province if needed
      
      if (!coordinator) {
        return null;
      }

      const staff = await BloodbankStaff.findOne({ ID: coordinatorId });
      if (!staff) {
        return {
          id: coordinatorId,
          district: coordinator.district,
          province: coordinator.province
        };
      }

      return {
        id: coordinatorId,
        district: coordinator.district,
        province: coordinator.province,
        name: `${staff.First_Name} ${staff.Middle_Name || ''} ${staff.Last_Name}`.trim(),
        email: staff.Email,
        phone: staff.Phone_Number
      };

    } catch (error) {
      console.error('Error in getCoordinatorInfo:', error);
      return null;
    }
  }

  /**
   * Get stakeholder information
   * @param {string} stakeholderId 
   * @returns {Object} Stakeholder info
   */
  async getStakeholderInfo(stakeholderId) {
    try {
      if (!stakeholderId) {
        return null;
      }

      const stakeholder = await Stakeholder.findOne({ Stakeholder_ID: stakeholderId })
        .populate('district', 'name')
        .populate('province', 'name');
      
      if (!stakeholder) {
        return null;
      }

      const staff = await BloodbankStaff.findOne({ ID: stakeholderId });
      if (!staff) {
        return {
          id: stakeholderId,
          district: stakeholder.district,
          province: stakeholder.province
        };
      }

      return {
        id: stakeholderId,
        district: stakeholder.district,
        province: stakeholder.province,
        name: `${staff.First_Name} ${staff.Middle_Name || ''} ${staff.Last_Name}`.trim(),
        email: staff.Email,
        phone: staff.Phone_Number
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

      // Fetch minimal event fields for requested ids
      const events = await Event.find({ Event_ID: { $in: ids } })
        .select('Event_ID Event_Title Start_Date End_Date Location Status coordinator_id stakeholder_id made_by_id made_by_role stakeholder Email Phone_Number')
        .lean();

      // Collect unique coordinator and stakeholder ids to resolve names in batch
      const coordinatorIds = Array.from(new Set(events.map(e => e.coordinator_id || (e.made_by_role !== 'Stakeholder' ? e.made_by_id : null)).filter(Boolean)));
      const stakeholderIds = Array.from(new Set(events.map(e => e.stakeholder_id || e.stakeholder?.toString() || (e.made_by_role === 'Stakeholder' ? e.made_by_id : null)).filter(Boolean)));

      const [staffDocs, coordDocs, stakeholderDocs] = await Promise.all([
        // staff records may use ID
        coordinatorIds.length ? BloodbankStaff.find({ ID: { $in: coordinatorIds } }).select('ID First_Name Middle_Name Last_Name Email Phone_Number').lean() : Promise.resolve([]),
        coordinatorIds.length ? Coordinator.find({ Coordinator_ID: { $in: coordinatorIds } }).populate('district', 'name code').lean() : Promise.resolve([]),
        stakeholderIds.length ? Stakeholder.find({ Stakeholder_ID: { $in: stakeholderIds } }).select('Stakeholder_ID firstName lastName').populate('district', 'name code').lean() : Promise.resolve([])
      ]);

      const staffById = new Map();
      for (const s of staffDocs) staffById.set(String(s.ID), s);

      const coordById = new Map();
      for (const c of coordDocs) coordById.set(String(c.Coordinator_ID), c);

      const stakeholderById = new Map();
      for (const st of stakeholderDocs) stakeholderById.set(String(st.Stakeholder_ID), st);

      // Fetch categories in parallel to include category/type and categoryData
      const categories = await Promise.all(events.map(ev => this.getEventCategory(ev.Event_ID)));

      const mapped = events.map((e, idx) => {
        let coordId = e.coordinator_id;
        let stakeholderId = e.stakeholder_id || e.stakeholder?.toString();
        if (!coordId && !stakeholderId) {
          if (e.made_by_role === 'Stakeholder') {
            stakeholderId = e.made_by_id;
          } else {
            coordId = e.made_by_id;
          }
        }
        const staff = coordId ? staffById.get(String(coordId)) : null;
        const coord = coordId ? coordById.get(String(coordId)) : null;
        const stakeholder = stakeholderId ? stakeholderById.get(String(stakeholderId)) : null;

        const coordinatorName = staff
          ? `${staff.First_Name || ''} ${staff.Middle_Name || ''} ${staff.Last_Name || ''}`.trim()
          : (coord ? (coord.Name || coord.Coordinator_Name || null) : null);

        const category = categories[idx] || { type: 'Unknown', data: null };

        return {
          Event_ID: e.Event_ID,
          Event_Title: e.Event_Title,
          Location: e.Location,
          Start_Date: e.Start_Date,
          End_Date: e.End_Date,
          Status: e.Status,
          MadeByCoordinatorID: coordId,
          MadeByStakeholderID: stakeholderId,
          coordinator: {
            id: coordId || null,
            name: coordinatorName || null,
            district_number: coord ? (coord.district?.code || this.extractDistrictNumber(coord.district?.name) || null) : null,
            district_name: coord ? (coord.District_Name || null) : null
          },
          stakeholder: stakeholder ? ({
            id: stakeholder.Stakeholder_ID || stakeholder._id,
            name: `${stakeholder.firstName || ''} ${stakeholder.lastName || ''}`.trim(),
            district_number: stakeholder.district?.code || this.extractDistrictNumber(stakeholder.district?.name) || null
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

