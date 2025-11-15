const Joi = require('joi');

// Validation schema for creating a new advocacy
const createAdvocacySchema = Joi.object({
  Advocacy_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Advocacy ID is required',
      'string.empty': 'Advocacy ID cannot be empty'
    }),

  Topic: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Topic cannot be empty',
      'string.min': 'Topic must be at least 3 characters long',
      'string.max': 'Topic must not exceed 200 characters'
    }),

  TargetAudience: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Target Audience cannot be empty',
      'string.min': 'Target Audience must be at least 3 characters long',
      'string.max': 'Target Audience must not exceed 200 characters'
    }),

  ExpectedAudienceSize: Joi.number()
    .integer()
    .min(1)
    .max(100000)
    .messages({
      'number.base': 'Expected Audience Size must be a number',
      'number.integer': 'Expected Audience Size must be an integer',
      'number.min': 'Expected Audience Size must be at least 1',
      'number.max': 'Expected Audience Size must not exceed 100000'
    }),

  PartnerOrganization: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Partner Organization cannot be empty',
      'string.min': 'Partner Organization must be at least 3 characters long',
      'string.max': 'Partner Organization must not exceed 200 characters'
    })
});

// Validation schema for updating an existing advocacy
const updateAdvocacySchema = Joi.object({
  Advocacy_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Advocacy ID cannot be empty'
    }),

  Topic: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Topic cannot be empty',
      'string.min': 'Topic must be at least 3 characters long',
      'string.max': 'Topic must not exceed 200 characters'
    }),

  TargetAudience: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Target Audience cannot be empty',
      'string.min': 'Target Audience must be at least 3 characters long',
      'string.max': 'Target Audience must not exceed 200 characters'
    }),

  ExpectedAudienceSize: Joi.number()
    .integer()
    .min(1)
    .max(100000)
    .messages({
      'number.base': 'Expected Audience Size must be a number',
      'number.integer': 'Expected Audience Size must be an integer',
      'number.min': 'Expected Audience Size must be at least 1',
      'number.max': 'Expected Audience Size must not exceed 100000'
    }),

  PartnerOrganization: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Partner Organization cannot be empty',
      'string.min': 'Partner Organization must be at least 3 characters long',
      'string.max': 'Partner Organization must not exceed 200 characters'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateAdvocacy = (req, res, next) => {
  const { error, value } = createAdvocacySchema.validate(req.body, {
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

const validateUpdateAdvocacy = (req, res, next) => {
  const { error, value } = updateAdvocacySchema.validate(req.body, {
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
  createAdvocacySchema,
  updateAdvocacySchema,
  validateCreateAdvocacy,
  validateUpdateAdvocacy
};

