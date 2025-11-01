const mongoose = require('mongoose');

const trainingSchema = new mongoose.Schema({
  Training_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    ref: 'Event'
  },
  TrainingType: {
    type: String,
    required: true,
    trim: true
  },
  MaxParticipants: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

const Training = mongoose.model('Training', trainingSchema);

module.exports = Training;

