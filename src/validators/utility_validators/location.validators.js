const Joi = require('joi');

// Validation schema for creating a new location
const createLocationSchema = Joi.object({
  name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(200)
    .messages({
      'any.required': 'Location name is required',
      'string.empty': 'Location name cannot be empty',
      'string.min': 'Location name must be at least 2 characters long',
      'string.max': 'Location name must not exceed 200 characters'
    }),

  type: Joi.string()
    .required()
    .valid('province', 'district', 'city', 'municipality', 'barangay', 'custom')
    .messages({
      'any.required': 'Location type is required',
      'any.only': 'Location type must be one of: province, district, city, municipality, barangay, custom'
    }),

  parentId: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Parent ID cannot be empty if provided'
    }),

  code: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Location code must contain only lowercase letters, numbers, and hyphens',
      'string.max': 'Location code must not exceed 100 characters'
    }),

  administrativeCode: Joi.string()
    .trim()
    .max(50)
    .allow(null, '')
    .messages({
      'string.max': 'Administrative code must not exceed 50 characters'
    }),

  metadata: Joi.object({
    isCity: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'isCity must be a boolean'
      }),

    isCombined: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'isCombined must be a boolean'
      }),

    operationalGroup: Joi.string()
      .trim()
      .max(200)
      .allow(null, '')
      .messages({
        'string.max': 'Operational group must not exceed 200 characters'
      }),

    custom: Joi.object()
      .default({})
      .messages({
        'object.base': 'Custom metadata must be an object'
      })
  })
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

// Validation schema for updating an existing location
const updateLocationSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .messages({
      'string.empty': 'Location name cannot be empty',
      'string.min': 'Location name must be at least 2 characters long',
      'string.max': 'Location name must not exceed 200 characters'
    }),

  type: Joi.string()
    .valid('province', 'district', 'city', 'municipality', 'barangay', 'custom')
    .messages({
      'any.only': 'Location type must be one of: province, district, city, municipality, barangay, custom'
    }),

  parentId: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Parent ID cannot be empty if provided'
    }),

  code: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Location code must contain only lowercase letters, numbers, and hyphens',
      'string.max': 'Location code must not exceed 100 characters'
    }),

  administrativeCode: Joi.string()
    .trim()
    .max(50)
    .allow(null, '')
    .messages({
      'string.max': 'Administrative code must not exceed 50 characters'
    }),

  metadata: Joi.object({
    isCity: Joi.boolean()
      .messages({
        'boolean.base': 'isCity must be a boolean'
      }),

    isCombined: Joi.boolean()
      .messages({
        'boolean.base': 'isCombined must be a boolean'
      }),

    operationalGroup: Joi.string()
      .trim()
      .max(200)
      .allow(null, '')
      .messages({
        'string.max': 'Operational group must not exceed 200 characters'
      }),

    custom: Joi.object()
      .messages({
        'object.base': 'Custom metadata must be an object'
      })
  })
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

// Validation schema for assigning user to location
const assignUserLocationSchema = Joi.object({
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
    }),

  isPrimary: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'isPrimary must be a boolean'
    }),

  expiresAt: Joi.date()
    .iso()
    .allow(null)
    .messages({
      'date.base': 'Expiration date must be a valid date',
      'date.format': 'Expiration date must be in ISO format'
    })
});

// Middleware functions for validation
const validateCreateLocation = (req, res, next) => {
  const { error, value } = createLocationSchema.validate(req.body, {
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

const validateUpdateLocation = (req, res, next) => {
  const { error, value } = updateLocationSchema.validate(req.body, {
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

const validateAssignUserLocation = (req, res, next) => {
  const { error, value } = assignUserLocationSchema.validate(req.body, {
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
  createLocationSchema,
  updateLocationSchema,
  assignUserLocationSchema,
  validateCreateLocation,
  validateUpdateLocation,
  validateAssignUserLocation
};
