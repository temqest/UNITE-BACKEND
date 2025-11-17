const mongoose = require('mongoose');

const municipalitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: false,
    trim: true,
    unique: true
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: true
  },
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province',
    required: true
  }
}, {
  timestamps: true
});

municipalitySchema.index({ district: 1, name: 1 }, { unique: true });

const Municipality = mongoose.model('Municipality', municipalitySchema);

module.exports = Municipality;
