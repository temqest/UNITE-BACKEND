const Joi = require('joi');

const joinWaitlistSchema = Joi.object({
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
    
  name: Joi.string()
    .trim()
    .max(100)
    .allow(null, '')
    .messages({
      'string.max': 'Name must not exceed 100 characters'
    }),
    
  source: Joi.string()
    .trim()
    .max(50)
    .allow(null, '')
    .messages({
      'string.max': 'Source must not exceed 50 characters'
    }),

  signupPage: Joi.string()
    .trim()
    .max(255)
    .allow(null, '')
    .messages({
      'string.max': 'Signup page URL must not exceed 255 characters'
    }),

  // Honeypot field - Bots will likely fill this out, humans won't see it (hidden via CSS)
  company_name: Joi.string()
    .max(100)
    .allow(null, '') // Allow empty or null, since humans leave it blank
});

const validateJoinWaitlist = (req, res, next) => {
  const { error, value } = joinWaitlistSchema.validate(req.body, {
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

  // Honeypot Check: Triggered if `company_name` has any content
  if (value.company_name && value.company_name.trim() !== '') {
    // Return a fake success (silently discard) so bots don't realize they failed
    // Depending on preference, could also return 400.
    return res.status(201).json({
      success: true,
      message: 'Successfully joined the waitlist!'
    });
  }

  // Inject normalized data for controller
  req.validatedData = value;
  next();
};

module.exports = {
  validateJoinWaitlist
};
