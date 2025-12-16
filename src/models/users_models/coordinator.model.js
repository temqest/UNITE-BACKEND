const mongoose = require('mongoose');

const coordinatorSchema = new mongoose.Schema({
  Coordinator_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    ref: 'BloodbankStaff'
  },
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province',
    required: true
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: true
  },
  accountType: {
    type: String,
    enum: ["LGU", "Others"],
    required: true
  }
}, {
  timestamps: true
});

coordinatorSchema.index({ province: 1, district: 1 }, { unique: true });

const Coordinator = mongoose.model('Coordinator', coordinatorSchema);

module.exports = Coordinator;

