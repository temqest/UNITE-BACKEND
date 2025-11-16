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
  End_Date: {
    type: Date,
    required: false
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
  MadeByStakeholderID: {
    type: String,
    required: false,
    trim: true,
    ref: 'Stakeholder'
  },
  // New hierarchical references (ObjectId refs) to support Province -> District -> Municipality
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province',
    required: false
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: false
  },
  municipality: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: false
  },
  // Optional explicit stakeholder reference (ObjectId)
  stakeholder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stakeholder',
    required: false
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
  Event_Description: {
    type: String,
    required: false,
    trim: true
  },
  // Category/type of event (e.g., 'BloodDrive', 'Training', 'Advocacy')
  Category: {
    type: String,
    required: false,
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

