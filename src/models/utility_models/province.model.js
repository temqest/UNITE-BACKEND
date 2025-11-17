const mongoose = require('mongoose');

const provinceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  code: {
    type: String,
    required: false,
    trim: true,
    unique: true
  }
}, {
  timestamps: true
});

const Province = mongoose.model('Province', provinceSchema);

module.exports = Province;
