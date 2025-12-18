const Joi = require('joi');

// Validation schema for creating a new permission
const createPermissionSchema = Joi.object({
  code: Joi.string()
    .required()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9.-]+$/)
    .min(3)
    .max(100)
    .messages({
      'any.required': 'Permission code is required',
      'string.empty': 'Permission code cannot be empty',
      'string.pattern.base': 'Permission code must contain only lowercase letters, numbers, dots, and hyphens (e.g., "request.review")',
      'string.min': 'Permission code must be at least 3 characters long',
      'string.max': 'Permission code must not exceed 100 characters'
    }),

  name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'any.required': 'Permission name is required',
      'string.empty': 'Permission name cannot be empty',
      'string.min': 'Permission name must be at least 2 characters long',
      'string.max': 'Permission name must not exceed 100 characters'
    }),

  resource: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(50)
    .messages({
      'any.required': 'Resource is required',
      'string.empty': 'Resource cannot be empty',
      'string.min': 'Resource must be at least 2 characters long',
      'string.max': 'Resource must not exceed 50 characters'
    }),

  action: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(50)
    .messages({
      'any.required': 'Action is required',
      'string.empty': 'Action cannot be empty',
      'string.min': 'Action must be at least 2 characters long',
      'string.max': 'Action must not exceed 50 characters'
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),

  type: Joi.string()
    .valid('resource', 'page', 'feature', 'staff')
    .default('resource')
    .messages({
      'any.only': 'Type must be one of: resource, page, feature, staff'
    }),

  metadata: Joi.object({
    allowedStaffTypes: Joi.array().items(Joi.string()).optional(),
    // Add other metadata fields as needed
  }).optional()
});

// Validation schema for updating an existing permission
const updatePermissionSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'Permission name cannot be empty',
      'string.min': 'Permission name must be at least 2 characters long',
      'string.max': 'Permission name must not exceed 100 characters'
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),

  type: Joi.string()
    .valid('resource', 'page', 'feature', 'staff')
    .messages({
      'any.only': 'Type must be one of: resource, page, feature, staff'
    }),

  metadata: Joi.object({
    allowedStaffTypes: Joi.array().items(Joi.string()).optional(),
  }).optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Validation schema for checking permission
const checkPermissionSchema = Joi.object({
  resource: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Resource is required',
      'string.empty': 'Resource cannot be empty'
    }),

  action: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Action is required',
      'string.empty': 'Action cannot be empty'
    }),

  locationId: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Location ID cannot be empty if provided'
    })
});

// Middleware functions for validation
const validateCreatePermission = (req, res, next) => {
  const { error, value } = createPermissionSchema.validate(req.body, {
    abortEarly: false
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errorMessages
    });
  }

  req.validatedData = value;
  next();
};

const validateUpdatePermission = (req, res, next) => {
  const { error, value } = updatePermissionSchema.validate(req.body, {
    abortEarly: false
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errorMessages
    });
  }

  req.validatedData = value;
  next();
};

const validateCheckPermission = (req, res, next) => {
  const { error, value } = checkPermissionSchema.validate(req.body, {
    abortEarly: false
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errorMessages
    });
  }

  req.validatedData = value;
  next();
};

module.exports = {
  createPermissionSchema,
  updatePermissionSchema,
  checkPermissionSchema,
  validateCreatePermission,
  validateUpdatePermission,
  validateCheckPermission
};
