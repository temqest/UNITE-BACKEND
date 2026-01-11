const mongoose = require('mongoose');

const eventStaffSchema = new mongoose.Schema({
  EventID: {
    type: String,
    required: true,
    trim: true,
    ref: 'Event',
    
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

// Add compound index for faster lookups and potential uniqueness checks
eventStaffSchema.index({ EventID: 1, Staff_FullName: 1, Role: 1 });

const EventStaff = mongoose.model('EventStaff', eventStaffSchema);

module.exports = EventStaff;

