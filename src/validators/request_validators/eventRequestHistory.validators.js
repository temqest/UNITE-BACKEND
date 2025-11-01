const Joi = require('joi');

// Validation schema for creating a new event request history
const createEventRequestHistorySchema = Joi.object({
  History_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'History ID is required',
      'string.empty': 'History ID cannot be empty'
    }),

  Request_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Request ID is required',
      'string.empty': 'Request ID cannot be empty'
    }),

  Event_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Event ID is required',
      'string.empty': 'Event ID cannot be empty'
    }),

  Action: Joi.string()
    .required()
    .valid(
      'Created',
      'AdminAccepted',
      'AdminRescheduled',
      'AdminRejected',
      'CoordinatorApproved',
      'CoordinatorAccepted',
      'CoordinatorRejected',
      'Completed',
      'Rejected'
    )
    .messages({
      'any.required': 'Action is required',
      'any.only': 'Action must be one of: Created, AdminAccepted, AdminRescheduled, AdminRejected, CoordinatorApproved, CoordinatorAccepted, CoordinatorRejected, Completed, or Rejected'
    }),

  Actor_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Actor ID is required',
      'string.empty': 'Actor ID cannot be empty'
    }),

  ActorType: Joi.string()
    .required()
    .valid('Coordinator', 'Admin')
    .messages({
      'any.required': 'Actor Type is required',
      'any.only': 'Actor Type must be either Coordinator or Admin'
    }),

  ActorName: Joi.string()
    .trim()
    .allow('', null)
    .max(200)
    .messages({
      'string.max': 'Actor Name must not exceed 200 characters'
    }),

  Note: Joi.string()
    .trim()
    .allow('', null)
    .max(1000)
    .messages({
      'string.max': 'Note must not exceed 1000 characters'
    }),

  PreviousStatus: Joi.string()
    .trim()
    .allow('', null)
    .max(100)
    .messages({
      'string.max': 'Previous Status must not exceed 100 characters'
    }),

  NewStatus: Joi.string()
    .trim()
    .allow('', null)
    .max(100)
    .messages({
      'string.max': 'New Status must not exceed 100 characters'
    }),

  RescheduledDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Rescheduled Date must be a valid date',
      'date.format': 'Rescheduled Date must be in ISO format'
    }),

  OriginalDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Original Date must be a valid date',
      'date.format': 'Original Date must be in ISO format'
    }),

  Metadata: Joi.object()
    .unknown(true)
    .default({})
    .messages({
      'object.base': 'Metadata must be an object'
    }),

  ActionDate: Joi.date()
    .iso()
    .default(Date.now)
    .messages({
      'date.base': 'Action Date must be a valid date',
      'date.format': 'Action Date must be in ISO format'
    })
});

// Validation schema for updating an existing event request history
const updateEventRequestHistorySchema = Joi.object({
  History_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'History ID cannot be empty'
    }),

  Request_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Request ID cannot be empty'
    }),

  Event_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Event ID cannot be empty'
    }),

  Action: Joi.string()
    .valid(
      'Created',
      'AdminAccepted',
      'AdminRescheduled',
      'AdminRejected',
      'CoordinatorApproved',
      'CoordinatorAccepted',
      'CoordinatorRejected',
      'Completed',
      'Rejected'
    )
    .messages({
      'any.only': 'Action must be one of: Created, AdminAccepted, AdminRescheduled, AdminRejected, CoordinatorApproved, CoordinatorAccepted, CoordinatorRejected, Completed, or Rejected'
    }),

  Actor_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Actor ID cannot be empty'
    }),

  ActorType: Joi.string()
    .valid('Coordinator', 'Admin')
    .messages({
      'any.only': 'Actor Type must be either Coordinator or Admin'
    }),

  ActorName: Joi.string()
    .trim()
    .allow('', null)
    .max(200)
    .messages({
      'string.max': 'Actor Name must not exceed 200 characters'
    }),

  Note: Joi.string()
    .trim()
    .allow('', null)
    .max(1000)
    .messages({
      'string.max': 'Note must not exceed 1000 characters'
    }),

  PreviousStatus: Joi.string()
    .trim()
    .allow('', null)
    .max(100)
    .messages({
      'string.max': 'Previous Status must not exceed 100 characters'
    }),

  NewStatus: Joi.string()
    .trim()
    .allow('', null)
    .max(100)
    .messages({
      'string.max': 'New Status must not exceed 100 characters'
    }),

  RescheduledDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Rescheduled Date must be a valid date',
      'date.format': 'Rescheduled Date must be in ISO format'
    }),

  OriginalDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Original Date must be a valid date',
      'date.format': 'Original Date must be in ISO format'
    }),

  Metadata: Joi.object()
    .unknown(true)
    .messages({
      'object.base': 'Metadata must be an object'
    }),

  ActionDate: Joi.date()
    .iso()
    .messages({
      'date.base': 'Action Date must be a valid date',
      'date.format': 'Action Date must be in ISO format'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateEventRequestHistory = (req, res, next) => {
  const { error, value } = createEventRequestHistorySchema.validate(req.body, {
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

const validateUpdateEventRequestHistory = (req, res, next) => {
  const { error, value } = updateEventRequestHistorySchema.validate(req.body, {
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
  createEventRequestHistorySchema,
  updateEventRequestHistorySchema,
  validateCreateEventRequestHistory,
  validateUpdateEventRequestHistory
};

