const mongoose = require('mongoose');

const registrationCodeSchema = new mongoose.Schema({
  Code: { type: String, required: true, trim: true },
  Coordinator_ID: { type: String, required: true, trim: true, ref: 'Coordinator' },
  District_ID: { type: String, required: true, trim: true, ref: 'District' },
  Max_Uses: { type: Number, required: true, default: 1, min: 1 },
  Uses: { type: Number, required: true, default: 0, min: 0 },
  Expires_At: { type: Date, required: false },
  IsActive: { type: Boolean, required: true, default: true }
}, { timestamps: true });

registrationCodeSchema.methods.consume = async function() {
  if (!this.IsActive) throw new Error('Registration code is inactive');
  if (this.Expires_At && this.Expires_At < new Date()) throw new Error('Registration code expired');
  if (this.Uses >= this.Max_Uses) throw new Error('Registration code usage limit reached');
  this.Uses += 1;
  if (this.Uses >= this.Max_Uses) this.IsActive = false;
  await this.save();
};

const RegistrationCode = mongoose.model('RegistrationCode', registrationCodeSchema);
module.exports = RegistrationCode;


