const mongoose = require('mongoose');

const requestedItemSchema = new mongoose.Schema({
  BloodType: { type: String, required: true, trim: true, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  Amount: { type: Number, required: true, min: 1 }
}, { _id: false });

const bloodBagRequestSchema = new mongoose.Schema({
  Request_ID: { type: String, required: true, trim: true },
  Requester_ID: { type: String, required: true, trim: true },
  Requestee_ID: { type: String, required: true, trim: true },
  RequestedItems: { type: [requestedItemSchema], required: true },
  RequestedForAt: { type: Date },
  Urgency: { type: String, enum: ['low','medium','high'], default: 'medium' },
  Notes: { type: String, trim: true },
  // Tenant / organization scope
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  }
}, {
  timestamps: true
});

bloodBagRequestSchema.index({ organizationId: 1, Requester_ID: 1 });
bloodBagRequestSchema.index({ organizationId: 1, Requestee_ID: 1 });
bloodBagRequestSchema.index({ organizationId: 1, Request_ID: 1 });

const BloodBagRequest = mongoose.model('BloodBagRequest', bloodBagRequestSchema);

module.exports = BloodBagRequest;
