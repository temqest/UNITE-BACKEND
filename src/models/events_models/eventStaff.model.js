const mongoose = require('mongoose');

const eventStaffSchema = new mongoose.Schema({
  EventID: {
    type: String,
    required: true,
    trim: true,
    ref: 'Event'
  },
  Staff_FullName: {
    type: String,
    required: true,
    trim: true
  },
  Role: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

const EventStaff = mongoose.model('EventStaff', eventStaffSchema);

module.exports = EventStaff;

