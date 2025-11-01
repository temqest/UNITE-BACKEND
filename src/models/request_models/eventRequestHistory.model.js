const mongoose = require('mongoose');

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
  // Action information
  Action: {
    type: String,
    enum: [
      'Created',              // Request created by coordinator
      'AdminAccepted',        // Admin accepted the request
      'AdminRescheduled',    // Admin rescheduled the request
      'AdminRejected',       // Admin rejected the request
      'CoordinatorApproved', // Coordinator approved admin's acceptance
      'CoordinatorAccepted', // Coordinator accepted admin's reschedule/rejection
      'CoordinatorRejected', // Coordinator rejected after admin action
      'Completed',           // Request completed
      'Rejected'             // Request finally rejected
    ],
    required: true
  },
  // Who performed the action
  Actor_ID: {
    type: String,
    required: true,
    trim: true
  },
  ActorType: {
    type: String,
    enum: ['Coordinator', 'Admin'],
    required: true
  },
  // Actor name for display (optional, can be populated from other models)
  ActorName: {
    type: String,
    trim: true
  },
  // Note/comment associated with the action
  Note: {
    type: String,
    trim: true
  },
  // Previous status before this action
  PreviousStatus: {
    type: String,
    trim: true
  },
  // New status after this action
  NewStatus: {
    type: String,
    trim: true
  },
  // Rescheduled date (if applicable)
  RescheduledDate: {
    type: Date
  },
  // Original date (before reschedule)
  OriginalDate: {
    type: Date
  },
  // Additional metadata
  Metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Action timestamp (when the action was performed)
  ActionDate: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
eventRequestHistorySchema.index({ Request_ID: 1, ActionDate: -1 });
eventRequestHistorySchema.index({ Actor_ID: 1, ActorType: 1 });
eventRequestHistorySchema.index({ Event_ID: 1 });

// Static method to create history entry when request is created
eventRequestHistorySchema.statics.createRequestHistory = function(requestId, eventId, coordinatorId, coordinatorName) {
  return this.create({
    History_ID: `HIST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Request_ID: requestId,
    Event_ID: eventId,
    Action: 'Created',
    Actor_ID: coordinatorId,
    ActorType: 'Coordinator',
    ActorName: coordinatorName || null,
    PreviousStatus: null,
    NewStatus: 'Pending_Admin_Review',
    Note: 'Event request created by coordinator'
  });
};

// Static method to create history entry when admin takes action
eventRequestHistorySchema.statics.createAdminActionHistory = function(
  requestId,
  eventId,
  adminId,
  adminName,
  action,
  note,
  rescheduledDate,
  originalDate
) {
  let newStatus;
  switch(action) {
    case 'Accepted':
      newStatus = 'Accepted_By_Admin';
      break;
    case 'Rescheduled':
      newStatus = 'Rescheduled_By_Admin';
      break;
    case 'Rejected':
      newStatus = 'Rejected_By_Admin';
      break;
    default:
      newStatus = 'Pending_Admin_Review';
  }

  return this.create({
    History_ID: `HIST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Request_ID: requestId,
    Event_ID: eventId,
    Action: `Admin${action}`,
    Actor_ID: adminId,
    ActorType: 'Admin',
    ActorName: adminName || null,
    PreviousStatus: 'Pending_Admin_Review',
    NewStatus: newStatus,
    Note: note || null,
    RescheduledDate: rescheduledDate || null,
    OriginalDate: originalDate || null
  });
};

// Static method to create history entry when coordinator takes final action
eventRequestHistorySchema.statics.createCoordinatorActionHistory = function(
  requestId,
  eventId,
  coordinatorId,
  coordinatorName,
  action,
  previousStatus,
  note
) {
  let newStatus;
  let actionType;
  
  switch(action) {
    case 'Approved':
      actionType = 'CoordinatorApproved';
      newStatus = 'Completed';
      break;
    case 'Accepted':
      actionType = 'CoordinatorAccepted';
      newStatus = 'Completed';
      break;
    case 'Rejected':
      actionType = 'CoordinatorRejected';
      newStatus = 'Rejected';
      break;
    default:
      actionType = 'CoordinatorApproved';
      newStatus = 'Completed';
  }

  return this.create({
    History_ID: `HIST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Request_ID: requestId,
    Event_ID: eventId,
    Action: actionType,
    Actor_ID: coordinatorId,
    ActorType: 'Coordinator',
    ActorName: coordinatorName || null,
    PreviousStatus: previousStatus,
    NewStatus: newStatus,
    Note: note || null
  });
};

// Instance method to get formatted history description
eventRequestHistorySchema.methods.getFormattedDescription = function() {
  const actor = this.ActorName || this.Actor_ID;
  const date = new Date(this.ActionDate).toLocaleString();
  
  switch(this.Action) {
    case 'Created':
      return `${actor} created this event request on ${date}`;
    case 'AdminAccepted':
      return `Admin ${actor} accepted this request on ${date}${this.Note ? ` - ${this.Note}` : ''}`;
    case 'AdminRescheduled':
      return `Admin ${actor} rescheduled this request on ${date}${this.RescheduledDate ? ` to ${new Date(this.RescheduledDate).toLocaleDateString()}` : ''}${this.Note ? ` - ${this.Note}` : ''}`;
    case 'AdminRejected':
      return `Admin ${actor} rejected this request on ${date}${this.Note ? ` - ${this.Note}` : ''}`;
    case 'CoordinatorApproved':
      return `Coordinator ${actor} approved this request on ${date}`;
    case 'CoordinatorAccepted':
      return `Coordinator ${actor} accepted the admin's decision on ${date}`;
    case 'CoordinatorRejected':
      return `Coordinator ${actor} rejected this request on ${date}${this.Note ? ` - ${this.Note}` : ''}`;
    case 'Completed':
      return `Request completed on ${date}`;
    case 'Rejected':
      return `Request rejected on ${date}`;
    default:
      return `Action ${this.Action} performed by ${actor} on ${date}`;
  }
};

const EventRequestHistory = mongoose.model('EventRequestHistory', eventRequestHistorySchema);

module.exports = EventRequestHistory;

