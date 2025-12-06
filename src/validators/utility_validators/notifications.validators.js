const Joi = require('joi');

// Validation schema for creating a new notification
const createNotificationSchema = Joi.object({
  Notification_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Notification ID is required',
      'string.empty': 'Notification ID cannot be empty'
    }),

  Recipient_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Recipient ID is required',
      'string.empty': 'Recipient ID cannot be empty'
    }),

  RecipientType: Joi.string()
    .required()
    .valid('Admin', 'Coordinator')
    .messages({
      'any.required': 'Recipient Type is required',
      'any.only': 'Recipient Type must be either Admin or Coordinator'
    }),

  Request_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Request ID is required',
      'string.empty': 'Request ID cannot be empty'
    }),

  Event_ID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Event ID cannot be empty if provided'
    }),

  Title: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'any.required': 'Title is required',
      'string.empty': 'Title cannot be empty',
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title must not exceed 200 characters'
    }),

  Message: Joi.string()
    .required()
    .trim()
    .min(10)
    .max(1000)
    .messages({
      'any.required': 'Message is required',
      'string.empty': 'Message cannot be empty',
      'string.min': 'Message must be at least 10 characters long',
      'string.max': 'Message must not exceed 1000 characters'
    }),

  NotificationType: Joi.string()
    .required()
    .valid(
      'NewRequest',
      'AdminAccepted',
      'AdminRescheduled',
      'AdminRejected',
      'CoordinatorApproved',
      'CoordinatorAccepted',
      'CoordinatorRejected',
      'RequestCompleted',
      'RequestRejected',
      'RequestCancelled'
    )
    .messages({
      'any.required': 'Notification Type is required',
      'any.only': 'Notification Type must be one of: NewRequest, AdminAccepted, AdminRescheduled, AdminRejected, CoordinatorApproved, CoordinatorAccepted, CoordinatorRejected, RequestCompleted, RequestRejected, or RequestCancelled'
    }),

  IsRead: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'Is Read must be a boolean value'
    }),

  ReadAt: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Read At must be a valid date',
      'date.format': 'Read At must be in ISO format'
    }),

  ActionTaken: Joi.string()
    .trim()
    .allow('', null)
    .max(100)
    .messages({
      'string.max': 'Action Taken must not exceed 100 characters'
    }),

  ActionNote: Joi.string()
    .trim()
    .allow('', null)
    .max(1000)
    .messages({
      'string.max': 'Action Note must not exceed 1000 characters'
    }),

  RescheduledDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Rescheduled Date must be a valid date',
      'date.format': 'Rescheduled Date must be in ISO format'
    })
});

// Validation schema for updating an existing notification
const updateNotificationSchema = Joi.object({
  Notification_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Notification ID cannot be empty'
    }),

  Recipient_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Recipient ID cannot be empty'
    }),

  RecipientType: Joi.string()
    .valid('Admin', 'Coordinator')
    .messages({
      'any.only': 'Recipient Type must be either Admin or Coordinator'
    }),

  Request_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Request ID cannot be empty'
    }),

  Event_ID: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Event ID cannot be empty if provided'
    }),

  Title: Joi.string()
    .trim()
    .min(3)
    .max(200)
    .messages({
      'string.empty': 'Title cannot be empty',
      'string.min': 'Title must be at least 3 characters long',
      'string.max': 'Title must not exceed 200 characters'
    }),

  Message: Joi.string()
    .trim()
    .min(10)
    .max(1000)
    .messages({
      'string.empty': 'Message cannot be empty',
      'string.min': 'Message must be at least 10 characters long',
      'string.max': 'Message must not exceed 1000 characters'
    }),

  NotificationType: Joi.string()
    .valid(
      'NewRequest',
      'AdminAccepted',
      'AdminRescheduled',
      'AdminRejected',
      'CoordinatorApproved',
      'CoordinatorAccepted',
      'CoordinatorRejected',
      'RequestCompleted',
      'RequestRejected',
      'RequestCancelled'
    )
    .messages({
      'any.only': 'Notification Type must be one of: NewRequest, AdminAccepted, AdminRescheduled, AdminRejected, CoordinatorApproved, CoordinatorAccepted, CoordinatorRejected, RequestCompleted, RequestRejected, or RequestCancelled'
    }),

  IsRead: Joi.boolean()
    .messages({
      'boolean.base': 'Is Read must be a boolean value'
    }),

  ReadAt: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Read At must be a valid date',
      'date.format': 'Read At must be in ISO format'
    }),

  ActionTaken: Joi.string()
    .trim()
    .allow('', null)
    .max(100)
    .messages({
      'string.max': 'Action Taken must not exceed 100 characters'
    }),

  ActionNote: Joi.string()
    .trim()
    .allow('', null)
    .max(1000)
    .messages({
      'string.max': 'Action Note must not exceed 1000 characters'
    }),

  RescheduledDate: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Rescheduled Date must be a valid date',
      'date.format': 'Rescheduled Date must be in ISO format'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateNotification = (req, res, next) => {
  const { error, value } = createNotificationSchema.validate(req.body, {
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

const validateUpdateNotification = (req, res, next) => {
  const { error, value } = updateNotificationSchema.validate(req.body, {
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
  createNotificationSchema,
  updateNotificationSchema,
  validateCreateNotification,
  validateUpdateNotification
};

