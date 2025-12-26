const {
  Event,
  EventRequest,
  BloodDrive,
  Advocacy,
  Training,
  Coordinator
} = require('../../models/index');
// Use new constants instead of legacy helpers
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');
// Create REQUEST_STATUSES object for backward compatibility with existing code
const REQUEST_STATUSES = {
  PENDING_REVIEW: REQUEST_STATES.PENDING_REVIEW,
  REVIEW_ACCEPTED: REQUEST_STATES.REVIEW_ACCEPTED,
  REVIEW_REJECTED: REQUEST_STATES.REVIEW_REJECTED,
  REVIEW_RESCHEDULED: REQUEST_STATES.REVIEW_RESCHEDULED,
  APPROVED: REQUEST_STATES.APPROVED,
  REJECTED: REQUEST_STATES.REJECTED,
  COMPLETED: REQUEST_STATES.COMPLETED,
  CANCELLED: REQUEST_STATES.CANCELLED
};
const cache = require('../../utils/cache');

class EventStatisticsService {
  /**
   * Get comprehensive event statistics
   * @param {Object} filters 
   * @returns {Object} Statistics
   */
  async getEventStatistics(filters = {}) {
    try {
      const cacheKey = `eventStats_${JSON.stringify(filters)}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

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

      const result = {
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

      cache.set(cacheKey, result);
      return result;

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
      const pipeline = [
        { $match: dateFilter },
        {
          $lookup: {
            from: 'blooddrives',
            localField: 'Event_ID',
            foreignField: 'BloodDrive_ID',
            as: 'bloodDrive'
          }
        },
        {
          $lookup: {
            from: 'advocacies',
            localField: 'Event_ID',
            foreignField: 'Advocacy_ID',
            as: 'advocacy'
          }
        },
        {
          $lookup: {
            from: 'trainings',
            localField: 'Event_ID',
            foreignField: 'Training_ID',
            as: 'training'
          }
        },
        {
          $addFields: {
            category: {
              $switch: {
                branches: [
                  { case: { $gt: [{ $size: '$bloodDrive' }, 0] }, then: 'BloodDrive' },
                  { case: { $gt: [{ $size: '$advocacy' }, 0] }, then: 'Advocacy' },
                  { case: { $gt: [{ $size: '$training' }, 0] }, then: 'Training' }
                ],
                default: 'Unknown'
              }
            }
          }
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 }
          }
        }
      ];

      const results = await Event.aggregate(pipeline);

      const breakdown = {
        BloodDrive: 0,
        Advocacy: 0,
        Training: 0,
        Unknown: 0
      };

      results.forEach(result => {
        breakdown[result._id] = result.count;
      });

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
        Status: REQUEST_STATUSES.COMPLETED
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
        Status: REQUEST_STATUSES.COMPLETED,
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
      const pipeline = [
        {
          $match: {
            ...dateFilter,
            Status: { $in: ['Approved', 'Completed'] }
          }
        },
        {
          $lookup: {
            from: 'blooddrives',
            localField: 'Event_ID',
            foreignField: 'BloodDrive_ID',
            as: 'bloodDrive'
          }
        },
        { $unwind: '$bloodDrive' },
        {
          $group: {
            _id: null,
            totalBloodDrives: { $sum: 1 },
            totalTargetBags: { $sum: '$bloodDrive.Target_Donation' },
            venueTypes: {
              $push: '$bloodDrive.VenueType'
            }
          }
        }
      ];

      const result = await Event.aggregate(pipeline);

      if (result.length === 0) {
        return {
          total_blood_drives: 0,
          total_target_bags: 0,
          avg_bags_per_drive: 0,
          venue_type_breakdown: {}
        };
      }

      const { totalBloodDrives, totalTargetBags, venueTypes } = result[0];

      const avgBagsPerDrive = totalBloodDrives > 0 
        ? Math.round(totalTargetBags / totalBloodDrives) 
        : 0;

      const venueTypeBreakdown = {};
      venueTypes.forEach(venue => {
        if (venue) {
          venueTypeBreakdown[venue] = (venueTypeBreakdown[venue] || 0) + 1;
        }
      });

      return {
        total_blood_drives: totalBloodDrives,
        total_target_bags: totalTargetBags,
        avg_bags_per_drive: avgBagsPerDrive,
        venue_type_breakdown: venueTypeBreakdown
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
      const pipeline = [
        {
          $lookup: {
            from: 'events',
            let: { coordId: '$Coordinator_ID' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$MadeByCoordinatorID', '$$coordId'] },
                  ...dateFilter
                }
              }
            ],
            as: 'events'
          }
        },
        {
          $addFields: {
            total_events: { $size: '$events' },
            completed_events: {
              $size: {
                $filter: {
                  input: '$events',
                  cond: { $eq: ['$$this.Status', 'Completed'] }
                }
              }
            }
          }
        },
        {
          $match: { total_events: { $gt: 0 } }
        },
        {
          $addFields: {
            completion_rate: {
              $round: {
                $multiply: [
                  { $divide: ['$completed_events', '$total_events'] },
                  100
                ]
              }
            }
          }
        },
        {
          $sort: { total_events: -1 }
        },
        {
          $project: {
            coordinator_id: '$Coordinator_ID',
            district_id: '$District_ID',
            total_events: 1,
            completed_events: 1,
            completion_rate: 1
          }
        }
      ];

      // Use User model with coordinator role instead
      const { Role, UserRole } = require('../../models');
      const coordinatorRole = await Role.findOne({ code: 'coordinator' });
      if (!coordinatorRole) {
        return { coordinators: [], total_coordinators: 0 };
      }
      const coordinatorUserIds = (await UserRole.find({ roleId: coordinatorRole._id })).map(ur => ur.userId);
      // Note: This aggregation would need to be rewritten to work with User model
      // For now, return empty result - this functionality should be reimplemented
      const coordinatorActivity = [];

      return {
        total_coordinators: coordinatorUserIds.length,
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

      const pipeline = [
        {
          $match: {
            Start_Date: {
              $gte: startDate,
              $lte: endDate
            }
          }
        },
        {
          $addFields: {
            year: { $year: '$Start_Date' },
            month: { $month: '$Start_Date' }
          }
        },
        {
          $group: {
            _id: { year: '$year', month: '$month' },
            total_events: { $sum: 1 },
            completed_events: {
              $sum: { $cond: [{ $eq: ['$Status', 'Completed'] }, 1, 0] }
            }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        },
        {
          $project: {
            year: '$_id.year',
            month: '$_id.month',
            month_name: {
              $arrayElemAt: [
                ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                 'July', 'August', 'September', 'October', 'November', 'December'],
                '$_id.month'
              ]
            },
            total_events: 1,
            completed_events: 1,
            completion_rate: {
              $round: {
                $multiply: [
                  { $divide: ['$completed_events', '$total_events'] },
                  100
                ]
              }
            }
          }
        }
      ];

      const monthlyData = await Event.aggregate(pipeline);

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

