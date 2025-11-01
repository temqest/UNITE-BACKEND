const mongoose = require('mongoose');

const coordinatorSchema = new mongoose.Schema({
  Coordinator_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    ref: 'BloodbankStaff'
  },
  District_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'District'
  }
}, {
  timestamps: true
});

const Coordinator = mongoose.model('Coordinator', coordinatorSchema);

module.exports = Coordinator;

