const permissionService = require('../services/users_services/permission.service');

/**
 * Middleware to require feature access permission
 * @param {string} featureCode - Feature code (e.g., 'create-event', 'request-blood', 'manage-inventory')
 * @returns {Function} Express middleware function
 */
function requireFeature(featureCode) {
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

      // Check feature access permission
      const canUse = await permissionService.canUseFeature(
        userId,
        featureCode,
        { locationId }
      );

      if (!canUse) {
        return res.status(403).json({ 
          success: false, 
          message: `Feature '${featureCode}' is not available`,
          feature: featureCode
        });
      }

      next();
    } catch (error) {
      console.error('Feature access check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking feature access' 
      });
    }
  };
}

module.exports = {
  requireFeature
};
