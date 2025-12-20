const coverageAreaService = require('../../services/utility_services/coverageArea.service');

/**
 * Coverage Area Controller
 * 
 * Handles HTTP requests for coverage area management.
 */
class CoverageAreaController {
  /**
   * Create a new coverage area
   * @route POST /api/coverage-areas
   */
  async createCoverageArea(req, res, next) {
    try {
      const data = req.validatedData || req.body;
      const coverageArea = await coverageAreaService.createCoverageArea(data);
      
      return res.status(201).json({
        success: true,
        data: coverageArea
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a coverage area by ID
   * @route GET /api/coverage-areas/:id
   */
  async getCoverageArea(req, res, next) {
    try {
      const { id } = req.params;
      const coverageArea = await coverageAreaService.getCoverageArea(id);
      
      return res.status(200).json({
        success: true,
        data: coverageArea
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List coverage areas
   * @route GET /api/coverage-areas
   */
  async listCoverageAreas(req, res, next) {
    try {
      const filters = {
        organizationId: req.query.organizationId,
        geographicUnitId: req.query.geographicUnitId,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        search: req.query.search,
        tags: req.query.tags ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags]) : undefined,
        limit: req.query.limit,
        skip: req.query.skip
      };
      
      const result = await coverageAreaService.listCoverageAreas(filters);
      
      return res.status(200).json({
        success: true,
        data: result.coverageAreas,
        pagination: {
          total: result.total,
          limit: result.limit,
          skip: result.skip
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a coverage area
   * @route PUT /api/coverage-areas/:id
   */
  async updateCoverageArea(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.validatedData || req.body;
      const coverageArea = await coverageAreaService.updateCoverageArea(id, data);
      
      return res.status(200).json({
        success: true,
        data: coverageArea
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a coverage area (soft delete)
   * @route DELETE /api/coverage-areas/:id
   */
  async deleteCoverageArea(req, res, next) {
    try {
      const { id } = req.params;
      const coverageArea = await coverageAreaService.deleteCoverageArea(id);
      
      return res.status(200).json({
        success: true,
        data: coverageArea,
        message: 'Coverage area deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all geographic units in a coverage area
   * @route GET /api/coverage-areas/:id/geographic-units
   */
  async getCoverageAreaGeographicUnits(req, res, next) {
    try {
      const { id } = req.params;
      const geographicUnits = await coverageAreaService.getCoverageAreaGeographicUnits(id);
      
      return res.status(200).json({
        success: true,
        data: geographicUnits
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all coverage areas containing a specific geographic unit
   * @route GET /api/geographic-units/:id/coverage-areas
   */
  async getCoverageAreasByGeographicUnit(req, res, next) {
    try {
      const { id } = req.params;
      const coverageAreas = await coverageAreaService.findCoverageAreasByGeographicUnit(id);
      
      return res.status(200).json({
        success: true,
        data: coverageAreas
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add a geographic unit to a coverage area
   * @route POST /api/coverage-areas/:id/geographic-units
   */
  async addGeographicUnit(req, res, next) {
    try {
      const { id } = req.params;
      const { geographicUnitId } = req.validatedData || req.body;
      
      if (!geographicUnitId) {
        return res.status(400).json({
          success: false,
          message: 'geographicUnitId is required'
        });
      }
      
      const coverageArea = await coverageAreaService.addGeographicUnit(id, geographicUnitId);
      
      return res.status(200).json({
        success: true,
        data: coverageArea
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove a geographic unit from a coverage area
   * @route DELETE /api/coverage-areas/:id/geographic-units/:geographicUnitId
   */
  async removeGeographicUnit(req, res, next) {
    try {
      const { id, geographicUnitId } = req.params;
      const coverageArea = await coverageAreaService.removeGeographicUnit(id, geographicUnitId);
      
      return res.status(200).json({
        success: true,
        data: coverageArea
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new CoverageAreaController();

