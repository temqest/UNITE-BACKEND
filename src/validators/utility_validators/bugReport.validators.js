const Joi = require('joi');

/**
 * Validator for creating a bug report
 */
const validateCreateBugReport = (req, res, next) => {
  const schema = Joi.object({
    description: Joi.string()
      .trim()
      .max(5000)
      .required()
      .messages({
        'string.empty': 'Description is required',
        'string.max': 'Description cannot exceed 5000 characters'
      }),
    
    imageKeys: Joi.array()
      .items(
        Joi.object({
          key: Joi.string().required(),
          filename: Joi.string().required(),
          contentType: Joi.string().optional(),
          size: Joi.number().optional()
        })
      )
      .max(5)
      .optional()
      .messages({
        'array.max': 'Maximum 5 images allowed'
      }),
    
    priority: Joi.string()
      .valid('Low', 'Medium', 'High', 'Critical')
      .optional()
      .default('Medium'),
    
    userAgent: Joi.string().optional(),
    pageUrl: Joi.string().uri().optional()
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });

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

/**
 * Validator for updating a bug report
 */
const validateUpdateBugReport = (req, res, next) => {
  const schema = Joi.object({
    Status: Joi.string()
      .valid('Open', 'In Progress', 'Resolved', 'Closed', 'Cannot Reproduce')
      .optional(),
    
    Priority: Joi.string()
      .valid('Low', 'Medium', 'High', 'Critical')
      .optional(),
    
    Admin_Notes: Joi.string()
      .max(5000)
      .allow('')
      .optional(),
    
    Assigned_To: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .allow(null)
      .optional()
      .messages({
        'string.pattern.base': 'Assigned_To must be a valid ObjectId'
      })
  }).min(1).messages({
    'object.min': 'At least one field must be provided for update'
  });

  const { error, value } = schema.validate(req.body, { abortEarly: false });

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
  validateCreateBugReport,
  validateUpdateBugReport
};
