const Joi = require('joi');

// Validation schema for creating a new training
const createTrainingSchema = Joi.object({
  Training_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Training ID is required',
      'string.empty': 'Training ID cannot be empty'
    }),

  TrainingType: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .messages({
      //'any.required': 'Training Type is required',
      'string.empty': 'Training Type cannot be empty',
      'string.min': 'Training Type must be at least 3 characters long',
      'string.max': 'Training Type must not exceed 100 characters'
    }),

  MaxParticipants: Joi.number()
    .required()
    .integer()
    .min(1)
    .max(10000)
    .messages({
      'any.required': 'Max Participants is required',
      'number.base': 'Max Participants must be a number',
      'number.integer': 'Max Participants must be an integer',
      'number.min': 'Max Participants must be at least 1',
      'number.max': 'Max Participants must not exceed 10000'
    })
});

// Validation schema for updating an existing training
const updateTrainingSchema = Joi.object({
  Training_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Training ID cannot be empty'
    }),

  TrainingType: Joi.string()
    .trim()
    .min(3)
    .max(100)
    .messages({
      'string.empty': 'Training Type cannot be empty',
      'string.min': 'Training Type must be at least 3 characters long',
      'string.max': 'Training Type must not exceed 100 characters'
    }),

  MaxParticipants: Joi.number()
    .integer()
    .min(1)
    .max(10000)
    .messages({
      'number.base': 'Max Participants must be a number',
      'number.integer': 'Max Participants must be an integer',
      'number.min': 'Max Participants must be at least 1',
      'number.max': 'Max Participants must not exceed 10000'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateTraining = (req, res, next) => {
  const { error, value } = createTrainingSchema.validate(req.body, {
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

const validateUpdateTraining = (req, res, next) => {
  const { error, value } = updateTrainingSchema.validate(req.body, {
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
  createTrainingSchema,
  updateTrainingSchema,
  validateCreateTraining,
  validateUpdateTraining
};

