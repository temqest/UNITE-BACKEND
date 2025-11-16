const mongoose = require('mongoose');

/**
 * District schema now stores a reference to its parent Province.
 * This supports the new hierarchy: Province -> District -> Municipality
 */
const districtSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: false,
    unique: true,
    trim: true
  },
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province',
    required: true
  }
}, {
  timestamps: true
});

districtSchema.index({ province: 1, name: 1 }, { unique: true });

const District = mongoose.model('District', districtSchema);

module.exports = District;

