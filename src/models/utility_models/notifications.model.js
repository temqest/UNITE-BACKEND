const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  Notification_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  Recipient_ID: {
    type: String,
    required: true,
    trim: true
  },
  RecipientType: {
    type: String,
    enum: ['Admin', 'Coordinator', 'Stakeholder'],
    required: true
  },
  Request_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'EventRequest'
  },
  Event_ID: {
    type: String,
    trim: true,
    ref: 'Event'
  },
  Title: {
    type: String,
    required: true,
    trim: true
  },
  Message: {
    type: String,
    required: true,
    trim: true
  },
  NotificationType: {
    type: String,
    enum: [
      'NewRequest',           // New request created by coordinator
      'AdminAccepted',        // Admin accepted the request
      'AdminRescheduled',     // Admin rescheduled the request
      'AdminRejected',        // Admin rejected the request
      'AdminCancelled',       // Admin cancelled the request
      'CoordinatorApproved',  // Coordinator approved admin's acceptance
      'CoordinatorAccepted', // Coordinator accepted admin's reschedule/rejection
      'CoordinatorRejected',  // Coordinator rejected after admin action
      'RequestCompleted',     // Request completed
      'RequestRejected',      // Request finally rejected
      'RequestCancelled',     // Request cancelled
      'RequestDeleted',       // Request deleted by sys admin
      'NewSignupRequest',     // New stakeholder signup request
      'SignupRequestApproved', // Signup request approved
      'SignupRequestRejected'  // Signup request rejected
    ],
    required: true
  },
  IsRead: {
    type: Boolean,
    default: false
  },
  ReadAt: {
    type: Date
  },
  // Additional metadata for the notification
  ActionTaken: {
    type: String,
    trim: true
  },
  ActionNote: {
    type: String,
    trim: true
  },
  RescheduledDate: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient querying of unread notifications by recipient
notificationSchema.index({ Recipient_ID: 1, RecipientType: 1, IsRead: 1 });
notificationSchema.index({ Request_ID: 1 });

// Method to mark notification as read
notificationSchema.methods.markAsRead = function() {
  this.IsRead = true;
  this.ReadAt = new Date();
  return this.save();
};

// Static method to create notification for new request
notificationSchema.statics.createNewRequestNotification = function(adminId, requestId, eventId, coordinatorId) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: adminId,
    RecipientType: 'Admin',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: 'New Event Request',
    Message: `A new event request has been submitted and requires your review.`,
    NotificationType: 'NewRequest'
  });
};

// Static method to create notification for admin action
// recipientId: id of the recipient (coordinator or stakeholder)
// recipientType: optional string 'Coordinator'|'Stakeholder' (defaults to 'Coordinator')
notificationSchema.statics.createAdminActionNotification = function(recipientId, requestId, eventId, action, note, rescheduledDate, recipientType = 'Coordinator') {
  let title, message, type;
  
  switch(action) {
    case 'Accepted':
      title = 'Event Request Accepted';
      message = `Your event request has been accepted by the admin. Please review and approve.`;
      type = 'AdminAccepted';
      break;
    case 'Rescheduled':
      title = 'Event Request Rescheduled';
      message = `Your event request has been rescheduled by the admin. ${note ? `Note: ${note}` : ''}`;
      type = 'AdminRescheduled';
      break;
    case 'Rejected':
      title = 'Event Request Rejected';
      message = `Your event request has been rejected by the admin. ${note ? `Note: ${note}` : ''}`;
      type = 'AdminRejected';
      break;
    default:
      title = 'Event Request Update';
      message = `Your event request has been updated by the admin.`;
      type = 'NewRequest';
  }

  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: recipientId,
    RecipientType: recipientType,
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
    NotificationType: type,
    ActionTaken: action,
    ActionNote: note || null,
    RescheduledDate: rescheduledDate || null
  });
};

// Static method to create notification for coordinator final action
notificationSchema.statics.createCoordinatorActionNotification = function(adminId, requestId, eventId, action) {
  let title, message, type;
  
  switch(action) {
    case 'Approved':
    case 'Accepted':
      title = 'Event Request Completed';
      message = `The coordinator has approved/accepted the event request. The event is now completed.`;
      type = 'RequestCompleted';
      break;
    case 'Rejected':
      title = 'Event Request Rejected';
      message = `The coordinator has rejected the event request.`;
      type = 'RequestRejected';
      break;
    default:
      title = 'Event Request Update';
      message = `The coordinator has updated the event request.`;
      type = 'CoordinatorApproved';
  }

  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: adminId,
    RecipientType: 'Admin',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
    NotificationType: type,
    ActionTaken: action
  });
};

// Static method to create notification for admin cancellation
notificationSchema.statics.createAdminCancellationNotification = function(coordinatorId, requestId, eventId, note) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: coordinatorId,
    RecipientType: 'Coordinator',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: 'Event Request Cancelled',
    Message: `An event request has been cancelled by the admin. ${note ? `Reason: ${note}` : ''}`,
    NotificationType: 'AdminCancelled',
    ActionTaken: 'Cancelled',
    ActionNote: note || null
  });
};

// Static method to create notification for stakeholder when request is cancelled
notificationSchema.statics.createStakeholderCancellationNotification = function(stakeholderId, requestId, eventId, note) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: stakeholderId,
    RecipientType: 'Stakeholder',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: 'Your Event Request Cancelled',
    Message: `Your event request has been cancelled. ${note ? `Reason: ${note}` : ''}`,
    NotificationType: 'RequestCancelled',
    ActionTaken: 'Cancelled',
    ActionNote: note || null
  });
};

// Static method to create notification for request deletion
notificationSchema.statics.createRequestDeletionNotification = function(coordinatorId, requestId, eventId) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: coordinatorId,
    RecipientType: 'Coordinator',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: 'Event Request Deleted',
    Message: `A cancelled event request has been permanently deleted by the system administrator.`,
    NotificationType: 'RequestDeleted',
    ActionTaken: 'Deleted'
  });
};

// Static method to create notification for stakeholder when request is deleted
notificationSchema.statics.createStakeholderDeletionNotification = function(stakeholderId, requestId, eventId) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: stakeholderId,
    RecipientType: 'Stakeholder',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: 'Your Event Request Deleted',
    Message: `Your event request has been permanently deleted by the system administrator.`,
    NotificationType: 'RequestDeleted',
    ActionTaken: 'Deleted'
  });
};

// Static method to create notification for new signup request
notificationSchema.statics.createNewSignupRequestNotification = function(coordinatorId, signupRequestId, requesterName, requesterEmail) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: coordinatorId,
    RecipientType: 'Coordinator',
    Request_ID: signupRequestId,
    Title: 'New Stakeholder Signup Request',
    Message: `${requesterName} (${requesterEmail}) has submitted a request to create a stakeholder account in your district.`,
    NotificationType: 'NewSignupRequest'
  });
};

// Static method to create notification for signup request approval
notificationSchema.statics.createSignupRequestApprovedNotification = function(stakeholderId, signupRequestId, stakeholderName) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: stakeholderId,
    RecipientType: 'Stakeholder',
    Request_ID: signupRequestId,
    Title: 'Stakeholder Account Created',
    Message: `Congratulations ${stakeholderName}! Your stakeholder account has been approved and created. You can now log in to the system.`,
    NotificationType: 'SignupRequestApproved'
  });
};

// Static method to create notification for signup request rejection
notificationSchema.statics.createSignupRequestRejectedNotification = function(email, signupRequestId, reason) {
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: email, // Use email as recipient ID for rejected requests since account doesn't exist
    RecipientType: 'Stakeholder',
    Request_ID: signupRequestId,
    Title: 'Stakeholder Signup Request Rejected',
    Message: `Your request to create a stakeholder account has been rejected. ${reason ? `Reason: ${reason}` : ''}`,
    NotificationType: 'SignupRequestRejected'
  });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

