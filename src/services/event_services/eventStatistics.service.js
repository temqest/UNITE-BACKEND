const {
  Event,
  EventRequest,
  BloodDrive,
  Advocacy,
  Training,
  Coordinator
} = require('../../models/index');

class EventStatisticsService {
  /**
   * Get comprehensive event statistics
   * @param {Object} filters 
   * @returns {Object} Statistics
   */
  async getEventStatistics(filters = {}) {
    try {
      const dateFilter = {};
      if (filters.date_from || filters.date_to) {
        dateFilter.Start_Date = {};
        if (filters.date_from) {
          dateFilter.Start_Date.$gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          dateFilter.Start_Date.$lte = new Date(filters.date_to);
        }
      }

      // Total events
      const totalEvents = await Event.countDocuments(dateFilter);

      // Events by status
      const eventsByStatus = await this.getEventsByStatus(dateFilter);

      // Events by category
      const eventsByCategory = await this.getEventsByCategory(dateFilter);

      // Event request statistics
      const requestStats = await this.getRequestStatistics(filters);

      // Blood drive statistics
      const bloodDriveStats = await this.getBloodDriveStatistics(dateFilter);

      // Coordinator statistics
      const coordinatorStats = await this.getCoordinatorStatistics(dateFilter);

      // Timeline statistics (monthly breakdown)
      const timelineStats = await this.getTimelineStatistics(filters);

      return {
        success: true,
        statistics: {
          overview: {
            total_events: totalEvents,
            date_range: {
              from: filters.date_from || null,
              to: filters.date_to || null
            }
          },
          by_status: eventsByStatus,
          by_category: eventsByCategory,
          request_statistics: requestStats,
          blood_drive_statistics: bloodDriveStats,
          coordinator_statistics: coordinatorStats,
          timeline: timelineStats
        }
      };

    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }

  /**
   * Get events grouped by status
   * @param {Object} dateFilter 
   * @returns {Object} Status breakdown
   */
  async getEventsByStatus(dateFilter = {}) {
    try {
      const statuses = ['Pending', 'Approved', 'Rescheduled', 'Rejected', 'Completed'];
      const breakdown = {};

      for (const status of statuses) {
        const count = await Event.countDocuments({
          ...dateFilter,
          Status: status
        });
        breakdown[status] = count;
      }

      const total = Object.values(breakdown).reduce((sum, count) => sum + count, 0);

      return {
        breakdown,
        total,
        percentages: Object.keys(breakdown).reduce((acc, status) => {
          acc[status] = total > 0 ? Math.round((breakdown[status] / total) * 100) : 0;
          return acc;
        }, {})
      };

    } catch (error) {
      throw new Error(`Failed to get status breakdown: ${error.message}`);
    }
  }

  /**
   * Get events grouped by category
   * @param {Object} dateFilter 
   * @returns {Object} Category breakdown
   */
  async getEventsByCategory(dateFilter = {}) {
    try {
      const allEvents = await Event.find(dateFilter);
      
      const breakdown = {
        BloodDrive: 0,
        Advocacy: 0,
        Training: 0,
        Unknown: 0
      };

      for (const event of allEvents) {
        const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID });
        if (bloodDrive) {
          breakdown.BloodDrive++;
          continue;
        }

        const advocacy = await Advocacy.findOne({ Advocacy_ID: event.Event_ID });
        if (advocacy) {
          breakdown.Advocacy++;
          continue;
        }

        const training = await Training.findOne({ Training_ID: event.Event_ID });
        if (training) {
          breakdown.Training++;
          continue;
        }

        breakdown.Unknown++;
      }

      const total = Object.values(breakdown).reduce((sum, count) => sum + count, 0);

      return {
        breakdown,
        total,
        percentages: Object.keys(breakdown).reduce((acc, category) => {
          acc[category] = total > 0 ? Math.round((breakdown[category] / total) * 100) : 0;
          return acc;
        }, {})
      };

    } catch (error) {
      throw new Error(`Failed to get category breakdown: ${error.message}`);
    }
  }

  /**
   * Get request workflow statistics
   * @param {Object} filters 
   * @returns {Object} Request statistics
   */
  async getRequestStatistics(filters = {}) {
    try {
      const dateFilter = {};
      if (filters.date_from || filters.date_to) {
        dateFilter.createdAt = {};
        if (filters.date_from) {
          dateFilter.createdAt.$gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          dateFilter.createdAt.$lte = new Date(filters.date_to);
        }
      }

      const totalRequests = await EventRequest.countDocuments(dateFilter);
      const pendingRequests = await EventRequest.countDocuments({
        ...dateFilter,
        Status: 'Pending_Admin_Review'
      });
      const acceptedRequests = await EventRequest.countDocuments({
        ...dateFilter,
        Status: 'Accepted_By_Admin'
      });
      const rescheduledRequests = await EventRequest.countDocuments({
        ...dateFilter,
        Status: 'Rescheduled_By_Admin'
      });
      const rejectedRequests = await EventRequest.countDocuments({
        ...dateFilter,
        Status: { $in: ['Rejected_By_Admin', 'Rejected'] }
      });
      const completedRequests = await EventRequest.countDocuments({
        ...dateFilter,
        Status: 'Completed'
      });

      // Average time to admin action
      const requestsWithAdminAction = await EventRequest.find({
        ...dateFilter,
        AdminActionDate: { $exists: true }
      });

      let avgTimeToAdminAction = 0;
      if (requestsWithAdminAction.length > 0) {
        const totalDays = requestsWithAdminAction.reduce((sum, req) => {
          const days = Math.ceil(
            (req.AdminActionDate - req.createdAt) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0);
        avgTimeToAdminAction = Math.round(totalDays / requestsWithAdminAction.length);
      }

      // Average time to completion
      const completedReqs = await EventRequest.find({
        ...dateFilter,
        Status: 'Completed',
        CoordinatorFinalActionDate: { $exists: true }
      });

      let avgTimeToCompletion = 0;
      if (completedReqs.length > 0) {
        const totalDays = completedReqs.reduce((sum, req) => {
          const days = Math.ceil(
            (req.CoordinatorFinalActionDate - req.createdAt) / (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0);
        avgTimeToCompletion = Math.round(totalDays / completedReqs.length);
      }

      return {
        total_requests: totalRequests,
        pending: pendingRequests,
        accepted: acceptedRequests,
        rescheduled: rescheduledRequests,
        rejected: rejectedRequests,
        completed: completedRequests,
        completion_rate: totalRequests > 0 
          ? Math.round((completedRequests / totalRequests) * 100) 
          : 0,
        rejection_rate: totalRequests > 0 
          ? Math.round((rejectedRequests / totalRequests) * 100) 
          : 0,
        avg_time_to_admin_action_days: avgTimeToAdminAction,
        avg_time_to_completion_days: avgTimeToCompletion
      };

    } catch (error) {
      throw new Error(`Failed to get request statistics: ${error.message}`);
    }
  }

  /**
   * Get blood drive specific statistics
   * @param {Object} dateFilter 
   * @returns {Object} Blood drive stats
   */
  async getBloodDriveStatistics(dateFilter = {}) {
    try {
      const bloodDriveEvents = await Event.find({
        ...dateFilter,
        Status: { $in: ['Approved', 'Completed'] }
      });

      let totalTargetBags = 0;
      let totalBloodDrives = 0;

      for (const event of bloodDriveEvents) {
        const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID });
        if (bloodDrive) {
          totalTargetBags += bloodDrive.Target_Donation || 0;
          totalBloodDrives++;
        }
      }

      // Average bags per drive
      const avgBagsPerDrive = totalBloodDrives > 0 
        ? Math.round(totalTargetBags / totalBloodDrives) 
        : 0;

      // Venue type breakdown
      const venueTypes = {};
      for (const event of bloodDriveEvents) {
        const bloodDrive = await BloodDrive.findOne({ BloodDrive_ID: event.Event_ID });
        if (bloodDrive && bloodDrive.VenueType) {
          venueTypes[bloodDrive.VenueType] = (venueTypes[bloodDrive.VenueType] || 0) + 1;
        }
      }

      return {
        total_blood_drives: totalBloodDrives,
        total_target_bags: totalTargetBags,
        avg_bags_per_drive: avgBagsPerDrive,
        venue_type_breakdown: venueTypes
      };

    } catch (error) {
      throw new Error(`Failed to get blood drive statistics: ${error.message}`);
    }
  }

  /**
   * Get coordinator activity statistics
   * @param {Object} dateFilter 
   * @returns {Object} Coordinator stats
   */
  async getCoordinatorStatistics(dateFilter = {}) {
    try {
      const allCoordinators = await Coordinator.find();
      const coordinatorActivity = [];

      for (const coordinator of allCoordinators) {
        const eventCount = await Event.countDocuments({
          ...dateFilter,
          MadeByCoordinatorID: coordinator.Coordinator_ID
        });

        const completedCount = await Event.countDocuments({
          ...dateFilter,
          MadeByCoordinatorID: coordinator.Coordinator_ID,
          Status: 'Completed'
        });

        if (eventCount > 0) {
          coordinatorActivity.push({
            coordinator_id: coordinator.Coordinator_ID,
            district_id: coordinator.District_ID,
            total_events: eventCount,
            completed_events: completedCount,
            completion_rate: Math.round((completedCount / eventCount) * 100)
          });
        }
      }

      // Sort by total events (descending)
      coordinatorActivity.sort((a, b) => b.total_events - a.total_events);

      return {
        total_coordinators: allCoordinators.length,
        active_coordinators: coordinatorActivity.length,
        top_coordinators: coordinatorActivity.slice(0, 10),
        coordinator_activity: coordinatorActivity
      };

    } catch (error) {
      throw new Error(`Failed to get coordinator statistics: ${error.message}`);
    }
  }

  /**
   * Get timeline statistics (monthly breakdown)
   * @param {Object} filters 
   * @returns {Array} Monthly statistics
   */
  async getTimelineStatistics(filters = {}) {
    try {
      const startDate = filters.date_from 
        ? new Date(filters.date_from) 
        : new Date(new Date().setMonth(new Date().getMonth() - 11)); // Last 12 months
      
      const endDate = filters.date_to || new Date();

      // Generate monthly breakdown
      const monthlyData = [];
      const current = new Date(startDate);
      current.setDate(1); // Start of month

      while (current <= endDate) {
        const monthStart = new Date(current);
        const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);

        const monthEvents = await Event.countDocuments({
          Start_Date: {
            $gte: monthStart,
            $lte: monthEnd
          }
        });

        const monthCompleted = await Event.countDocuments({
          Start_Date: {
            $gte: monthStart,
            $lte: monthEnd
          },
          Status: 'Completed'
        });

        monthlyData.push({
          year: current.getFullYear(),
          month: current.getMonth() + 1,
          month_name: current.toLocaleString('default', { month: 'long' }),
          total_events: monthEvents,
          completed_events: monthCompleted,
          completion_rate: monthEvents > 0 
            ? Math.round((monthCompleted / monthEvents) * 100) 
            : 0
        });

        current.setMonth(current.getMonth() + 1);
      }

      return monthlyData;

    } catch (error) {
      throw new Error(`Failed to get timeline statistics: ${error.message}`);
    }
  }

  /**
   * Get dashboard summary statistics
   * @param {Object} filters 
   * @returns {Object} Dashboard stats
   */
  async getDashboardStatistics(filters = {}) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);

      // Today's events
      const todayEvents = await Event.countDocuments({
        Start_Date: {
          $gte: today,
          $lt: tomorrow
        },
        Status: { $in: ['Approved', 'Completed'] }
      });

      // This week's events
      const weekEvents = await Event.countDocuments({
        Start_Date: {
          $gte: today,
          $lte: nextWeek
        },
        Status: { $in: ['Approved', 'Completed'] }
      });

      // This month's events
      const monthEvents = await Event.countDocuments({
        Start_Date: {
          $gte: today,
          $lte: nextMonth
        },
        Status: { $in: ['Approved', 'Completed'] }
      });

      // Pending requests
      const pendingRequests = await EventRequest.countDocuments({
        Status: 'Pending_Admin_Review'
      });

      // Overall statistics
      const overallStats = await this.getEventStatistics(filters);

      return {
        success: true,
        dashboard: {
          today_events: todayEvents,
          week_events: weekEvents,
          month_events: monthEvents,
          pending_requests: pendingRequests,
          overall: overallStats.statistics
        }
      };

    } catch (error) {
      throw new Error(`Failed to get dashboard statistics: ${error.message}`);
    }
  }
}

module.exports = new EventStatisticsService();

