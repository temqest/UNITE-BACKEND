const Joi = require('joi');

const requestedItemSchema = Joi.object({
  BloodType: Joi.string().valid('A+','A-','B+','B-','AB+','AB-','O+','O-').required(),
  Amount: Joi.number().integer().min(1).required()
});

const createSchema = Joi.object({
  Request_ID: Joi.string().trim().optional(),
  Requester_ID: Joi.string().trim().required(),
  Requestee_ID: Joi.string().trim().required(),
  RequestedItems: Joi.array().items(requestedItemSchema).min(1).required(),
  RequestedForAt: Joi.date().optional(),
  Urgency: Joi.string().valid('low','medium','high').optional(),
  Notes: Joi.string().trim().optional()
});

const updateSchema = Joi.object({
  Requester_ID: Joi.string().trim().optional(),
  Requestee_ID: Joi.string().trim().optional(),
  RequestedItems: Joi.array().items(requestedItemSchema).min(1).optional(),
  RequestedForAt: Joi.date().optional(),
  Urgency: Joi.string().valid('low','medium','high').optional(),
  Notes: Joi.string().trim().optional()
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

const validateCreate = (req, res, next) => {
  const { error, value } = createSchema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({ success: false, message: 'Validation error', errors: errorMessages });
  }
  req.validatedData = value;
  next();
};

const validateUpdate = (req, res, next) => {
  const { error, value } = updateSchema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({ success: false, message: 'Validation error', errors: errorMessages });
  }
  req.validatedData = value;
  next();
};

module.exports = { validateCreate, validateUpdate };
