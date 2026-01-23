const { BugReport, User } = require('../../models/index');
const notificationService = require('./notification.service');

class BugReportService {
  /**
   * Generate unique bug report ID
   * @returns {string} Unique report ID
   */
  generateReportID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `BUG_${timestamp}_${random}`;
  }

  /**
   * Create a new bug report
   * @param {Object} reportData 
   * @returns {Object} Created bug report
   */
  async createBugReport(reportData) {
    try {
      // Generate Report_ID if not provided
      if (!reportData.Report_ID) {
        reportData.Report_ID = this.generateReportID();
      }

      // Validate reporter exists
      const reporter = await User.findById(reportData.Reporter_ID);
      if (!reporter) {
        throw new Error('Reporter user not found');
      }

      // Set reporter name and email from user object
      reportData.Reporter_Name = reporter.fullName || `${reporter.firstName} ${reporter.lastName}`;
      reportData.Reporter_Email = reporter.email;

      const bugReport = new BugReport({
        Report_ID: reportData.Report_ID,
        Reporter_ID: reportData.Reporter_ID,
        Reporter_Name: reportData.Reporter_Name,
        Reporter_Email: reportData.Reporter_Email,
        Description: reportData.Description,
        Image_Keys: reportData.Image_Keys || [],
        Status: 'Open',
        Priority: reportData.Priority || 'Medium',
        User_Agent: reportData.User_Agent,
        Page_URL: reportData.Page_URL
      });

      const savedReport = await bugReport.save();

      // Notify System Admins (Authority 100)
      await this.notifySystemAdmins(savedReport);

      return {
        success: true,
        message: 'Bug report submitted successfully',
        bugReport: savedReport.toObject()
      };

    } catch (error) {
      throw new Error(`Failed to create bug report: ${error.message}`);
    }
  }

  /**
   * Notify System Admins about new bug report
   * @param {Object} bugReport - The created bug report
   */
  async notifySystemAdmins(bugReport) {
    try {
      // Find all System Admins (authority === 100 OR isSystemAdmin === true)
      const systemAdmins = await User.find({
        $or: [
          { authority: 100 },
          { isSystemAdmin: true }
        ],
        isActive: true
      }).select('_id firstName lastName email');

      if (!systemAdmins || systemAdmins.length === 0) {
        console.warn('[BUG REPORT SERVICE] No system admins found to notify');
        return;
      }

      // Create notification for each system admin
      const notificationPromises = systemAdmins.map(async (admin) => {
        const notificationData = {
          recipientUserId: admin._id,
          Title: '🐛 New Bug Report Submitted',
          Message: `${bugReport.Reporter_Name} reported a bug: "${bugReport.Description.substring(0, 100)}${bugReport.Description.length > 100 ? '...' : ''}"`,
          NotificationType: 'request.pending-review', // Reuse existing type or create new if needed
          IsRead: false,
          deliveryStatus: {
            inApp: true,
            email: false
          }
        };

        try {
          await notificationService.createNotification(notificationData);
        } catch (notifError) {
          console.error(`[BUG REPORT SERVICE] Failed to notify admin ${admin._id}:`, notifError.message);
        }
      });

      await Promise.all(notificationPromises);

      console.log(`[BUG REPORT SERVICE] Notified ${systemAdmins.length} system admin(s) about bug report ${bugReport.Report_ID}`);

    } catch (error) {
      console.error('[BUG REPORT SERVICE] Error notifying system admins:', error.message);
      // Don't throw - notification failure shouldn't fail bug report creation
    }
  }

  /**
   * Get all bug reports with filtering and pagination
   * @param {Object} filters 
   * @param {Object} options 
   * @returns {Object} List of bug reports
   */
  async getAllBugReports(filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;

      // Build query
      const query = {};

      if (filters.status) {
        query.Status = filters.status;
      }

      if (filters.priority) {
        query.Priority = filters.priority;
      }

      if (filters.reporterId) {
        query.Reporter_ID = filters.reporterId;
      }

      if (filters.assignedTo) {
        query.Assigned_To = filters.assignedTo;
      }

      if (filters.search) {
        query.$or = [
          { Description: { $regex: filters.search, $options: 'i' } },
          { Report_ID: { $regex: filters.search, $options: 'i' } },
          { Reporter_Name: { $regex: filters.search, $options: 'i' } }
        ];
      }

      // Date range filter
      if (filters.date_from || filters.date_to) {
        query.createdAt = {};
        if (filters.date_from) {
          query.createdAt.$gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          query.createdAt.$lte = new Date(filters.date_to);
        }
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const bugReports = await BugReport.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .populate('Reporter_ID', 'firstName lastName email authority')
        .populate('Assigned_To', 'firstName lastName email')
        .populate('Resolved_By', 'firstName lastName email');

      const total = await BugReport.countDocuments(query);

      return {
        success: true,
        bugReports: bugReports.map(report => report.toObject()),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters: filters
      };

    } catch (error) {
      throw new Error(`Failed to get bug reports: ${error.message}`);
    }
  }

  /**
   * Get bug report by ID
   * @param {string} reportId 
   * @returns {Object} Bug report data
   */
  async getBugReportById(reportId) {
    try {
      const bugReport = await BugReport.findOne({ Report_ID: reportId })
        .populate('Reporter_ID', 'firstName lastName email authority organizationType')
        .populate('Assigned_To', 'firstName lastName email')
        .populate('Resolved_By', 'firstName lastName email');

      if (!bugReport) {
        throw new Error('Bug report not found');
      }

      return {
        success: true,
        bugReport: bugReport.toObject()
      };

    } catch (error) {
      throw new Error(`Failed to get bug report: ${error.message}`);
    }
  }

  /**
   * Update bug report status
   * @param {string} reportId 
   * @param {Object} updateData 
   * @param {string} updatedBy - User ID of the updater
   * @returns {Object} Updated bug report
   */
  async updateBugReport(reportId, updateData, updatedBy) {
    try {
      const bugReport = await BugReport.findOne({ Report_ID: reportId });

      if (!bugReport) {
        throw new Error('Bug report not found');
      }

      // Update allowed fields
      if (updateData.Status) {
        bugReport.Status = updateData.Status;
        
        // If marking as resolved, set resolved metadata
        if (updateData.Status === 'Resolved' || updateData.Status === 'Closed') {
          bugReport.Resolved_At = new Date();
          bugReport.Resolved_By = updatedBy;
        }
      }

      if (updateData.Priority) {
        bugReport.Priority = updateData.Priority;
      }

      if (updateData.Admin_Notes !== undefined) {
        bugReport.Admin_Notes = updateData.Admin_Notes;
      }

      if (updateData.Assigned_To !== undefined) {
        bugReport.Assigned_To = updateData.Assigned_To || null;
      }

      const updatedReport = await bugReport.save();

      return {
        success: true,
        message: 'Bug report updated successfully',
        bugReport: updatedReport.toObject()
      };

    } catch (error) {
      throw new Error(`Failed to update bug report: ${error.message}`);
    }
  }

  /**
   * Delete bug report
   * @param {string} reportId 
   * @returns {Object} Success message
   */
  async deleteBugReport(reportId) {
    try {
      const bugReport = await BugReport.findOne({ Report_ID: reportId });

      if (!bugReport) {
        throw new Error('Bug report not found');
      }

      // Note: In production, you might want to also delete S3 images here
      // using s3.deleteObject() for each Image_Keys[].key

      await BugReport.deleteOne({ Report_ID: reportId });

      return {
        success: true,
        message: 'Bug report deleted successfully'
      };

    } catch (error) {
      throw new Error(`Failed to delete bug report: ${error.message}`);
    }
  }

  /**
   * Get bug report statistics
   * @returns {Object} Statistics summary
   */
  async getBugReportStatistics() {
    try {
      const total = await BugReport.countDocuments();
      const open = await BugReport.countDocuments({ Status: 'Open' });
      const inProgress = await BugReport.countDocuments({ Status: 'In Progress' });
      const resolved = await BugReport.countDocuments({ Status: 'Resolved' });
      const closed = await BugReport.countDocuments({ Status: 'Closed' });

      // Priority breakdown
      const criticalCount = await BugReport.countDocuments({ 
        Priority: 'Critical', 
        Status: { $in: ['Open', 'In Progress'] } 
      });
      const highCount = await BugReport.countDocuments({ 
        Priority: 'High', 
        Status: { $in: ['Open', 'In Progress'] } 
      });

      return {
        success: true,
        statistics: {
          total,
          byStatus: {
            open,
            inProgress,
            resolved,
            closed
          },
          activeCritical: criticalCount,
          activeHigh: highCount,
          activeTotal: open + inProgress
        }
      };

    } catch (error) {
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }
}

module.exports = new BugReportService();
