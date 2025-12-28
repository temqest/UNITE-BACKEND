const permissionService = require('../services/users_services/permission.service');

/**
 * Middleware to require a specific permission
 * @param {string} resource - Resource name (e.g., 'event', 'request', 'user')
 * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete', 'review', 'approve')
 * @returns {Function} Express middleware function
 */
function requirePermission(resource, action) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
      }

      // Extract locationId from request (body, params, or query)
      const locationId = req.body?.locationId || 
                        req.params?.locationId || 
                        req.query?.locationId ||
                        req.body?.location?.district ||
                        req.body?.location?.province ||
                        null;

      // First check if user has wildcard permission (*.*) - admins get all permissions
      console.log('[requirePermission] Checking permissions for user:', {
        userId: userId.toString(),
        resource,
        action,
        locationId: locationId?.toString() || null
      });

      let userPermissions = [];
      try {
        userPermissions = await permissionService.getUserPermissions(userId, null);
        console.log('[requirePermission] getUserPermissions returned:', {
          count: userPermissions.length,
          permissions: userPermissions.map(p => ({
            resource: p.resource,
            actions: p.actions,
            hasWildcard: p.resource === '*' && p.actions.includes('*')
          }))
        });
      } catch (permError) {
        console.error('[requirePermission] Error getting user permissions:', permError);
      }

      // Check for wildcard permission in multiple formats
      const hasWildcard = userPermissions.some(p => {
        // Standard format: { resource: '*', actions: ['*'] }
        if (p.resource === '*' && Array.isArray(p.actions) && p.actions.includes('*')) {
          return true;
        }
        // Also check if actions includes the specific action
        if (p.resource === '*' && Array.isArray(p.actions) && p.actions.includes(action)) {
          return true;
        }
        return false;
      });
      
      if (hasWildcard) {
        console.log('[requirePermission] ✓ Wildcard permission (*.*) granted:', {
          userId: userId.toString(),
          resource,
          action,
          permissionsFound: userPermissions.length
        });
        return next();
      }

      // Bypass permission check for SysAdmin (authority >= 80)
      const authorityService = require('../services/users_services/authority.service');
      const userAuthority = await authorityService.calculateUserAuthority(userId);
      
      if (userAuthority >= 80) {
        console.log('[requirePermission] SysAdmin bypass:', {
          userId: userId.toString(),
          authority: userAuthority,
          resource,
          action
        });
        return next();
      }

      // Check permission
      console.log('[requirePermission] Checking specific permission:', {
        userId: userId.toString(),
        resource,
        action,
        locationId: locationId?.toString() || null
      });

      const hasPermission = await permissionService.checkPermission(
        userId,
        resource,
        action,
        { locationId }
      );

      console.log('[requirePermission] checkPermission result:', {
        userId: userId.toString(),
        resource,
        action,
        hasPermission,
        authority: userAuthority
      });

      if (!hasPermission) {
        console.log('[requirePermission] ✗ Permission denied:', {
          userId: userId.toString(),
          authority: userAuthority,
          resource,
          action,
          locationId: locationId?.toString() || null,
          userPermissionsCount: userPermissions.length,
          userPermissions: userPermissions.map(p => `${p.resource}.${Array.isArray(p.actions) ? p.actions.join(',') : p.actions}`)
        });
        return res.status(403).json({ 
          success: false, 
          message: `Permission denied: ${resource}.${action}`,
          required: { resource, action }
        });
      }

      console.log('[requirePermission] ✓ Permission granted:', {
        userId: userId.toString(),
        resource,
        action
      });

      next();
    } catch (error) {
      console.error('[requirePermission] Permission check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking permissions' 
      });
    }
  };
}

/**
 * Middleware to require any of multiple permissions
 * @param {Array<{resource: string, action: string}>} permissions - Array of permission objects
 * @returns {Function} Express middleware function
 */
function requireAnyPermission(permissions) {
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

      // First check if user has wildcard permission (*.*) - admins get all permissions
      const userPermissions = await permissionService.getUserPermissions(userId, null);
      const hasWildcard = userPermissions.some(p => 
        p.resource === '*' && p.actions.includes('*')
      );
      
      if (hasWildcard) {
        console.log('[requireAnyPermission] Wildcard permission (*.*) granted:', {
          userId: userId.toString(),
          permissions
        });
        return next();
      }

      // Bypass permission check for SysAdmin (authority >= 80)
      const authorityService = require('../services/users_services/authority.service');
      const userAuthority = await authorityService.calculateUserAuthority(userId);
      
      if (userAuthority >= 80) {
        console.log('[requireAnyPermission] SysAdmin bypass:', {
          userId: userId.toString(),
          authority: userAuthority,
          permissions
        });
        return next();
      }

      // Check if user has any of the required permissions
      for (const perm of permissions) {
        const hasPermission = await permissionService.checkPermission(
          userId,
          perm.resource,
          perm.action,
          { locationId }
        );
        
        if (hasPermission) {
          return next();
        }
      }

      console.log('[requireAnyPermission] Permission denied:', {
        userId: userId.toString(),
        authority: userAuthority,
        permissions
      });
      return res.status(403).json({ 
        success: false, 
        message: 'Permission denied: requires one of the following permissions',
        required: permissions
      });
    } catch (error) {
      console.error('[requireAnyPermission] Permission check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking permissions' 
      });
    }
  };
}

/**
 * Middleware to require all of multiple permissions
 * @param {Array<{resource: string, action: string}>} permissions - Array of permission objects
 * @returns {Function} Express middleware function
 */
function requireAllPermissions(permissions) {
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

      // First check if user has wildcard permission (*.*) - admins get all permissions
      const userPermissions = await permissionService.getUserPermissions(userId, null);
      const hasWildcard = userPermissions.some(p => 
        p.resource === '*' && p.actions.includes('*')
      );
      
      if (hasWildcard) {
        console.log('[requireAllPermissions] Wildcard permission (*.*) granted:', {
          userId: userId.toString(),
          permissions
        });
        return next();
      }

      // Bypass permission check for SysAdmin (authority >= 80)
      const authorityService = require('../services/users_services/authority.service');
      const userAuthority = await authorityService.calculateUserAuthority(userId);
      
      if (userAuthority >= 80) {
        console.log('[requireAllPermissions] SysAdmin bypass:', {
          userId: userId.toString(),
          authority: userAuthority,
          permissions
        });
        return next();
      }

      // Check if user has all required permissions
      for (const perm of permissions) {
        const hasPermission = await permissionService.checkPermission(
          userId,
          perm.resource,
          perm.action,
          { locationId }
        );
        
        if (!hasPermission) {
          console.log('[requireAllPermissions] Permission denied:', {
            userId: userId.toString(),
            authority: userAuthority,
            missing: { resource: perm.resource, action: perm.action }
          });
          return res.status(403).json({ 
            success: false, 
            message: `Permission denied: requires ${perm.resource}.${perm.action}`,
            required: permissions,
            missing: { resource: perm.resource, action: perm.action }
          });
        }
      }

      next();
    } catch (error) {
      console.error('[requireAllPermissions] Permission check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking permissions' 
      });
    }
  };
}

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions
};
