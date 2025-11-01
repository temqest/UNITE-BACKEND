const Joi = require('joi');

// Validation schema for creating a new event staff
const createEventStaffSchema = Joi.object({
  EventID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Event ID is required',
      'string.empty': 'Event ID cannot be empty'
    }),

  Staff_FullName: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(200)
    .pattern(/^[a-zA-Z\s-']+$/)
    .messages({
      'any.required': 'Staff Full Name is required',
      'string.empty': 'Staff Full Name cannot be empty',
      'string.min': 'Staff Full Name must be at least 3 characters long',
      'string.max': 'Staff Full Name must not exceed 200 characters',
      'string.pattern.base': 'Staff Full Name can only contain letters, spaces, hyphens, and apostrophes'
    }),

  Role: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'any.required': 'Role is required',
      'string.empty': 'Role cannot be empty',
      'string.min': 'Role must be at least 2 characters long',
      'string.max': 'Role must not exceed 100 characters'
    })
});

// Validation schema for updating an existing event staff
const updateEventStaffSchema = Joi.object({
  EventID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Event ID cannot be empty'
    }),

  Staff_FullName: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .pattern(/^[a-zA-Z\s-']+$/)
    .messages({
      'string.empty': 'Staff Full Name cannot be empty',
      'string.min': 'Staff Full Name must be at least 3 characters long',
      'string.max': 'Staff Full Name must not exceed 200 characters',
      'string.pattern.base': 'Staff Full Name can only contain letters, spaces, hyphens, and apostrophes'
    }),

  Role: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'Role cannot be empty',
      'string.min': 'Role must be at least 2 characters long',
      'string.max': 'Role must not exceed 100 characters'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateEventStaff = (req, res, next) => {
  const { error, value } = createEventStaffSchema.validate(req.body, {
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

const validateUpdateEventStaff = (req, res, next) => {
  const { error, value } = updateEventStaffSchema.validate(req.body, {
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
  createEventStaffSchema,
  updateEventStaffSchema,
  validateCreateEventStaff,
  validateUpdateEventStaff
};

