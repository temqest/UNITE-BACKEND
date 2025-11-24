const Joi = require('joi');

const createBloodBagSchema = Joi.object({
  BloodBag_ID: Joi.string().trim().optional(),
  BloodType: Joi.string().trim().required().valid('A+','A-','B+','B-','AB+','AB-','O+','O-')
});

const updateBloodBagSchema = Joi.object({
  BloodType: Joi.string().trim().valid('A+','A-','B+','B-','AB+','AB-','O+','O-')
}).min(1).messages({ 'object.min': 'At least one field must be provided for update' });

const validateCreateBloodBag = (req, res, next) => {
  const { error, value } = createBloodBagSchema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({ success: false, message: 'Validation error', errors: errorMessages });
  }
  req.validatedData = value;
  next();
};

const validateUpdateBloodBag = (req, res, next) => {
  const { error, value } = updateBloodBagSchema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessages = error.details.map(d => d.message);
    return res.status(400).json({ success: false, message: 'Validation error', errors: errorMessages });
  }
  req.validatedData = value;
  next();
};

module.exports = {
  validateCreateBloodBag,
  validateUpdateBloodBag
};
