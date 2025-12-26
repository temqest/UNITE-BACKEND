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
    Event_ID: Joi.string().trim().required(),
    Category: Joi.string().trim().optional(),
    organizationId: Joi.string().hex().length(24).optional(),
    coverageAreaId: Joi.string().hex().length(24).optional(),
    municipalityId: Joi.string().hex().length(24).optional(),
    district: Joi.string().hex().length(24).optional(),
    province: Joi.string().hex().length(24).optional(),
    notes: Joi.string().trim().max(1000).optional()
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
  req.validatedData = value;
  next();
};

/**
 * Validate update event request
 */
const validateUpdateEventRequest = (req, res, next) => {
  const schema = Joi.object({
    Category: Joi.string().trim().optional(),
    municipalityId: Joi.string().hex().length(24).optional(),
    district: Joi.string().hex().length(24).optional(),
    province: Joi.string().hex().length(24).optional(),
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
