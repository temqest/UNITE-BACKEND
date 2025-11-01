const mongoose = require('mongoose');

const bloodbankStaffSchema = new mongoose.Schema({
  ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  Username: {
    type: String,
    required: true,
    unique: true,
    trim: true
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
  StaffType: {
    type: String,
    enum: ['Admin', 'Coordinator'],
    required: true
  }
}, {
  timestamps: true
});

const BloodbankStaff = mongoose.model('BloodbankStaff', bloodbankStaffSchema);

module.exports = BloodbankStaff;

