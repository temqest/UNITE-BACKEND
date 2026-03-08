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
  },
  // Optional tenant / organization scope (inventory ownership)
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: false
  }
}, {
  timestamps: true
});

// Tenant-scoped inventory lookups
bloodBagSchema.index({ organizationId: 1, BloodType: 1 });

const BloodBag = mongoose.model('BloodBag', bloodBagSchema);

module.exports = BloodBag;
