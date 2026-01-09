const Joi = require('joi');

// Validation schema for creating a new role
const createRoleSchema = Joi.object({
  code: Joi.string()
    .required()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .min(2)
    .max(50)
    .messages({
      'any.required': 'Role code is required',
      'string.empty': 'Role code cannot be empty',
      'string.pattern.base': 'Role code must contain only lowercase letters, numbers, and hyphens',
      'string.min': 'Role code must be at least 2 characters long',
      'string.max': 'Role code must not exceed 50 characters'
    }),

  name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'any.required': 'Role name is required',
      'string.empty': 'Role name cannot be empty',
      'string.min': 'Role name must be at least 2 characters long',
      'string.max': 'Role name must not exceed 100 characters'
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),

  isSystemRole: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'isSystemRole must be a boolean'
    }),

  permissions: Joi.array()
    .items(
      Joi.object({
        resource: Joi.string()
          .required()
          .trim()
          .messages({
            'any.required': 'Permission resource is required',
            'string.empty': 'Permission resource cannot be empty'
          }),
        actions: Joi.array()
          .items(Joi.string().trim())
          .min(1)
          .required()
          .messages({
            'any.required': 'Permission actions are required',
            'array.min': 'At least one action must be specified',
            'array.includesRequiredUnknowns': 'Actions must be strings'
          }),
        metadata: Joi.object()
          .optional()
          .allow(null, {})
          .messages({
            'object.base': 'Permission metadata must be an object'
          })
      })
    )
    .min(1)
    .required()
    .messages({
      'any.required': 'Permissions are required',
      'array.min': 'At least one permission must be specified'
    })
});

// Validation schema for updating an existing role
const updateRoleSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'Role name cannot be empty',
      'string.min': 'Role name must be at least 2 characters long',
      'string.max': 'Role name must not exceed 100 characters'
    }),

  description: Joi.string()
    .trim()
    .max(500)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 500 characters'
    }),

  isSystemRole: Joi.boolean()
    .messages({
      'boolean.base': 'isSystemRole must be a boolean'
    }),

  permissions: Joi.array()
    .items(
      Joi.object({
        _id: Joi.string()
          .optional()
          .allow(null)
          .messages({
            'string.base': 'Permission _id must be a string'
          }),
        resource: Joi.string()
          .required()
          .trim()
          .messages({
            'any.required': 'Permission resource is required',
            'string.empty': 'Permission resource cannot be empty'
          }),
        actions: Joi.array()
          .items(Joi.string().trim())
          .min(1)
          .required()
          .messages({
            'any.required': 'Permission actions are required',
            'array.min': 'At least one action must be specified'
          }),
        metadata: Joi.object()
          .optional()
          .allow(null, {})
          .messages({
            'object.base': 'Permission metadata must be an object'
          })
      })
    )
    .min(1)
    .messages({
      'array.min': 'At least one permission must be specified'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Validation schema for assigning role to user
const assignRoleSchema = Joi.object({
  roleId: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Role ID is required',
      'string.empty': 'Role ID cannot be empty'
    }),

  locationScope: Joi.array()
    .items(Joi.string().trim())
    .default([])
    .messages({
      'array.base': 'Location scope must be an array'
    }),

  expiresAt: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Expiration date must be a valid date',
      'date.format': 'Expiration date must be in ISO format'
    })
});

// Middleware functions for validation
const validateCreateRole = (req, res, next) => {
  const { error, value } = createRoleSchema.validate(req.body, {
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

const validateUpdateRole = (req, res, next) => {
  // Strip unknown fields (like 'code' which shouldn't be updated) before validation
  const { error, value } = updateRoleSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
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

const validateAssignRole = (req, res, next) => {
  const { error, value } = assignRoleSchema.validate(req.body, {
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
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
  validateCreateRole,
  validateUpdateRole,
  validateAssignRole
};
