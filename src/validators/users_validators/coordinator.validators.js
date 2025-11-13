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
    }),

  Province_Name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.min': 'Province Name must be at least 2 characters long',
      'string.max': 'Province Name must not exceed 100 characters'
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
    }),

  Province_Name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'Province Name cannot be empty',
      'string.min': 'Province Name must be at least 2 characters long',
      'string.max': 'Province Name must not exceed 100 characters'
    })
,
  // Allow updating staff fields as part of coordinator update
  First_Name: Joi.string().trim().min(1).max(100).messages({ 'string.empty': 'First name cannot be empty' }),
  Middle_Name: Joi.string().allow(null, '').trim().max(100),
  Last_Name: Joi.string().trim().min(1).max(100).messages({ 'string.empty': 'Last name cannot be empty' }),
  Email: Joi.string().email().trim().messages({ 'string.email': 'Email must be a valid email address' }),
  Phone_Number: Joi.string().trim().min(5).max(30).messages({ 'string.empty': 'Phone number cannot be empty' }),
  Password: Joi.string().min(6).max(128).messages({ 'string.min': 'Password must be at least 6 characters long' })
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

