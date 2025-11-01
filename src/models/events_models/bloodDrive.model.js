const mongoose = require('mongoose');

const bloodDriveSchema = new mongoose.Schema({
  BloodDrive_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    ref: 'Event'
  },
  Target_Donation: {
    type: Number,
    required: true
  },
  VenueType: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

const BloodDrive = mongoose.model('BloodDrive', bloodDriveSchema);

module.exports = BloodDrive;

