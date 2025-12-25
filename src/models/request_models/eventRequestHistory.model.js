const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  id: { type: String, trim: true },
  role: { type: String, trim: true },
  name: { type: String, trim: true },
  authority: { type: Number, default: null } // NEW: Authority level for permission-based access control
}, { _id: false });

const eventRequestHistorySchema = new mongoose.Schema({
  History_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  Request_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'EventRequest'
  },
  Event_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'Event'
  },
  Action: {
    type: String,
    enum: [
      'created',
      'review-assigned',
      'review-decision',
      'review-expired',
      'creator-response',
      'status-updated',
      'finalized',
      'revision-requested'
    ],
    required: true
  },
  Actor: actorSchema,
  Note: {
    type: String,
    trim: true
  },
  PreviousStatus: {
    type: String,
    trim: true
  },
  NewStatus: {
    type: String,
    trim: true
  },
  Metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // NEW: Permission-based audit trail fields
  PermissionUsed: {
    type: String,
    trim: true,
    default: null,
    description: 'Permission code used for this action (e.g., request.review, request.approve, event.publish)'
  },
  ReviewerAuthority: {
    type: Number,
    default: null,
    description: 'Authority level of the reviewer/actor performing the action'
  },
  RequesterAuthority: {
    type: Number,
    default: null,
    description: 'Authority level of the request creator for authority hierarchy comparison'
  },
  ActionDate: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true
});

eventRequestHistorySchema.index({ Request_ID: 1, ActionDate: -1 });
eventRequestHistorySchema.index({ 'Actor.id': 1, ActionDate: -1 });
eventRequestHistorySchema.index({ Event_ID: 1, ActionDate: -1 });

eventRequestHistorySchema.statics._create = function(payload) {
  return this.create({
    History_ID: `HIST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    ...payload
  });
};

eventRequestHistorySchema.statics.logCreation = function({ requestId, eventId, actor, note, permissionUsed, reviewerAuthority, requesterAuthority }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'created',
    Actor: actor || null,
    Note: note || 'Event request created',
    PreviousStatus: null,
    NewStatus: 'pending-review',
    PermissionUsed: permissionUsed || null,
    ReviewerAuthority: reviewerAuthority !== undefined ? reviewerAuthority : null,
    RequesterAuthority: requesterAuthority !== undefined ? requesterAuthority : null
  });
};

eventRequestHistorySchema.statics.logStatusChange = function({ requestId, eventId, previousStatus, newStatus, actor, note, metadata, permissionUsed, reviewerAuthority, requesterAuthority }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'status-updated',
    Actor: actor || null,
    PreviousStatus: previousStatus || null,
    NewStatus: newStatus || null,
    Note: note || null,
    Metadata: metadata || {},
    PermissionUsed: permissionUsed || null,
    ReviewerAuthority: reviewerAuthority !== undefined ? reviewerAuthority : null,
    RequesterAuthority: requesterAuthority !== undefined ? requesterAuthority : null
  });
};

eventRequestHistorySchema.statics.logReviewDecision = function({ requestId, eventId, decisionType, actor, notes, previousStatus, newStatus, metadata, permissionUsed, reviewerAuthority, requesterAuthority }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'review-decision',
    Actor: actor || null,
    PreviousStatus: previousStatus || null,
    NewStatus: newStatus || null,
    Note: notes || null,
    Metadata: Object.assign({ decisionType }, metadata),
    PermissionUsed: permissionUsed || null,
    ReviewerAuthority: reviewerAuthority !== undefined ? reviewerAuthority : null,
    RequesterAuthority: requesterAuthority !== undefined ? requesterAuthority : null
  });
};

eventRequestHistorySchema.statics.logCreatorResponse = function({ requestId, eventId, actor, action, previousStatus, newStatus, notes, permissionUsed, reviewerAuthority, requesterAuthority }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'creator-response',
    Actor: actor || null,
    PreviousStatus: previousStatus || null,
    NewStatus: newStatus || null,
    Note: notes || null,
    Metadata: { action },
    PermissionUsed: permissionUsed || null,
    ReviewerAuthority: reviewerAuthority !== undefined ? reviewerAuthority : null,
    RequesterAuthority: requesterAuthority !== undefined ? requesterAuthority : null
  });
};

eventRequestHistorySchema.statics.logFinalization = function({ requestId, eventId, actor, outcome, notes, permissionUsed, reviewerAuthority, requesterAuthority }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'finalized',
    Actor: actor || null,
    PreviousStatus: null,
    NewStatus: outcome || null,
    Note: notes || null,
    Metadata: { outcome },
    PermissionUsed: permissionUsed || null,
    ReviewerAuthority: reviewerAuthority !== undefined ? reviewerAuthority : null,
    RequesterAuthority: requesterAuthority !== undefined ? requesterAuthority : null
  });
};

eventRequestHistorySchema.statics.logRevision = function({ requestId, eventId, actor, revisionNumber, note, permissionUsed, reviewerAuthority, requesterAuthority }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'revision-requested',
    Actor: actor || null,
    PreviousStatus: null,
    NewStatus: null,
    Note: note || null,
    Metadata: { revisionNumber },
    PermissionUsed: permissionUsed || null,
    ReviewerAuthority: reviewerAuthority !== undefined ? reviewerAuthority : null,
    RequesterAuthority: requesterAuthority !== undefined ? requesterAuthority : null
  });
};

eventRequestHistorySchema.statics.logExpiry = function({ requestId, eventId, previousStatus, note, permissionUsed, reviewerAuthority, requesterAuthority }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'review-expired',
    Actor: null,
    PreviousStatus: previousStatus || null,
    NewStatus: 'expired-review',
    Note: note || 'Request expired',
    Metadata: {},
    PermissionUsed: permissionUsed || null,
    ReviewerAuthority: reviewerAuthority !== undefined ? reviewerAuthority : null,
    RequesterAuthority: requesterAuthority !== undefined ? requesterAuthority : null
  });
};

const EventRequestHistory = mongoose.model('EventRequestHistory', eventRequestHistorySchema);

module.exports = EventRequestHistory;

