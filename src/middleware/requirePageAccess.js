const permissionService = require('../services/users_services/permission.service');

/**
 * Middleware to require page access permission
 * @param {string} pageRoute - Page route (e.g., '/dashboard', '/events', '/requests')
 * @returns {Function} Express middleware function
 */
function requirePageAccess(pageRoute) {
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

      // Check page access permission
      const canAccess = await permissionService.canAccessPage(
        userId,
        pageRoute,
        { locationId }
      );

      if (!canAccess) {
        return res.status(403).json({ 
          success: false, 
          message: `Access denied: Page '${pageRoute}' is not accessible`,
          page: pageRoute
        });
      }

      next();
    } catch (error) {
      console.error('Page access check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking page access' 
      });
    }
  };
}

module.exports = {
  requirePageAccess
};
