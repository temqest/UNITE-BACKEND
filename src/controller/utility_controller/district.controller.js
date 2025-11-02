const districtService = require('../../services/utility_services/district.service');

/**
 * District Controller
 * Handles all HTTP requests related to district operations
 */
class DistrictController {
  /**
   * Create a new district
   * POST /api/districts
   */
  async createDistrict(req, res) {
    try {
      const districtData = req.body;
      
      const result = await districtService.createDistrict(districtData);

      return res.status(201).json({
        success: result.success,
        message: result.message,
        data: result.district
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create district'
      });
    }
  }

  /**
   * Get district by ID
   * GET /api/districts/:districtId
   */
  async getDistrictById(req, res) {
    try {
      const { districtId } = req.params;
      
      const result = await districtService.getDistrictById(districtId);

      return res.status(200).json({
        success: result.success,
        data: result.district
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'District not found'
      });
    }
  }

  /**
   * Get all districts with filtering and pagination
   * GET /api/districts
   */
  async getAllDistricts(req, res) {
    try {
      const filters = {
        region: req.query.region,
        city: req.query.city,
        search: req.query.search
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'District_Name',
        sortOrder: req.query.sortOrder || 'asc'
      };

      const result = await districtService.getAllDistricts(filters, options);

      return res.status(200).json({
        success: result.success,
        data: result.districts,
        pagination: result.pagination,
        filters: result.filters
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve districts'
      });
    }
  }

  /**
   * Get districts grouped by region
   * GET /api/districts/by-region
   */
  async getDistrictsByRegion(req, res) {
    try {
      const result = await districtService.getDistrictsByRegion();

      return res.status(200).json({
        success: result.success,
        data: result.districts,
        statistics: result.statistics
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve districts by region'
      });
    }
  }

  /**
   * Update district
   * PUT /api/districts/:districtId
   */
  async updateDistrict(req, res) {
    try {
      const { districtId } = req.params;
      const updateData = req.body;
      
      const result = await districtService.updateDistrict(districtId, updateData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.district
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update district'
      });
    }
  }

  /**
   * Delete district
   * DELETE /api/districts/:districtId
   */
  async deleteDistrict(req, res) {
    try {
      const { districtId } = req.params;
      
      const result = await districtService.deleteDistrict(districtId);

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete district'
      });
    }
  }

  /**
   * Search districts
   * GET /api/districts/search
   */
  async searchDistricts(req, res) {
    try {
      const searchTerm = req.query.q || req.query.search;
      
      if (!searchTerm) {
        return res.status(400).json({
          success: false,
          message: 'Search term is required'
        });
      }

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'District_Name',
        sortOrder: req.query.sortOrder || 'asc'
      };

      const result = await districtService.searchDistricts(searchTerm, options);

      return res.status(200).json({
        success: result.success,
        searchTerm: result.searchTerm,
        data: result.districts,
        pagination: result.pagination
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Search failed'
      });
    }
  }

  /**
   * Get district statistics
   * GET /api/districts/statistics
   */
  async getDistrictStatistics(req, res) {
    try {
      const result = await districtService.getDistrictStatistics();

      return res.status(200).json({
        success: result.success,
        data: result.statistics
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve district statistics'
      });
    }
  }

  /**
   * Check if district exists
   * GET /api/districts/:districtId/exists
   */
  async districtExists(req, res) {
    try {
      const { districtId } = req.params;
      
      const exists = await districtService.districtExists(districtId);

      return res.status(200).json({
        success: true,
        exists,
        districtId
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check district existence'
      });
    }
  }
}

module.exports = new DistrictController();

