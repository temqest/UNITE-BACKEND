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
      'SignupRequestRejected',  // Signup request rejected
      'NewMessage',           // New chat message received
      'MessageRead'           // Message marked as read
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
  },
  OriginalDate: {
    type: Date
  },
  // Chat-specific fields
  Message_ID: {
    type: String,
    trim: true
  },
  Sender_ID: {
    type: String,
    trim: true
  },
  Conversation_ID: {
    type: String,
    trim: true
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
notificationSchema.statics.createNewRequestNotification = async function(recipientId, requestId, eventId, coordinatorId, recipientType) {
  // Attempt to enrich message with event title, category, and requester information
  let eventTitle = null;
  let eventCategory = null;
  let requesterLabel = null;
  try {
    const Event = mongoose.model('Event');
    const ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title Category Start_Date').lean().exec();
    if (ev) {
      eventTitle = ev.Event_Title;
      eventCategory = ev.Category;
    }
  } catch (e) {
    // ignore
  }

  try {
    const EventRequest = mongoose.model('EventRequest');
    const req = await EventRequest.findOne({ Request_ID: requestId }).lean().exec();
    if (req) {
      // Prefer creator snapshot if present
      if (req.creator && req.creator.name) {
        requesterLabel = `${req.creator.role || req.made_by_role || 'Requester'}: ${req.creator.name}`;
      } else if (req.made_by_role) {
        requesterLabel = `${req.made_by_role}${req.made_by_id ? ` (${req.made_by_id})` : ''}`;
      } else if (req.stakeholder_id) {
        requesterLabel = `Stakeholder (${req.stakeholder_id})`;
      } else if (coordinatorId) {
        requesterLabel = `Coordinator (${coordinatorId})`;
      }
    }
  } catch (e) {
    // ignore
  }

  const finalRecipientType = recipientType && String(recipientType).length > 0 ? (String(recipientType).toLowerCase().includes('system') || String(recipientType).toLowerCase().includes('admin') ? 'Admin' : (String(recipientType).toLowerCase().includes('stakeholder') ? 'Stakeholder' : 'Coordinator')) : 'Admin';

  const categoryLabel = eventCategory || 'Event';
  const title = 'New Event Request';
  const messageParts = [];
  if (eventTitle) messageParts.push(`"${eventTitle}"`);
  messageParts.push(`a new ${categoryLabel} request`);
  if (requesterLabel) messageParts.push(`submitted by ${requesterLabel}`);
  messageParts.push('requires your review.');

  const message = messageParts.join(' ');

  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: recipientId,
    RecipientType: finalRecipientType,
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
    NotificationType: 'NewRequest'
  });
};

// Static method to create notification for admin action
// recipientId: id of the recipient (coordinator or stakeholder)
// recipientType: optional string 'Coordinator'|'Stakeholder' (defaults to 'Coordinator')
notificationSchema.statics.createAdminActionNotification = async function(recipientId, requestId, eventId, action, note, rescheduledDate, recipientType = 'Coordinator', originalDate = null, actorRole = 'Admin', actorName = null) {
  let title, message, type;
  // Attempt to fetch event title for clearer messages
  let eventTitle = null;
  // Ensure `ev` is available in this scope for later branches
  let ev = null;
  try {
    const Event = mongoose.model('Event');
    ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title Start_Date').lean().exec();
    if (ev) eventTitle = ev.Event_Title;
  } catch (e) {}

  // Determine actor label
  let actorLabel = 'Admin';
  if (actorRole) {
    const roleLower = String(actorRole).toLowerCase();
    if (roleLower === 'systemadmin' || roleLower === 'admin') actorLabel = 'Admin';
    else if (roleLower === 'coordinator') actorLabel = 'Coordinator';
    else if (roleLower === 'stakeholder') actorLabel = 'Stakeholder';
    else actorLabel = actorRole;
  }

  switch(action) {
    case 'Accepted':
      title = 'Event Request Accepted';
      message = eventTitle ? `The event request "${eventTitle}" has been accepted by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. Please review and approve.` : `Your event request has been accepted by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. Please review and approve.`;
      type = 'AdminAccepted';
      break;
      case 'Rescheduled':
      title = 'Event Request Rescheduled';
      // Format dates as 'Month DD, YYYY' for readability
      let when = null;
      let original = null;
      try {
        if (rescheduledDate) {
          when = new Date(rescheduledDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        }
        // Prefer provided originalDate (captured before event update), otherwise fall back to ev.Start_Date
        const srcOriginal = originalDate || (ev && ev.Start_Date ? ev.Start_Date : null);
        if (srcOriginal) {
          original = new Date(srcOriginal).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        }
      } catch (e) {
        // ignore formatting errors
      }
      if (eventTitle) {
        if (original && when) {
          message = `The event "${eventTitle}" scheduled on ${original} has a proposed reschedule to ${when} by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}`;
        } else if (when) {
          message = `The event "${eventTitle}" has a proposed reschedule to ${when} by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}`;
        } else {
          message = `The event "${eventTitle}" has a proposed reschedule by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}`;
        }
      } else {
        if (original && when) {
          message = `Your event request scheduled on ${original} has been rescheduled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. Proposed date: ${when}. ${note ? `Note: ${note}` : ''}`;
        } else if (when) {
          message = `Your event request has been rescheduled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. Proposed date: ${when}. ${note ? `Note: ${note}` : ''}`;
        } else {
          message = `Your event request has been rescheduled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}`;
        }
      }
      type = 'AdminRescheduled';
      break;
    case 'Rejected':
      title = 'Event Request Rejected';
      message = eventTitle ? `The event "${eventTitle}" has been rejected by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}` : `Your event request has been rejected by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}`;
      type = 'AdminRejected';
      break;
    case 'Cancelled':
      title = 'Event Request Cancelled';
      message = eventTitle ? `The event "${eventTitle}" has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}` : `Your event request has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Note: ${note}` : ''}`;
      type = 'RequestCancelled';
      break;
    case 'Approved':
    case 'Event Published':
      title = 'Event Published';
      // Format: "The event [title] has been approved and is now live. Approved by [role] ([name])."
      const approverLabel = actorLabel.toLowerCase();
      const approverName = actorName ? ` (${actorName})` : '';
      message = eventTitle 
        ? `The event "${eventTitle}" has been approved and is now live. Approved by ${approverLabel}${approverName}.`
        : `Your event has been approved and is now live. Approved by ${approverLabel}${approverName}.`;
      type = 'RequestCompleted';
      break;
    default:
      title = 'Event Request Update';
      message = eventTitle ? `The event "${eventTitle}" has been updated by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.` : `Your event request has been updated by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
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
    RescheduledDate: rescheduledDate || null,
    OriginalDate: originalDate || (ev && ev.Start_Date ? ev.Start_Date : null)
  });
};

// Static method to create notification for coordinator final action
notificationSchema.statics.createCoordinatorActionNotification = async function(adminId, requestId, eventId, action) {
  let title, message, type;
  let eventTitle = null;
  try {
    const Event = mongoose.model('Event');
    const ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title').lean().exec();
    if (ev) eventTitle = ev.Event_Title;
  } catch (e) {}

  switch(action) {
    case 'Approved':
    case 'Accepted':
      title = 'Event Request Completed';
      message = eventTitle ? `The coordinator has approved the event "${eventTitle}". The event is now completed.` : `The coordinator has approved/accepted the event request. The event is now completed.`;
      type = 'RequestCompleted';
      break;
    case 'Rejected':
      title = 'Event Request Rejected';
      message = eventTitle ? `The coordinator has rejected the event "${eventTitle}".` : `The coordinator has rejected the event request.`;
      type = 'RequestRejected';
      break;
    default:
      title = 'Event Request Update';
      message = eventTitle ? `The coordinator has updated the event "${eventTitle}".` : `The coordinator has updated the event request.`;
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

// Static method to notify the original requester when a reviewer (coordinator)
// accepts/rejects/reschedules a request. Includes actor info for clarity.
notificationSchema.statics.createReviewerDecisionNotification = async function(recipientId, requestId, eventId, action, actorRole, actorName, rescheduledDate, originalDate = null, recipientType = null) {
  let title, message, type;
  let eventTitle = null;
  try {
    const Event = mongoose.model('Event');
    const ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title Start_Date').lean().exec();
    if (ev) eventTitle = ev.Event_Title;
    // include original start date on the event object for formatting below
    if (ev) ev._origStart = ev.Start_Date;
  } catch (e) {}

  const actorLabel = actorRole ? String(actorRole) : 'Reviewer';

  switch(action) {
    case 'Accepted':
    case 'Approved':
      title = 'Your Event Request Approved';
      message = eventTitle ? `Your event "${eventTitle}" has been approved by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.` : `Your event request has been approved by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
      type = 'CoordinatorAccepted';
      break;
    case 'Rejected':
      title = 'Your Event Request Rejected';
      message = eventTitle ? `Your event "${eventTitle}" has been rejected by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.` : `Your event request has been rejected by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
      type = 'CoordinatorRejected';
      break;
    case 'Cancelled':
      title = 'Your Event Request Cancelled';
      message = eventTitle ? `Your event "${eventTitle}" has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.` : `Your event request has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
      type = 'RequestCancelled';
      break;
    case 'Rescheduled':
      title = 'Your Event Request Rescheduled';
      // format proposed and original dates
      let when = null;
      let original = null;
      try {
        if (rescheduledDate) when = new Date(rescheduledDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        // Prefer explicit originalDate argument (captured before event update)
        const srcOriginal = originalDate || null;
        if (srcOriginal) {
          original = new Date(srcOriginal).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        } else {
          const Event = mongoose.model('Event');
          const ev = await Event.findOne({ Event_ID: eventId }).select('Start_Date Event_Title').lean().exec();
          if (ev && ev.Start_Date) original = new Date(ev.Start_Date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        }
      } catch (e) {}
      if (eventTitle) {
        if (original && when) {
          message = `Your event "${eventTitle}" scheduled on ${original} has a proposed reschedule to ${when} by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
        } else if (when) {
          message = `Your event "${eventTitle}" has a proposed reschedule to ${when} by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
        } else {
          message = `Your event "${eventTitle}" has a proposed reschedule by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
        }
      } else {
        message = when ? `Your event request has a proposed reschedule to ${when} by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.` : `Your event request has been rescheduled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
      }
      type = 'AdminRescheduled';
      break;
    default:
      title = 'Event Request Update';
      message = eventTitle ? `Your event "${eventTitle}" has been updated by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.` : `Your event request has been updated by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`;
      type = 'CoordinatorAccepted';
  }

  // Determine recipient type. Prefer explicit `recipientType` argument (caller knows the recipient),
  // otherwise fall back to inferring from the actorRole (legacy behavior).
  let recipientTypeFinal = 'Coordinator';
  if (recipientType && String(recipientType).length > 0) {
    recipientTypeFinal = recipientType;
  } else {
    if (String(actorRole || '').toLowerCase().includes('admin') || String(actorRole || '').toLowerCase().includes('system')) recipientTypeFinal = 'Admin';
    if (String(actorRole || '').toLowerCase().includes('stakeholder')) recipientTypeFinal = 'Stakeholder';
  }

  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: recipientId,
    RecipientType: recipientTypeFinal,
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
    NotificationType: type,
    ActionTaken: action,
    ActionNote: null,
    RescheduledDate: rescheduledDate || null
  });
};
// Static method to create notification for admin cancellation
notificationSchema.statics.createAdminCancellationNotification = async function(recipientId, requestId, eventId, note, recipientType = 'Coordinator', actorRole = 'Admin', actorName = null) {
  // Determine actor label
  let actorLabel = 'Admin';
  if (actorRole) {
    const roleLower = String(actorRole).toLowerCase();
    if (roleLower === 'systemadmin' || roleLower === 'admin') actorLabel = 'Admin';
    else if (roleLower === 'coordinator') actorLabel = 'Coordinator';
    else if (roleLower === 'stakeholder') actorLabel = 'Stakeholder';
    else actorLabel = actorRole;
  }
  
  // Get event title for better context
  let eventTitle = null;
  try {
    const Event = mongoose.model('Event');
    const ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title').lean().exec();
    if (ev) eventTitle = ev.Event_Title;
  } catch (e) {}
  
  const title = 'Event Request Cancelled';
  const message = eventTitle 
    ? `The event "${eventTitle}" has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Reason: ${note}` : ''}`
    : `An event request has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Reason: ${note}` : ''}`;
  
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: recipientId,
    RecipientType: recipientType,
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
    NotificationType: 'AdminCancelled',
    ActionTaken: 'Cancelled',
    ActionNote: note || null
  });
};

// Static method to create notification for stakeholder when request is cancelled
notificationSchema.statics.createStakeholderCancellationNotification = async function(stakeholderId, requestId, eventId, note, actorRole = 'Admin', actorName = null) {
  // Determine actor label
  let actorLabel = 'Admin';
  if (actorRole) {
    const roleLower = String(actorRole).toLowerCase();
    if (roleLower === 'systemadmin' || roleLower === 'admin') actorLabel = 'Admin';
    else if (roleLower === 'coordinator') actorLabel = 'Coordinator';
    else if (roleLower === 'stakeholder') actorLabel = 'Stakeholder';
    else actorLabel = actorRole;
  }
  
  // Get event title for better context
  let eventTitle = null;
  try {
    const Event = mongoose.model('Event');
    const ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title').lean().exec();
    if (ev) eventTitle = ev.Event_Title;
  } catch (e) {}
  
  const title = 'Your Event Request Cancelled';
  const message = eventTitle
    ? `Your event "${eventTitle}" has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Reason: ${note}` : ''}`
    : `Your event request has been cancelled by the ${actorLabel}${actorName ? ` (${actorName})` : ''}. ${note ? `Reason: ${note}` : ''}`;
  
  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: stakeholderId,
    RecipientType: 'Stakeholder',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
    NotificationType: 'RequestCancelled',
    ActionTaken: 'Cancelled',
    ActionNote: note || null
  });
};

// Static method to create notification for request deletion
notificationSchema.statics.createRequestDeletionNotification = async function(recipientId, requestId, eventId, recipientType = 'Coordinator', actorRole = 'Admin', actorName = null) {
  // Attempt to include event title and type for better context
  let eventTitle = null;
  let eventCategory = null;
  try {
    const Event = mongoose.model('Event');
    const ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title Category').lean().exec();
    if (ev) {
      eventTitle = ev.Event_Title;
      eventCategory = ev.Category;
    }
  } catch (e) {
    // ignore
  }

  // If the Event record is not available (already deleted), try to enrich
  // the message from the EventRequest document which may contain category
  // or originalData snapshots.
  if (!eventTitle && !eventCategory) {
    try {
      const EventRequest = mongoose.model('EventRequest');
      const req = await EventRequest.findOne({ Request_ID: requestId }).select('Category originalData Event_Title creator').lean().exec();
      if (req) {
        if (!eventCategory && req.Category) eventCategory = req.Category;
        // originalData may contain a snapshot of the event
        if (!eventTitle && req.originalData) {
          eventTitle = req.originalData.Event_Title || req.originalData.EventTitle || null;
        }
        // fallback: some older docs may have Event_Title at root
        if (!eventTitle && req.Event_Title) eventTitle = req.Event_Title;
        // also consider creator snapshot
        if (!eventTitle && req.creator && req.creator.name) {
          // nothing to do for title, but keep creator present for context (not used here)
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Determine actor label
  let actorLabel = 'Admin';
  if (actorRole) {
    const roleLower = String(actorRole).toLowerCase();
    if (roleLower === 'systemadmin' || roleLower === 'admin') actorLabel = 'Admin';
    else if (roleLower === 'coordinator') actorLabel = 'Coordinator';
    else if (roleLower === 'stakeholder') actorLabel = 'Stakeholder';
    else actorLabel = actorRole;
  }
  
  const title = 'Event Request Deleted';
  const messageParts = [];
  if (eventTitle) messageParts.push(`"${eventTitle}"`);
  if (eventCategory) messageParts.push(`${eventCategory}`);
  messageParts.push(`request has been permanently deleted by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`);
  const message = messageParts.join(' ');
  // Avoid creating duplicate deletion notifications for the same recipient+request
  try {
    const recent = await this.findOne({
      Recipient_ID: recipientId,
      Request_ID: requestId,
      NotificationType: 'RequestDeleted'
    }).sort({ createdAt: -1 }).lean().exec();
    if (recent) {
      const createdAt = new Date(recent.createdAt || recent.created_at || recent.created_at);
      if (Date.now() - createdAt.getTime() < 60 * 1000) {
        // return existing recent notification instead of creating a duplicate
        return recent;
      }
    }
  } catch (e) {
    // ignore dedupe failures and proceed to create
  }

  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: recipientId,
    RecipientType: recipientType,
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
    NotificationType: 'RequestDeleted',
    ActionTaken: 'Deleted'
  });
};

// Static method to create notification for stakeholder when request is deleted
notificationSchema.statics.createStakeholderDeletionNotification = async function(stakeholderId, requestId, eventId, actorRole = 'Admin', actorName = null) {
  // Attempt to include event title and type for better context
  let eventTitle = null;
  let eventCategory = null;
  try {
    const Event = mongoose.model('Event');
    const ev = await Event.findOne({ Event_ID: eventId }).select('Event_Title Category').lean().exec();
    if (ev) {
      eventTitle = ev.Event_Title;
      eventCategory = ev.Category;
    }
  } catch (e) {
    // ignore
  }

  // Determine actor label
  let actorLabel = 'Admin';
  if (actorRole) {
    const roleLower = String(actorRole).toLowerCase();
    if (roleLower === 'systemadmin' || roleLower === 'admin') actorLabel = 'Admin';
    else if (roleLower === 'coordinator') actorLabel = 'Coordinator';
    else if (roleLower === 'stakeholder') actorLabel = 'Stakeholder';
    else actorLabel = actorRole;
  }
  
  const title = 'Your Event Request Deleted';
  const messageParts = [];
  if (eventTitle) messageParts.push(`"${eventTitle}"`);
  if (eventCategory) messageParts.push(`${eventCategory}`);
  messageParts.push(`request has been permanently deleted by the ${actorLabel}${actorName ? ` (${actorName})` : ''}.`);
  const message = messageParts.join(' ');
  // Avoid creating duplicate deletion notifications for the same recipient+request
  try {
    const recent = await this.findOne({
      Recipient_ID: stakeholderId,
      Request_ID: requestId,
      NotificationType: 'RequestDeleted'
    }).sort({ createdAt: -1 }).lean().exec();
    if (recent) {
      const createdAt = new Date(recent.createdAt || recent.created_at || recent.created_at);
      if (Date.now() - createdAt.getTime() < 60 * 1000) {
        return recent;
      }
    }
  } catch (e) {
    // ignore dedupe failures and proceed to create
  }

  return this.create({
    Notification_ID: `NOTIF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    Recipient_ID: stakeholderId,
    RecipientType: 'Stakeholder',
    Request_ID: requestId,
    Event_ID: eventId,
    Title: title,
    Message: message,
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

