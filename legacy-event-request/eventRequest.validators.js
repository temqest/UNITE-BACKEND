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

  // Legacy fields (for backward compatibility)
  coordinator_id: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Coordinator ID cannot be empty if provided'
    }),

  stakeholder_id: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Stakeholder ID cannot be empty if provided'
    }),

  made_by_id: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Made by ID cannot be empty if provided'
    }),

  made_by_role: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Made by role cannot be empty if provided'
    }),

  // New role-agnostic fields
  requester: Joi.object({
    userId: Joi.string().trim().allow(null, ''),
    id: Joi.string().trim().allow(null, ''),
    roleSnapshot: Joi.string().trim().allow(null, ''),
    authoritySnapshot: Joi.number().integer().min(20).max(100).allow(null),
    name: Joi.string().trim().allow(null, '')
  }).allow(null),
  
  // New coordinator assignment field
  assignedCoordinator: Joi.object({
    userId: Joi.string().trim().allow(null, ''),
    id: Joi.string().trim().allow(null, ''),
    assignmentRule: Joi.string().valid('auto', 'manual', 'organization_match', 'coverage_match').allow(null, '')
  }).allow(null),
  
  // New stakeholder reference field
  stakeholderReference: Joi.object({
    userId: Joi.string().trim().allow(null, ''),
    id: Joi.string().trim().allow(null, ''),
    relationshipType: Joi.string().valid('creator', 'participant', 'sponsor').allow(null, '')
  }).allow(null),
  
  // Organization and coverage references
  organizationId: Joi.string().trim().allow(null, ''),
  coverageAreaId: Joi.string().trim().allow(null, ''),
  municipalityId: Joi.string().trim().allow(null, ''),

  // New flexible location structure
  location: Joi.object({
    province: Joi.string().trim().allow(null, ''),
    district: Joi.string().trim().allow(null, ''),
    municipality: Joi.string().trim().allow(null, ''),
    custom: Joi.string().trim().allow(null, '')
  }).allow(null),

  // Legacy location fields (for backward compatibility)
  province: Joi.string().trim().allow(null, ''),
  district: Joi.string().trim().allow(null, ''),
  municipality: Joi.string().trim().allow(null, ''),

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
  // Stakeholder identifier when a stakeholder is submitting an update (allowed)
  stakeholder_id: Joi.string().trim().allow('', null).messages({ 'string.empty': 'Stakeholder ID cannot be empty if provided' }),
  MadeByStakeholderID: Joi.string().trim().allow('', null).messages({ 'string.empty': 'MadeByStakeholderID cannot be empty if provided' }),

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

  coordinator_id: Joi.string()
    .trim()
    .messages({
      'string.empty': 'Coordinator ID cannot be empty'
    }),

  made_by_id: Joi.string()
    .trim()
    .allow('', null)
    .messages({
      'string.empty': 'Made by ID cannot be empty if provided'
    }),

  made_by_role: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Made by role cannot be empty if provided'
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
  // Detect actor presence strictly from the authenticated token only.
  // We ignore any actor ids that may be present in the body to prevent
  // clients from spoofing roles. The route should be protected by
  // authentication middleware so req.user is available.
  // Check if user is authenticated (role checks removed - permissions are checked in middleware/controllers)
  const actorPresent = !!(req.user && req.user.id);

  // Sanitize admin-related action fields (AdminAction/AdminNote/RescheduledDate)
  // from the incoming payload for all update requests. Admin actions should be
  // performed via the dedicated admin-action endpoint; stripping here prevents
  // accidental validation triggers when clients include the full request object
  // while performing a simple edit (e.g., changing title).
  if (req.body) {
    // Deep-clone the body so we don't mutate the original request unexpectedly
    const cloneDeep = (o) => JSON.parse(JSON.stringify(o));
    const originalBody = cloneDeep(req.body);
    const sanitized = cloneDeep(req.body);

    // Recursively strip any admin-related fields (many clients may send different casings or snake_case)
    const stripAdminFields = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const k = String(key);
        const normalized = k.replace(/[^a-zA-Z]/g, '').toLowerCase();
        // Keys that indicate admin action/note/date or reschedule
        if (
          normalized === 'adminaction' ||
          normalized === 'adminnote' ||
          normalized === 'adminactiondate' ||
          normalized === 'rescheduleddate' ||
          normalized === 'rescheduleddate'
        ) {
          delete obj[key];
          continue;
        }

        // also remove common snake_case or camel variants that include admin + action/note
        if (normalized.includes('admin') && (normalized.includes('action') || normalized.includes('note') || normalized.includes('rescheduled'))) {
          delete obj[key];
          continue;
        }

        // Recurse into nested objects/arrays
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          stripAdminFields(obj[key]);
        }
      }
    };

    stripAdminFields(sanitized);

    // Replace the request body used for validation with the sanitized copy
    req.body = sanitized;
  }

  let schemaToUse = updateEventRequestSchema;
  if (!actorPresent) {
    // When the caller is NOT an admin/coordinator, ensure admin-related keys
    // are stripped from the validated result so Joi conditional rules based
    // on AdminAction do not trigger. Using Joi.any().strip() will silently
    // remove these keys during validation.
    schemaToUse = updateEventRequestSchema.keys({
      AdminAction: Joi.any().strip(),
      adminAction: Joi.any().strip(),
      AdminNote: Joi.any().strip(),
      adminNote: Joi.any().strip(),
      RescheduledDate: Joi.any().strip(),
      rescheduledDate: Joi.any().strip()
    });
  } else {
    // create a relaxed schema where AdminNote is allowed to be empty for most actor-driven updates
    // but require AdminNote when the incoming action is explicitly Rescheduled or Rejected.
    const incomingAction = req.body && (req.body.AdminAction ? String(req.body.AdminAction) : (req.body.adminAction ? String(req.body.adminAction) : null));
    if (incomingAction === 'Rescheduled' || incomingAction === 'Rejected') {
      // keep original schema which enforces AdminNote when AdminAction is Rescheduled or Rejected
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

