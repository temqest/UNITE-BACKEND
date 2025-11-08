const mongoose = require('mongoose');

const advocacySchema = new mongoose.Schema({
  Advocacy_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    ref: 'Event'
  },
  Topic: {
    type: String,
    trim: true
  },
  TargetAudience: {
    type: String,
    trim: true
  },
  ExpectedAudienceSize: {
    type: Number
  },
  PartnerOrganization: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

const Advocacy = mongoose.model('Advocacy', advocacySchema);

module.exports = Advocacy;

