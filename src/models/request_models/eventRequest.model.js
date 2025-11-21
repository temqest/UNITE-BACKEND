const mongoose = require('mongoose');

const actorSnapshotSchema = new mongoose.Schema({
  id: { type: String, trim: true },
  // Accept legacy 'Admin' value alongside canonical 'SystemAdmin'
  role: { type: String, enum: ['SystemAdmin', 'Admin', 'Coordinator', 'Stakeholder'], trim: true },
  name: { type: String, trim: true }
}, { _id: false });

const reviewerSchema = new mongoose.Schema({
  id: { type: String, trim: true, required: true },
  // Accept legacy 'Admin' alongside 'SystemAdmin' for backward compatibility
  role: { type: String, enum: ['SystemAdmin', 'Admin', 'Coordinator'], required: true },
  name: { type: String, trim: true },
  assignedAt: { type: Date, default: Date.now },
  autoAssigned: { type: Boolean, default: true },
  overriddenAt: { type: Date },
  overriddenBy: actorSnapshotSchema
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true, trim: true },
  note: { type: String, trim: true },
  changedAt: { type: Date, default: Date.now },
  actor: actorSnapshotSchema
}, { _id: false });

const decisionSchema = new mongoose.Schema({
  type: { type: String, enum: ['accept', 'reject', 'reschedule'], required: true },
  notes: { type: String, trim: true },
  decidedAt: { type: Date, default: Date.now },
  resultStatus: { type: String, trim: true },
  actor: {
    id: { type: String, trim: true, required: true },
    // Allow 'Admin' legacy value
    role: { type: String, enum: ['SystemAdmin', 'Admin', 'Coordinator'], required: true },
    name: { type: String, trim: true }
  },
  payload: {
    proposedDate: { type: Date },
    proposedStartTime: { type: String, trim: true },
    proposedEndTime: { type: String, trim: true }
  }
}, { _id: false });

const rescheduleSchema = new mongoose.Schema({
  proposedDate: { type: Date },
  proposedStartTime: { type: String, trim: true },
  proposedEndTime: { type: String, trim: true },
  reviewerNotes: { type: String, trim: true },
  proposedAt: { type: Date },
  proposedBy: actorSnapshotSchema
}, { _id: false });

const confirmationSchema = new mongoose.Schema({
  action: { type: String, enum: ['confirm', 'decline', 'revise'] },
  notes: { type: String, trim: true },
  confirmedAt: { type: Date },
  actor: actorSnapshotSchema
}, { _id: false });

const finalResolutionSchema = new mongoose.Schema({
  outcome: { type: String, enum: ['approved', 'rejected', 'expired', 'cancelled', 'revision-requested'] },
  completedAt: { type: Date },
  reason: { type: String, trim: true },
  publishedEventStatus: { type: String, trim: true }
}, { _id: false });

const revisionSchema = new mongoose.Schema({
  number: { type: Number, default: 1 },
  parentRequestId: { type: String, trim: true },
  supersedes: { type: [String], default: [] },
  lastRevisedAt: { type: Date }
}, { _id: false });

const eventRequestSchema = new mongoose.Schema({
  Request_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  Event_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'Event'
  },
  coordinator_id: {
    type: String,
    required: true,
    trim: true,
    ref: 'Coordinator'
  },
  stakeholder_id: {
    type: String,
    trim: true,
    ref: 'Stakeholder'
  },
  made_by_id: {
    type: String,
    required: true,
    trim: true,
    refPath: 'made_by_role'
  },
  made_by_role: {
    type: String,
    required: true,
    enum: ['SystemAdmin', 'Coordinator', 'Stakeholder']
  },
  creator: {
    type: actorSnapshotSchema,
    default: null
  },
  reviewer: reviewerSchema,
  stakeholderPresent: {
    type: Boolean,
    default: false
  },
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province'
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District'
  },
  municipality: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality'
  },
  stakeholder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stakeholder'
  },
  Category: {
    type: String,
    trim: true
  },
  Status: {
    type: String,
    enum: [
      // canonical (new) statuses
      'pending-review',
      'review-accepted',
      'review-rejected',
      'review-rescheduled',
      'creator-confirmed',
      'creator-declined',
      'completed',
      'expired-review',
      // legacy / backwards-compatibility variants (uppercase / underscore)
      'Pending',
      'Pending_Admin_Review',
      'Pending_Coordinator_Review',
      'Pending_Stakeholder_Review',
      'Accepted_By_Admin',
      'Rescheduled_By_Admin',
      'Rescheduled_By_Coordinator',
      'Rescheduled_By_Stakeholder',
      'Rejected_By_Admin',
      'Rejected',
      'Cancelled',
      'Completed'
    ],
    required: true,
    default: 'pending-review'
  },
  statusHistory: {
    type: [statusHistorySchema],
    default: []
  },
  decisionHistory: {
    type: [decisionSchema],
    default: []
  },
  rescheduleProposal: rescheduleSchema,
  creatorConfirmation: confirmationSchema,
  finalResolution: finalResolutionSchema,
  reviewSummary: {
    type: String,
    trim: true
  },
  decisionSummary: {
    type: String,
    trim: true
  },
  expiresAt: {
    type: Date
  },
  confirmationDueAt: {
    type: Date
  },
  expiredAt: {
    type: Date
  },
  reviewDeadlineHours: {
    type: Number
  },
  summaryTemplate: {
    type: String,
    trim: true
  },
  revision: {
    type: revisionSchema,
    default: () => ({ number: 1, supersedes: [] })
  },
  originalData: {
    type: Object,
    default: null
  }
}, {
  timestamps: true
});

eventRequestSchema.index({ Status: 1 });
eventRequestSchema.index({ coordinator_id: 1, Status: 1 });
eventRequestSchema.index({ stakeholder_id: 1, Status: 1 });
eventRequestSchema.index({ expiresAt: 1 });
eventRequestSchema.index({ 'reviewer.id': 1, Status: 1 });

const EventRequest = mongoose.model('EventRequest', eventRequestSchema);

module.exports = EventRequest;

