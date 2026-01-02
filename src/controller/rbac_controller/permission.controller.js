const Permission = require('../../models/users_models/permission.model');
const permissionService = require('../../services/users_services/permission.service');

class PermissionController {
  /**
   * Get all permissions
   * GET /api/rbac/permissions
   */
  async getAllPermissions(req, res) {
    try {
      const { type, resource } = req.query;
      const query = {};
      
      if (type) {
        query.type = type;
      }
      if (resource) {
        query.resource = resource;
      }

      const permissions = await Permission.find(query).sort({ resource: 1, action: 1 });
      
      return res.status(200).json({
        success: true,
        data: permissions
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get permissions'
      });
    }
  }

  /**
   * Get permission by ID
   * GET /api/rbac/permissions/:id
   */
  async getPermissionById(req, res) {
    try {
      const { id } = req.params;
      const permission = await Permission.findById(id);
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: permission
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get permission'
      });
    }
  }

  /**
   * Create a new permission
   * POST /api/rbac/permissions
   */
  async createPermission(req, res) {
    try {
      const permissionData = req.body;
      
      // Validate required fields
      if (!permissionData.code || !permissionData.name || !permissionData.resource || !permissionData.action) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: code, name, resource, action'
        });
      }

      // Check if permission already exists
      const existing = await Permission.findOne({ code: permissionData.code.toLowerCase() });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'Permission with this code already exists'
        });
      }

      const permission = new Permission({
        code: permissionData.code.toLowerCase(),
        name: permissionData.name,
        resource: permissionData.resource,
        action: permissionData.action,
        description: permissionData.description || '',
        type: permissionData.type || 'resource',
        metadata: permissionData.metadata || {}
      });

      await permission.save();

      return res.status(201).json({
        success: true,
        message: 'Permission created successfully',
        data: permission
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create permission'
      });
    }
  }

  /**
   * Update a permission
   * PUT /api/rbac/permissions/:id
   */
  async updatePermission(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const permission = await Permission.findById(id);
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      // Update fields
      if (updateData.name) permission.name = updateData.name;
      if (updateData.description !== undefined) permission.description = updateData.description;
      if (updateData.type) permission.type = updateData.type;
      if (updateData.metadata) permission.metadata = { ...permission.metadata, ...updateData.metadata };

      await permission.save();

      return res.status(200).json({
        success: true,
        message: 'Permission updated successfully',
        data: permission
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update permission'
      });
    }
  }

  /**
   * Delete a permission
   * DELETE /api/rbac/permissions/:id
   */
  async deletePermission(req, res) {
    try {
      const { id } = req.params;
      const permission = await Permission.findById(id);
      
      if (!permission) {
        return res.status(404).json({
          success: false,
          message: 'Permission not found'
        });
      }

      await permission.deleteOne();

      return res.status(200).json({
        success: true,
        message: 'Permission deleted successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete permission'
      });
    }
  }

  /**
   * Get user's accessible pages
   * GET /api/rbac/permissions/user/:userId/pages
   */
  async getUserPages(req, res) {
    try {
      const { userId } = req.params;
      const locationId = req.query.locationId || null;

      const pages = await permissionService.getAccessiblePages(userId, { locationId });

      return res.status(200).json({
        success: true,
        data: pages
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user pages'
      });
    }
  }

  /**
   * Get user's available features
   * GET /api/rbac/permissions/user/:userId/features
   */
  async getUserFeatures(req, res) {
    try {
      const { userId } = req.params;
      const locationId = req.query.locationId || null;

      const features = await permissionService.getAvailableFeatures(userId, { locationId });

      return res.status(200).json({
        success: true,
        data: features
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user features'
      });
    }
  }

  /**
   * Get user's allowed staff types for an action
   * GET /api/rbac/permissions/user/:userId/staff-types/:action
   */
  async getAllowedStaffTypes(req, res) {
    try {
      const { userId, action } = req.params;
      const locationId = req.query.locationId || null;

      const allowedTypes = await permissionService.getAllowedStaffTypes(userId, action, { locationId });

      return res.status(200).json({
        success: true,
        data: allowedTypes
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get allowed staff types'
      });
    }
  }

  /**
   * Check if user has a specific permission
   * POST /api/rbac/permissions/check
   */
  async checkPermission(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { resource, action, locationId } = req.validatedData || req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const hasPermission = await permissionService.checkPermission(
        userId,
        resource,
        action,
        { locationId: locationId || null }
      );

      return res.status(200).json({
        success: true,
        hasPermission,
        resource,
        action
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check permission'
      });
    }
  }

  /**
   * Get user's authority level
   * GET /api/rbac/authority/user/:userId
   */
  async getUserAuthority(req, res) {
    try {
      const { userId } = req.params;
      const locationId = req.query.locationId || null;
      const context = locationId ? { locationId } : {};

      const authorityService = require('../../services/users_services/authority.service');
      const authority = await authorityService.calculateUserAuthority(userId, context);
      
      // Helper to get tier name
      const getTierName = (auth) => {
        if (auth >= 100) return 'SYSTEM_ADMIN';
        if (auth >= 80) return 'OPERATIONAL_ADMIN';
        if (auth >= 60) return 'COORDINATOR';
        if (auth >= 40) return 'STAKEHOLDER';
        return 'BASIC_USER';
      };
      const tierName = getTierName(authority);

      return res.status(200).json({
        success: true,
        data: {
          userId,
          authority,
          tierName
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user authority'
      });
    }
  }

  /**
   * Get role's authority level
   * GET /api/rbac/authority/role/:roleId
   */
  async getRoleAuthority(req, res) {
    try {
      const { roleId } = req.params;

      const authorityService = require('../../services/users_services/authority.service');
      const authority = await authorityService.calculateRoleAuthority(roleId);
      
      // Helper to get tier name
      const getTierName = (auth) => {
        if (auth >= 100) return 'SYSTEM_ADMIN';
        if (auth >= 80) return 'OPERATIONAL_ADMIN';
        if (auth >= 60) return 'COORDINATOR';
        if (auth >= 40) return 'STAKEHOLDER';
        return 'BASIC_USER';
      };
      const tierName = getTierName(authority);

      return res.status(200).json({
        success: true,
        data: {
          roleId,
          authority,
          tierName
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get role authority'
      });
    }
  }

  /**
   * Get assignable roles for current user
   * GET /api/rbac/authority/assignable-roles
   */
  async getAssignableRoles(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const locationId = req.query.locationId || null;
      const { capability, context: pageContext } = req.query;
      const context = locationId ? { locationId } : {};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const authorityService = require('../../services/users_services/authority.service');
      const AuthorityService = authorityService.AuthorityService || authorityService.constructor;
      const { Role } = require('../../models/index');
      
      // Helper to get tier name
      const getTierName = (auth) => {
        if (auth >= 100) return 'SYSTEM_ADMIN';
        if (auth >= 80) return 'OPERATIONAL_ADMIN';
        if (auth >= 60) return 'COORDINATOR';
        if (auth >= 40) return 'STAKEHOLDER';
        return 'BASIC_USER';
      };
      
      // Get all roles
      const allRoles = await Role.find().sort({ name: 1 });
      
      // Get user's authority
      const userAuthority = await authorityService.calculateUserAuthority(userId, context);
      
      // Filter roles that user can assign (user authority > role authority)
      let assignableRoles = [];
      const filteredOutByAuthority = [];
      
      for (const role of allRoles) {
        const roleAuthority = await authorityService.calculateRoleAuthority(role._id);
        
        // Log why roles are filtered out
        if (userAuthority <= roleAuthority) {
          filteredOutByAuthority.push({
            code: role.code,
            name: role.name,
            roleAuthority,
            userAuthority,
            reason: userAuthority === roleAuthority ? 'equal authority' : 'user authority too low'
          });
          continue;
        }
        
        // Get role capabilities
        let capabilities = [];
        try {
          capabilities = await permissionService.getRoleCapabilities(role._id);
        } catch (err) {
          console.error(`[DIAG] Failed to get capabilities for role ${role._id}:`, err);
        }
        
        assignableRoles.push({
          _id: role._id,
          code: role.code,
          name: role.name,
          description: role.description,
          authority: roleAuthority,
          tierName: getTierName(roleAuthority),
          capabilities: capabilities
        });
      }
      
      console.log(`[DIAG] getAssignableRoles - Authority filter:`, {
        totalRoles: allRoles.length,
        passedAuthorityFilter: assignableRoles.length,
        filteredOut: filteredOutByAuthority.length,
        filteredOutRoles: filteredOutByAuthority
      });

      // For stakeholder-management context, only return stakeholder role (explicit role code matching)
      if (pageContext === 'stakeholder-management') {
        console.log(`[RBAC] getAssignableRoles - Stakeholder-management context: filtering to stakeholder role only`);
        const beforeContextFilter = assignableRoles.length;
        assignableRoles = assignableRoles.filter(role => role.code === 'stakeholder');
        
        console.log(`[RBAC] getAssignableRoles - Context filter (stakeholder-management):`, {
          beforeFilter: beforeContextFilter,
          afterFilter: assignableRoles.length,
          roles: assignableRoles.map(r => r.code)
        });
      } else if (pageContext === 'coordinator-management') {
        // For coordinator creation, ONLY show coordinator role (explicit role code matching)
        // Remove capability-based filtering - use explicit role code
        console.log(`[RBAC] getAssignableRoles - Coordinator-management context: filtering to coordinator role only`);
        const beforeContextFilter = assignableRoles.length;
        assignableRoles = assignableRoles.filter(role => role.code === 'coordinator');
        
        console.log(`[RBAC] getAssignableRoles - Context filter (coordinator-management):`, {
          beforeFilter: beforeContextFilter,
          afterFilter: assignableRoles.length,
          roles: assignableRoles.map(r => r.code)
        });
      } else {
        // Filter by capability if provided (only for non-stakeholder-management contexts)
        if (capability) {
          const beforeCapabilityFilter = assignableRoles.length;
          const filteredOutByCapability = [];
          
          assignableRoles = assignableRoles.filter(role => {
            const hasCapability = role.capabilities.includes(capability) || role.capabilities.includes('*');
            
            if (!hasCapability) {
              filteredOutByCapability.push({
                code: role.code,
                name: role.name,
                capabilities: role.capabilities,
                requiredCapability: capability,
                reason: 'missing required capability'
              });
              return false;
            }
            return true;
          });
          
          console.log(`[DIAG] getAssignableRoles - Capability filter:`, {
            requiredCapability: capability,
            beforeFilter: beforeCapabilityFilter,
            afterFilter: assignableRoles.length,
            filteredOut: filteredOutByCapability.length,
            filteredOutRoles: filteredOutByCapability
          });
        }
      }

      // Exclude operational roles for stakeholder-management page (when capability is request.review)
      // BUT: Skip this filter if we're in stakeholder-management or coordinator-management context
      // AND: System admin should be able to assign ANY role, including coordinator
      if (pageContext !== 'stakeholder-management' && pageContext !== 'coordinator-management') {
        const beforeOperationalFilter = assignableRoles.length;
        const filteredOutByOperational = [];
        
        if (capability === 'request.review' && userAuthority < AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN) {
          // Only apply operational filter for non-system-admins
          // System admins can assign any role, including coordinator
          const operationalCapabilities = ['request.create', 'event.create', 'staff.create', 'staff.update'];
          assignableRoles = assignableRoles.filter(role => {
            // Exclude roles that have operational capabilities
            const hasOperational = role.capabilities.some(cap => 
              operationalCapabilities.includes(cap) || cap === '*'
            );
            
            if (hasOperational) {
              filteredOutByOperational.push({
                code: role.code,
                name: role.name,
                capabilities: role.capabilities,
                reason: 'has operational capabilities (non-admin filter)'
              });
              return false;
            }
            return true;
          });
          
          console.log(`[DIAG] getAssignableRoles - Operational filter (non-admin):`, {
            beforeFilter: beforeOperationalFilter,
            afterFilter: assignableRoles.length,
            filteredOut: filteredOutByOperational.length,
            filteredOutRoles: filteredOutByOperational
          });
        } else if (capability === 'request.review' && userAuthority >= AuthorityService.AUTHORITY_TIERS.SYSTEM_ADMIN) {
          console.log(`[DIAG] getAssignableRoles - Skipping operational filter for system admin`);
        }
      } else {
        if (pageContext === 'stakeholder-management') {
          console.log(`[DIAG] getAssignableRoles - Skipping operational filter for stakeholder-management context`);
        } else if (pageContext === 'coordinator-management') {
          console.log(`[DIAG] getAssignableRoles - Skipping operational filter for coordinator-management context`);
        }
      }

      // Diagnostic logging
      console.log('[DIAG] getAssignableRoles:', {
        userId: userId.toString(),
        userAuthority,
        userTierName: getTierName(userAuthority),
        capability: capability || 'none',
        pageContext: pageContext || 'none',
        allRolesCount: allRoles.length,
        finalRolesCount: assignableRoles.length,
        finalRoles: assignableRoles.map(r => ({ 
          code: r.code, 
          name: r.name,
          authority: r.authority,
          tierName: r.tierName,
          capabilities: r.capabilities
        }))
      });

      return res.status(200).json({
        success: true,
        data: assignableRoles
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get assignable roles'
      });
    }
  }
}

module.exports = new PermissionController();
