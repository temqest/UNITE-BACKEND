const Joi = require('joi');

// Validation schema for creating a new organization
const createOrganizationSchema = Joi.object({
  name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(200)
    .messages({
      'any.required': 'Organization name is required',
      'string.empty': 'Organization name cannot be empty',
      'string.min': 'Organization name must be at least 2 characters long',
      'string.max': 'Organization name must not exceed 200 characters'
    }),

  type: Joi.string()
    .required()
    .valid('LGU', 'NGO', 'Hospital', 'BloodBank', 'RedCross', 'Non-LGU', 'Other')
    .messages({
      'any.required': 'Organization type is required',
      'any.only': 'Organization type must be one of: LGU, NGO, Hospital, BloodBank, RedCross, Non-LGU, Other'
    }),

  code: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Organization code must contain only lowercase letters, numbers, and hyphens',
      'string.max': 'Organization code must not exceed 100 characters'
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 1000 characters'
    }),

  contactInfo: Joi.object({
    email: Joi.string()
      .email()
      .trim()
      .lowercase()
      .allow(null, '')
      .messages({
        'string.email': 'Contact email must be a valid email address'
      }),

    phone: Joi.string()
      .trim()
      .max(50)
      .allow(null, '')
      .messages({
        'string.max': 'Phone number must not exceed 50 characters'
      }),

    address: Joi.string()
      .trim()
      .max(500)
      .allow(null, '')
      .messages({
        'string.max': 'Address must not exceed 500 characters'
      })
  })
    .default({})
    .messages({
      'object.base': 'Contact info must be an object'
    }),

  metadata: Joi.object()
    .default({})
    .messages({
      'object.base': 'Metadata must be an object'
    }),

  isActive: Joi.boolean()
    .default(true)
    .messages({
      'boolean.base': 'isActive must be a boolean'
    })
});

// Validation schema for updating an existing organization
const updateOrganizationSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .messages({
      'string.empty': 'Organization name cannot be empty',
      'string.min': 'Organization name must be at least 2 characters long',
      'string.max': 'Organization name must not exceed 200 characters'
    }),

  type: Joi.string()
    .valid('LGU', 'NGO', 'Hospital', 'BloodBank', 'RedCross', 'Non-LGU', 'Other')
    .messages({
      'any.only': 'Organization type must be one of: LGU, NGO, Hospital, BloodBank, RedCross, Non-LGU, Other'
    }),

  code: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Organization code must contain only lowercase letters, numbers, and hyphens',
      'string.max': 'Organization code must not exceed 100 characters'
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 1000 characters'
    }),

  contactInfo: Joi.object({
    email: Joi.string()
      .email()
      .trim()
      .lowercase()
      .allow(null, '')
      .messages({
        'string.email': 'Contact email must be a valid email address'
      }),

    phone: Joi.string()
      .trim()
      .max(50)
      .allow(null, '')
      .messages({
        'string.max': 'Phone number must not exceed 50 characters'
      }),

    address: Joi.string()
      .trim()
      .max(500)
      .allow(null, '')
      .messages({
        'string.max': 'Address must not exceed 500 characters'
      })
  })
    .messages({
      'object.base': 'Contact info must be an object'
    }),

  metadata: Joi.object()
    .messages({
      'object.base': 'Metadata must be an object'
    }),

  isActive: Joi.boolean()
    .messages({
      'boolean.base': 'isActive must be a boolean'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateOrganization = (req, res, next) => {
  const { error, value } = createOrganizationSchema.validate(req.body, {
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

const validateUpdateOrganization = (req, res, next) => {
  const { error, value } = updateOrganizationSchema.validate(req.body, {
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
  createOrganizationSchema,
  updateOrganizationSchema,
  validateCreateOrganization,
  validateUpdateOrganization
};

