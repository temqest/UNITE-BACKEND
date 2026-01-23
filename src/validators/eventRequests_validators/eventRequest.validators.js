/**
 * Event Request Validators
 * 
 * Validation rules for event request creation and updates using Joi
 */

const Joi = require('joi');

/**
 * Validate create event request
 */
const validateCreateEventRequest = (req, res, next) => {
  const schema = Joi.object({
    // Event_ID is optional - it will be generated when the request is approved and event is created
    Event_ID: Joi.string().trim().optional(),
    // Required event fields
    Event_Title: Joi.string().trim().required(),
    Location: Joi.string().trim().required(),
    Date: Joi.date().optional(), // Can be Date or Start_Date (for backward compatibility)
    Start_Date: Joi.date().optional(), // Support old field name for backward compatibility
    Email: Joi.string().allow('', null).optional(),
    Phone_Number: Joi.string().allow('', null).optional(),
    // Optional event fields
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
    // Location and organization references
    organizationId: Joi.string().optional(),
    coverageAreaId: Joi.string().optional(),
    municipalityId: Joi.string().optional(),
    district: Joi.string().optional(),
    province: Joi.string().optional(),
    // Request-specific fields
    notes: Joi.string().trim().max(1000).optional(),
    coordinatorId: Joi.string().optional() // For testing purposes
  }).unknown(true); // Allow unknown fields to pass through

  const { error, value } = schema.validate(req.body, { abortEarly: false, allowUnknown: true });
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  // Ensure at least one of Date or Start_Date is provided
  if (!value.Date && !value.Start_Date) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: ['Either Date or Start_Date is required']
    });
  }
  
  // Normalize: use Date if provided, otherwise use Start_Date
  if (!value.Date && value.Start_Date) {
    value.Date = value.Start_Date;
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
    Date: Joi.date().optional(),
    Start_Date: Joi.date().optional(),
    End_Date: Joi.date().optional(),
    Email: Joi.string().allow('', null).optional(),
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
    // Location and organization references
    municipalityId: Joi.string().hex().length(24).optional(),
    district: Joi.string().hex().length(24).optional(),
    province: Joi.string().hex().length(24).optional(),
    organizationId: Joi.string().optional(),
    coverageAreaId: Joi.string().optional(),
    // Request-specific fields
    notes: Joi.string().trim().max(1000).optional()
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
  if (!value.Date && value.Start_Date) {
    value.Date = value.Start_Date;
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

module.exports = {
  validateCreateEventRequest,
  validateUpdateEventRequest,
  validateRequestId
};
