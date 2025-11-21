const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  id: { type: String, trim: true },
  role: { type: String, trim: true },
  name: { type: String, trim: true }
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

eventRequestHistorySchema.statics.logCreation = function({ requestId, eventId, actor, note }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'created',
    Actor: actor || null,
    Note: note || 'Event request created',
    PreviousStatus: null,
    NewStatus: 'pending-review'
  });
};

eventRequestHistorySchema.statics.logStatusChange = function({ requestId, eventId, previousStatus, newStatus, actor, note, metadata }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'status-updated',
    Actor: actor || null,
    PreviousStatus: previousStatus || null,
    NewStatus: newStatus || null,
    Note: note || null,
    Metadata: metadata || {}
  });
};

eventRequestHistorySchema.statics.logReviewDecision = function({ requestId, eventId, decisionType, actor, notes, previousStatus, newStatus, metadata }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'review-decision',
    Actor: actor || null,
    PreviousStatus: previousStatus || null,
    NewStatus: newStatus || null,
    Note: notes || null,
    Metadata: Object.assign({ decisionType }, metadata)
  });
};

eventRequestHistorySchema.statics.logCreatorResponse = function({ requestId, eventId, actor, action, previousStatus, newStatus, notes }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'creator-response',
    Actor: actor || null,
    PreviousStatus: previousStatus || null,
    NewStatus: newStatus || null,
    Note: notes || null,
    Metadata: { action }
  });
};

eventRequestHistorySchema.statics.logFinalization = function({ requestId, eventId, actor, outcome, notes }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'finalized',
    Actor: actor || null,
    PreviousStatus: null,
    NewStatus: outcome || null,
    Note: notes || null,
    Metadata: { outcome }
  });
};

eventRequestHistorySchema.statics.logRevision = function({ requestId, eventId, actor, revisionNumber, note }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'revision-requested',
    Actor: actor || null,
    PreviousStatus: null,
    NewStatus: null,
    Note: note || null,
    Metadata: { revisionNumber }
  });
};

eventRequestHistorySchema.statics.logExpiry = function({ requestId, eventId, previousStatus, note }) {
  return this._create({
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'review-expired',
    Actor: null,
    PreviousStatus: previousStatus || null,
    NewStatus: 'expired-review',
    Note: note || 'Request expired',
    Metadata: {}
  });
};

const EventRequestHistory = mongoose.model('EventRequestHistory', eventRequestHistorySchema);

module.exports = EventRequestHistory;

