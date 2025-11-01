const Joi = require('joi');

// Validation schema for creating a new event request
const createEventRequestSchema = Joi.object({
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

  Coordinator_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Coordinator ID is required',
      'string.empty': 'Coordinator ID cannot be empty'
    }),

  Admin_ID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Admin ID cannot be empty if provided'
    }),

  AdminAction: Joi.string()
    .valid('Accepted', 'Rescheduled', 'Rejected', null)
    .allow(null)
    .messages({
      'any.only': 'Admin Action must be one of: Accepted, Rescheduled, Rejected, or null'
    }),

  AdminNote: Joi.string()
    .trim()
    .allow('', null)
    .when('AdminAction', {
      is: Joi.string().valid('Rescheduled', 'Rejected'),
      then: Joi.string().trim().min(1).required(),
      otherwise: Joi.string().trim().allow('', null)
    })
    .messages({
      'any.required': 'Admin Note is required when Admin Action is Rescheduled or Rejected',
      'string.empty': 'Admin Note cannot be empty when Admin Action is Rescheduled or Rejected',
      'string.min': 'Admin Note must be at least 1 character long'
    }),

  RescheduledDate: Joi.date()
    .iso()
    .allow(null)
    .when('AdminAction', {
      is: 'Rescheduled',
      then: Joi.date().iso().required(),
      otherwise: Joi.date().iso().allow(null)
    })
    .messages({
      'any.required': 'Rescheduled Date is required when Admin Action is Rescheduled',
      'date.base': 'Rescheduled Date must be a valid date',
      'date.format': 'Rescheduled Date must be in ISO format'
    }),

  AdminActionDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Admin Action Date must be a valid date',
      'date.format': 'Admin Action Date must be in ISO format'
    }),

  CoordinatorFinalAction: Joi.string()
    .valid('Approved', 'Accepted', 'Rejected', null)
    .allow(null)
    .messages({
      'any.only': 'Coordinator Final Action must be one of: Approved, Accepted, Rejected, or null'
    }),

  CoordinatorFinalActionDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Coordinator Final Action Date must be a valid date',
      'date.format': 'Coordinator Final Action Date must be in ISO format'
    }),

  Status: Joi.string()
    .valid(
      'Pending_Admin_Review',
      'Accepted_By_Admin',
      'Rescheduled_By_Admin',
      'Rejected_By_Admin',
      'Completed',
      'Rejected'
    )
    .default('Pending_Admin_Review')
    .messages({
      'any.only': 'Status must be one of: Pending_Admin_Review, Accepted_By_Admin, Rescheduled_By_Admin, Rejected_By_Admin, Completed, or Rejected'
    })
});

// Validation schema for updating an existing event request
const updateEventRequestSchema = Joi.object({
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

  Coordinator_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Coordinator ID cannot be empty'
    }),

  Admin_ID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Admin ID cannot be empty if provided'
    }),

  AdminAction: Joi.string()
    .valid('Accepted', 'Rescheduled', 'Rejected', null)
    .allow(null)
    .messages({
      'any.only': 'Admin Action must be one of: Accepted, Rescheduled, Rejected, or null'
    }),

  AdminNote: Joi.string()
    .trim()
    .allow('', null)
    .when('AdminAction', {
      is: Joi.string().valid('Rescheduled', 'Rejected'),
      then: Joi.string().trim().min(1).required(),
      otherwise: Joi.string().trim().allow('', null)
    })
    .messages({
      'any.required': 'Admin Note is required when Admin Action is Rescheduled or Rejected',
      'string.empty': 'Admin Note cannot be empty when Admin Action is Rescheduled or Rejected',
      'string.min': 'Admin Note must be at least 1 character long'
    }),

  RescheduledDate: Joi.date()
    .iso()
    .allow(null)
    .when('AdminAction', {
      is: 'Rescheduled',
      then: Joi.date().iso().required(),
      otherwise: Joi.date().iso().allow(null)
    })
    .messages({
      'any.required': 'Rescheduled Date is required when Admin Action is Rescheduled',
      'date.base': 'Rescheduled Date must be a valid date',
      'date.format': 'Rescheduled Date must be in ISO format'
    }),

  AdminActionDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Admin Action Date must be a valid date',
      'date.format': 'Admin Action Date must be in ISO format'
    }),

  CoordinatorFinalAction: Joi.string()
    .valid('Approved', 'Accepted', 'Rejected', null)
    .allow(null)
    .messages({
      'any.only': 'Coordinator Final Action must be one of: Approved, Accepted, Rejected, or null'
    }),

  CoordinatorFinalActionDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Coordinator Final Action Date must be a valid date',
      'date.format': 'Coordinator Final Action Date must be in ISO format'
    }),

  Status: Joi.string()
    .valid(
      'Pending_Admin_Review',
      'Accepted_By_Admin',
      'Rescheduled_By_Admin',
      'Rejected_By_Admin',
      'Completed',
      'Rejected'
    )
    .messages({
      'any.only': 'Status must be one of: Pending_Admin_Review, Accepted_By_Admin, Rescheduled_By_Admin, Rejected_By_Admin, Completed, or Rejected'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateEventRequest = (req, res, next) => {
  const { error, value } = createEventRequestSchema.validate(req.body, {
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

const validateUpdateEventRequest = (req, res, next) => {
  const { error, value } = updateEventRequestSchema.validate(req.body, {
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
  createEventRequestSchema,
  updateEventRequestSchema,
  validateCreateEventRequest,
  validateUpdateEventRequest
};

