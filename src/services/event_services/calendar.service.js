const {
  Event,
  EventRequest,
  BloodDrive,
  Advocacy,
  Training,
  EventStaff,
  Coordinator,
  BloodbankStaff,
  District,
  Stakeholder
} = require('../../models/index');

class CalendarService {
  /**
   * Get calendar color for event category
   * @param {string} category 
   * @returns {string} Hex color code
   */
  getCategoryColor(category) {
    const colors = {
      BloodDrive: '#DC2626', // Red
      Advocacy: '#2563EB',   // Blue
      Training: '#059669'     // Green
    };
    return colors[category] || '#6B7280'; // Gray default
  }

  /**
   * Get month view - all events in a month
   * @param {number} year 
   * @param {number} month (1-12)
   * @param {Object} filters 
   * @returns {Object} Month calendar data
   */
  async getMonthView(year, month, filters = {}) {
    try {
      // Calculate month boundaries
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      // Build query
      const query = {
        Start_Date: {
          $gte: startDate,
          $lte: endDate
        },
        Status: filters.status || { $in: ['Approved', 'Completed'] }
      };

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      if (filters.category) {
        // We'll filter by category after fetching
      }

      // Get events with location population
      const events = await Event.find(query)
        .populate('province', 'name code')
        .populate('district', 'name code province')
        .populate('municipality', 'name code district province')
        .sort({ Start_Date: 1 });

      // Enrich events with category and color
      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const category = await this.getEventCategory(event.Event_ID);
          // resolve coordinator/staff info and district
          let coordinator = null;
          try {
            const coordDoc = await Coordinator.findOne({ Coordinator_ID: event.MadeByCoordinatorID }).catch(() => null);
            const staff = coordDoc ? await BloodbankStaff.findOne({ ID: event.MadeByCoordinatorID }).catch(() => null) : null;
            let district = null;
            try {
              if (coordDoc && coordDoc.District_ID) {
                district = await District.findOne({ District_ID: coordDoc.District_ID }).catch(() => null);
              }
            } catch (e) {
              district = null;
            }

            coordinator = staff ? {
              id: event.MadeByCoordinatorID,
              name: `${staff.First_Name || ''} ${staff.Last_Name || ''}`.trim(),
              district_number: district ? district.District_Number : (coordDoc ? coordDoc.District_Number : null),
              district_name: district ? district.District_Name : (coordDoc ? coordDoc.District_Name : null)
            } : (coordDoc ? { id: event.MadeByCoordinatorID, name: coordDoc.Name || '', district_number: coordDoc.District_Number, district_name: coordDoc.District_Name } : null);
          } catch (e) {
            coordinator = null;
          }

          // attempt to resolve any attached stakeholder
          let stakeholderInfo = null;
          try {
            const stakeholderDoc = event.stakeholder ? await Stakeholder.findById(event.stakeholder).catch(() => null) : (event.MadeByStakeholderID ? await Stakeholder.findOne({ Stakeholder_ID: event.MadeByStakeholderID }).catch(() => null) : null);
            if (stakeholderDoc) {
              stakeholderInfo = {
                id: stakeholderDoc.Stakeholder_ID || stakeholderDoc._id,
                name: `${stakeholderDoc.firstName || stakeholderDoc.First_Name || ''} ${stakeholderDoc.lastName || stakeholderDoc.Last_Name || ''}`.trim()
              };
            }
          } catch (e) {
            stakeholderInfo = null;
          }

          // Extract location names from populated refs
          const provinceName = event.province?.name || (typeof event.province === 'object' && event.province?.name) || null;
          const districtName = event.district?.name || (typeof event.district === 'object' && event.district?.name) || null;
          const municipalityName = event.municipality?.name || (typeof event.municipality === 'object' && event.municipality?.name) || null;

          return {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Location: event.Location,
            Start_Date: event.Start_Date,
            End_Date: event.End_Date || null,
            Status: event.Status,
            category: category.type,
            categoryData: category.data || null,
            color: this.getCategoryColor(category.type),
            province: provinceName,
            district: districtName,
            municipality: municipalityName,
            coordinator: coordinator,
            stakeholder: stakeholderInfo
          };
        })
      );

      // Filter by category if specified
      const filteredEvents = filters.category
        ? enrichedEvents.filter(e => e.category === filters.category)
        : enrichedEvents;

      // Group events by date
      const eventsByDate = {};
      filteredEvents.forEach(event => {
        const dateKey = event.Start_Date.toISOString().split('T')[0];
        if (!eventsByDate[dateKey]) {
          eventsByDate[dateKey] = [];
        }
        eventsByDate[dateKey].push(event);
      });

      return {
        success: true,
        month: {
          year,
          month,
          startDate,
          endDate,
          events: filteredEvents,
          eventsByDate,
          totalEvents: filteredEvents.length,
          stats: {
            byCategory: this.groupByCategory(filteredEvents),
            byStatus: this.groupByStatus(filteredEvents)
          }
        }
      };

    } catch (error) {
      throw new Error(`Failed to get month view: ${error.message}`);
    }
  }

  /**
   * Get week view - all events in a week
   * @param {Date} weekStartDate 
   * @param {Object} filters 
   * @returns {Object} Week calendar data
   */
  async getWeekView(weekStartDate, filters = {}) {
    try {
      const startOfWeek = new Date(weekStartDate);
      startOfWeek.setHours(0, 0, 0, 0);
      
      // Get Monday of the week
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(startOfWeek.setDate(diff));
      
      const endOfWeek = new Date(monday);
      endOfWeek.setDate(endOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      const query = {
        Start_Date: {
          $gte: monday,
          $lte: endOfWeek
        },
        Status: filters.status || { $in: ['Approved', 'Completed'] }
      };

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      const events = await Event.find(query)
        .populate('province', 'name code')
        .populate('district', 'name code province')
        .populate('municipality', 'name code district province')
        .sort({ Start_Date: 1 });

        const enrichedEvents = await Promise.all(
          events.map(async (event) => {
            const category = await this.getEventCategory(event.Event_ID);
            // resolve coordinator/staff info and district
            let coordinator = null;
            try {
              const coordDoc = await Coordinator.findOne({ Coordinator_ID: event.MadeByCoordinatorID }).catch(() => null);
              const staff = coordDoc ? await BloodbankStaff.findOne({ ID: event.MadeByCoordinatorID }).catch(() => null) : null;
              let district = null;
              try {
                if (coordDoc && coordDoc.District_ID) {
                  district = await District.findOne({ District_ID: coordDoc.District_ID }).catch(() => null);
                }
              } catch (e) {
                district = null;
              }

              coordinator = staff ? {
                id: event.MadeByCoordinatorID,
                name: `${staff.First_Name || ''} ${staff.Last_Name || ''}`.trim(),
                district_number: district ? district.District_Number : (coordDoc ? coordDoc.District_Number : null),
                district_name: district ? district.District_Name : (coordDoc ? coordDoc.District_Name : null)
              } : (coordDoc ? { id: event.MadeByCoordinatorID, name: coordDoc.Name || '', district_number: coordDoc.District_Number, district_name: coordDoc.District_Name } : null);
            } catch (e) {
              coordinator = null;
            }

            // Extract location names from populated refs
            const provinceName = event.province?.name || (typeof event.province === 'object' && event.province?.name) || null;
            const districtName = event.district?.name || (typeof event.district === 'object' && event.district?.name) || null;
            const municipalityName = event.municipality?.name || (typeof event.municipality === 'object' && event.municipality?.name) || null;

            return {
              Event_ID: event.Event_ID,
              Event_Title: event.Event_Title,
              Location: event.Location,
              Start_Date: event.Start_Date,
              End_Date: event.End_Date || null,
              Status: event.Status,
              category: category.type,
              categoryData: category.data || null,
              color: this.getCategoryColor(category.type),
              province: provinceName,
              district: districtName,
              municipality: municipalityName,
              coordinator: coordinator
            };
          })
        );

      // Group by day of week
      const weekDays = {};
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        weekDays[dateKey] = enrichedEvents.filter(e => {
          const eventDate = new Date(e.Start_Date).toISOString().split('T')[0];
          return eventDate === dateKey;
        });
      }

      return {
        success: true,
        week: {
          startDate: monday,
          endDate: endOfWeek,
          events: enrichedEvents,
          weekDays,
          totalEvents: enrichedEvents.length,
          stats: {
            byCategory: this.groupByCategory(enrichedEvents),
            byStatus: this.groupByStatus(enrichedEvents)
          }
        }
      };

    } catch (error) {
      throw new Error(`Failed to get week view: ${error.message}`);
    }
  }

  /**
   * Get day view - all events on a specific day
   * @param {Date} date 
   * @param {Object} filters 
   * @returns {Object} Day calendar data
   */
  async getDayView(date, filters = {}) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const query = {
        Start_Date: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        Status: filters.status || { $in: ['Approved', 'Completed'] }
      };

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      const events = await Event.find(query)
        .populate('province', 'name code')
        .populate('district', 'name code province')
        .populate('municipality', 'name code district province')
        .sort({ Start_Date: 1 });

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const category = await this.getEventCategory(event.Event_ID);
          const coordinator = await Coordinator.findOne({ Coordinator_ID: event.MadeByCoordinatorID });
          const staff = coordinator ? await BloodbankStaff.findOne({ ID: event.MadeByCoordinatorID }) : null;
          
          // Extract location names from populated refs
          const provinceName = event.province?.name || (typeof event.province === 'object' && event.province?.name) || null;
          const districtName = event.district?.name || (typeof event.district === 'object' && event.district?.name) || null;
          const municipalityName = event.municipality?.name || (typeof event.municipality === 'object' && event.municipality?.name) || null;

          return {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Location: event.Location,
            Start_Date: event.Start_Date,
            End_Date: event.End_Date || null,
            Status: event.Status,
            category: category.type,
            color: this.getCategoryColor(category.type),
            province: provinceName,
            district: districtName,
            municipality: municipalityName,
            coordinator: staff ? {
              id: event.MadeByCoordinatorID,
              name: `${staff.First_Name} ${staff.Last_Name}`
            } : null,
            categoryData: category.data
          };
        })
      );

      return {
        success: true,
        day: {
          date: startOfDay,
          events: enrichedEvents,
          totalEvents: enrichedEvents.length,
          stats: {
            byCategory: this.groupByCategory(enrichedEvents),
            byStatus: this.groupByStatus(enrichedEvents),
            byTime: this.groupByTime(enrichedEvents)
          }
        }
      };

    } catch (error) {
      throw new Error(`Failed to get day view: ${error.message}`);
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
   * Helper: Group events by category
   * @param {Array} events 
   * @returns {Object} Grouped events
   */
  groupByCategory(events) {
    const grouped = {};
    events.forEach(event => {
      const cat = event.category || 'Unknown';
      grouped[cat] = (grouped[cat] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Helper: Group events by status
   * @param {Array} events 
   * @returns {Object} Grouped events
   */
  groupByStatus(events) {
    const grouped = {};
    events.forEach(event => {
      const status = event.Status || 'Unknown';
      grouped[status] = (grouped[status] || 0) + 1;
    });
    return grouped;
  }

  /**
   * Helper: Group events by time (for day view)
   * @param {Array} events 
   * @returns {Object} Grouped events
   */
  groupByTime(events) {
    const grouped = {
      morning: [], // 6 AM - 12 PM
      afternoon: [], // 12 PM - 6 PM
      evening: [], // 6 PM - 12 AM
      night: [] // 12 AM - 6 AM
    };

    events.forEach(event => {
      const hour = new Date(event.Start_Date).getHours();
      if (hour >= 6 && hour < 12) {
        grouped.morning.push(event);
      } else if (hour >= 12 && hour < 18) {
        grouped.afternoon.push(event);
      } else if (hour >= 18 && hour < 24) {
        grouped.evening.push(event);
      } else {
        grouped.night.push(event);
      }
    });

    return grouped;
  }

  /**
   * Get upcoming events count for a date range
   * @param {Date} startDate 
   * @param {Date} endDate 
   * @param {Object} filters 
   * @returns {Object} Upcoming events summary
   */
  async getUpcomingEventsSummary(startDate, endDate, filters = {}) {
    try {
      const query = {
        Start_Date: {
          $gte: startDate,
          $lte: endDate
        },
        Status: { $in: ['Approved', 'Completed'] }
      };

      if (filters.coordinator_id) {
        query.MadeByCoordinatorID = filters.coordinator_id;
      }

      const events = await Event.find(query).sort({ Start_Date: 1 });

      const enrichedEvents = await Promise.all(
        events.map(async (event) => {
          const category = await this.getEventCategory(event.Event_ID);
          return {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Start_Date: event.Start_Date,
            category: category.type,
            color: this.getCategoryColor(category.type)
          };
        })
      );

      return {
        success: true,
        summary: {
          startDate,
          endDate,
          totalEvents: enrichedEvents.length,
          events: enrichedEvents,
          byCategory: this.groupByCategory(enrichedEvents),
          nextEvent: enrichedEvents.length > 0 ? enrichedEvents[0] : null
        }
      };

    } catch (error) {
      throw new Error(`Failed to get upcoming events: ${error.message}`);
    }
  }
}

module.exports = new CalendarService();

