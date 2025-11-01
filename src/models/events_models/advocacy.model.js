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
    required: true,
    trim: true
  },
  TargetAudience: {
    type: String,
    required: true,
    trim: true
  },
  ExpectedAudienceSize: {
    type: Number,
    required: true
  },
  PartnerOrganization: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

const Advocacy = mongoose.model('Advocacy', advocacySchema);

module.exports = Advocacy;

