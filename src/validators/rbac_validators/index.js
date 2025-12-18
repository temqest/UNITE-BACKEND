const {
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
  validateCreateRole,
  validateUpdateRole,
  validateAssignRole
} = require('./role.validators');

const {
  createPermissionSchema,
  updatePermissionSchema,
  checkPermissionSchema,
  validateCreatePermission,
  validateUpdatePermission,
  validateCheckPermission
} = require('./permission.validators');

module.exports = {
  // Role validators
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
  validateCreateRole,
  validateUpdateRole,
  validateAssignRole,
  
  // Permission validators
  createPermissionSchema,
  updatePermissionSchema,
  checkPermissionSchema,
  validateCreatePermission,
  validateUpdatePermission,
  validateCheckPermission
};
