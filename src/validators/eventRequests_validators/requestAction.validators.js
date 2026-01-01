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
  // Get action from request body to determine validation rules
  const action = req.body?.action;
  
  // Base schema with common fields (no note/notes initially)
  const baseSchema = {
    action: Joi.string()
      .valid(...Object.values(REQUEST_ACTIONS))
      .required()
      .messages({
        'any.only': `action must be one of: ${Object.values(REQUEST_ACTIONS).join(', ')}`
      }),
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
  };

  // Conditionally add note/notes based on action
  if (action === REQUEST_ACTIONS.REJECT || action === REQUEST_ACTIONS.RESCHEDULE) {
    // For reject and reschedule, notes are REQUIRED
    // Support both 'note' and 'notes' for backward compatibility
    // At least one must be provided (they're normalized to 'notes' later)
    baseSchema.note = Joi.string().trim().max(1000).allow('').optional();
    baseSchema.notes = Joi.string().trim().max(1000).allow('').optional();
  }
  // For accept, confirm, and other actions, note/notes are not allowed
  // (they won't be in the schema, so they'll be rejected by unknown(false))

  // For reschedule, proposedDate is required
  if (action === REQUEST_ACTIONS.RESCHEDULE) {
    baseSchema.proposedDate = Joi.date().iso().required().messages({
      'any.required': 'proposedDate is required for reschedule action',
      'date.base': 'proposedDate must be a valid date',
      'date.format': 'proposedDate must be in ISO format'
    });
  }

  // For REJECT and RESCHEDULE, validate that at least one of note/notes is provided and non-empty
  if (action === REQUEST_ACTIONS.REJECT || action === REQUEST_ACTIONS.RESCHEDULE) {
    const schema = Joi.object(baseSchema).unknown(false);
    const { error: schemaError, value } = schema.validate(req.body, { abortEarly: false });
    
    if (schemaError) {
      const errorMessages = schemaError.details.map(d => d.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }
    
    // Custom validation: at least one of note/notes must be provided and non-empty
    const noteValue = (value.note || '').trim();
    const notesValue = (value.notes || '').trim();
    
    if (!noteValue && !notesValue) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: [`Note is required for ${action} action`]
      });
    }
    
    // Normalize note/notes to notes for consistency
    if (noteValue && !notesValue) {
      value.notes = noteValue;
      delete value.note;
    } else if (notesValue) {
      value.notes = notesValue;
      delete value.note;
    }
    
    req.validatedData = value;
    next();
  } else {
    // For other actions, use standard validation
    const schema = Joi.object(baseSchema).unknown(false);
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errorMessages = error.details.map(d => d.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errorMessages
      });
    }
    
    // Normalize note/notes to notes for consistency (if present)
    if (value.note && !value.notes) {
      value.notes = value.note;
      delete value.note;
    }
    
    req.validatedData = value;
    next();
  }
};

module.exports = {
  validateExecuteAction
};
