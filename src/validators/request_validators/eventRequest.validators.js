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
  // actor identifiers (controller forwards either coordinatorId or adminId)
  coordinatorId: Joi.string().trim().allow('', null).messages({ 'string.empty': 'Coordinator ID cannot be empty if provided' }),
  adminId: Joi.string().trim().allow('', null).messages({ 'string.empty': 'Admin ID cannot be empty if provided' }),

  // Common event fields that can be updated
  Event_Title: Joi.string().trim().allow('', null).messages({ 'string.empty': 'Event title cannot be empty' }),
  Event_Description: Joi.string().trim().allow('', null).messages({ 'string.empty': 'Event description cannot be empty' }),
  Location: Joi.string().trim().allow('', null).messages({ 'string.empty': 'Location cannot be empty' }),
  Email: Joi.string().email().allow('', null).messages({ 'string.email': 'Email must be a valid email address' }),
  Phone_Number: Joi.string().trim().allow('', null).messages({ 'string.empty': 'Phone number cannot be empty' }),

  // Date/time updates - frontend should only change times, but backend accepts ISO datetime
  Start_Date: Joi.date().iso().allow('', null).messages({ 'date.base': 'Start_Date must be a valid ISO date' }),
  End_Date: Joi.date().iso().allow('', null).messages({ 'date.base': 'End_Date must be a valid ISO date' }),

  // Category hints and specific fields
  categoryType: Joi.string().trim().allow('', null).messages({ 'string.empty': 'categoryType cannot be empty' }),

  // Training
  TrainingType: Joi.string().trim().allow('', null),
  MaxParticipants: Joi.number().integer().allow(null),

  // BloodDrive
  Target_Donation: Joi.number().integer().allow(null),
  VenueType: Joi.string().trim().allow('', null),

  // Advocacy
  Topic: Joi.string().trim().allow('', null),
  TargetAudience: Joi.string().trim().allow('', null),
  ExpectedAudienceSize: Joi.number().integer().allow(null),
  PartnerOrganization: Joi.string().trim().allow('', null),

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
  // If the caller included an adminId or coordinatorId we treat the caller as an actor
  // and relax the AdminNote requirement for admin actions (Rescheduled/Rejected).
  const actorPresent = !!(req.body && (req.body.adminId || req.body.coordinatorId));

  let schemaToUse = updateEventRequestSchema;
  if (actorPresent) {
    // create a relaxed schema where AdminNote is allowed to be empty for most actor-driven updates
    // but require AdminNote when the incoming action is explicitly a Rescheduled admin action.
    const incomingAction = req.body && req.body.AdminAction ? String(req.body.AdminAction) : (req.body && req.body.adminAction ? String(req.body.adminAction) : null);
    if (incomingAction === 'Rescheduled') {
      // keep original schema which enforces AdminNote when AdminAction is Rescheduled
      schemaToUse = updateEventRequestSchema;
    } else {
      const relaxedAdminNote = Joi.string().trim().allow('', null).messages({
        'string.empty': 'Admin Note cannot be empty when provided'
      });
      schemaToUse = updateEventRequestSchema.keys({ AdminNote: relaxedAdminNote });
    }
  }

  const { error, value } = schemaToUse.validate(req.body, {
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

