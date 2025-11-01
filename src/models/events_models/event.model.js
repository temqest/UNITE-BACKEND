const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  Event_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  Event_Title: {
    type: String,
    required: true,
    trim: true
  },
  Location: {
    type: String,
    required: true,
    trim: true
  },
  Start_Date: {
    type: Date,
    required: true
  },
  ApprovedByAdminID: {
    type: String,
    trim: true,
    ref: 'SystemAdmin'
  },
  MadeByCoordinatorID: {
    type: String,
    required: true,
    trim: true,
    ref: 'Coordinator'
  },
  StaffAssignmentID: {
    type: String,
    trim: true
  },
  Email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  Phone_Number: {
    type: String,
    required: true,
    trim: true
  },
  Status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rescheduled', 'Rejected', 'Completed'],
    required: true,
    default: 'Pending'
  }
}, {
  timestamps: true
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;

