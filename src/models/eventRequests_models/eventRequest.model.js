const mongoose = require('mongoose');
const { REQUEST_STATES } = require('../../utils/eventRequests/requestConstants');

/**
 * Actor Snapshot Schema
 * Captures user information at time of action for audit trail
 */
const actorSnapshotSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: { 
    type: String, 
    trim: true 
  },
  roleSnapshot: { 
    type: String, 
    trim: true 
  },
  authoritySnapshot: { 
    type: Number 
  }
}, { _id: false });

/**
 * Reviewer Schema
 * Information about the assigned reviewer
 */
const reviewerSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  name: { 
    type: String, 
    trim: true 
  },
  roleSnapshot: { 
    type: String, 
    trim: true 
  },
  assignedAt: { 
    type: Date, 
    default: Date.now 
  },
  autoAssigned: { 
    type: Boolean, 
    default: true 
  },
  assignmentRule: { 
    type: String, 
    trim: true,
    enum: ['stakeholder-to-coordinator', 'coordinator-to-admin', 'admin-to-coordinator', 'auto-assigned', 'manual']
  },
  overriddenAt: { 
    type: Date 
  },
  overriddenBy: { 
    type: actorSnapshotSchema 
  }
}, { _id: false });

/**
 * Status History Schema
 * Tracks all state transitions
 */
const statusHistorySchema = new mongoose.Schema({
  status: { 
    type: String, 
    required: true, 
    trim: true 
  },
  note: { 
    type: String, 
    trim: true 
  },
  changedAt: { 
    type: Date, 
    default: Date.now 
  },
  actor: { 
    type: actorSnapshotSchema 
  }
}, { _id: false });

/**
 * Decision Schema
 * Records review decisions (accept/reject/reschedule)
 */
const decisionSchema = new mongoose.Schema({
  type: { 
    type: String, 
    enum: ['accept', 'reject', 'reschedule'], 
    required: true 
  },
  notes: { 
    type: String, 
    trim: true 
  },
  decidedAt: { 
    type: Date, 
    default: Date.now 
  },
  actor: { 
    type: actorSnapshotSchema, 
    required: true 
  },
  payload: {
    proposedDate: { type: Date },
    proposedStartTime: { type: String, trim: true },
    proposedEndTime: { type: String, trim: true }
  }
}, { _id: false });

/**
 * Reschedule Proposal Schema
 * Stores reschedule proposal details
 */
const rescheduleSchema = new mongoose.Schema({
  proposedDate: { 
    type: Date 
  },
  proposedStartTime: { 
    type: String, 
    trim: true 
  },
  proposedEndTime: { 
    type: String, 
    trim: true 
  },
  reviewerNotes: { 
    type: String, 
    trim: true 
  },
  proposedAt: { 
    type: Date, 
    default: Date.now 
  },
  proposedBy: { 
    type: actorSnapshotSchema 
  }
}, { _id: false });

/**
 * Event Request Schema
 * Clean, modern schema aligned with new User Model and permission-based system
 */
const eventRequestSchema = new mongoose.Schema({
  Request_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  
  Event_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'Event',
    index: true
  },
  
  // Requester information (ObjectId reference to User)
  requester: {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true
    },
    name: { 
      type: String, 
      trim: true 
    },
    roleSnapshot: { 
      type: String, 
      trim: true 
    },
    authoritySnapshot: { 
      type: Number, 
      required: true 
    }
  },
  
  // Reviewer information
  reviewer: {
    type: reviewerSchema,
    required: false
  },
  
  // Organization and location references
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },
  
  coverageAreaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CoverageArea',
    index: true
  },
  
  municipalityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    index: true
  },
  
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    index: true
  },
  
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    index: true
  },
  
  // Event details - all fields from Event model
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
  Date: {
    type: Date,
    required: true
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
  Category: {
    type: String,
    trim: true
  },
  // Category-specific fields (for BloodDrive, Training, Advocacy)
  Target_Donation: {
    type: Number,
    required: false
  },
  VenueType: {
    type: String,
    trim: true
  },
  TrainingType: {
    type: String,
    trim: true
  },
  MaxParticipants: {
    type: Number,
    required: false
  },
  Topic: {
    type: String,
    trim: true
  },
  TargetAudience: {
    type: String,
    trim: true
  },
  ExpectedAudienceSize: {
    type: Number,
    required: false
  },
  PartnerOrganization: {
    type: String,
    trim: true
  },
  // Staff assignment
  StaffAssignmentID: {
    type: String,
    trim: true
  },
  
  // Request status (using new state names)
  status: {
    type: String,
    enum: Object.values(REQUEST_STATES),
    required: true,
    default: REQUEST_STATES.PENDING_REVIEW,
    index: true
  },
  
  // Status history
  statusHistory: {
    type: [statusHistorySchema],
    default: []
  },
  
  // Decision history
  decisionHistory: {
    type: [decisionSchema],
    default: []
  },
  
  // Reschedule proposal (if any)
  rescheduleProposal: {
    type: rescheduleSchema,
    default: null
  },
  
  // Event reference (set when event is published)
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    index: true
  },
  
  // Additional metadata
  notes: {
    type: String,
    trim: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for common queries
eventRequestSchema.index({ 'requester.userId': 1, status: 1 });
eventRequestSchema.index({ 'reviewer.userId': 1, status: 1 });
eventRequestSchema.index({ organizationId: 1, status: 1 });
eventRequestSchema.index({ coverageAreaId: 1, status: 1 });
eventRequestSchema.index({ municipalityId: 1, status: 1 });
eventRequestSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to ensure authoritySnapshot is set
eventRequestSchema.pre('save', function(next) {
  if (this.isNew && this.requester && !this.requester.authoritySnapshot) {
    return next(new Error('requester.authoritySnapshot is required for new requests'));
  }
  next();
});

// Method to add status history entry
eventRequestSchema.methods.addStatusHistory = function(status, actor, note = '') {
  this.statusHistory.push({
    status,
    note,
    changedAt: new Date(),
    actor: {
      userId: actor.userId,
      name: actor.name,
      roleSnapshot: actor.roleSnapshot,
      authoritySnapshot: actor.authoritySnapshot
    }
  });
};

// Method to add decision history entry
eventRequestSchema.methods.addDecisionHistory = function(type, actor, notes = '', payload = {}) {
  this.decisionHistory.push({
    type,
    notes,
    decidedAt: new Date(),
    actor: {
      userId: actor.userId,
      name: actor.name,
      roleSnapshot: actor.roleSnapshot,
      authoritySnapshot: actor.authoritySnapshot
    },
    payload
  });
};

const EventRequest = mongoose.model('EventRequest', eventRequestSchema);

module.exports = EventRequest;

