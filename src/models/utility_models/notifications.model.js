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
    enum: ['Admin', 'Coordinator'],
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
      'CoordinatorApproved',  // Coordinator approved admin's acceptance
      'CoordinatorAccepted', // Coordinator accepted admin's reschedule/rejection
      'CoordinatorRejected',  // Coordinator rejected after admin action
      'RequestCompleted',     // Request completed
      'RequestRejected'       // Request finally rejected
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
notificationSchema.statics.createAdminActionNotification = function(coordinatorId, requestId, eventId, action, note, rescheduledDate) {
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
    Recipient_ID: coordinatorId,
    RecipientType: 'Coordinator',
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

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;

