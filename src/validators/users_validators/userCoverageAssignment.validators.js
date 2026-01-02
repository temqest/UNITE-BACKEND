const Joi = require('joi');

// Validation schema for assigning user to coverage area
const assignUserCoverageAreaSchema = Joi.object({
  coverageAreaId: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Coverage area ID is required',
      'string.empty': 'Coverage area ID cannot be empty'
    }),

  isPrimary: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'isPrimary must be a boolean'
    }),

  expiresAt: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Expiration date must be a valid date',
      'date.format': 'Expiration date must be in ISO format'
    })
});

// Middleware function for validation
const validateAssignUserCoverageArea = (req, res, next) => {
  const { error, value } = assignUserCoverageAreaSchema.validate(req.body, {
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
  assignUserCoverageAreaSchema,
  validateAssignUserCoverageArea
};

