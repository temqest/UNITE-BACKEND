const Joi = require('joi');

// Validation schema for creating a new bloodbank staff
const createBloodbankStaffSchema = Joi.object({
  ID: Joi.string()
    .required()
    .trim()
    .messages({
      'any.required': 'ID is required',
      'string.empty': 'ID cannot be empty'
    }),

  Username: Joi.string()
    .required()
    .trim()
    .min(3)
    .max(50)
    .alphanum()
    .messages({
      'any.required': 'Username is required',
      'string.empty': 'Username cannot be empty',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must not exceed 50 characters',
      'string.alphanum': 'Username must contain only alphanumeric characters'
    }),

  First_Name: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z\s-']+$/)
    .messages({
      'any.required': 'First Name is required',
      'string.empty': 'First Name cannot be empty',
      'string.min': 'First Name must be at least 1 character long',
      'string.max': 'First Name must not exceed 100 characters',
      'string.pattern.base': 'First Name can only contain letters, spaces, hyphens, and apostrophes'
    }),

  Last_Name: Joi.string()
    .required()
    .trim()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z\s-']+$/)
    .messages({
      'any.required': 'Last Name is required',
      'string.empty': 'Last Name cannot be empty',
      'string.min': 'Last Name must be at least 1 character long',
      'string.max': 'Last Name must not exceed 100 characters',
      'string.pattern.base': 'Last Name can only contain letters, spaces, hyphens, and apostrophes'
    }),

  Email: Joi.string()
    .required()
    .trim()
    .lowercase()
    .email()
    .messages({
      'any.required': 'Email is required',
      'string.empty': 'Email cannot be empty',
      'string.email': 'Please provide a valid email address'
    }),

  Phone_Number: Joi.string()
    .required()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .min(10)
    .max(20)
    .messages({
      'any.required': 'Phone Number is required',
      'string.empty': 'Phone Number cannot be empty',
      'string.min': 'Phone Number must be at least 10 characters long',
      'string.max': 'Phone Number must not exceed 20 characters',
      'string.pattern.base': 'Phone Number can only contain numbers, +, -, spaces, and parentheses'
    }),

  Password: Joi.string()
    .required()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),

  StaffType: Joi.string()
    .required()
    .valid('Admin', 'Coordinator')
    .messages({
      'any.required': 'Staff Type is required',
      'any.only': 'Staff Type must be either Admin or Coordinator'
    })
});

// Validation schema for updating an existing bloodbank staff
const updateBloodbankStaffSchema = Joi.object({
  ID: Joi.string()
    .trim()
    .messages({
      'string.empty': 'ID cannot be empty'
    }),

  Username: Joi.string()
    .trim()
    .min(3)
    .max(50)
    .alphanum()
    .messages({
      'string.empty': 'Username cannot be empty',
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username must not exceed 50 characters',
      'string.alphanum': 'Username must contain only alphanumeric characters'
    }),

  First_Name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z\s-']+$/)
    .messages({
      'string.empty': 'First Name cannot be empty',
      'string.min': 'First Name must be at least 1 character long',
      'string.max': 'First Name must not exceed 100 characters',
      'string.pattern.base': 'First Name can only contain letters, spaces, hyphens, and apostrophes'
    }),

  Last_Name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z\s-']+$/)
    .messages({
      'string.empty': 'Last Name cannot be empty',
      'string.min': 'Last Name must be at least 1 character long',
      'string.max': 'Last Name must not exceed 100 characters',
      'string.pattern.base': 'Last Name can only contain letters, spaces, hyphens, and apostrophes'
    }),

  Email: Joi.string()
    .trim()
    .lowercase()
    .email()
    .messages({
      'string.empty': 'Email cannot be empty',
      'string.email': 'Please provide a valid email address'
    }),

  Phone_Number: Joi.string()
    .trim()
    .pattern(/^[0-9+\-\s()]+$/)
    .min(10)
    .max(20)
    .messages({
      'string.empty': 'Phone Number cannot be empty',
      'string.min': 'Phone Number must be at least 10 characters long',
      'string.max': 'Phone Number must not exceed 20 characters',
      'string.pattern.base': 'Phone Number can only contain numbers, +, -, spaces, and parentheses'
    }),

  Password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),

  StaffType: Joi.string()
    .valid('Admin', 'Coordinator')
    .messages({
      'any.only': 'Staff Type must be either Admin or Coordinator'
    })
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Middleware functions for validation
const validateCreateBloodbankStaff = (req, res, next) => {
  const { error, value } = createBloodbankStaffSchema.validate(req.body, {
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

const validateUpdateBloodbankStaff = (req, res, next) => {
  const { error, value } = updateBloodbankStaffSchema.validate(req.body, {
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
  createBloodbankStaffSchema,
  updateBloodbankStaffSchema,
  validateCreateBloodbankStaff,
  validateUpdateBloodbankStaff
};

