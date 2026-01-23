const Joi = require('joi');

// Validation schema for creating a new event
const createEventSchema = Joi.object({
  Event_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Event ID is required',
      'string.empty': 'Event ID cannot be empty'
    }),

  Request_ID: Joi.string()
    .optional()
    .allow('', null)
    .trim()
    .messages({
      'string.empty': 'Request ID cannot be empty'
    }),

  isBatchCreated: Joi.boolean()
    .optional(),

  Event_Title: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'any.required': 'Event Title is required',
      'string.empty': 'Event Title cannot be empty',
      'string.min': 'Event Title must be at least 3 characters long',
      'string.max': 'Event Title must not exceed 200 characters'
    }),

  Location: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(500)
    .messages({
      'any.required': 'Location is required',
      'string.empty': 'Location cannot be empty',
      'string.min': 'Location must be at least 3 characters long',
      'string.max': 'Location must not exceed 500 characters'
    }),

  Start_Date: Joi.date()
    .required()
    .iso()
    .messages({
      'any.required': 'Start Date is required',
      'date.base': 'Start Date must be a valid date',
      'date.format': 'Start Date must be in ISO format'
    }),

  End_Date: Joi.date()
    .iso()
    .greater(Joi.ref('Start_Date'))
    .messages({
      'date.base': 'End Date must be a valid date',
      'date.greater': 'End Date must be after Start Date',
      'date.format': 'End Date must be in ISO format'
    }),

  ApprovedByAdminID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Approved By Admin ID cannot be empty if provided'
    }),

  MadeByCoordinatorID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Made By Coordinator ID is required',
      'string.empty': 'Made By Coordinator ID cannot be empty'
    }),

  StaffAssignmentID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Staff Assignment ID cannot be empty if provided'
    }),

  Email: Joi.string()
    .optional()
    .allow('', null)
    .trim()
    .lowercase()
    .email()
    .messages({
      'string.email': 'Please provide a valid email address'
    }),

  Phone_Number: Joi.string()
    .optional()
    .allow('', null)
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .min(10)
    .max(20)
    .messages({
      'string.min': 'Phone Number must be at least 10 characters long',
      'string.max': 'Phone Number must not exceed 20 characters',
      'string.pattern.base': 'Phone Number can only contain numbers, +, -, spaces, and parentheses'
    }),

  Status: Joi.string()
    .valid('Pending', 'Approved', 'Rescheduled', 'Rejected', 'Completed')
    .default('Pending')
    .messages({
      'any.only': 'Status must be one of: Pending, Approved, Rescheduled, Rejected, Completed'
    })
});

// Validation schema for updating an existing event
const updateEventSchema = Joi.object({
  Event_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Event ID cannot be empty'
    }),

  Request_ID: Joi.string()
    .optional()
    .allow('', null)
    .trim()
    .messages({
      'string.empty': 'Request ID cannot be empty'
    }),

  isBatchCreated: Joi.boolean()
    .optional(),

  Event_Title: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Event Title cannot be empty',
      'string.min': 'Event Title must be at least 3 characters long',
      'string.max': 'Event Title must not exceed 200 characters'
    }),

  Location: Joi.string()
    .trim()
    .min(3)
    .max(500)
    .messages({
      'string.empty': 'Location cannot be empty',
      'string.min': 'Location must be at least 3 characters long',
      'string.max': 'Location must not exceed 500 characters'
    }),

  // New hierarchical fields
  province: Joi.string().trim().allow(null, ''),
  district: Joi.string().trim().allow(null, ''),
  municipality: Joi.string().trim().allow(null, ''),
  // Optional stakeholder association when admin/coordinator attaches one
  stakeholder: Joi.string().trim().allow(null, ''),

  Start_Date: Joi.date()
    .iso()
    .messages({
      'date.base': 'Start Date must be a valid date',
      'date.format': 'Start Date must be in ISO format'
    }),

  End_Date: Joi.date()
    .iso()
    .messages({
      'date.base': 'End Date must be a valid date',
      'date.format': 'End Date must be in ISO format'
    }),

  ApprovedByAdminID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Approved By Admin ID cannot be empty if provided'
    }),

  MadeByCoordinatorID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Made By Coordinator ID cannot be empty'
    }),

  StaffAssignmentID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Staff Assignment ID cannot be empty if provided'
    }),

  Email: Joi.string()
    .allow('', null)
    .optional(),

  Phone_Number: Joi.string()
    .allow('', null)
    .optional(),

  Status: Joi.string()
    .valid('Pending', 'Approved', 'Rescheduled', 'Rejected', 'Completed')
    .messages({
      'any.only': 'Status must be one of: Pending, Approved, Rescheduled, Rejected, Completed'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateEvent = (req, res, next) => {
  const { error, value } = createEventSchema.validate(req.body, {
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

const validateUpdateEvent = (req, res, next) => {
  const { error, value } = updateEventSchema.validate(req.body, {
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
  createEventSchema,
  updateEventSchema,
  validateCreateEvent,
  validateUpdateEvent
};

