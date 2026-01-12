const authorityService = require('../services/users_services/authority.service');

/**
 * Middleware to require admin authority (≥ 80)
 * Only users with authority level 80 or higher can access the route
 * 
 * @returns {Function} Express middleware function
 */
function requireAdminAuthority() {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({ 
          success: false, 
          message: 'Authentication required' 
        });
      }

      // Calculate user authority
      const userAuthority = await authorityService.calculateUserAuthority(userId);
      
      // Check if user has admin authority (≥ 80)
      if (userAuthority < 80) {
        return res.status(403).json({ 
          success: false, 
          message: 'Admin authority required (authority ≥ 80). Your authority level is insufficient.',
          userAuthority,
          requiredAuthority: 80
        });
      }

      // Attach authority to request for use in controllers
      req.userAuthority = userAuthority;
      
      next();
    } catch (error) {
      console.error('[requireAdminAuthority] Authority check error:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Error checking user authority' 
      });
    }
  };
}

module.exports = requireAdminAuthority;

