const bugReportService = require('../../services/utility_services/bugReport.service');

/**
 * BugReport Controller
 * Handles all HTTP requests related to bug report operations
 */
class BugReportController {
  /**
   * Create a new bug report
   * POST /api/utility/bug-reports
   */
  async createBugReport(req, res) {
    try {
      const userId = req.user && (req.user.id || req.user._id);
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User not authenticated'
        });
      }

      const { description, imageKeys, userAgent, pageUrl, priority } = req.body;

      if (!description || description.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Description is required'
        });
      }

      // Validate image keys if provided
      let validatedImageKeys = [];
      if (imageKeys && Array.isArray(imageKeys)) {
        validatedImageKeys = imageKeys.filter(img => 
          img && typeof img === 'object' && img.key && img.filename
        );
      }

      const reportData = {
        Reporter_ID: userId,
        Description: description,
        Image_Keys: validatedImageKeys,
        User_Agent: userAgent || req.headers['user-agent'],
        Page_URL: pageUrl,
        Priority: priority || 'Medium'
      };

      const result = await bugReportService.createBugReport(reportData);

      return res.status(201).json({
        success: result.success,
        message: result.message,
        data: result.bugReport
      });
    } catch (error) {
      console.error('[BUG REPORT CONTROLLER] Create error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create bug report'
      });
    }
  }

  /**
   * Get all bug reports with filtering and pagination
   * GET /api/utility/bug-reports
   */
  async getAllBugReports(req, res) {
    try {
      const filters = {
        status: req.query.status,
        priority: req.query.priority,
        reporterId: req.query.reporterId,
        assignedTo: req.query.assignedTo,
        search: req.query.search,
        date_from: req.query.date_from,
        date_to: req.query.date_to
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const result = await bugReportService.getAllBugReports(filters, options);

      return res.status(200).json({
        success: result.success,
        data: result.bugReports,
        pagination: result.pagination,
        filters: result.filters
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve bug reports'
      });
    }
  }

  /**
   * Get bug report by ID
   * GET /api/utility/bug-reports/:reportId
   */
  async getBugReportById(req, res) {
    try {
      const { reportId } = req.params;
      
      const result = await bugReportService.getBugReportById(reportId);

      return res.status(200).json({
        success: result.success,
        data: result.bugReport
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Bug report not found'
      });
    }
  }

  /**
   * Update bug report
   * PUT /api/utility/bug-reports/:reportId
   */
  async updateBugReport(req, res) {
    try {
      const { reportId } = req.params;
      const userId = req.user && (req.user.id || req.user._id);
      const updateData = req.body;
      
      const result = await bugReportService.updateBugReport(reportId, updateData, userId);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.bugReport
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update bug report'
      });
    }
  }

  /**
   * Delete bug report
   * DELETE /api/utility/bug-reports/:reportId
   */
  async deleteBugReport(req, res) {
    try {
      const { reportId } = req.params;
      
      const result = await bugReportService.deleteBugReport(reportId);

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete bug report'
      });
    }
  }

  /**
   * Get bug report statistics
   * GET /api/utility/bug-reports/statistics
   */
  async getBugReportStatistics(req, res) {
    try {
      const result = await bugReportService.getBugReportStatistics();

      return res.status(200).json({
        success: result.success,
        data: result.statistics
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get statistics'
      });
    }
  }
}

module.exports = new BugReportController();
