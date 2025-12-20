const Joi = require('joi');

// Validation schema for creating a new coverage area
const createCoverageAreaSchema = Joi.object({
  name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(200)
    .messages({
      'any.required': 'Coverage area name is required',
      'string.empty': 'Coverage area name cannot be empty',
      'string.min': 'Coverage area name must be at least 2 characters long',
      'string.max': 'Coverage area name must not exceed 200 characters'
    }),

  geographicUnits: Joi.array()
    .items(Joi.string().trim())
    .min(1)
    .required()
    .messages({
      'any.required': 'At least one geographic unit is required',
      'array.min': 'At least one geographic unit is required',
      'array.base': 'Geographic units must be an array'
    }),

  organizationId: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Organization ID cannot be empty if provided'
    }),

  code: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Coverage area code must contain only lowercase letters, numbers, and hyphens',
      'string.max': 'Coverage area code must not exceed 100 characters'
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 1000 characters'
    }),

  metadata: Joi.object({
    isDefault: Joi.boolean()
      .default(false)
      .messages({
        'boolean.base': 'isDefault must be a boolean'
      }),

    tags: Joi.array()
      .items(Joi.string().trim())
      .default([])
      .messages({
        'array.base': 'Tags must be an array',
        'string.base': 'Each tag must be a string'
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

// Validation schema for updating an existing coverage area
const updateCoverageAreaSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(200)
    .messages({
      'string.empty': 'Coverage area name cannot be empty',
      'string.min': 'Coverage area name must be at least 2 characters long',
      'string.max': 'Coverage area name must not exceed 200 characters'
    }),

  geographicUnits: Joi.array()
    .items(Joi.string().trim())
    .min(1)
    .messages({
      'array.min': 'At least one geographic unit is required',
      'array.base': 'Geographic units must be an array'
    }),

  organizationId: Joi.string()
    .trim()
    .allow(null, '')
    .messages({
      'string.empty': 'Organization ID cannot be empty if provided'
    }),

  code: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'Coverage area code must contain only lowercase letters, numbers, and hyphens',
      'string.max': 'Coverage area code must not exceed 100 characters'
    }),

  description: Joi.string()
    .trim()
    .max(1000)
    .allow(null, '')
    .messages({
      'string.max': 'Description must not exceed 1000 characters'
    }),

  metadata: Joi.object({
    isDefault: Joi.boolean()
      .messages({
        'boolean.base': 'isDefault must be a boolean'
      }),

    tags: Joi.array()
      .items(Joi.string().trim())
      .messages({
        'array.base': 'Tags must be an array',
        'string.base': 'Each tag must be a string'
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

// Validation schema for adding a geographic unit to a coverage area
const addGeographicUnitSchema = Joi.object({
  geographicUnitId: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'Geographic unit ID is required',
      'string.empty': 'Geographic unit ID cannot be empty'
    })
});

// Middleware functions for validation
const validateCreateCoverageArea = (req, res, next) => {
  const { error, value } = createCoverageAreaSchema.validate(req.body, {
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

const validateUpdateCoverageArea = (req, res, next) => {
  const { error, value } = updateCoverageAreaSchema.validate(req.body, {
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

const validateAddGeographicUnit = (req, res, next) => {
  const { error, value } = addGeographicUnitSchema.validate(req.body, {
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
  createCoverageAreaSchema,
  updateCoverageAreaSchema,
  addGeographicUnitSchema,
  validateCreateCoverageArea,
  validateUpdateCoverageArea,
  validateAddGeographicUnit
};

