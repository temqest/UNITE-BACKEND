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

module.exports = {
  requireStaffManagement
};
