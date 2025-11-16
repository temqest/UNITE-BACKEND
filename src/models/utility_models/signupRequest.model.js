const mongoose = require('mongoose');

const signupRequestSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, required: false, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phoneNumber: { type: String, required: true, trim: true },
  organization: { type: String, required: false, trim: true },
  province: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true },
  district: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true },
  municipality: { type: mongoose.Schema.Types.ObjectId, ref: 'Municipality', required: true },
  assignedCoordinator: { type: mongoose.Schema.Types.ObjectId, ref: 'Coordinator', required: false },
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  emailVerificationToken: { type: String, required: false },
  emailVerified: { type: Boolean, default: false },
  submittedAt: { type: Date, default: Date.now },
  decisionAt: { type: Date }
}, {
  timestamps: true
});

const SignUpRequest = mongoose.model('SignUpRequest', signupRequestSchema);

module.exports = SignUpRequest;
