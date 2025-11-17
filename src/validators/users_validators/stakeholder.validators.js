const Joi = require('joi');

const createStakeholderSchema = Joi.object({
  Stakeholder_ID: Joi.string().optional().trim(),
  province: Joi.string().required().trim(),
  district: Joi.string().required().trim(),
  municipality: Joi.string().required().trim(),
  firstName: Joi.string().required().trim().min(1).max(100),
  middleName: Joi.string().allow(null, '').trim().max(100),
  lastName: Joi.string().required().trim().min(1).max(100),
  field: Joi.string().allow(null, '').trim().max(150),
  email: Joi.string().required().trim().lowercase().email(),
  phoneNumber: Joi.string().required().trim().pattern(/^[0-9+\-\s()]+$/).min(10).max(20),
  password: Joi.string().required().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  registrationCode: Joi.string().allow(null, '').trim().max(100),
  coordinator: Joi.string().allow(null, '').trim().max(200),
  organizationInstitution: Joi.string().allow(null, '').trim().max(200)
});

const updateStakeholderSchema = Joi.object({
  province: Joi.string().trim(),
  district: Joi.string().trim(),
  municipality: Joi.string().trim(),
  firstName: Joi.string().trim().min(1).max(100),
  middleName: Joi.string().allow(null, '').trim().max(100),
  lastName: Joi.string().trim().min(1).max(100),
  field: Joi.string().allow(null, '').trim().max(150),
  email: Joi.string().trim().lowercase().email(),
  phoneNumber: Joi.string().trim().pattern(/^[0-9+\-\s()]+$/).min(10).max(20),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  organizationInstitution: Joi.string().allow(null, '').trim().max(200),
  registrationCode: Joi.string().allow(null, '').trim().max(100)
}).min(1);

const validateCreateStakeholder = (req, res, next) => {
  const { error, value } = createStakeholderSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: error.details.map(d => d.message) });
  }
  req.validatedData = value;
  next();
};

const validateUpdateStakeholder = (req, res, next) => {
  const { error, value } = updateStakeholderSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, message: 'Validation error', errors: error.details.map(d => d.message) });
  }
  req.validatedData = value;
  next();
};

module.exports = {
  createStakeholderSchema,
  updateStakeholderSchema,
  validateCreateStakeholder,
  validateUpdateStakeholder
};


