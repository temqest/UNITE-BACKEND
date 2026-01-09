const userCoverageAssignmentService = require('../../services/users_services/userCoverageAssignment.service');

/**
 * User Coverage Assignment Controller
 * 
 * Handles HTTP requests for user coverage area assignments.
 */
class UserCoverageAssignmentController {
  /**
   * Assign a user to a coverage area
   * @route POST /api/users/:userId/coverage-areas
   */
  async assignUserToCoverageArea(req, res, next) {
    try {
      const { userId } = req.params;
      const { coverageAreaId, isPrimary, expiresAt } = req.validatedData || req.body;
      const assignedBy = req.user?.id || req.user?._id;
      
      if (!coverageAreaId) {
        return res.status(400).json({
          success: false,
          message: 'coverageAreaId is required'
        });
      }
      
      const assignment = await userCoverageAssignmentService.assignUserToCoverageArea(
        userId,
        coverageAreaId,
        {
          isPrimary: isPrimary || false,
          assignedBy,
          expiresAt: expiresAt ? new Date(expiresAt) : null
        }
      );
      
      return res.status(201).json({
        success: true,
        data: assignment
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all coverage areas assigned to a user
   * @route GET /api/users/:userId/coverage-areas
   */
  async getUserCoverageAreas(req, res, next) {
    try {
      const { userId } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      
      const assignments = await userCoverageAssignmentService.getUserCoverageAreas(userId, {
        includeInactive
      });
      
      return res.status(200).json({
        success: true,
        data: assignments
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get primary coverage area for a user
   * @route GET /api/users/:userId/coverage-areas/primary
   */
  async getPrimaryCoverageArea(req, res, next) {
    try {
      const { userId } = req.params;
      const assignment = await userCoverageAssignmentService.getPrimaryCoverageArea(userId);
      
      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'No primary coverage area found for this user'
        });
      }
      
      return res.status(200).json({
        success: true,
        data: assignment
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all geographic units a user can access via coverage areas
   * @route GET /api/users/:userId/coverage-areas/geographic-units
   */
  async getUserAccessibleGeographicUnits(req, res, next) {
    try {
      const { userId } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      
      const geographicUnits = await userCoverageAssignmentService.getUserAccessibleGeographicUnits(userId, {
        includeInactive,
        deduplicate: true
      });
      
      return res.status(200).json({
        success: true,
        data: geographicUnits
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoke a user's coverage area assignment
   * @route DELETE /api/users/:userId/coverage-areas/:coverageAreaId
   */
  async revokeUserCoverageAssignment(req, res, next) {
    try {
      const { userId, coverageAreaId } = req.params;
      await userCoverageAssignmentService.revokeUserCoverageAssignment(userId, coverageAreaId);
      
      return res.status(200).json({
        success: true,
        message: 'Coverage area assignment revoked successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all users assigned to a coverage area
   * @route GET /api/coverage-areas/:coverageAreaId/users
   */
  async getUsersInCoverageArea(req, res, next) {
    try {
      const { coverageAreaId } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      
      const assignments = await userCoverageAssignmentService.getUsersInCoverageArea(coverageAreaId, {
        includeInactive
      });
      
      return res.status(200).json({
        success: true,
        data: assignments
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserCoverageAssignmentController();

