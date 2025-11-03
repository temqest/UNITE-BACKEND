const Joi = require('joi');

// Validation schema for creating a new district
const createDistrictSchema = Joi.object({
  District_ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'District ID is required',
      'string.empty': 'District ID cannot be empty'
    }),

  Province_Name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'any.required': 'Province Name is required',
      'string.empty': 'Province Name cannot be empty',
      'string.min': 'Province Name must be at least 2 characters long',
      'string.max': 'Province Name must not exceed 100 characters'
    }),

  District_Name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'any.required': 'District Name is required',
      'string.empty': 'District Name cannot be empty',
      'string.min': 'District Name must be at least 2 characters long',
      'string.max': 'District Name must not exceed 100 characters'
    }),

  District_City: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'any.required': 'District City is required',
      'string.empty': 'District City cannot be empty',
      'string.min': 'District City must be at least 2 characters long',
      'string.max': 'District City must not exceed 100 characters'
    }),

  District_Number: Joi.string()
    .required()
    .trim()
    .max(20)
    .messages({
      'any.required': 'District Number is required',
      'string.empty': 'District Number cannot be empty',
      'string.max': 'District Number must not exceed 20 characters'
    }),

  Region: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'any.required': 'Region is required',
      'string.empty': 'Region cannot be empty',
      'string.min': 'Region must be at least 2 characters long',
      'string.max': 'Region must not exceed 100 characters'
    })
});

// Validation schema for updating an existing district
const updateDistrictSchema = Joi.object({
  District_ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'District ID cannot be empty'
    }),

  Province_Name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'Province Name cannot be empty',
      'string.min': 'Province Name must be at least 2 characters long',
      'string.max': 'Province Name must not exceed 100 characters'
    }),

  District_Name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'District Name cannot be empty',
      'string.min': 'District Name must be at least 2 characters long',
      'string.max': 'District Name must not exceed 100 characters'
    }),

  District_City: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'District City cannot be empty',
      'string.min': 'District City must be at least 2 characters long',
      'string.max': 'District City must not exceed 100 characters'
    }),

  District_Number: Joi.string()
    .trim()
    .max(20)
    .messages({
      'string.empty': 'District Number cannot be empty',
      'string.max': 'District Number must not exceed 20 characters'
    }),

  Region: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .messages({
      'string.empty': 'Region cannot be empty',
      'string.min': 'Region must be at least 2 characters long',
      'string.max': 'Region must not exceed 100 characters'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateDistrict = (req, res, next) => {
  const { error, value } = createDistrictSchema.validate(req.body, {
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

const validateUpdateDistrict = (req, res, next) => {
  const { error, value } = updateDistrictSchema.validate(req.body, {
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
  createDistrictSchema,
  updateDistrictSchema,
  validateCreateDistrict,
  validateUpdateDistrict
};

