const mongoose = require('mongoose');

const actorSnapshotSchema = new mongoose.Schema({
  id: { type: String, trim: true }, // Legacy ID support
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // New: ObjectId reference to User
  // Accept legacy 'Admin' value alongside canonical 'SystemAdmin' and any role code
  role: { type: String, trim: true }, // Removed enum to support any role code
  roleSnapshot: { type: String, trim: true }, // Role at time of action (for audit)
  name: { type: String, trim: true }
}, { _id: false });

const reviewerSchema = new mongoose.Schema({
  id: { type: String, trim: true }, // Legacy ID support
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // New: ObjectId reference to User
  // Accept legacy 'Admin' alongside 'SystemAdmin' and any role code
  role: { type: String, trim: true }, // Removed enum to support any role code
  roleSnapshot: { type: String, trim: true }, // Role at time of assignment
  name: { type: String, trim: true },
  assignedAt: { type: Date, default: Date.now },
  autoAssigned: { type: Boolean, default: true },
  assignmentRule: { type: String, trim: true }, // Which RBAC rule assigned this reviewer
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
    // Allow 'Admin' legacy value and 'Stakeholder' for reschedule flows
    role: { type: String, enum: ['SystemAdmin', 'Admin', 'Coordinator', 'Stakeholder'], required: true },
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
  // Legacy fields (for backward compatibility)
  coordinator_id: {
    type: String,
    required: false, // Made optional for new requests
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
    required: false, // Made optional for new requests
    trim: true,
    refPath: 'made_by_role'
  },
  made_by_role: {
    type: String,
    required: false, // Made optional for new requests
    trim: true
    // Removed enum to support any role code
  },
  // New role-agnostic fields
  requester: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    id: { type: String, trim: true }, // Legacy ID for backward compatibility
    roleSnapshot: { type: String, trim: true }, // Role at time of creation
    name: { type: String, trim: true }
  },
  reviewer: reviewerSchema,
  creator: {
    type: actorSnapshotSchema,
    default: null
  },
  stakeholderPresent: {
    type: Boolean,
    default: false
  },
  // Location references (support both legacy and new models)
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province' // Legacy reference
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District' // Legacy reference
  },
  municipality: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality' // Legacy reference
  },
  stakeholder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stakeholder'
  },
  // New flexible location structure
  location: {
    province: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    district: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    municipality: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    custom: { type: String, trim: true } // Optional free-text location
  },
  // Dynamic permissions for access control
  permissions: {
    canEdit: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    canReview: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    canApprove: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  // Enhanced audit trail with location context
  auditTrail: [{
    action: { type: String, required: true, trim: true },
    actor: actorSnapshotSchema,
    timestamp: { type: Date, default: Date.now },
    changes: { type: mongoose.Schema.Types.Mixed },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' } // Location context
  }],
  Category: {
    type: String,
    trim: true
  },
  Status: {
    type: String,
    enum: [
      // State machine canonical statuses
      'pending-review',
      'review-accepted',
      'review-rejected',
      'review-rescheduled',
      'awaiting-confirmation',
      'approved',
      'rejected',
      'cancelled',
      'closed',
      // Legacy statuses (backward compatibility)
      'creator-confirmed',
      'creator-declined',
      'completed',
      'expired-review',
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
eventRequestSchema.index({ coordinator_id: 1, Status: 1 }); // Legacy index
eventRequestSchema.index({ stakeholder_id: 1, Status: 1 }); // Legacy index
eventRequestSchema.index({ 'requester.userId': 1, Status: 1 }); // New index
eventRequestSchema.index({ 'reviewer.userId': 1, Status: 1 }); // New index
eventRequestSchema.index({ 'reviewer.id': 1, Status: 1 }); // Legacy index
eventRequestSchema.index({ expiresAt: 1 });
eventRequestSchema.index({ 'location.district': 1 }); // New location index
eventRequestSchema.index({ 'location.province': 1 }); // New location index

const EventRequest = mongoose.model('EventRequest', eventRequestSchema);

module.exports = EventRequest;

