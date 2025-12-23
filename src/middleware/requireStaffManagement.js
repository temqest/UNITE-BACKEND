const permissionService = require('../services/users_services/permission.service');

/**
 * Map role code to staff type based on role capabilities
 * @param {string} roleCode - Role code to map
 * @returns {Promise<string|null>} Staff type ('stakeholder', 'coordinator', or null)
 */
async function getStaffTypeFromRoleCode(roleCode) {
  if (!roleCode) return null;
  
  const role = await permissionService.getRoleByCode(roleCode);
  
  if (!role) return null;
  
  // Determine staff type from role's capabilities
  const hasReview = await permissionService.roleHasCapability(role._id, 'request.review');
  const hasOperational = await permissionService.roleHasCapability(role._id, 'request.create') ||
                         await permissionService.roleHasCapability(role._id, 'event.create') ||
                         await permissionService.roleHasCapability(role._id, 'staff.create');
  
  if (hasReview && !hasOperational) {
    return 'stakeholder';
  } else if (hasOperational) {
    return 'coordinator';
  }
  
  // Check role metadata or name for staff type hint
  if (role.metadata?.staffType) {
    return role.metadata.staffType;
  }
  
  // Fallback: infer from role code pattern
  const codeLower = roleCode.toLowerCase();
  if (codeLower.includes('stakeholder') || codeLower.includes('reviewer')) {
    return 'stakeholder';
  } else if (codeLower.includes('coordinator') || codeLower.includes('admin')) {
    return 'coordinator';
  }
  
  return null;
}

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

      // Get staff type from request or map from role code
      let staffType = req.body?.[staffTypeParam] || 
                     req.params?.[staffTypeParam] || 
                     req.query?.[staffTypeParam] ||
                     null;
      
      // If not provided, try to extract from roles array
      if (!staffType && req.body?.roles && req.body.roles.length > 0) {
        const roleCode = req.body.roles[0];
        staffType = await getStaffTypeFromRoleCode(roleCode);
      }
      
      // If still not found, try role field
      if (!staffType && req.body?.role) {
        staffType = await getStaffTypeFromRoleCode(req.body.role);
      }

      // Check staff management permission
      const canManage = await permissionService.canManageStaff(
        userId,
        action,
        staffType, // Now correctly mapped to staff type
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

      // Diagnostic logging
      console.log('[DIAG] requireStaffManagement:', {
        userId: userId.toString(),
        action,
        staffType: staffType || 'none',
        canManage,
        allowedStaffTypes: allowedTypes,
        locationId: locationId || 'none'
      });

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
          required: ['request.confirm', 'request.decline'], // Stakeholders have confirm/decline, not review
          description: 'Stakeholder'
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

      const { Role } = require('../models/index');
      const mongoose = require('mongoose');

      for (const roleIdentifier of roles) {
        let role = null;
        
        // Try to find role by ID first (if it's an ObjectId)
        if (mongoose.Types.ObjectId.isValid(roleIdentifier)) {
          role = await Role.findById(roleIdentifier);
        }
        
        // If not found by ID, try by code (string)
        if (!role) {
          role = await permissionService.getRoleByCode(roleIdentifier);
        }
        
        if (!role) {
          console.log(`[DIAG] validatePageContext - Role not found: ${roleIdentifier}`);
          continue;
        }

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

      // Diagnostic logging
      console.log('[DIAG] validatePageContext:', {
        context: context || 'none',
        roles: roles,
        rolesCount: roles.length,
        requiredCapabilities: requirements.required,
        hasRequiredCapability,
        roleCapabilities: roleCapabilities
      });

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
