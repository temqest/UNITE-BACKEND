const Joi = require('joi');

// Validation schema for creating a new user (unified model)
const createUserSchema = Joi.object({
  email: Joi.string()
    .required()
    .email()
    .trim()
    .lowercase()
    .messages({
      'any.required': 'Email is required',
      'string.email': 'Email must be a valid email address',
      'string.empty': 'Email cannot be empty'
    }),

  firstName: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(100)
    .messages({
      'any.required': 'First name is required',
      'string.empty': 'First name cannot be empty',
      'string.min': 'First name must be at least 1 character long',
      'string.max': 'First name must not exceed 100 characters'
    }),

  middleName: Joi.string()
    .trim()
    .max(100)
    .allow(null, '')
    .messages({
      'string.max': 'Middle name must not exceed 100 characters'
    }),

  lastName: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(100)
    .messages({
      'any.required': 'Last name is required',
      'string.empty': 'Last name cannot be empty',
      'string.min': 'Last name must be at least 1 character long',
      'string.max': 'Last name must not exceed 100 characters'
    }),

  phoneNumber: Joi.string()
    .trim()
    .min(5)
    .max(30)
    .allow(null, '')
    .messages({
      'string.min': 'Phone number must be at least 5 characters long',
      'string.max': 'Phone number must not exceed 30 characters'
    }),

  password: Joi.string()
    .required()
    .min(6)
    .max(128)
    .messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 6 characters long',
      'string.max': 'Password must not exceed 128 characters'
    }),

  organizationType: Joi.string()
    .valid('LGU', 'NGO', 'Hospital', 'RedCross', 'Non-LGU', 'Other')
    .allow(null, '')
    .messages({
      'any.only': 'Organization type must be one of: LGU, NGO, Hospital, RedCross, Non-LGU, Other'
    }),

  organizationInstitution: Joi.string()
    .trim()
    .max(200)
    .allow(null, '')
    .messages({
      'string.max': 'Organization institution must not exceed 200 characters'
    }),

  field: Joi.string()
    .trim()
    .max(100)
    .allow(null, '')
    .messages({
      'string.max': 'Field must not exceed 100 characters'
    }),

  isSystemAdmin: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'isSystemAdmin must be a boolean'
    }),

  // RBAC fields
  roles: Joi.array()
    .items(Joi.string().trim())
    .default([])
    .messages({
      'array.base': 'Roles must be an array'
    }),

  locations: Joi.array()
    .items(
      Joi.object({
        locationId: Joi.string()
          .required()
          .trim()
          .messages({
            'any.required': 'Location ID is required',
            'string.empty': 'Location ID cannot be empty'
          }),
        scope: Joi.string()
          .valid('exact', 'descendants', 'ancestors', 'all')
          .default('exact')
          .messages({
            'any.only': 'Scope must be one of: exact, descendants, ancestors, all'
          })
      })
    )
    .default([])
    .messages({
      'array.base': 'Locations must be an array'
    }),

  // Page context for staff creation (used by middleware for validation)
  pageContext: Joi.string()
    .valid('coordinator-management', 'stakeholder-management')
    .allow(null, '')
    .messages({
      'any.only': 'Page context must be either "coordinator-management" or "stakeholder-management"'
    })
});

// Validation schema for updating an existing user
const updateUserSchema = Joi.object({
  firstName: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .messages({
      'string.empty': 'First name cannot be empty',
      'string.min': 'First name must be at least 1 character long',
      'string.max': 'First name must not exceed 100 characters'
    }),

  middleName: Joi.string()
    .trim()
    .max(100)
    .allow(null, '')
    .messages({
      'string.max': 'Middle name must not exceed 100 characters'
    }),

  lastName: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .messages({
      'string.empty': 'Last name cannot be empty',
      'string.min': 'Last name must be at least 1 character long',
      'string.max': 'Last name must not exceed 100 characters'
    }),

  phoneNumber: Joi.string()
    .trim()
    .min(5)
    .max(30)
    .allow(null, '')
    .messages({
      'string.min': 'Phone number must be at least 5 characters long',
      'string.max': 'Phone number must not exceed 30 characters'
    }),

  organizationType: Joi.string()
    .valid('LGU', 'NGO', 'Hospital', 'RedCross', 'Non-LGU', 'Other')
    .allow(null, '')
    .messages({
      'any.only': 'Organization type must be one of: LGU, NGO, Hospital, RedCross, Non-LGU, Other'
    }),

  organizationInstitution: Joi.string()
    .trim()
    .max(200)
    .allow(null, '')
    .messages({
      'string.max': 'Organization institution must not exceed 200 characters'
    }),

  field: Joi.string()
    .trim()
    .max(100)
    .allow(null, '')
    .messages({
      'string.max': 'Field must not exceed 100 characters'
    }),

  isSystemAdmin: Joi.boolean()
    .messages({
      'boolean.base': 'isSystemAdmin must be a boolean'
    }),

  isActive: Joi.boolean()
    .messages({
      'boolean.base': 'isActive must be a boolean'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateUser = (req, res, next) => {
  const { error, value } = createUserSchema.validate(req.body, {
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

const validateUpdateUser = (req, res, next) => {
  const { error, value } = updateUserSchema.validate(req.body, {
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
  createUserSchema,
  updateUserSchema,
  validateCreateUser,
  validateUpdateUser
};
