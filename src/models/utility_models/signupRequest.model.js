const mongoose = require('mongoose');

const signupRequestSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, required: false, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phoneNumber: { type: String, required: false, trim: true },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
  organization: { type: String, required: false, trim: true },
  province: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  district: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  municipality: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  assignedCoordinator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  emailVerificationToken: { type: String, required: false },
  verificationCode: { type: String, required: false },
  emailVerified: { type: Boolean, default: false },
  passwordActivationToken: { type: String, required: false },
  passwordActivationExpires: { type: Date, required: false },
  submittedAt: { type: Date, default: Date.now },
  decisionAt: { type: Date }
}, {
  timestamps: true
});

const SignUpRequest = mongoose.model('SignUpRequest', signupRequestSchema);

module.exports = SignUpRequest;
