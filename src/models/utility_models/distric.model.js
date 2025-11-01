const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema({
  District_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  District_Name: {
    type: String,
    required: true,
    trim: true
  },
  District_City: {
    type: String,
    required: true,
    trim: true
  },
  Region: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

const District = mongoose.model('District', districtSchema);

module.exports = District;

