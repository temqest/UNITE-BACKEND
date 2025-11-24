const mongoose = require('mongoose');

const bloodBagSchema = new mongoose.Schema({
  BloodBag_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  BloodType: {
    type: String,
    required: true,
    trim: true,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  }
}, {
  timestamps: true
});

const BloodBag = mongoose.model('BloodBag', bloodBagSchema);

module.exports = BloodBag;
