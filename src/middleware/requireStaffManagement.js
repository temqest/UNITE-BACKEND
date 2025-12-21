const permissionService = require('../services/users_services/permission.service');

/**
 * Middleware to require staff management permission
 * @param {string} action - Action (e.g., 'create', 'update', 'delete')
 * @param {string} staffTypeParam - Request parameter name that contains staff type (default: 'staffType')
 * @returns {Function} Express middleware function
 */
function requireStaffManagement(action, staffTypeParam = 'staffType') {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
      }

      const locationId = req.body?.locationId || 
                        req.params?.locationId || 
                        req.query?.locationId ||
                        req.body?.location?.district ||
                        req.body?.location?.province ||
                        null;

      // Get staff type from request (body, params, or query)
      const staffType = req.body?.[staffTypeParam] || 
                       req.params?.[staffTypeParam] || 
                       req.query?.[staffTypeParam] ||
                       req.body?.role ||
                       req.body?.roles?.[0] ||
                       null;

      // Check staff management permission
      const canManage = await permissionService.canManageStaff(
        userId,
        action,
        staffType,
        { locationId }
      );

      if (!canManage) {
        const staffTypeMsg = staffType ? ` for staff type '${staffType}'` : '';
        return res.status(403).json({ 
          success: false, 
          message: `Permission denied: Cannot ${action} staff${staffTypeMsg}`,
          action,
          staffType: staffType || 'any'
        });
      }

      // Attach allowed staff types to request for use in controllers
      const allowedTypes = await permissionService.getAllowedStaffTypes(userId, action, { locationId });
      req.allowedStaffTypes = allowedTypes;

      next();
    } catch (error) {
      console.error('Staff management check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking staff management permission' 
      });
    }
  };
}

/**
 * Middleware to validate page context requirements for staff creation
 * Validates that assigned roles have required permissions based on page context
 * @param {string} pageContext - Page context ('coordinator-management' or 'stakeholder-management')
 * @returns {Function} Express middleware function
 */
function validatePageContext(pageContext) {
  return async (req, res, next) => {
    try {
      // Only validate on create/update actions
      if (req.method !== 'POST' && req.method !== 'PUT') {
        return next();
      }

      // Get page context from header, query, or body
      const context = pageContext || 
                     req.headers['x-page-context'] || 
                     req.query.pageContext || 
                     req.body.pageContext;

      if (!context) {
        // No context specified, skip validation
        return next();
      }

      // Get roles from request
      const roles = req.body.roles || [];
      if (roles.length === 0) {
        // No roles specified, skip validation
        return next();
      }

      // Define required capabilities for each page context
      // Note: These must match the actual permissions in the database
      const contextRequirements = {
        'stakeholder-management': {
          required: ['request.review'],
          description: 'Stakeholder (Review & Approval)'
        },
        'coordinator-management': {
          required: ['request.create', 'event.create', 'event.update', 'staff.create', 'staff.update'],
          description: 'Staff (Operations)'
        }
      };

      const requirements = contextRequirements[context];
      if (!requirements) {
        // Unknown context, skip validation
        return next();
      }

      // Check if any assigned role has at least one required capability
      let hasRequiredCapability = false;
      const roleCapabilities = [];

      for (const roleCode of roles) {
        const role = await permissionService.getRoleByCode(roleCode);
        if (!role) continue;

        const capabilities = await permissionService.getRoleCapabilities(role._id);
        roleCapabilities.push(...capabilities);

        // Check if role has any required capability
        for (const requiredCap of requirements.required) {
          const hasCap = await permissionService.roleHasCapability(role._id, requiredCap);
          if (hasCap) {
            hasRequiredCapability = true;
            break;
          }
        }

        if (hasRequiredCapability) break;
      }

      if (!hasRequiredCapability) {
        return res.status(400).json({
          success: false,
          message: `Cannot create ${requirements.description} staff: Assigned roles must include at least one of the following capabilities: ${requirements.required.join(', ')}`,
          required: requirements.required,
          context: context
        });
      }

      next();
    } catch (error) {
      console.error('Page context validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error validating page context requirements'
      });
    }
  };
}

module.exports = {
  requireStaffManagement,
  validatePageContext
};
