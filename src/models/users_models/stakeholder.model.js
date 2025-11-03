const mongoose = require('mongoose');

const stakeholderSchema = new mongoose.Schema({
  Stakeholder_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  Province_Name: {
    type: String,
    required: true,
    trim: true
  },
  District_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'District'
  },
  First_Name: {
    type: String,
    required: true,
    trim: true
  },
  Middle_Name: {
    type: String,
    required: false,
    trim: true
  },
  Last_Name: {
    type: String,
    required: true,
    trim: true
  },
  Field: {
    type: String,
    required: false,
    trim: true
  },
  Email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  Phone_Number: {
    type: String,
    required: true,
    trim: true
  },
  Password: {
    type: String,
    required: true
  },
  City_Municipality: {
    type: String,
    required: true,
    trim: true
  },
  Organization_Institution: {
    type: String,
    required: false,
    trim: true
  },
  Registration_Code: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true
});

const Stakeholder = mongoose.model('Stakeholder', stakeholderSchema);

module.exports = Stakeholder;


