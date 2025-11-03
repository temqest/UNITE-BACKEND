const Joi = require('joi');

const createStakeholderSchema = Joi.object({
  Stakeholder_ID: Joi.string().required().trim(),
  Province_Name: Joi.string().required().trim().min(2).max(100),
  District_ID: Joi.string().required().trim(),
  First_Name: Joi.string().required().trim().min(1).max(100),
  Middle_Name: Joi.string().allow(null, '').trim().max(100),
  Last_Name: Joi.string().required().trim().min(1).max(100),
  Field: Joi.string().allow(null, '').trim().max(150),
  Email: Joi.string().required().trim().lowercase().email(),
  Phone_Number: Joi.string().required().trim().pattern(/^[0-9+\-\s()]+$/).min(10).max(20),
  Password: Joi.string().required().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  City_Municipality: Joi.string().required().trim().min(2).max(100),
  Organization_Institution: Joi.string().allow(null, '').trim().max(200),
  Registration_Code: Joi.string().allow(null, '').trim().max(100)
});

const updateStakeholderSchema = Joi.object({
  Province_Name: Joi.string().trim().min(2).max(100),
  District_ID: Joi.string().trim(),
  First_Name: Joi.string().trim().min(1).max(100),
  Middle_Name: Joi.string().allow(null, '').trim().max(100),
  Last_Name: Joi.string().trim().min(1).max(100),
  Field: Joi.string().allow(null, '').trim().max(150),
  Email: Joi.string().trim().lowercase().email(),
  Phone_Number: Joi.string().trim().pattern(/^[0-9+\-\s()]+$/).min(10).max(20),
  Password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  City_Municipality: Joi.string().trim().min(2).max(100),
  Organization_Institution: Joi.string().allow(null, '').trim().max(200),
  Registration_Code: Joi.string().allow(null, '').trim().max(100)
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


