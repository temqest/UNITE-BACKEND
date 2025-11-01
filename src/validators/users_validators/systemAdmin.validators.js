const Joi = require('joi');

// Validation schema for creating a new system admin
const createSystemAdminSchema = Joi.object({
  Admin_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Admin ID is required',
      'string.empty': 'Admin ID cannot be empty'
    }),

  AccessLevel: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(50)
    .messages({
      'any.required': 'Access Level is required',
      'string.empty': 'Access Level cannot be empty',
      'string.min': 'Access Level must be at least 1 character long',
      'string.max': 'Access Level must not exceed 50 characters'
    })
});

// Validation schema for updating an existing system admin
const updateSystemAdminSchema = Joi.object({
  Admin_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Admin ID cannot be empty'
    }),

  AccessLevel: Joi.string()
    .trim()
    .min(1)
    .max(50)
    .messages({
      'string.empty': 'Access Level cannot be empty',
      'string.min': 'Access Level must be at least 1 character long',
      'string.max': 'Access Level must not exceed 50 characters'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateSystemAdmin = (req, res, next) => {
  const { error, value } = createSystemAdminSchema.validate(req.body, {
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

const validateUpdateSystemAdmin = (req, res, next) => {
  const { error, value } = updateSystemAdminSchema.validate(req.body, {
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
  createSystemAdminSchema,
  updateSystemAdminSchema,
  validateCreateSystemAdmin,
  validateUpdateSystemAdmin
};

