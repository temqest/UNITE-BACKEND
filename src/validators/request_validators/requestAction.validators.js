const Joi = require('joi');

// Validation schema for executing a request action
const executeActionSchema = Joi.object({
  action: Joi.string()
    .required()
    .valid('accept', 'reject', 'reschedule', 'cancel', 'delete', 'confirm', 'decline', 'edit', 'view')
    .trim()
    .messages({
      'any.required': 'Action is required',
      'any.only': 'Action must be one of: accept, reject, reschedule, cancel, delete, confirm, decline, edit, view',
      'string.empty': 'Action cannot be empty'
    }),

  data: Joi.object({
    notes: Joi.string()
      .trim()
      .max(1000)
      .allow(null, '')
      .messages({
        'string.max': 'Notes must not exceed 1000 characters'
      }),

    proposedDate: Joi.date()
      .iso()
      .allow(null)
      .messages({
        'date.base': 'Proposed date must be a valid date',
        'date.format': 'Proposed date must be in ISO format'
      }),

    proposedStartTime: Joi.string()
      .trim()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .allow(null, '')
      .messages({
        'string.pattern.base': 'Proposed start time must be in HH:MM format'
      }),

    proposedEndTime: Joi.string()
      .trim()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .allow(null, '')
      .messages({
        'string.pattern.base': 'Proposed end time must be in HH:MM format'
      }),

    reason: Joi.string()
      .trim()
      .max(500)
      .allow(null, '')
      .messages({
        'string.max': 'Reason must not exceed 500 characters'
      })
  })
    .default({})
    .messages({
      'object.base': 'Data must be an object'
    })
}).when(Joi.object({ action: Joi.string().valid('reschedule') }).unknown(), {
  then: Joi.object({
    action: Joi.string().required(),
    data: Joi.object({
      proposedDate: Joi.date().iso().required().messages({
        'any.required': 'Proposed date is required for reschedule action',
        'date.base': 'Proposed date must be a valid date',
        'date.format': 'Proposed date must be in ISO format'
      }),
      proposedStartTime: Joi.string().trim().allow(null, ''),
      proposedEndTime: Joi.string().trim().allow(null, ''),
      notes: Joi.string().trim().max(1000).allow(null, '')
    }).required()
  })
});

// Middleware function for validation
const validateExecuteAction = (req, res, next) => {
  const { error, value } = executeActionSchema.validate(req.body, {
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
  executeActionSchema,
  validateExecuteAction
};
