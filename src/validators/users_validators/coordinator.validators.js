const Joi = require('joi');

// Validation schema for creating a new coordinator
const createCoordinatorSchema = Joi.object({
  Coordinator_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Coordinator ID is required',
      'string.empty': 'Coordinator ID cannot be empty'
    }),

  District_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'District ID is required',
      'string.empty': 'District ID cannot be empty'
    })
});

// Validation schema for updating an existing coordinator
const updateCoordinatorSchema = Joi.object({
  Coordinator_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Coordinator ID cannot be empty'
    }),

  District_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'District ID cannot be empty'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateCoordinator = (req, res, next) => {
  const { error, value } = createCoordinatorSchema.validate(req.body, {
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

const validateUpdateCoordinator = (req, res, next) => {
  const { error, value } = updateCoordinatorSchema.validate(req.body, {
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
  createCoordinatorSchema,
  updateCoordinatorSchema,
  validateCreateCoordinator,
  validateUpdateCoordinator
};

