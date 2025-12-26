/**
 * Request Action Validators
 * 
 * Validation rules for request actions using Joi
 */

const Joi = require('joi');
const { REQUEST_ACTIONS } = require('../../utils/eventRequests/requestConstants');

/**
 * Validate execute action
 */
const validateExecuteAction = (req, res, next) => {
  const schema = Joi.object({
    action: Joi.string()
      .valid(...Object.values(REQUEST_ACTIONS))
      .required()
      .messages({
        'any.only': `action must be one of: ${Object.values(REQUEST_ACTIONS).join(', ')}`
      }),
    notes: Joi.string().trim().max(1000).optional(),
    proposedDate: Joi.date().iso().optional(),
    proposedStartTime: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional()
      .messages({
        'string.pattern.base': 'proposedStartTime must be in HH:mm format'
      }),
    proposedEndTime: Joi.string()
      .pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .optional()
      .messages({
        'string.pattern.base': 'proposedEndTime must be in HH:mm format'
      })
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

module.exports = {
  validateExecuteAction
};
