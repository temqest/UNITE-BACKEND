const organizationService = require('../../services/utility_services/organization.service');

/**
 * Organization Controller
 * 
 * Handles HTTP requests for organization management.
 */
class OrganizationController {
  /**
   * Create a new organization
   * @route POST /api/organizations
   */
  async createOrganization(req, res, next) {
    try {
      const data = req.validatedData || req.body;
      const organization = await organizationService.createOrganization(data);
      
      return res.status(201).json({
        success: true,
        data: organization
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get an organization by ID
   * @route GET /api/organizations/:id
   */
  async getOrganization(req, res, next) {
    try {
      const { id } = req.params;
      const organization = await organizationService.getOrganization(id);
      
      return res.status(200).json({
        success: true,
        data: organization
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List organizations
   * @route GET /api/organizations
   */
  async listOrganizations(req, res, next) {
    try {
      const filters = {
        type: req.query.type,
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        search: req.query.search,
        limit: req.query.limit,
        skip: req.query.skip
      };
      
      const result = await organizationService.listOrganizations(filters);
      
      return res.status(200).json({
        success: true,
        data: result.organizations,
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
   * Update an organization
   * @route PUT /api/organizations/:id
   */
  async updateOrganization(req, res, next) {
    try {
      const { id } = req.params;
      const data = req.validatedData || req.body;
      const organization = await organizationService.updateOrganization(id, data);
      
      return res.status(200).json({
        success: true,
        data: organization
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete an organization (soft delete)
   * @route DELETE /api/organizations/:id
   */
  async deleteOrganization(req, res, next) {
    try {
      const { id } = req.params;
      const organization = await organizationService.deleteOrganization(id);
      
      return res.status(200).json({
        success: true,
        data: organization,
        message: 'Organization deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all coverage areas for an organization
   * @route GET /api/organizations/:id/coverage-areas
   */
  async getOrganizationCoverageAreas(req, res, next) {
    try {
      const { id } = req.params;
      const coverageAreas = await organizationService.getOrganizationCoverageAreas(id);
      
      return res.status(200).json({
        success: true,
        data: coverageAreas
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new OrganizationController();

