const Joi = require('joi');

// Validation schema for creating a new blood drive
const createBloodDriveSchema = Joi.object({
  BloodDrive_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Blood Drive ID is required',
      'string.empty': 'Blood Drive ID cannot be empty'
    }),

  Target_Donation: Joi.number()
    .required()
    .integer()
    .min(1)
    .max(100000)
    .messages({
      'any.required': 'Target Donation is required',
      'number.base': 'Target Donation must be a number',
      'number.integer': 'Target Donation must be an integer',
      'number.min': 'Target Donation must be at least 1',
      'number.max': 'Target Donation must not exceed 100000'
    }),

  VenueType: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(100)
    .messages({
      'any.required': 'Venue Type is required',
      'string.empty': 'Venue Type cannot be empty',
      'string.min': 'Venue Type must be at least 3 characters long',
      'string.max': 'Venue Type must not exceed 100 characters'
    })
});

// Validation schema for updating an existing blood drive
const updateBloodDriveSchema = Joi.object({
  BloodDrive_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Blood Drive ID cannot be empty'
    }),

  Target_Donation: Joi.number()
    .integer()
    .min(1)
    .max(100000)
    .messages({
      'number.base': 'Target Donation must be a number',
      'number.integer': 'Target Donation must be an integer',
      'number.min': 'Target Donation must be at least 1',
      'number.max': 'Target Donation must not exceed 100000'
    }),

  VenueType: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .messages({
      'string.empty': 'Venue Type cannot be empty',
      'string.min': 'Venue Type must be at least 3 characters long',
      'string.max': 'Venue Type must not exceed 100 characters'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateBloodDrive = (req, res, next) => {
  const { error, value } = createBloodDriveSchema.validate(req.body, {
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

const validateUpdateBloodDrive = (req, res, next) => {
  const { error, value } = updateBloodDriveSchema.validate(req.body, {
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
  createBloodDriveSchema,
  updateBloodDriveSchema,
  validateCreateBloodDrive,
  validateUpdateBloodDrive
};

