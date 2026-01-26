/**
 * v2.0 Event Request Validators
 * 
 * Validation rules for v2.0 event request endpoints using Joi
 */

const Joi = require('joi');

/**
 * Validate create event request
 */
const validateCreateEventRequest = (req, res, next) => {
  const schema = Joi.object({
    // Required event fields
    Event_Title: Joi.string().trim().required(),
    Location: Joi.string().trim().required(),
    Start_Date: Joi.date().required(),
    End_Date: Joi.date().optional(),
    // Optional event fields
    Email: Joi.string().email().allow('', null).optional(),
    Phone_Number: Joi.string().allow('', null).optional(),
    Event_Description: Joi.string().trim().allow('', null).optional(),
    Category: Joi.string().trim().optional(),
    // Category-specific fields
    Target_Donation: Joi.number().optional(),
    VenueType: Joi.string().trim().optional(),
    TrainingType: Joi.string().trim().optional(),
    MaxParticipants: Joi.number().optional(),
    Topic: Joi.string().trim().optional(),
    TargetAudience: Joi.string().trim().optional(),
    ExpectedAudienceSize: Joi.number().optional(),
    PartnerOrganization: Joi.string().trim().optional(),
    StaffAssignmentID: Joi.string().trim().optional(),
    // Location references (at least one required)
    municipalityId: Joi.string().hex().length(24).optional(),
    district: Joi.string().hex().length(24).optional(),
    province: Joi.string().hex().length(24).optional(),
    organizationId: Joi.string().hex().length(24).optional(),
    coverageAreaId: Joi.string().hex().length(24).optional(),
    organizationType: Joi.string().trim().optional(),
    // Request-specific fields
    notes: Joi.string().trim().max(1000).optional(),
    // Legacy field support
    Date: Joi.date().optional()
  }).unknown(false); // Don't allow unknown fields

  const { error, value } = schema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  // Ensure at least one location field is provided
  if (!value.municipalityId && !value.district && !value.province) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['At least one location field (municipalityId, district, or province) is required']
    });
  }
  
  // Normalize: use Date if provided, otherwise use Start_Date
  if (!value.Start_Date && value.Date) {
    value.Start_Date = value.Date;
  }
  
  req.validatedData = value;
  next();
};

/**
 * Validate update event request
 */
const validateUpdateEventRequest = (req, res, next) => {
  const schema = Joi.object({
    // Event fields
    Event_Title: Joi.string().trim().min(3).max(200).optional(),
    Location: Joi.string().trim().min(3).max(500).optional(),
    Start_Date: Joi.date().optional(),
    End_Date: Joi.date().optional(),
    Email: Joi.string().email().allow('', null).optional(),
    Phone_Number: Joi.string().allow('', null).optional(),
    Event_Description: Joi.string().trim().allow('', null).optional(),
    Category: Joi.string().trim().optional(),
    // Category-specific fields
    Target_Donation: Joi.number().optional(),
    VenueType: Joi.string().trim().optional(),
    TrainingType: Joi.string().trim().optional(),
    MaxParticipants: Joi.number().optional(),
    Topic: Joi.string().trim().optional(),
    TargetAudience: Joi.string().trim().optional(),
    ExpectedAudienceSize: Joi.number().optional(),
    PartnerOrganization: Joi.string().trim().optional(),
    StaffAssignmentID: Joi.string().trim().optional(),
    // Location references
    municipalityId: Joi.string().hex().length(24).optional(),
    district: Joi.string().hex().length(24).optional(),
    province: Joi.string().hex().length(24).optional(),
    organizationId: Joi.string().hex().length(24).optional(),
    coverageAreaId: Joi.string().hex().length(24).optional(),
    // Request-specific fields
    notes: Joi.string().trim().max(1000).optional(),
    // Legacy field support
    Date: Joi.date().optional()
  }).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

  const { error, value } = schema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  // Normalize: use Date if provided, otherwise use Start_Date
  if (!value.Start_Date && value.Date) {
    value.Start_Date = value.Date;
  }
  
  req.validatedData = value;
  next();
};

/**
 * Validate request ID parameter
 */
const validateRequestId = (req, res, next) => {
  const schema = Joi.object({
    requestId: Joi.string().trim().required()
  });

  const { error } = schema.validate({ requestId: req.params.requestId });
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: error.details.map(d => d.message)
    });
  }
  
  next();
};

/**
 * Validate execute action
 */
const validateExecuteAction = (req, res, next) => {
  const schema = Joi.object({
    action: Joi.string()
      .valid('accept', 'reject', 'reschedule', 'confirm', 'decline', 'cancel')
      .required(),
    notes: Joi.string().trim().max(1000).allow('', null).optional(),
    note: Joi.string().trim().max(1000).allow('', null).optional(), // Support both field names
    // Reschedule-specific fields
    proposedDate: Joi.date().when('action', {
      is: 'reschedule',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    proposedStartTime: Joi.string().trim().optional(),
    proposedEndTime: Joi.string().trim().optional()
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });
  
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  // Normalize notes field
  if (value.note && !value.notes) {
    value.notes = value.note;
  }

  // Enforce note requirement only for reject/reschedule actions
  const requiresNote = ['reject', 'reschedule'].includes(value.action);
  if (requiresNote) {
    const noteStr = (value.notes || '').trim();
    if (!noteStr) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: ['Note is required for reject/reschedule actions']
      });
    }
  }
  
  req.validatedData = value;
  next();
};

module.exports = {
  validateCreateEventRequest,
  validateUpdateEventRequest,
  validateRequestId,
  validateExecuteAction
};
