const mongoose = require('mongoose');

const stakeholderSchema = new mongoose.Schema({
  Stakeholder_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province',
    required: true
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: true
  },
  municipality: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: true
  },
  coordinator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coordinator',
    required: false
  },
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, required: false, trim: true },
  lastName: { type: String, required: true, trim: true },
  field: { type: String, required: false, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  phoneNumber: { type: String, required: false, trim: true },
  password: { type: String, required: true },
  organizationInstitution: { type: String, required: false, trim: true },
  registrationCode: { type: String, required: false, trim: true },
  accountType: {
    type: String,
    enum: ["LGU", "Others"],
    required: true
  }
}, {
  timestamps: true
});

const Stakeholder = mongoose.model('Stakeholder', stakeholderSchema);

module.exports = Stakeholder;


